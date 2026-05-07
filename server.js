const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Подключение к БД
const db = new Database('./autoshop.db');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    image TEXT,
    stock INTEGER DEFAULT 10
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
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
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER,
    product_id INTEGER,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

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

  const count = db.prepare("SELECT COUNT(*) as count FROM products").get();
  if (count.count === 0) {
    const stmt = db.prepare("INSERT INTO products (name, price, category) VALUES (?, ?, ?)");
    for (const p of products) {
      stmt.run(p.name, p.price, p.category);
    }
    console.log('✅ Товары загружены в БД');
  }
}

// ========== API РОУТЫ ==========

// Получить все товары
app.get('/api/products', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM products").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Регистрация
app.post('/api/register', (req, res) => {
  const {email, password, phone} = req.body;
  try {
    const result = db.prepare("INSERT INTO users (email, password, phone) VALUES (?, ?, ?)").run(email, password, phone);
    res.json({success: true, userId: result.lastInsertRowid});
  } catch (err) {
    res.status(400).json({error: 'Email уже существует'});
  }
});

// Логин
app.post('/api/login', (req, res) => {
  const {email, password} = req.body;
  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
    if (!user) return res.status(401).json({error: 'Неверный email или пароль'});
    res.json({success: true, user: {id: user.id, email: user.email, phone: user.phone}});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Создать заказ
app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  try {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + Math.floor(Math.random() * 6) + 2);

    const result = db.prepare(`
      INSERT INTO orders (user_id, user_email, user_phone, pickup_point, payment_method, total, delivery_date, items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, user_email, user_phone, pickup_point, payment_method, total, deliveryDate.toISOString(), JSON.stringify(items));

    res.json({success: true, orderId: result.lastInsertRowid, deliveryDate: deliveryDate.toLocaleDateString('ru-RU')});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Получить заказы пользователя
app.get('/api/orders/:email', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM orders WHERE user_email = ? ORDER BY order_date DESC").all(req.params.email);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Получить все заказы (для админа/отчёта)
app.get('/api/all-orders', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM orders ORDER BY order_date DESC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Отменить заказ
app.put('/api/orders/:id/cancel', (req, res) => {
  try {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(req.params.id);
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// ========== ЭКСПОРТ В EXCEL ==========
app.get('/api/export-excel', (req, res) => {
  const {startDate, endDate} = req.query;
  try {
    let orders;
    if (startDate && endDate) {
      orders = db.prepare("SELECT * FROM orders WHERE order_date BETWEEN ? AND ? ORDER BY order_date DESC").all(startDate, endDate);
    } else {
      orders = db.prepare("SELECT * FROM orders ORDER BY order_date DESC").all();
    }

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
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Статистика для отчёта
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.prepare("SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders WHERE status != 'cancelled'").get();
    res.json(stats);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 Страница отчётности: http://localhost:${PORT}/reports.html`);
});