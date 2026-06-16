require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const { dbAll, dbGet, dbRun, initDatabase, quoteId } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const TWO_FACTOR_DISABLED = process.env.DISABLE_2FA === 'true';

initDatabase().then(startServer).catch(err => {
  console.error('Database init failed:', err.message);
  process.exit(1);
});

// Helper: áº©n sá»‘ Ä‘iá»‡n thoáº¡i (chá»‰ giá»¯ 3 sá»‘ cuá»‘i)
function maskPhone(phone) {
  if (!phone) return 'â€”';
  return phone.replace(/\d(?=\d{3})/g, '*');
}

// â”€â”€ Profile helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PROFILE_PATH = path.join(__dirname, 'data', 'profile.json');
function loadProfile() {
  if (!fs.existsSync(PROFILE_PATH)) {
    const def = { username: process.env.ADMIN_USERNAME || 'admin',
                  email: process.env.ADMIN_EMAIL || 'admin@example.com',
                  avatar: null, twoFactorEnabled: true };
    fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(def, null, 2));
    return def;
  }
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}
function saveProfile(data) {
  data.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(data, null, 2));
}

// â”€â”€ OTP store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const otpStore = {};
function generateOTP() { return crypto.randomInt(100000, 999999).toString(); }
function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}
async function sendOTP(email, otp) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Northwind Portal" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'đŸ” MĂ£ OTP ÄÄƒng Nháº­p â€“ Northwind Database',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#6c63ff,#a78bfa);padding:28px 32px;text-align:center">
          <h1 style="margin:0;font-size:22px;color:#fff">đŸ§­ Northwind Portal</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">XĂ¡c thá»±c 2 bÆ°á»›c</p>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 16px">MĂ£ OTP Ä‘Äƒng nháº­p cá»§a báº¡n lĂ :</p>
          <div style="background:rgba(108,99,255,0.15);border:1px solid rgba(108,99,255,0.4);border-radius:12px;padding:20px;text-align:center">
            <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#a78bfa">${otp}</span>
          </div>
          <p style="margin:20px 0 0;font-size:13px;color:#64748b">â± MĂ£ cĂ³ hiá»‡u lá»±c trong <strong>5 phĂºt</strong>. KhĂ´ng chia sáº» mĂ£ nĂ y vá»›i ai.</p>
        </div>
      </div>`
  });
}

// Helper dĂ¹ng chung cho gá»­i OTP (login + resend)
async function sendOTPToUser(username, res, step) {
  const profile = loadProfile();
  const otp = generateOTP();
  otpStore[username] = { otp, expires: Date.now() + 5 * 60 * 1000, email: profile.email };
  const maskedEmail = profile.email.replace(/(.{2}).+(@.+)/, '$1***$2');
  const isDevMode = process.env.EMAIL_PASS === 'your_16_char_app_password_here' || !process.env.EMAIL_PASS;
  if (isDevMode) {
    console.log(`\nâ ï¸  [DEV MODE] OTP cho "${username}": ${otp}\n`);
    return res.json({ success: true, step, email: maskedEmail, devMode: true });
  }
  try {
    await sendOTP(profile.email, otp);
    res.json({ success: true, step, email: maskedEmail });
  } catch (err) {
    console.error('Email error:', err.message);
    delete otpStore[username];
    res.status(500).json({ success: false, message: `KhĂ´ng thá»ƒ gá»­i email OTP: ${err.message}` });
  }
}

// â”€â”€ Multer â€“ avatar upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'avatar' + path.extname(file.originalname))
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chá»‰ cháº¥p nháº­n file áº£nh'));
  }
});

// â”€â”€ Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
}));

// â”€â”€ Auth middlewares â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.authenticated && req.session.role === 'admin') return next();
  if (req.session && req.session.authenticated) return res.status(403).json({ error: 'Chá»‰ admin má»›i cĂ³ quyá»n thá»±c hiá»‡n thao tĂ¡c nĂ y' });
  res.redirect('/');
}

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect(req.session.role === 'admin' ? '/dashboard' : '/user');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// â”€â”€ Auth: BÆ°á»›c 1 â€“ xĂ¡c minh máº­t kháº©u â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  let role = null;
  let hash = null;
  if (username === process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) {
    role = 'admin'; hash = process.env.ADMIN_PASSWORD_HASH;
  } else if (username === process.env.USER_USERNAME && process.env.USER_PASSWORD_HASH) {
    role = 'user'; hash = process.env.USER_PASSWORD_HASH;
  }

  if (!role) return res.status(401).json({ success: false, message: 'TĂªn Ä‘Äƒng nháº­p hoáº·c máº­t kháº©u khĂ´ng Ä‘Ăºng' });

  try {
    const match = await bcrypt.compare(password, hash);
    if (!match) return res.status(401).json({ success: false, message: 'TĂªn Ä‘Äƒng nháº­p hoáº·c máº­t kháº©u khĂ´ng Ä‘Ăºng' });
  } catch { return res.status(500).json({ success: false, message: 'Lá»—i xĂ¡c thá»±c' }); }

  const redirect = role === 'admin' ? '/dashboard' : '/user';

  // User luĂ´n bá» qua 2FA; Admin tuá»³ cáº¥u hĂ¬nh
  if (TWO_FACTOR_DISABLED || role === 'user') {
    req.session.authenticated = true;
    req.session.username = username;
    req.session.role = role;
    req.session.loginTime = new Date().toISOString();
    return res.json({ success: true, redirect });
  }

  req.session.pendingAuth = username;
  req.session.pendingRole = role;
  await sendOTPToUser(username, res, 'otp');
});

// â”€â”€ Auth: BÆ°á»›c 2 â€“ xĂ¡c minh OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/auth/verify-otp', (req, res) => {
  const { username, otp } = req.body;
  const record = otpStore[username];
  if (!record) return res.status(400).json({ success: false, message: 'PhiĂªn OTP khĂ´ng tá»“n táº¡i. Vui lĂ²ng Ä‘Äƒng nháº­p láº¡i' });
  if (Date.now() > record.expires) {
    delete otpStore[username];
    return res.status(400).json({ success: false, message: 'MĂ£ OTP Ä‘Ă£ háº¿t háº¡n. Vui lĂ²ng Ä‘Äƒng nháº­p láº¡i' });
  }
  if (otp !== record.otp) return res.status(401).json({ success: false, message: 'MĂ£ OTP khĂ´ng Ä‘Ăºng' });
  delete otpStore[username];
  const role = req.session.pendingRole || 'admin';
  delete req.session.pendingAuth;
  delete req.session.pendingRole;
  req.session.authenticated = true;
  req.session.username = username;
  req.session.role = role;
  req.session.loginTime = new Date().toISOString();
  res.json({ success: true, redirect: role === 'admin' ? '/dashboard' : '/user' });
});

// â”€â”€ Auth: Gá»­i láº¡i OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/auth/resend-otp', async (req, res) => {
  const username = req.session.pendingAuth;
  if (!username) return res.status(400).json({ success: false, message: 'PhiĂªn xĂ¡c thá»±c khĂ´ng há»£p lá»‡. Vui lĂ²ng Ä‘Äƒng nháº­p láº¡i' });
  await sendOTPToUser(username, res, 'resend');
});

// â”€â”€ Auth: ÄÄƒng xuáº¥t â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// â”€â”€ Pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/dashboard', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/user', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-dashboard.html'));
});

// â”€â”€ API: Session + Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/me', requireAuth, async (req, res) => {
  const profile = loadProfile();
  res.json({ username: req.session.username, loginTime: req.session.loginTime,
             role: req.session.role, email: profile.email, avatar: profile.avatar });
});

app.get('/api/profile', requireAuth, async (req, res) => {
  const p = loadProfile();
  res.json({ username: p.username, email: p.email, avatar: p.avatar, twoFactorEnabled: p.twoFactorEnabled });
});

app.post('/api/profile/email', requireAdmin, (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ success: false, message: 'Email khĂ´ng há»£p lá»‡' });
  const p = loadProfile();
  p.email = email.trim();
  saveProfile(p);
  res.json({ success: true, message: 'Email Ä‘Ă£ cáº­p nháº­t thĂ nh cĂ´ng' });
});

app.post('/api/profile/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ success: false, message: 'Máº­t kháº©u má»›i pháº£i Ă­t nháº¥t 8 kĂ½ tá»±' });
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  const match = await bcrypt.compare(currentPassword, expectedHash).catch(() => false);
  if (!match) return res.status(401).json({ success: false, message: 'Máº­t kháº©u hiá»‡n táº¡i khĂ´ng Ä‘Ăºng' });
  const newHash = await bcrypt.hash(newPassword, 12);
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/^ADMIN_PASSWORD_HASH=.*/m, `ADMIN_PASSWORD_HASH=${newHash}`);
  fs.writeFileSync(envPath, envContent);
  process.env.ADMIN_PASSWORD_HASH = newHash;
  res.json({ success: true, message: 'Máº­t kháº©u Ä‘Ă£ thay Ä‘á»•i thĂ nh cĂ´ng' });
});

app.post('/api/profile/avatar', requireAdmin, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'KhĂ´ng cĂ³ file Ä‘Æ°á»£c táº£i lĂªn' });
  const avatarUrl = '/uploads/' + req.file.filename;
  const p = loadProfile();
  p.avatar = avatarUrl;
  saveProfile(p);
  res.json({ success: true, avatar: avatarUrl, message: 'áº¢nh Ä‘áº¡i diá»‡n Ä‘Ă£ cáº­p nháº­t' });
}, (err, req, res, next) => {
  res.status(400).json({ success: false, message: err.message });
});

// â”€â”€ API: Thá»‘ng kĂª â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const keys = ['Customers','Orders','Products','Employees','Suppliers','Categories','Shippers','Territories'];
    const stats = {};
    for (const k of keys) {
      const row = await dbGet(`SELECT COUNT(*) as n FROM ${quoteId(k)}`);
      stats[k.toLowerCase()] = row ? row.n : 0;
    }
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: Doanh thu theo danh má»¥c â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/sales-by-category', requireAuth, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT c.CategoryName,
             ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) as Revenue,
             COUNT(DISTINCT o.OrderID) as Orders
      FROM [Order Details] od
      JOIN Products   p ON od.ProductID  = p.ProductID
      JOIN Categories c ON p.CategoryID  = c.CategoryID
      JOIN Orders     o ON od.OrderID    = o.OrderID
      GROUP BY c.CategoryName ORDER BY Revenue DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: KhĂ¡ch hĂ ng â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/customers', requireAuth, async (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const offset = (page - 1) * limit;
  const isUser = req.session.role !== 'admin';
  try {
    const where = search ? 'WHERE CompanyName LIKE ? OR ContactName LIKE ?' : '';
    const searchParams = search ? [`%${search}%`, `%${search}%`] : [];
    const rows  = await dbAll(`SELECT CustomerID, CompanyName, ContactName, City, Country, Phone FROM Customers ${where} LIMIT ? OFFSET ?`, [...searchParams, limit, offset]);
    if (isUser) rows.forEach(r => { r.Phone = maskPhone(r.Phone); });
    const totalRow = await dbGet(`SELECT COUNT(*) as n FROM Customers ${where}`, searchParams);
    const total = totalRow?.n || 0;
    res.json({ data: rows, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers/:id', requireAdmin, async (req, res) => {
  const row = await dbGet('SELECT * FROM Customers WHERE CustomerID = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'KhĂ´ng tĂ¬m tháº¥y' });
  res.json(row);
});

app.put('/api/customers/:id', requireAdmin, async (req, res) => {
  const { CompanyName, ContactName, ContactTitle, Address, City, Region, PostalCode, Country, Phone, Fax } = req.body;
  try {
    await dbRun(`UPDATE Customers SET CompanyName=?, ContactName=?, ContactTitle=?, Address=?, City=?, Region=?, PostalCode=?, Country=?, Phone=?, Fax=? WHERE CustomerID=?`,
      [CompanyName, ContactName, ContactTitle, Address, City, Region, PostalCode, Country, Phone, Fax, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/customers/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM Customers WHERE CustomerID=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: ÄÆ¡n hĂ ng â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/orders', requireAuth, async (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  try {
    const rows = await dbAll(`
      SELECT o.OrderID, c.CompanyName as Customer,
             e.FirstName || ' ' || e.LastName as Employee,
             o.OrderDate, o.ShippedDate, o.Freight, o.ShipCountry
      FROM Orders o
      LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
      LEFT JOIN Employees e ON o.EmployeeID = e.EmployeeID
      ORDER BY o.OrderID DESC LIMIT ? OFFSET ?
    `, [limit, offset]);
    const totalRow = await dbGet('SELECT COUNT(*) as n FROM Orders');
    const total = totalRow?.n || 0;
    res.json({ data: rows, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM [Order Details] WHERE OrderID=?', [req.params.id]);
    await dbRun('DELETE FROM Orders WHERE OrderID=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: Sáº£n pháº©m â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/products', requireAuth, async (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';
  const offset = (page - 1) * limit;
  try {
    const where = search ? 'WHERE p.ProductName LIKE ?' : '';
    const searchParams = search ? [`%${search}%`] : [];
    const rows = await dbAll(`
      SELECT p.ProductID, p.ProductName, c.CategoryName,
             s.CompanyName as Supplier, p.UnitPrice, p.UnitsInStock, p.Discontinued
      FROM Products p
      LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
      LEFT JOIN Suppliers  s ON p.SupplierID = s.SupplierID
      ${where} ORDER BY p.ProductName LIMIT ? OFFSET ?
    `, [...searchParams, limit, offset]);
    const totalRow = await dbGet(`SELECT COUNT(*) as n FROM Products p ${where}`, searchParams);
    const total = totalRow?.n || 0;
    res.json({ data: rows, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:id', requireAdmin, async (req, res) => {
  const row = await dbGet('SELECT ProductID, ProductName, SupplierID, CategoryID, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued FROM Products WHERE ProductID=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'KhĂ´ng tĂ¬m tháº¥y' });
  res.json(row);
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const { ProductName, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued } = req.body;
  try {
    await dbRun(`UPDATE Products SET ProductName=?, UnitPrice=?, UnitsInStock=?, UnitsOnOrder=?, ReorderLevel=?, Discontinued=? WHERE ProductID=?`,
      [ProductName, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM Products WHERE ProductID=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: NhĂ¢n viĂªn â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/employees', requireAuth, async (req, res) => {
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const isUser = req.session.role !== 'admin';
  try {
    const rows = await dbAll(`
      SELECT e.EmployeeID, e.FirstName || ' ' || e.LastName as FullName,
             e.Title, e.City, e.Country, e.HomePhone, e.HireDate,
             m.FirstName || ' ' || m.LastName as Manager
      FROM Employees e
      LEFT JOIN Employees m ON e.ReportsTo = m.EmployeeID
      ORDER BY e.EmployeeID LIMIT ? OFFSET ?
    `, [limit, offset]);
    if (isUser) rows.forEach(r => { r.HomePhone = maskPhone(r.HomePhone); });
    const totalRow = await dbGet('SELECT COUNT(*) as n FROM Employees');
    const total = totalRow?.n || 0;
    res.json({ data: rows, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employees/:id', requireAdmin, async (req, res) => {
  const row = await dbGet('SELECT EmployeeID, FirstName, LastName, Title, City, Country, Region, HomePhone, HireDate, ReportsTo FROM Employees WHERE EmployeeID=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'KhĂ´ng tĂ¬m tháº¥y' });
  res.json(row);
});

app.put('/api/employees/:id', requireAdmin, async (req, res) => {
  const { FirstName, LastName, Title, City, Country, Region, HomePhone } = req.body;
  try {
    await dbRun(`UPDATE Employees SET FirstName=?, LastName=?, Title=?, City=?, Country=?, Region=?, HomePhone=? WHERE EmployeeID=?`,
      [FirstName, LastName, Title, City, Country, Region, HomePhone, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employees/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM EmployeeTerritories WHERE EmployeeID=?', [req.params.id]);
    await dbRun('DELETE FROM Employees WHERE EmployeeID=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: NhĂ  cung cáº¥p â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/suppliers', requireAuth, async (req, res) => {
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const isUser = req.session.role !== 'admin';
  try {
    const rows = await dbAll(`
      SELECT SupplierID, CompanyName, ContactName, ContactTitle, City, Country, Phone
      FROM Suppliers ORDER BY CompanyName LIMIT ? OFFSET ?
    `, [limit, offset]);
    if (isUser) rows.forEach(r => { r.Phone = maskPhone(r.Phone); });
    const totalRow = await dbGet('SELECT COUNT(*) as n FROM Suppliers');
    const total = totalRow?.n || 0;
    res.json({ data: rows, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/suppliers/:id', requireAdmin, async (req, res) => {
  const row = await dbGet('SELECT SupplierID, CompanyName, ContactName, ContactTitle, Address, City, Region, PostalCode, Country, Phone, Fax, HomePage FROM Suppliers WHERE SupplierID=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'KhĂ´ng tĂ¬m tháº¥y' });
  res.json(row);
});

app.put('/api/suppliers/:id', requireAdmin, async (req, res) => {
  const { CompanyName, ContactName, ContactTitle, Address, City, Region, PostalCode, Country, Phone, Fax, HomePage } = req.body;
  try {
    await dbRun(`UPDATE Suppliers SET CompanyName=?, ContactName=?, ContactTitle=?, Address=?, City=?, Region=?, PostalCode=?, Country=?, Phone=?, Fax=?, HomePage=? WHERE SupplierID=?`,
      [CompanyName, ContactName, ContactTitle, Address, City, Region, PostalCode, Country, Phone, Fax, HomePage, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/suppliers/:id', requireAdmin, async (req, res) => {
  try {
    await dbRun('DELETE FROM Suppliers WHERE SupplierID=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: Danh má»¥c â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT c.CategoryID, c.CategoryName, c.Description, COUNT(p.ProductID) as ProductCount
      FROM Categories c LEFT JOIN Products p ON c.CategoryID = p.CategoryID
      GROUP BY c.CategoryID, c.CategoryName, c.Description ORDER BY c.CategoryName
    `);
    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: Váº­n chuyá»ƒn â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/shippers', requireAuth, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT s.ShipperID, s.CompanyName, s.Phone, COUNT(o.OrderID) as TotalOrders
      FROM Shippers s LEFT JOIN Orders o ON s.ShipperID = o.ShipVia
      GROUP BY s.ShipperID, s.CompanyName, s.Phone ORDER BY s.CompanyName
    `);
    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ API: VĂ¹ng â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/regions', requireAuth, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT r.RegionID, r.RegionDescription, COUNT(t.TerritoryID) as TerritoryCount
      FROM Regions r LEFT JOIN Territories t ON r.RegionID = t.RegionID
      GROUP BY r.RegionID, r.RegionDescription ORDER BY r.RegionID
    `);
    res.json({ data: rows, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// â”€â”€ Start server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function startServer() {
  app.listen(PORT, () => {
    console.log(`\nđŸ€ Northwind Web App: http://localhost:${PORT}`);
    console.log(`đŸ‘‘ Admin: admin / Admin@2024  â†’  /dashboard`);
    console.log(`đŸ‘¤ User:  user  / User@2024   â†’  /user\n`);
  });
}

