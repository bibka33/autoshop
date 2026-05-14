const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ========== ФАЙЛОВАЯ БАЗА ДАННЫХ (JSON) ==========
const DATA_FILE = './data.json';

// Инициализация данных
function initData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      products: [
        {id:1, name:'Масло моторное LADA Professional 5W-40', price:2100, category:'Двигатель', stock:25, description:'Оригинальное масло', characteristics:'5W-40, синтетика, 4л'},
        {id:2, name:'Ароматизатор "Кожа"', price:350, category:'Ароматизаторы', stock:50, description:'Запах дорогого авто', characteristics:'Стойкость 30 дней'},
        {id:3, name:'Ароматизатор "Мятная свежесть"', price:390, category:'Ароматизаторы', stock:45, description:'Мятный аромат', characteristics:'Гель 50мл'},
        {id:4, name:'Очиститель стёкол', price:280, category:'Автохимия', stock:30, description:'Без разводов', characteristics:'Зимний до -30°C'},
        {id:5, name:'Тормозные колодки LADA', price:1200, category:'Тормозная система', stock:20, description:'Оригинальные колодки', characteristics:'Керамические'},
        {id:6, name:'Воздушный фильтр LADA', price:450, category:'Двигатель', stock:30, description:'Очистка воздуха', characteristics:'Для LADA'},
        {id:7, name:'Аккумулятор LADA 60 Ач', price:4500, category:'Электрика', stock:8, description:'Стартерный', characteristics:'Пусковой ток 540А'},
        {id:8, name:'Амортизатор LADA', price:2200, category:'Подвеска', stock:18, description:'Гидравлический', characteristics:'Для Vesta/Granta'},
        {id:9, name:'Полироль для кузова', price:650, category:'Автохимия', stock:20, description:'Придаёт блеск', characteristics:'Восковая эмульсия'},
        {id:10, name:'Антидождь', price:420, category:'Автохимия', stock:25, description:'Вода скатывается', characteristics:'Нано-покрытие'}
      ],
      users: [],
      orders: [],
      favorites: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('✅ Данные инициализированы');
  }
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

initData();

// ========== API ==========
app.get('/api/products', (req, res) => {
  const data = readData();
  res.json(data.products);
});

app.post('/api/register', (req, res) => {
  const {email, password, phone} = req.body;
  const data = readData();
  if (data.users.find(u => u.email === email)) {
    return res.status(400).json({error: 'Email уже существует'});
  }
  const newUser = {id: Date.now(), email, password, phone, created_at: new Date()};
  data.users.push(newUser);
  writeData(data);
  res.json({success: true, userId: newUser.id});
});

app.post('/api/login', (req, res) => {
  const {email, password} = req.body;
  const data = readData();
  const user = data.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({error: 'Неверный email или пароль'});
  res.json({success: true, user: {id: user.id, email: user.email, phone: user.phone}});
});

app.post('/api/orders', (req, res) => {
  const {user_id, user_email, user_phone, pickup_point, payment_method, total, items} = req.body;
  const data = readData();
  
  // Проверка наличия
  for (const item of items) {
    const product = data.products.find(p => p.id === item.id);
    if (!product || product.stock < item.quantity) {
      return res.status(400).json({error: `Товар "${item.name}" недоступен`});
    }
  }
  
  // Уменьшаем склад
  for (const item of items) {
    const product = data.products.find(p => p.id === item.id);
    product.stock -= item.quantity;
  }
  
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 1);
  
  const newOrder = {
    id: Date.now(),
    user_id,
    user_email,
    user_phone,
    pickup_point,
    payment_method,
    total,
    status: 'processing',
    order_date: new Date(),
    delivery_date: deliveryDate,
    items: JSON.stringify(items)
  };
  data.orders.push(newOrder);
  writeData(data);
  
  res.json({success: true, orderId: newOrder.id, deliveryDate: deliveryDate.toLocaleDateString('ru-RU')});
});

app.get('/api/orders/:email', (req, res) => {
  const data = readData();
  const orders = data.orders.filter(o => o.user_email === req.params.email).sort((a,b) => new Date(b.order_date) - new Date(a.order_date));
  res.json(orders);
});

app.get('/api/all-orders', (req, res) => {
  const data = readData();
  res.json(data.orders.sort((a,b) => new Date(b.order_date) - new Date(a.order_date)));
});

app.put('/api/orders/:id/cancel', (req, res) => {
  const data = readData();
  const order = data.orders.find(o => o.id == req.params.id);
  if (order && order.status !== 'cancelled') {
    // Возвращаем товары на склад
    const items = JSON.parse(order.items);
    for (const item of items) {
      const product = data.products.find(p => p.id === item.id);
      if (product) product.stock += item.quantity;
    }
    order.status = 'cancelled';
    writeData(data);
  }
  res.json({success: true});
});

app.get('/api/products/search/:query', (req, res) => {
  const data = readData();
  const query = req.params.query.toLowerCase();
  const results = data.products.filter(p => 
    p.name.toLowerCase().includes(query) || 
    p.category.toLowerCase().includes(query) ||
    (p.characteristics && p.characteristics.toLowerCase().includes(query))
  );
  res.json(results);
});

app.post('/api/support', (req, res) => {
  console.log('Support request:', req.body);
  res.json({success: true, status: 'offline', message: 'Техподдержка в оффлайн режиме'});
});

app.get('/api/stats', (req, res) => {
  const data = readData();
  const activeOrders = data.orders.filter(o => o.status !== 'cancelled');
  const totalRevenue = activeOrders.reduce((sum, o) => sum + o.total, 0);
  res.json({total_orders: activeOrders.length, total_revenue: totalRevenue});
});

app.get('/reports.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reports.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});