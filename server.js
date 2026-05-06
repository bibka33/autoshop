const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Подключение к БД
const db = new sqlite3.Database('./autoshop.db');

// Создание таблиц
db.serialize(() => {
  // Таблица товаров
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    image TEXT,
    stock INTEGER DEFAULT 10
  )`);

  // Таблица пользователей
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица заказов
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    pickup_point TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_date TEXT,
    items TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Таблица избранного
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER,
    product_id INTEGER,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  )`);
});

// Загрузка начальных товаров
function initProducts() {
  const products = [
    {name:'Тормозные колодки Brembo (передние)', price:2500, category:'Тормозная система'},
    {name:'Аккумулятор Varta (70 Ач)', price:7200, category:'Электрика'},
    {name:'Амортизатор Sachs (газовый)', price:5400, category:'Подвеска'},
    {name:'Масло моторное ТЕSMA (2+1)', price:3200, category:'Двигатель'},
    {name:'Воздушный фильтр Mann (с углем)', price:850, category:'Двигатель'},
    {name:'Свечи зажигания NGK (иридиевые)', price:1800, category:'Двигатель'},
    {name:'Тормозной диск ATE (вентилируемый)', price:4200, category:'Тормозная система'},
    {name:'Генератор Bosch (140А)', price:8900, category:'Электрика'},
    {name:'Пружины подвески Kilen (усиленные)', price:3100, category:'Подвеска'},
    {name:'Топливный фильтр Knecht (с отстойником)', price:1200, category:'Двигатель'}
  ];

  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (row.count === 0) {
      const stmt = db.prepare("INSERT INTO products (name, price, category) VALUES (?, ?, ?)");
      products.forEach(p => stmt.run(p.name, p.price, p.category));
      stmt.finalize();
      console.log('✅ Товары загружены в БД');
    }
  });
}

// ========== API РОУТЫ ==========

// Получить все товары
app.get('/api/products', (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

// Регистрация
app.post('/api/register', (req, res) => {
  const {email, password, phone} = req.body;
  
  db.run("INSERT INTO users (email, password, phone) VALUES (?, ?, ?)",
    [email, password, phone],
    function(err) {
      if (err) return res.status(400).json({error: 'Email уже существует'});
      res.json({success: true, userId: this.lastID});
    }
  );
});

// Логин
app.post('/api/login', (req, res) => {
  const {email, password} = req.body;
  
  db.get("SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password],
    (err, user) => {
      if (err || !user) return res.status(401).json({error: 'Неверный email или пароль'});
      res.json({success: true, user: {id: user.id, email: user.email, phone: user.phone}});
    }
  );
});

// Создать заказ
app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + Math.floor(Math.random() * 6) + 2);
  
  db.run(`INSERT INTO orders (user_id, user_email, user_phone, pickup_point, payment_method, total, delivery_date, items)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user_id, user_email, user_phone, pickup_point, payment_method, total, deliveryDate.toISOString(), JSON.stringify(items)],
    function(err) {
      if (err) return res.status(500).json({error: err.message});
      res.json({success: true, orderId: this.lastID, deliveryDate: deliveryDate.toLocaleDateString('ru-RU')});
    }
  );
});

// Получить заказы пользователя
app.get('/api/orders/:email', (req, res) => {
  db.all("SELECT * FROM orders WHERE user_email = ? ORDER BY order_date DESC",
    [req.params.email],
    (err, rows) => {
      if (err) return res.status(500).json({error: err.message});
      res.json(rows);
    }
  );
});

// Получить все заказы (для админа/отчёта)
app.get('/api/all-orders', (req, res) => {
  db.all("SELECT * FROM orders ORDER BY order_date DESC", (err, rows) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(rows);
  });
});

// Отменить заказ
app.put('/api/orders/:id/cancel', (req, res) => {
  db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({error: err.message});
    res.json({success: true});
  });
});

// ========== ЭКСПОРТ В EXCEL ==========
app.get('/api/export-excel', (req, res) => {
  const {startDate, endDate} = req.query;
  
  let query = "SELECT * FROM orders";
  let params = [];
  
  if (startDate && endDate) {
    query += " WHERE order_date BETWEEN ? AND ?";
    params = [startDate, endDate];
  }
  
  query += " ORDER BY order_date DESC";
  
  db.all(query, params, (err, orders) => {
    if (err) return res.status(500).json({error: err.message});
    
    // Подготовка данных для Excel
    const excelData = orders.map(order => ({
      'ID заказа': order.id,
      'Дата заказа': order.order_date,
      'Дата доставки': order.delivery_date,
      'Email клиента': order.user_email,
      'Телефон клиента': order.user_phone,
      'Пункт выдачи': order.pickup_point,
      'Способ оплаты': order.payment_method,
      'Сумма заказа (₽)': order.total,
      'Статус': order.status === 'pending' ? 'Активен' : order.status === 'cancelled' ? 'Отменён' : 'Выполнен',
      'Товары': order.items
    }));
    
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Заказы');
    
    const filename = `orders_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.xlsx`;
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
});

// Статистика для отчёта
app.get('/api/stats', (req, res) => {
  db.get("SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders WHERE status != 'cancelled'", (err, stats) => {
    if (err) return res.status(500).json({error: err.message});
    res.json(stats);
  });
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 Страница отчётности: http://localhost:${PORT}/reports.html`);
});