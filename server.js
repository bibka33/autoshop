const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Создаем базу данных в памяти для Railway (временное решение)
const db = new Database(':memory:');

// ========== СОЗДАНИЕ ТАБЛИЦ ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER DEFAULT 10,
    description TEXT,
    characteristics TEXT
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
    items TEXT
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER,
    product_id INTEGER,
    PRIMARY KEY (user_id, product_id)
  );
`);

// ========== ИНИЦИАЛИЗАЦИЯ ТОВАРОВ ==========
const products = [
  {name:'Масло моторное LADA Professional 5W-40', price:2100, category:'Двигатель', stock:25, characteristics:'5W-40, синтетика, 4л'},
  {name:'Воздушный фильтр LADA', price:450, category:'Двигатель', stock:30, characteristics:'Для Granta, Kalina, Priora'},
  {name:'Свечи зажигания LADA', price:350, category:'Двигатель', stock:40, characteristics:'Комплект 4 шт'},
  {name:'Тормозные колодки LADA', price:1200, category:'Тормозная система', stock:20, characteristics:'Керамические, комплект 4 шт'},
  {name:'Тормозной диск LADA', price:1800, category:'Тормозная система', stock:12, characteristics:'Диаметр 260мм'},
  {name:'Амортизатор LADA', price:2200, category:'Подвеска', stock:18, characteristics:'Для Vesta/Granta'},
  {name:'Пружина подвески LADA', price:1500, category:'Подвеска', stock:10, characteristics:'Высота +20мм'},
  {name:'Аккумулятор LADA 60 Ач', price:4500, category:'Электрика', stock:8, characteristics:'Пусковой ток 540А'},
  {name:'Генератор LADA 120А', price:5500, category:'Электрика', stock:5, characteristics:'Для Vesta/XRAY'},
  {name:'Ароматизатор Кожа', price:350, category:'Ароматизаторы', stock:50, characteristics:'Стойкость 30 дней'},
  {name:'Ароматизатор Мятная свежесть', price:390, category:'Ароматизаторы', stock:45, characteristics:'Гель 50мл'},
  {name:'Очиститель стёкол', price:280, category:'Автохимия', stock:30, characteristics:'Зимний до -30°C'},
  {name:'Полироль для кузова', price:650, category:'Автохимия', stock:20, characteristics:'Восковая эмульсия 250мл'},
  {name:'Антидождь', price:420, category:'Автохимия', stock:25, characteristics:'Нано-покрытие 100мл'}
];

const stmt = db.prepare("INSERT INTO products (name, price, category, stock, characteristics) VALUES (?, ?, ?, ?, ?)");
for (const p of products) {
  stmt.run(p.name, p.price, p.category, p.stock, p.characteristics);
}

// API endpoints
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
    deliveryDate.setDate(deliveryDate.getDate() + 1);
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

app.put('/api/orders/:id/cancel', (req, res) => {
  try {
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(req.params.id);
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/products/search/:query', (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const rows = db.prepare(`
      SELECT * FROM products
      WHERE name LIKE ? OR category LIKE ? OR characteristics LIKE ?
    `).all(query, query, query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/support', (req, res) => {
  res.json({success: true, status: 'offline'});
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});