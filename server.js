const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Используем SQLite через встроенный модуль (не требует установки)
const Database = require('sqlite3').verbose();
const db = new Database.Database('./autoshop.db');

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

// ========== API (промисы для удобства) ==========
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID });
    });
  });
}

// ========== ИНИЦИАЛИЗАЦИЯ ТОВАРОВ ==========
async function initProducts() {
  const products = [
    {name:'Масло моторное LADA Professional 5W-40', price:2100, category:'Двигатель', stock:25, description:'Оригинальное масло', characteristics:'5W-40, синтетика, 4л'},
    {name:'Ароматизатор "Кожа"', price:350, category:'Ароматизаторы', stock:50, description:'Запах дорогого авто', characteristics:'Стойкость 30 дней'},
    {name:'Очиститель стёкол', price:280, category:'Автохимия', stock:30, description:'Без разводов', characteristics:'Зимний до -30°C'}
  ];

  try {
    const row = await getQuery("SELECT COUNT(*) as count FROM products");
    if (row.count === 0) {
      for (const p of products) {
        await runQuery("INSERT INTO products (name, price, category, stock, description, characteristics) VALUES (?, ?, ?, ?, ?, ?)",
          [p.name, p.price, p.category, p.stock, p.description, p.characteristics]);
      }
      console.log('✅ Товары загружены');
    }
  } catch (err) {
    console.error('Ошибка:', err);
  }
}

// API endpoints
app.get('/api/products', async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM products");
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/register', async (req, res) => {
  const {email, password, phone} = req.body;
  try {
    await runQuery("INSERT INTO users (email, password, phone) VALUES (?, ?, ?)", [email, password, phone]);
    res.json({success: true});
  } catch (err) {
    res.status(400).json({error: 'Email уже существует'});
  }
});

app.post('/api/login', async (req, res) => {
  const {email, password} = req.body;
  try {
    const user = await getQuery("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);
    if (!user) return res.status(401).json({error: 'Неверный email или пароль'});
    res.json({success: true, user: {id: user.id, email: user.email, phone: user.phone}});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/orders', async (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  try {
    for (const item of items) {
      const product = await getQuery("SELECT stock FROM products WHERE id = ?", [item.id]);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({error: `Товар "${item.name}" недоступен`});
      }
    }
    for (const item of items) {
      await runQuery("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.id]);
    }
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    const result = await runQuery(`INSERT INTO orders (user_id, user_email, user_phone, pickup_point, payment_method, total, delivery_date, items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, user_email, user_phone, pickup_point, payment_method, total, deliveryDate.toISOString(), JSON.stringify(items)]);
    res.json({success: true, orderId: result.lastID, deliveryDate: deliveryDate.toLocaleDateString('ru-RU')});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/orders/:email', async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM orders WHERE user_email = ? ORDER BY order_date DESC", [req.params.email]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/all-orders', async (req, res) => {
  try {
    const rows = await allQuery("SELECT * FROM orders ORDER BY order_date DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    await runQuery("UPDATE orders SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/products/search/:query', async (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const rows = await allQuery("SELECT * FROM products WHERE name LIKE ? OR category LIKE ?", [query, query]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/support', (req, res) => {
  res.json({success: true, status: 'offline'});
});

app.get('/api/stats', async (req, res) => {
  try {
    const row = await getQuery("SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders WHERE status != 'cancelled'");
    res.json(row || {total_orders: 0, total_revenue: 0});
  } catch (err) {
    res.json({total_orders: 0, total_revenue: 0});
  }
});

app.get('/reports.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reports.html'));
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});