const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Открываем базу данных
const db = new sqlite3.Database('./autoshop.db');

// ========== СОЗДАНИЕ ТАБЛИЦ ==========
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER DEFAULT 10,
    description TEXT,
    characteristics TEXT,
    image TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    pickup_point TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'processing',
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_date TEXT,
    items TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER,
    product_id INTEGER,
    PRIMARY KEY (user_id, product_id)
  )`);
});

// ========== ИНИЦИАЛИЗАЦИЯ ТОВАРОВ ==========
function initProducts() {
  const products = [
    {name:'Масло моторное LADA Professional 5W-40', price:2100, category:'Двигатель', stock:25, description:'Оригинальное масло', characteristics:'5W-40, синтетика, 4л'},
    {name:'Воздушный фильтр LADA', price:450, category:'Двигатель', stock:30, description:'Очистка воздуха', characteristics:'Для LADA Granta, Kalina, Priora'},
    {name:'Свечи зажигания LADA', price:350, category:'Двигатель', stock:40, description:'Оригинальные свечи', characteristics:'Комплект 4 шт'},
    {name:'Тормозные колодки LADA', price:1200, category:'Тормозная система', stock:20, description:'Оригинальные колодки', characteristics:'Керамические, комплект 4 шт'},
    {name:'Тормозной диск LADA', price:1800, category:'Тормозная система', stock:12, description:'Вентилируемый диск', characteristics:'Диаметр 260мм'},
    {name:'Амортизатор LADA', price:2200, category:'Подвеска', stock:18, description:'Гидравлический', characteristics:'Для Vesta/Granta'},
    {name:'Пружина подвески LADA', price:1500, category:'Подвеска', stock:10, description:'Усиленная', characteristics:'Высота +20мм'},
    {name:'Аккумулятор LADA 60 Ач', price:4500, category:'Электрика', stock:8, description:'Стартерный', characteristics:'Пусковой ток 540А'},
    {name:'Генератор LADA 120А', price:5500, category:'Электрика', stock:5, description:'Оригинальный', characteristics:'Для Vesta/XRAY'},
    {name:'Ароматизатор "Кожа"', price:350, category:'Ароматизаторы', stock:50, description:'Запах дорогого авто', characteristics:'Стойкость 30 дней'},
    {name:'Ароматизатор "Мятная свежесть"', price:390, category:'Ароматизаторы', stock:45, description:'Мятный аромат', characteristics:'Гель 50мл'},
    {name:'Ароматизатор "Ваниль"', price:320, category:'Ароматизаторы', stock:60, description:'Сладкий аромат', characteristics:'Жидкий на панель'},
    {name:'Очиститель стёкол', price:280, category:'Автохимия', stock:30, description:'Без разводов', characteristics:'Зимний до -30°C'},
    {name:'Полироль для кузова', price:650, category:'Автохимия', stock:20, description:'Придаёт блеск', characteristics:'Восковая эмульсия'},
    {name:'Антидождь', price:420, category:'Автохимия', stock:25, description:'Вода скатывается', characteristics:'Нано-покрытие'}
  ];

  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (err) return;
    if (row.count === 0) {
      const stmt = db.prepare("INSERT INTO products (name, price, category, stock, description, characteristics) VALUES (?, ?, ?, ?, ?, ?)");
      for (const p of products) {
        stmt.run(p.name, p.price, p.category, p.stock, p.description, p.characteristics);
      }
      console.log('✅ Товары загружены');
    }
  });
}

// API endpoints (асинхронные)
app.get('/api/products', (req, res) => {
  db.all("SELECT * FROM products", (err, rows) => {
    if (err) res.status(500).json({error: err.message});
    else res.json(rows);
  });
});

app.post('/api/register', (req, res) => {
  const {email, password, phone} = req.body;
  db.run("INSERT INTO users (email, password, phone) VALUES (?, ?, ?)", [email, password, phone], function(err) {
    if (err) res.status(400).json({error: 'Email уже существует'});
    else res.json({success: true, userId: this.lastID});
  });
});

app.post('/api/login', (req, res) => {
  const {email, password} = req.body;
  db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, user) => {
    if (err || !user) res.status(401).json({error: 'Неверный email или пароль'});
    else res.json({success: true, user: {id: user.id, email: user.email, phone: user.phone}});
  });
});

app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  
  // Проверка наличия товаров
  let checkQuery = "SELECT stock FROM products WHERE id = ?";
  let allAvailable = true;
  let errorMsg = '';
  
  let completed = 0;
  for (const item of items) {
    db.get(checkQuery, [item.id], (err, row) => {
      if (err || !row || row.stock < item.quantity) {
        allAvailable = false;
        errorMsg = `Товар "${item.name}" недоступен`;
      }
      completed++;
      if (completed === items.length) {
        if (!allAvailable) {
          return res.status(400).json({error: errorMsg});
        }
        
        // Обновляем склад
        let updateCompleted = 0;
        for (const item of items) {
          db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.id], () => {
            updateCompleted++;
            if (updateCompleted === items.length) {
              const deliveryDate = new Date();
              deliveryDate.setDate(deliveryDate.getDate() + 1);
              
              db.run(`INSERT INTO orders (user_id, user_email, user_phone, pickup_point, payment_method, total, delivery_date, items)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id, user_email, user_phone, pickup_point, payment_method, total, deliveryDate.toISOString(), JSON.stringify(items)],
                function(err) {
                  if (err) res.status(500).json({error: err.message});
                  else res.json({success: true, orderId: this.lastID, deliveryDate: deliveryDate.toLocaleDateString('ru-RU')});
                });
            }
          });
        }
      }
    });
  }
});

app.get('/api/orders/:email', (req, res) => {
  db.all("SELECT * FROM orders WHERE user_email = ? ORDER BY order_date DESC", [req.params.email], (err, rows) => {
    if (err) res.status(500).json({error: err.message});
    else res.json(rows);
  });
});

app.get('/api/all-orders', (req, res) => {
  db.all("SELECT * FROM orders ORDER BY order_date DESC", (err, rows) => {
    if (err) res.status(500).json({error: err.message});
    else res.json(rows);
  });
});

app.put('/api/orders/:id/cancel', (req, res) => {
  db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [req.params.id], (err) => {
    if (err) res.status(500).json({error: err.message});
    else res.json({success: true});
  });
});

app.get('/api/products/search/:query', (req, res) => {
  const query = `%${req.params.query}%`;
  db.all("SELECT * FROM products WHERE name LIKE ? OR category LIKE ? OR characteristics LIKE ?", [query, query, query], (err, rows) => {
    if (err) res.status(500).json({error: err.message});
    else res.json(rows);
  });
});

app.post('/api/support', (req, res) => {
  res.json({success: true, status: 'offline'});
});

app.get('/api/stats', (req, res) => {
  db.get("SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders WHERE status != 'cancelled'", (err, row) => {
    if (err) res.json({total_orders: 0, total_revenue: 0});
    else res.json(row);
  });
});

app.get('/reports.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reports.html'));
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});