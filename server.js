const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const db = new Database('./autoshop.db');

// ========== СОЗДАНИЕ ТАБЛИЦ ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER DEFAULT 10,
    description TEXT,
    characteristics TEXT,
    image TEXT
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
    status TEXT DEFAULT 'processing',
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

// ========== ИНИЦИАЛИЗАЦИЯ ТОВАРОВ ==========
function initProducts() {
  const products = [
    {name:'Масло моторное ТЕSMA (2+1)', price:3200, category:'Двигатель', stock:10},
    {name:'Воздушный фильтр Mann (с углем)', price:850, category:'Двигатель', stock:15},
    {name:'Свечи зажигания NGK (иридиевые)', price:1800, category:'Двигатель', stock:20},
    {name:'Тормозные колодки Brembo (передние)', price:2500, category:'Тормозная система', stock:8},
    {name:'Тормозной диск ATE (вентилируемый)', price:4200, category:'Тормозная система', stock:6},
    {name:'Амортизатор Sachs (газовый)', price:5400, category:'Подвеска', stock:7},
    {name:'Аккумулятор Varta (70 Ач)', price:7200, category:'Электрика', stock:4}
  ];

  const count = db.prepare("SELECT COUNT(*) as count FROM products").get();
  if (count.count === 0) {
    const stmt = db.prepare("INSERT INTO products (name, price, category, stock) VALUES (?, ?, ?, ?)");
    for (const p of products) {
      stmt.run(p.name, p.price, p.category, p.stock);
    }
    console.log('✅ Товары загружены в БД');
  }
}

// API endpoints (ваши оригинальные)
app.get('/api/products', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM products").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/register', (req, res) => {
  const {email, password, phone} = req.body;
  try {
    const result = db.prepare("INSERT INTO users (email, password, phone) VALUES (?, ?, ?)").run(email, password, phone);
    res.json({success: true, userId: result.lastInsertRowid});
  } catch (err) {
    res.status(400).json({error: 'Email уже существует'});
  }
});

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

app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  try {
    for (const item of items) {
      const product = db.prepare("SELECT stock FROM products WHERE id = ?").get(item.id);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({error: `Товар "${item.name}" недоступен`});
      }
    }
    for (const item of items) {
      db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.id);
    }
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 2);
    const result = db.prepare(`
      INSERT INTO orders (user_id, user_email, user_phone, pickup_point, payment_method, total, delivery_date, items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, user_email, user_phone, pickup_point, payment_method, total, deliveryDate.toISOString(), JSON.stringify(items));
    res.json({success: true, orderId: result.lastInsertRowid, deliveryDate: deliveryDate.toLocaleDateString('ru-RU')});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/orders/:email', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM orders WHERE user_email = ? ORDER BY order_date DESC").all(req.params.email);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/products/search/:query', (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const rows = db.prepare("SELECT * FROM products WHERE name LIKE ? OR category LIKE ?").all(query, query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});