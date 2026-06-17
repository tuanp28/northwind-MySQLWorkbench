require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const { dbAll, dbGet, dbRun, initDatabase, quoteId, withTransaction } = require('./db');

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

function normalizeRole(role) {
  return String(role || '').toLowerCase();
}

function isAdminSession(req) {
  return normalizeRole(req.session?.role) === 'admin';
}

function isEmployeeSession(req) {
  return normalizeRole(req.session?.role) === 'employee';
}

function getIPAddress(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function sendSafeError(res, status, message) {
  return res.status(status).json({ success: false, error: message, message });
}

function setAuthenticatedSession(req, user) {
  req.session.authenticated = true;
  req.session.userId = user.UserID;
  req.session.username = user.Username;
  req.session.role = user.Role;
  req.session.employeeId = user.EmployeeID;
  req.session.loginTime = new Date().toISOString();
}

async function auditLog(req, action, tableName = null, recordId = null, oldValue = null, newValue = null, userId = undefined) {
  try {
    await dbRun(
      `INSERT INTO AuditLogs (UserID, Action, TableName, RecordID, OldValue, NewValue, IPAddress)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId !== undefined ? userId : (req.session?.userId || null),
        action,
        tableName,
        recordId ? String(recordId) : null,
        safeJson(oldValue),
        safeJson(newValue),
        getIPAddress(req)
      ]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
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
  if (req.session && req.session.authenticated && isAdminSession(req)) return next();
  if (req.session && req.session.authenticated) return res.status(403).json({ error: 'Forbidden' });
  res.redirect('/');
}

function requireRole(...roles) {
  const allowed = roles.map(normalizeRole);
  return (req, res, next) => {
    if (!req.session?.authenticated) return res.status(401).json({ error: 'Authentication required' });
    if (!allowed.includes(normalizeRole(req.session.role))) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect(isAdminSession(req) ? '/dashboard' : '/user');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// â”€â”€ Auth: BÆ°á»›c 1 â€“ xĂ¡c minh máº­t kháº©u â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const safeMessage = 'Invalid username or password';

  if (!username || !password) {
    await auditLog(req, 'LOGIN_FAILED', 'Users', username || null, null, { reason: 'missing_credentials' }, null);
    return res.status(401).json({ success: false, message: safeMessage });
  }

  try {
    const user = await dbGet(
      `SELECT UserID, Username, PasswordHash, Role, EmployeeID, Status
       FROM Users
       WHERE Username = ?`,
      [username.trim()]
    );
    const match = user ? await bcrypt.compare(password, user.PasswordHash) : false;
    if (!user || !match || user.Status !== 'Active') {
      await auditLog(req, 'LOGIN_FAILED', 'Users', username.trim(), null, { reason: 'invalid_credentials_or_disabled' }, user?.UserID || null);
      return res.status(401).json({ success: false, message: safeMessage });
    }

    const redirect = normalizeRole(user.Role) === 'admin' ? '/dashboard' : '/user';

    // Employees bypass OTP; Admin OTP remains configurable for the existing UI.
    if (TWO_FACTOR_DISABLED || normalizeRole(user.Role) === 'employee') {
      setAuthenticatedSession(req, user);
      await auditLog(req, 'LOGIN_SUCCESS', 'Users', user.UserID, null, { role: user.Role, employeeId: user.EmployeeID }, user.UserID);
      return res.json({ success: true, redirect });
    }

    req.session.pendingAuth = user.Username;
    req.session.pendingUser = {
      UserID: user.UserID,
      Username: user.Username,
      Role: user.Role,
      EmployeeID: user.EmployeeID
    };
    await sendOTPToUser(user.Username, res, 'otp');
  } catch (err) {
    console.error('Login failed:', err.message);
    return res.status(500).json({ success: false, message: 'Authentication failed' });
  }
});

app.post('/auth/verify-otp', (req, res) => {
  const { username, otp } = req.body;
  const record = otpStore[username];
  if (!record) return res.status(400).json({ success: false, message: 'OTP session not found. Please login again.' });
  if (Date.now() > record.expires) {
    delete otpStore[username];
    return res.status(400).json({ success: false, message: 'OTP expired. Please login again.' });
  }
  if (otp !== record.otp) return res.status(401).json({ success: false, message: 'Invalid OTP' });

  delete otpStore[username];
  const pendingUser = req.session.pendingUser || { Username: username, Role: 'Admin', UserID: null, EmployeeID: null };
  delete req.session.pendingAuth;
  delete req.session.pendingUser;
  setAuthenticatedSession(req, pendingUser);
  auditLog(req, 'LOGIN_SUCCESS', 'Users', pendingUser.UserID, null, { role: pendingUser.Role, employeeId: pendingUser.EmployeeID }, pendingUser.UserID);
  res.json({ success: true, redirect: normalizeRole(pendingUser.Role) === 'admin' ? '/dashboard' : '/user' });
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
  res.json({ userId: req.session.userId, username: req.session.username, loginTime: req.session.loginTime,
             role: req.session.role, employeeId: req.session.employeeId, email: profile.email, avatar: profile.avatar });
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

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT u.UserID, u.Username, u.Role, u.EmployeeID, u.Status, u.CreatedAt,
             CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName
      FROM Users u
      LEFT JOIN Employees e ON u.EmployeeID = e.EmployeeID
      ORDER BY u.UserID
    `);
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('Load users failed:', err.message);
    sendSafeError(res, 500, 'Unable to load users');
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const username = String(req.body.Username || '').trim();
  const password = String(req.body.Password || '');
  const role = String(req.body.Role || 'Employee');
  const employeeId = req.body.EmployeeID ? parsePositiveInt(req.body.EmployeeID, 'EmployeeID') : null;
  if (!/^[A-Za-z0-9_.-]{3,80}$/.test(username)) return sendSafeError(res, 400, 'Username is invalid');
  if (!['Admin', 'Employee'].includes(role)) return sendSafeError(res, 400, 'Role is invalid');
  if (password.length < 8) return sendSafeError(res, 400, 'Password must be at least 8 characters');

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await dbRun(
      'INSERT INTO Users (Username, PasswordHash, Role, EmployeeID, Status) VALUES (?, ?, ?, ?, ?)',
      [username, hash, role, employeeId, 'Active']
    );
    await auditLog(req, 'CREATE_USER', 'Users', result?.insertId || username, null, { Username: username, Role: role, EmployeeID: employeeId, Status: 'Active' });
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Create user failed:', err.message);
    sendSafeError(res, 400, 'Unable to create user');
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.id, 'UserID');
  const role = String(req.body.Role || '');
  const employeeId = req.body.EmployeeID ? parsePositiveInt(req.body.EmployeeID, 'EmployeeID') : null;
  if (!['Admin', 'Employee'].includes(role)) return sendSafeError(res, 400, 'Role is invalid');

  const oldValue = await dbGet('SELECT UserID, Username, Role, EmployeeID, Status FROM Users WHERE UserID=?', [userId]);
  if (!oldValue) return sendSafeError(res, 404, 'User not found');
  await dbRun('UPDATE Users SET Role=?, EmployeeID=? WHERE UserID=?', [role, employeeId, userId]);
  await auditLog(req, 'EDIT_USER_ROLE', 'Users', userId, oldValue, { Role: role, EmployeeID: employeeId });
  res.json({ success: true });
});

