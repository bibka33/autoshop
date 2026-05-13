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
    // Двигатель
    {name:'Масло моторное ТЕSMA (2+1)', price:3200, category:'Двигатель', stock:10, description:'Отличное масло для любых двигателей', characteristics:'Вязкость 5W-40, синтетика'},
    {name:'Воздушный фильтр Mann (с углем)', price:850, category:'Двигатель', stock:15, description:'Очистка воздуха от пыли', characteristics:'Размер: 234x184 мм'},
    {name:'Свечи зажигания NGK (иридиевые)', price:1800, category:'Двигатель', stock:20, description:'Долгий срок службы', characteristics:'Иридиевый наконечник'},
    {name:'Топливный фильтр Knecht (с отстойником)', price:1200, category:'Двигатель', stock:12, description:'Фильтрация топлива', characteristics:'Для дизеля/бензина'},
    // Тормозная система
    {name:'Тормозные колодки Brembo (передние)', price:2500, category:'Тормозная система', stock:8, description:'Высокое качество', characteristics:'Керамические'},
    {name:'Тормозной диск ATE (вентилируемый)', price:4200, category:'Тормозная система', stock:6, description:'Не перегревается', characteristics:'Диаметр 300мм'},
    // Подвеска
    {name:'Амортизатор Sachs (газовый)', price:5400, category:'Подвеска', stock:7, description:'Плавность хода', characteristics:'Газомасляный'},
    {name:'Пружины подвески Kilen (усиленные)', price:3100, category:'Подвеска', stock:5, description:'Для тяжелых условий', characteristics:'Высота +30мм'},
    // Электрика
    {name:'Аккумулятор Varta (70 Ач)', price:7200, category:'Электрика', stock:4, description:'Пусковой ток 640А', characteristics:'AGM технология'},
    {name:'Генератор Bosch (140А)', price:8900, category:'Электрика', stock:3, description:'Надёжная зарядка', characteristics:'Для иномарок'},
    // НОВЫЕ КАТЕГОРИИ
    {name:'Ароматизатор «Кожа»', price:350, category:'Ароматизаторы', stock:50, description:'Запах дорогого авто', characteristics:'Стойкость 30 дней'},
    {name:'Ароматизатор «Мятная свежесть»', price:390, category:'Ароматизаторы', stock:45, description:'Приятный мятный аромат', characteristics:'Подвеска на зеркало'},
    {name:'Ароматизатор «Ваниль»', price:320, category:'Ароматизаторы', stock:60, description:'Сладкий ванильный запах', characteristics:'Гель в баночке'},
    {name:'Очиститель стёкол 500мл', price:280, category:'Автохимия', stock:30, description:'Без разводов', characteristics:'Зимний -30°C'},
    {name:'Жидкость для омывателя', price:150, category:'Автохимия', stock:40, description:'С запахом яблока', characteristics:'Концентрат 1:5'},
    {name:'Полироль для кузова', price:650, category:'Автохимия', stock:20, description:'Придаёт блеск', characteristics:'Восковая эмульсия'},
    {name:'Антидождь', price:420, category:'Автохимия', stock:25, description:'Вода скатывается', characteristics:'Нано-покрытие'}
  ];

  const count = db.prepare("SELECT COUNT(*) as count FROM products").get();
  if (count.count === 0) {
    const stmt = db.prepare("INSERT INTO products (name, price, category, stock, description, characteristics) VALUES (?, ?, ?, ?, ?, ?)");
    for (const p of products) {
      stmt.run(p.name, p.price, p.category, p.stock, p.description, p.characteristics);
    }
    console.log('✅ Товары с ароматизаторами и автохимией загружены в БД');
  }
}

// ========== API ==========
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

// Оформление заказа с проверкой stock
app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  try {
    // Проверяем, что товары есть на складе
    for (const item of items) {
      const product = db.prepare("SELECT stock FROM products WHERE id = ?").get(item.id);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({error: `Товар "${item.name}" в количестве ${item.quantity} недоступен (остаток: ${product?.stock || 0})`});
      }
    }

    // Уменьшаем склад
    for (const item of items) {
      db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.id);
    }

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 2); // через 2 дня и готов к выдаче

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

app.get('/api/all-orders', (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM orders ORDER BY order_date DESC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.put('/api/orders/:id/cancel', (req, res) => {
  try {
    // Можно также вернуть товары на склад
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(req.params.id);
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// Экспорт в Excel
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
      'Телефон': order.user_phone,
      'Пункт выдачи': order.pickup_point,
      'Оплата': order.payment_method,
      'Сумма (₽)': order.total,
      'Статус': order.status === 'pending' ? 'Активен' : 'Отменён',
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

app.get('/api/stats', (req, res) => {
  try {
    const stats = db.prepare("SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders WHERE status != 'cancelled'").get();
    res.json(stats);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});



// ===== Техническая поддержка =====
app.post('/api/support', (req, res) => {
  const {name, contact, message} = req.body;
  res.json({
    success: true,
    status: 'offline',
    message: 'Техническая поддержка временно работает в оффлайн режиме'
  });
});

// ===== Поиск товаров =====
app.get('/api/products/search/:query', (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const rows = db.prepare(`
      SELECT * FROM products
      WHERE name LIKE ?
      OR category LIKE ?
      OR description LIKE ?
    `).all(query, query, query);

    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 Отчётность: http://localhost:${PORT}/reports.html`);
});