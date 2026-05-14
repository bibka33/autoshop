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
app.use(express.static('.')); // Изменено с 'public' на '.' так как index.html в корне

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
    // Двигатель (LADA)
    {name:'Масло моторное LADA Professional 5W-40', price:2100, category:'Двигатель', stock:25, description:'Оригинальное масло для двигателей LADA', characteristics:'Вязкость 5W-40, синтетика, 4л'},
    {name:'Воздушный фильтр LADA (оригинал)', price:450, category:'Двигатель', stock:30, description:'Очистка воздуха от пыли', characteristics:'Для LADA Granta, Kalina, Priora'},
    {name:'Свечи зажигания LADA (A17DVRM)', price:350, category:'Двигатель', stock:40, description:'Оригинальные свечи', characteristics:'Комплект 4 шт, зазор 1.0-1.1мм'},
    {name:'Ремень ГРМ LADA', price:890, category:'Двигатель', stock:15, description:'Зубчатый ремень', characteristics:'Для 8-ми клапанных двигателей'},
    // Тормозная система
    {name:'Тормозные колодки LADA (передние)', price:1200, category:'Тормозная система', stock:20, description:'Оригинальные колодки', characteristics:'Керамические, комплект 4 шт'},
    {name:'Тормозной диск LADA', price:1800, category:'Тормозная система', stock:12, description:'Вентилируемый диск', characteristics:'Диаметр 260мм, для Granta/Kalina'},
    {name:'Тормозная жидкость DOT-4', price:350, category:'Тормозная система', stock:35, description:'Для всех моделей LADA', characteristics:'500мл, температура кипения 260°C'},
    // Подвеска
    {name:'Амортизатор LADA (передний)', price:2200, category:'Подвеска', stock:18, description:'Гидравлический амортизатор', characteristics:'Для Vesta/Granta'},
    {name:'Пружина подвески LADA', price:1500, category:'Подвеска', stock:10, description:'Усиленная пружина', characteristics:'Высота +20мм'},
    {name:'Сайлентблок LADA', price:280, category:'Подвеска', stock:45, description:'Резинометаллический', characteristics:'Для поперечной рычага'},
    // Электрика
    {name:'Аккумулятор LADA 60 Ач', price:4500, category:'Электрика', stock:8, description:'Стартерный аккумулятор', characteristics:'Пусковой ток 540А, кальций'},
    {name:'Генератор LADA 120А', price:5500, category:'Электрика', stock:5, description:'Оригинальный генератор', characteristics:'Для Vesta/XRAY'},
    {name:'Лампочка головного света H4', price:280, category:'Электрика', stock:60, description:'Галогеновая лампа', characteristics:'12V, 60/55W, комплект 2 шт'},
    // АРОМАТИЗАТОРЫ
    {name:'Ароматизатор «Кожа»', price:350, category:'Ароматизаторы', stock:50, description:'Запах дорогого авто', characteristics:'Стойкость 30 дней, подвеска на зеркало'},
    {name:'Ароматизатор «Мятная свежесть»', price:390, category:'Ароматизаторы', stock:45, description:'Приятный мятный аромат', characteristics:'Гель в баночке 50мл'},
    {name:'Ароматизатор «Ваниль»', price:320, category:'Ароматизаторы', stock:60, description:'Сладкий ванильный запах', characteristics:'Жидкий, на панель'},
    {name:'Ароматизатор «Спорт»', price:400, category:'Ароматизаторы', stock:35, description:'Дерзкий мужской аромат', characteristics:'Подвеска, 60 дней'},
    {name:'Ароматизатор «Кондиционер»', price:280, category:'Ароматизаторы', stock:55, description:'Имитация чистого кондиционера', characteristics:'Гель в баночке 40мл'},
    // АВТОХИМИЯ
    {name:'Очиститель стёкол 500мл', price:280, category:'Автохимия', stock:30, description:'Без разводов', characteristics:'Зимний, до -30°C'},
    {name:'Жидкость для омывателя', price:150, category:'Автохимия', stock:40, description:'С запахом яблока', characteristics:'Концентрат 1:5, 1л'},
    {name:'Полироль для кузова', price:650, category:'Автохимия', stock:20, description:'Придаёт блеск и защищает', characteristics:'Восковая эмульсия 250мл'},
    {name:'Антидождь', price:420, category:'Автохимия', stock:25, description:'Вода скатывается со стекла', characteristics:'Нано-покрытие 100мл'},
    {name:'Очиститель дисков и суппортов', price:380, category:'Автохимия', stock:18, description:'Удаляет тормозную пыль', characteristics:'500мл, аэрозоль'},
    {name:'Смазка WD-40', price:320, category:'Автохимия', stock:42, description:'Многофункциональная смазка', characteristics:'200мл, оригинал'}
  ];

  const count = db.prepare("SELECT COUNT(*) as count FROM products").get();
  if (count.count === 0) {
    const stmt = db.prepare("INSERT INTO products (name, price, category, stock, description, characteristics) VALUES (?, ?, ?, ?, ?, ?)");
    for (const p of products) {
      stmt.run(p.name, p.price, p.category, p.stock, p.description, p.characteristics);
    }
    console.log('✅ Товары загружены в БД');
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

app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  try {
    for (const item of items) {
      const product = db.prepare("SELECT stock, name FROM products WHERE id = ?").get(item.id);
      if (!product) {
        return res.status(400).json({error: `Товар "${item.name}" не найден`});
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({error: `Товар "${item.name}" в количестве ${item.quantity} недоступен (остаток: ${product.stock})`});
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
    const order = db.prepare("SELECT items FROM orders WHERE id = ?").get(req.params.id);
    if (order && order.items) {
      const items = JSON.parse(order.items);
      for (const item of items) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.quantity, item.id);
      }
    }
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(req.params.id);
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

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
      'Дата готовности': order.delivery_date,
      'Email клиента': order.user_email,
      'Телефон': order.user_phone,
      'Пункт выдачи': order.pickup_point,
      'Оплата': order.payment_method,
      'Сумма (₽)': order.total,
      'Статус': order.status === 'processing' ? 'Активен' : 'Отменён',
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

app.post('/api/support', (req, res) => {
  const {name, contact, message} = req.body;
  res.json({
    success: true,
    status: 'offline',
    message: 'Техническая поддержка временно работает в оффлайн режиме. Мы свяжемся с вами в ближайшее время!'
  });
});

app.get('/api/products/search/:query', (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const rows = db.prepare(`
      SELECT * FROM products
      WHERE name LIKE ?
      OR category LIKE ?
      OR description LIKE ?
      OR characteristics LIKE ?
    `).all(query, query, query, query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

initProducts();
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});