app.put('/api/users/:id/status', requireAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.id, 'UserID');
  const status = String(req.body.Status || '');
  if (!['Active', 'Disabled'].includes(status)) return sendSafeError(res, 400, 'Status is invalid');
  if (userId === req.session.userId && status === 'Disabled') return sendSafeError(res, 400, 'You cannot disable your own account');

  const oldValue = await dbGet('SELECT UserID, Username, Role, EmployeeID, Status FROM Users WHERE UserID=?', [userId]);
  if (!oldValue) return sendSafeError(res, 404, 'User not found');
  await dbRun('UPDATE Users SET Status=? WHERE UserID=?', [status, userId]);
  await auditLog(req, status === 'Disabled' ? 'DISABLE_USER' : 'ENABLE_USER', 'Users', userId, oldValue, { Status: status });
  res.json({ success: true });
});

app.post('/api/users/:id/reset-password', requireAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.id, 'UserID');
  const password = String(req.body.Password || '');
  if (password.length < 8) return sendSafeError(res, 400, 'Password must be at least 8 characters');

  const user = await dbGet('SELECT UserID, Username FROM Users WHERE UserID=?', [userId]);
  if (!user) return sendSafeError(res, 404, 'User not found');
  const hash = await bcrypt.hash(password, 12);
  await dbRun('UPDATE Users SET PasswordHash=? WHERE UserID=?', [hash, userId]);
  await auditLog(req, 'RESET_PASSWORD', 'Users', userId, { Username: user.Username }, { passwordReset: true });
  res.json({ success: true });
});

app.get('/api/audit-logs', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const rows = await dbAll(`
    SELECT a.LogID, a.UserID, u.Username, a.Action, a.TableName, a.RecordID,
           a.OldValue, a.NewValue, a.IPAddress, a.CreatedAt
    FROM AuditLogs a
    LEFT JOIN Users u ON a.UserID = u.UserID
    ORDER BY a.LogID DESC
    LIMIT ?
  `, [limit]);
  res.json({ data: rows, total: rows.length });
});

function parsePositiveInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${field} must be a positive integer`);
  return n;
}

function parseMoney(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a valid non-negative number`);
  return n;
}

function parseDiscount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('Discount must be between 0 and 1');
  return n;
}

function validateCustomerId(value) {
  const id = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(id)) throw new Error('CustomerID is invalid');
  return id;
}

function validateOrderPayload(body) {
  const item = Array.isArray(body.items) ? body.items[0] : body;
  return {
    CustomerID: validateCustomerId(body.CustomerID),
    EmployeeID: body.EmployeeID ? parsePositiveInt(body.EmployeeID, 'EmployeeID') : null,
    ShipVia: body.ShipVia ? parsePositiveInt(body.ShipVia, 'ShipVia') : 1,
    Freight: body.Freight !== undefined ? parseMoney(body.Freight, 'Freight') : 0,
    ShipName: String(body.ShipName || '').trim().slice(0, 255),
    ShipAddress: String(body.ShipAddress || '').trim().slice(0, 255),
    ShipCity: String(body.ShipCity || '').trim().slice(0, 100),
    ShipRegion: String(body.ShipRegion || '').trim().slice(0, 100) || null,
    ShipPostalCode: String(body.ShipPostalCode || '').trim().slice(0, 50),
    ShipCountry: String(body.ShipCountry || '').trim().slice(0, 100),
    ProductID: parsePositiveInt(item?.ProductID, 'ProductID'),
    Quantity: parsePositiveInt(item?.Quantity, 'Quantity'),
    UnitPrice: parseMoney(item?.UnitPrice, 'UnitPrice'),
    Discount: parseDiscount(item?.Discount)
  };
}

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
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const params = [];
  const where = [];

  if (isEmployeeSession(req)) {
    where.push('o.EmployeeID = ?');
    params.push(req.session.employeeId);
  }

  try {
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await dbAll(`
      SELECT o.OrderID, o.CustomerID, c.CompanyName AS Customer,
             o.EmployeeID, CONCAT(e.FirstName, ' ', e.LastName) AS Employee,
             o.OrderDate, o.RequiredDate, o.ShippedDate, o.Freight,
             o.ShipName, o.ShipCity, o.ShipCountry,
             s.CompanyName AS Shipper,
             COUNT(od.ProductID) AS ItemCount,
             ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS OrderTotal
      FROM Orders o
      LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
      LEFT JOIN Employees e ON o.EmployeeID = e.EmployeeID
      LEFT JOIN Shippers s ON o.ShipVia = s.ShipperID
      LEFT JOIN [Order Details] od ON o.OrderID = od.OrderID
      ${whereSql}
      GROUP BY o.OrderID, o.CustomerID, c.CompanyName, o.EmployeeID, e.FirstName, e.LastName,
               o.OrderDate, o.RequiredDate, o.ShippedDate, o.Freight, o.ShipName, o.ShipCity,
               o.ShipCountry, s.CompanyName
      ORDER BY o.OrderID DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    const totalRow = await dbGet(`SELECT COUNT(*) AS n FROM Orders o ${whereSql}`, params);
    await auditLog(req, 'VIEW_ORDERS', 'Orders', null, null, { page, limit, role: req.session.role });
    res.json({ data: rows, total: totalRow?.n || 0, page, limit });
  } catch (err) {
    console.error('View orders failed:', err.message);
    sendSafeError(res, 500, 'Unable to load orders');
  }
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const orderId = parsePositiveInt(req.params.id, 'OrderID');
  const params = [orderId];
  const employeeClause = isEmployeeSession(req) ? 'AND o.EmployeeID = ?' : '';
  if (isEmployeeSession(req)) params.push(req.session.employeeId);

  const order = await dbGet(`
    SELECT o.*, c.CompanyName AS Customer, CONCAT(e.FirstName, ' ', e.LastName) AS Employee,
           s.CompanyName AS Shipper
    FROM Orders o
    LEFT JOIN Customers c ON o.CustomerID = c.CustomerID
    LEFT JOIN Employees e ON o.EmployeeID = e.EmployeeID
    LEFT JOIN Shippers s ON o.ShipVia = s.ShipperID
    WHERE o.OrderID = ? ${employeeClause}
  `, params);
  if (!order) return sendSafeError(res, 404, 'Order not found');

  const details = await dbAll(`
    SELECT od.ProductID, p.ProductName, od.UnitPrice, od.Quantity, od.Discount,
           p.UnitsInStock, p.IsVerified
    FROM [Order Details] od
    JOIN Products p ON od.ProductID = p.ProductID
    WHERE od.OrderID = ?
  `, [orderId]);
  res.json({ ...order, details });
});

app.post('/api/orders', requireRole('Admin', 'Employee'), async (req, res) => {
  let payload;
  try {
    payload = validateOrderPayload(req.body);
  } catch (err) {
    return sendSafeError(res, 400, err.message);
  }

  const employeeId = isAdminSession(req) ? (payload.EmployeeID || req.session.employeeId || 1) : req.session.employeeId;
  if (!employeeId) return sendSafeError(res, 403, 'Employee account is not linked to an EmployeeID');

  try {
    const result = await withTransaction(async tx => {
      const customer = await tx.get('SELECT CustomerID, CompanyName, Address, City, Region, PostalCode, Country FROM Customers WHERE CustomerID = ?', [payload.CustomerID]);
      if (!customer) throw new Error('CustomerID does not exist');

      const product = await tx.get('SELECT ProductID, ProductName, UnitPrice, UnitsInStock, IsVerified FROM Products WHERE ProductID = ? FOR UPDATE', [payload.ProductID]);
      if (!product) throw new Error('ProductID does not exist');
      if (Number(product.IsVerified) !== 1) throw new Error('Product is not verified');
      if (Number(product.UnitsInStock) < payload.Quantity) throw new Error('Insufficient stock');

      const orderInsert = await tx.run(`
        INSERT INTO Orders (CustomerID, EmployeeID, OrderDate, RequiredDate, ShipVia, Freight,
                            ShipName, ShipAddress, ShipCity, ShipRegion, ShipPostalCode, ShipCountry)
        VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        payload.CustomerID, employeeId, payload.ShipVia, payload.Freight,
        payload.ShipName || customer.CompanyName, payload.ShipAddress || customer.Address,
        payload.ShipCity || customer.City, payload.ShipRegion || customer.Region,
        payload.ShipPostalCode || customer.PostalCode, payload.ShipCountry || customer.Country
      ]);
      const orderId = orderInsert.insertId;

      await tx.run(`INSERT INTO [Order Details] (OrderID, ProductID, UnitPrice, Quantity, Discount) VALUES (?, ?, ?, ?, ?)`,
        [orderId, payload.ProductID, payload.UnitPrice, payload.Quantity, payload.Discount]);
      await tx.run('UPDATE Products SET UnitsInStock = UnitsInStock - ? WHERE ProductID = ?', [payload.Quantity, payload.ProductID]);
      return { orderId, product };
    });

    await auditLog(req, 'CREATE_ORDER', 'Orders', result.orderId, null, {
      CustomerID: payload.CustomerID,
      EmployeeID: employeeId,
      ProductID: payload.ProductID,
      Quantity: payload.Quantity,
      UnitPrice: payload.UnitPrice,
      Discount: payload.Discount
    });
    res.status(201).json({ success: true, orderId: result.orderId });
  } catch (err) {
    console.error('Create order failed:', err.message);
    sendSafeError(res, 400, err.message);
  }
});

app.put('/api/orders/:id', requireRole('Admin', 'Employee'), async (req, res) => {
  const orderId = parsePositiveInt(req.params.id, 'OrderID');
  let payload;
  try {
    payload = validateOrderPayload(req.body);
  } catch (err) {
    return sendSafeError(res, 400, err.message);
  }

  try {
    await withTransaction(async tx => {
      const order = await tx.get('SELECT * FROM Orders WHERE OrderID = ? FOR UPDATE', [orderId]);
      if (!order) throw new Error('Order not found');
      if (isEmployeeSession(req) && Number(order.EmployeeID) !== Number(req.session.employeeId)) throw new Error('Forbidden');
      const customer = await tx.get('SELECT CustomerID FROM Customers WHERE CustomerID = ?', [payload.CustomerID]);
      if (!customer) throw new Error('CustomerID does not exist');

      const oldDetail = await tx.get('SELECT * FROM [Order Details] WHERE OrderID = ? ORDER BY ProductID LIMIT 1 FOR UPDATE', [orderId]);
      if (!oldDetail) throw new Error('Order detail not found');

      await tx.run('UPDATE Products SET UnitsInStock = UnitsInStock + ? WHERE ProductID = ?', [oldDetail.Quantity, oldDetail.ProductID]);
      const product = await tx.get('SELECT ProductID, ProductName, UnitsInStock, IsVerified FROM Products WHERE ProductID = ? FOR UPDATE', [payload.ProductID]);
      if (!product) throw new Error('ProductID does not exist');
      if (Number(product.IsVerified) !== 1) throw new Error('Product is not verified');
      if (Number(product.UnitsInStock) < payload.Quantity) throw new Error('Insufficient stock');

      await tx.run(`
        UPDATE Orders
        SET CustomerID=?, ShipVia=?, Freight=?, ShipName=?, ShipAddress=?, ShipCity=?, ShipRegion=?, ShipPostalCode=?, ShipCountry=?
        WHERE OrderID=?
      `, [payload.CustomerID, payload.ShipVia, payload.Freight, payload.ShipName, payload.ShipAddress,
          payload.ShipCity, payload.ShipRegion, payload.ShipPostalCode, payload.ShipCountry, orderId]);
      await tx.run('DELETE FROM [Order Details] WHERE OrderID = ?', [orderId]);
      await tx.run('INSERT INTO [Order Details] (OrderID, ProductID, UnitPrice, Quantity, Discount) VALUES (?, ?, ?, ?, ?)',
        [orderId, payload.ProductID, payload.UnitPrice, payload.Quantity, payload.Discount]);
      await tx.run('UPDATE Products SET UnitsInStock = UnitsInStock - ? WHERE ProductID = ?', [payload.Quantity, payload.ProductID]);

      await auditLog(req, 'EDIT_ORDER', 'Orders', orderId, { order, detail: oldDetail }, payload);
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Edit order failed:', err.message);
    sendSafeError(res, err.message === 'Forbidden' ? 403 : 400, err.message);
  }
});

app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const orderId = parsePositiveInt(req.params.id, 'OrderID');
    await dbRun('DELETE FROM [Order Details] WHERE OrderID=?', [orderId]);
    await dbRun('DELETE FROM Orders WHERE OrderID=?', [orderId]);
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
             s.CompanyName as Supplier, p.UnitPrice, p.UnitsInStock, p.Discontinued, p.IsVerified
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
  const row = await dbGet('SELECT ProductID, ProductName, SupplierID, CategoryID, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued, IsVerified FROM Products WHERE ProductID=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'KhĂ´ng tĂ¬m tháº¥y' });
  res.json(row);
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const { ProductName, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued, IsVerified } = req.body;
  try {
    const oldValue = await dbGet('SELECT ProductID, ProductName, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued, IsVerified FROM Products WHERE ProductID=?', [req.params.id]);
    const verifiedValue = IsVerified === undefined ? Number(oldValue?.IsVerified || 0) : (IsVerified === true || IsVerified === 1 || IsVerified === '1' ? 1 : 0);
    await dbRun(`UPDATE Products SET ProductName=?, UnitPrice=?, UnitsInStock=?, UnitsOnOrder=?, ReorderLevel=?, Discontinued=?, IsVerified=? WHERE ProductID=?`,
      [ProductName, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued, verifiedValue, req.params.id]);
    await auditLog(req, 'EDIT_PRODUCT', 'Products', req.params.id, oldValue, { ProductName, UnitPrice, UnitsInStock, UnitsOnOrder, ReorderLevel, Discontinued, IsVerified: verifiedValue });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id/verification', requireAdmin, async (req, res) => {
  const productId = parsePositiveInt(req.params.id, 'ProductID');
  const isVerified = req.body.IsVerified === true || req.body.IsVerified === 1 || req.body.IsVerified === '1';
  const oldValue = await dbGet('SELECT ProductID, ProductName, IsVerified FROM Products WHERE ProductID=?', [productId]);
  if (!oldValue) return sendSafeError(res, 404, 'Product not found');
  await dbRun('UPDATE Products SET IsVerified=? WHERE ProductID=?', [isVerified ? 1 : 0, productId]);
  await auditLog(req, 'VERIFY_PRODUCT', 'Products', productId, oldValue, { IsVerified: isVerified ? 1 : 0 });
  res.json({ success: true });
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

