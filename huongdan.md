# 📖 Hướng Dẫn Sử Dụng – Northwind Web App

> Tài liệu tiếng Việt mô tả cách cài đặt, vận hành, và sử dụng ứng dụng web Northwind SQLite3.

---

## 🗂️ Cấu Trúc Dự Án

```
northwind-SQLite3-main/
├── dist/
│   └── northwind.db            # File SQLite3 có dữ liệu mẫu
├── src/
│   ├── create.sql              # Script tạo bảng và views (FILE GỐC)
│   ├── update.sql              # Script cập nhật dữ liệu (FILE GỐC)
│   ├── populate.py             # Script Python sinh dữ liệu ngẫu nhiên (FILE GỐC)
│   └── report.sql              # Script báo cáo bản ghi (FILE GỐC)
├── app/                        # Web application Node.js
│   ├── server.js               # Entry point – Express server + toàn bộ API
│   ├── package.json            # Dependencies
│   ├── .env                    # Biến môi trường (KHÔNG commit lên git)
│   ├── .env.example            # Mẫu cấu hình
│   ├── public/
│   │   ├── login.html          # Trang đăng nhập
│   │   ├── dashboard.html      # Dashboard Admin
│   │   ├── user-dashboard.html # Dashboard User (chỉ đọc)
│   │   └── uploads/            # Ảnh đại diện (tự tạo khi upload)
│   ├── scripts/
│   │   └── hash-password.js    # Tiện ích tạo bcrypt hash mật khẩu
│   └── data/
│       └── profile.json        # Hồ sơ admin (email, avatar – tự tạo khi khởi động)
├── makefile                    # Lệnh build database gốc
├── README.md                   # Tài liệu gốc tiếng Anh (FILE GỐC)
├── rule.md                     # Quy tắc phát triển dự án
└── huongdan.md                 # File này
```

---

## ⚡ Stack Kỹ Thuật

| Thành phần | Công nghệ |
|-----------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database driver | sql.js (SQLite3 thuần JS, tải vào memory) |
| Xác thực mật khẩu | bcryptjs (hash cost=12) |
| Quản lý phiên | express-session |
| Gửi email OTP | nodemailer + Gmail App Password |
| Upload file | multer |
| Frontend | HTML / CSS / JavaScript thuần |
| Dev tool | nodemon (tự reload khi sửa code) |

---

## 🚀 Cài Đặt & Khởi Chạy

### Yêu cầu

- **Node.js** 16+ (`node --version`)
- **npm** (`npm --version`)

### Bước 1 – Cài dependencies

```powershell
cd app
npm install
```

### Bước 2 – Cấu hình file .env

```powershell
copy .env.example .env   # Windows
cp .env.example .env     # Linux/macOS
```

Mở `.env` và điền thông tin (xem mục **Cấu Hình .env** bên dưới).

### Bước 3 – Tạo hash mật khẩu (nếu cần đổi)

```powershell
node scripts/hash-password.js "MậtKhẩuMới@123"
```

Sao chép giá trị `$2b$12$...` in ra vào `ADMIN_PASSWORD_HASH` hoặc `USER_PASSWORD_HASH` trong `.env`.

### Bước 4 – Khởi chạy server

```powershell
npm start        # Production
npm run dev      # Development (tự reload khi sửa file)
```

Truy cập: **http://localhost:3000**

---

## ⚙️ Cấu Hình .env

```env
# ── Tài khoản Admin ───────────────────────────────────────────────────────
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...   # bcrypt hash, tạo bằng scripts/hash-password.js

# ── Tài khoản User (chỉ đọc, số điện thoại ẩn) ───────────────────────────
USER_USERNAME=user
USER_PASSWORD_HASH=$2b$12$...

# ── Session ────────────────────────────────────────────────────────────────
# Thay bằng chuỗi ngẫu nhiên >= 32 ký tự trước khi deploy
SESSION_SECRET=northwind_secret_key_change_this_in_production_2024

# ── Server ─────────────────────────────────────────────────────────────────
PORT=3000
DB_PATH=../dist/northwind.db

# ── Xác thực 2 bước (OTP qua email) ───────────────────────────────────────
# true  = tắt OTP (chỉ dùng khi phát triển, OTP in ra console)
# false = bật OTP gửi email thật (cần cấu hình EMAIL_USER, EMAIL_PASS)
DISABLE_2FA=true

# ── Gmail App Password ─────────────────────────────────────────────────────
EMAIL_USER=your@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx   # 16 ký tự, tạo tại Google Account > App passwords
ADMIN_EMAIL=your@gmail.com       # Email nhận OTP của admin
```

---

## 👤 Tài Khoản Mặc Định

| Vai trò | Username | Mật khẩu mặc định | Trang |
|---------|----------|-------------------|-------|
| Admin   | `admin`  | `Admin@2024`      | `/dashboard` |
| User    | `user`   | `User@2024`       | `/user` |

> **Bảo mật:** Đổi mật khẩu ngay sau khi triển khai lần đầu.

---

## 🔐 Hệ Thống Xác Thực

### Đăng nhập 2 bước (Admin, khi `DISABLE_2FA=false`)

```
POST /auth/login  →  bcrypt verify mật khẩu
                  →  gửi OTP 6 số tới email admin (hết hạn sau 5 phút)
POST /auth/verify-otp  →  xác minh OTP  →  session authenticated
POST /auth/resend-otp  →  gửi lại OTP (không cần nhập lại mật khẩu)
```

### Chế độ Dev (`DISABLE_2FA=true`)

OTP không gửi email — in ra console. Frontend hiển thị cảnh báo màu vàng.

### User

Luôn bỏ qua 2FA, đăng nhập 1 bước ngay sau khi xác minh mật khẩu.

### Cấu Hình Gmail App Password

1. Vào **Google Account** → **Security** → **2-Step Verification** → **App passwords**
2. Tạo App Password (chọn loại "Mail")
3. Dán 16 ký tự vào `EMAIL_PASS` trong `.env`
4. Khởi động lại server

---

## 🏠 Dashboard Admin (`/dashboard`)

### Tổng quan

- Thẻ thống kê số lượng: Khách hàng, Đơn hàng, Sản phẩm, Nhân viên, Nhà cung cấp, Danh mục
- Biểu đồ doanh thu theo danh mục sản phẩm

### Quản lý dữ liệu (Admin có toàn quyền CRUD)

| Module | Xem | Tìm kiếm | Sửa | Xóa |
|--------|:---:|:--------:|:---:|:---:|
| Khách hàng | ✅ | ✅ | ✅ | ✅ |
| Đơn hàng | ✅ | — | — | ✅ |
| Sản phẩm | ✅ | ✅ | ✅ | ✅ |
| Nhân viên | ✅ | — | ✅ | ✅ |
| Nhà cung cấp | ✅ | — | ✅ | ✅ |
| Danh mục | ✅ | — | — | — |
| Vận chuyển | ✅ | — | — | — |
| Vùng | ✅ | — | — | — |

### Quản lý Profile

- **Đổi email:** cập nhật địa chỉ nhận OTP
- **Đổi mật khẩu:** yêu cầu mật khẩu hiện tại, tối thiểu 8 ký tự (lưu thẳng vào `.env`)
- **Upload avatar:** file ảnh ≤ 2 MB (JPG/PNG/GIF/WEBP), lưu tại `public/uploads/`

---

## 👁️ Dashboard User (`/user`)

- Xem thống kê tổng quan (chỉ đọc)
- Duyệt danh sách: Khách hàng, Sản phẩm, Nhân viên, Nhà cung cấp, Danh mục, Vận chuyển, Vùng
- **Số điện thoại được ẩn** — chỉ hiển thị 3 số cuối: `***-456`
- Không có quyền sửa hoặc xóa

---

## 🔌 API Endpoints

### Auth

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `POST` | `/auth/login` | Bước 1 – xác minh mật khẩu |
| `POST` | `/auth/verify-otp` | Bước 2 – xác minh OTP |
| `POST` | `/auth/resend-otp` | Gửi lại OTP |
| `POST` | `/auth/logout` | Đăng xuất, huỷ session |

### Session & Profile

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET`  | `/api/me` | Auth | Thông tin phiên + profile |
| `GET`  | `/api/profile` | Auth | Hồ sơ quản trị viên |
| `POST` | `/api/profile/email` | Admin | Cập nhật email nhận OTP |
| `POST` | `/api/profile/password` | Admin | Đổi mật khẩu admin |
| `POST` | `/api/profile/avatar` | Admin | Upload ảnh đại diện (form-data: `avatar`) |

### Thống kê & Biểu đồ

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/stats` | Auth | Số lượng bản ghi từng bảng |
| `GET` | `/api/sales-by-category` | Auth | Doanh thu + số đơn theo danh mục |

### Khách hàng

| Method | Endpoint | Quyền | Query params |
|--------|----------|-------|-------------|
| `GET` | `/api/customers` | Auth | `page`, `limit`, `search` |
| `GET` | `/api/customers/:id` | Admin | – |
| `PUT` | `/api/customers/:id` | Admin | body: các trường Customers |
| `DELETE` | `/api/customers/:id` | Admin | – |

### Đơn hàng

| Method | Endpoint | Quyền | Query params |
|--------|----------|-------|-------------|
| `GET` | `/api/orders` | Auth | `page`, `limit` |
| `DELETE` | `/api/orders/:id` | Admin | xóa đơn + chi tiết đơn |

### Sản phẩm

| Method | Endpoint | Quyền | Query params |
|--------|----------|-------|-------------|
| `GET` | `/api/products` | Auth | `page`, `limit`, `search` |
| `GET` | `/api/products/:id` | Admin | – |
| `PUT` | `/api/products/:id` | Admin | body: các trường Products |
| `DELETE` | `/api/products/:id` | Admin | – |

### Nhân viên

| Method | Endpoint | Quyền | Query params |
|--------|----------|-------|-------------|
| `GET` | `/api/employees` | Auth | `page`, `limit` |
| `GET` | `/api/employees/:id` | Admin | – |
| `PUT` | `/api/employees/:id` | Admin | body: các trường Employees |
| `DELETE` | `/api/employees/:id` | Admin | xóa nhân viên + EmployeeTerritories |

### Nhà cung cấp

| Method | Endpoint | Quyền | Query params |
|--------|----------|-------|-------------|
| `GET` | `/api/suppliers` | Auth | `page`, `limit` |
| `GET` | `/api/suppliers/:id` | Admin | – |
| `PUT` | `/api/suppliers/:id` | Admin | body: các trường Suppliers |
| `DELETE` | `/api/suppliers/:id` | Admin | – |

### Danh mục / Vận chuyển / Vùng (chỉ đọc)

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/api/categories` | Auth | Danh mục + số sản phẩm |
| `GET` | `/api/shippers` | Auth | Công ty vận chuyển + số đơn |
| `GET` | `/api/regions` | Auth | Vùng + số khu vực |

---

## 🗄️ Cơ Sở Dữ Liệu Northwind

### Các Bảng Chính

| Bảng | Mô tả |
|------|-------|
| `Categories` | Danh mục sản phẩm |
| `Customers` | Khách hàng |
| `CustomerDemographics` | Phân loại nhóm khách hàng |
| `CustomerCustomerDemo` | Khách hàng thuộc nhóm nào (bảng trung gian) |
| `Employees` | Nhân viên |
| `EmployeeTerritories` | Nhân viên phụ trách khu vực nào |
| `Orders` | Đơn hàng |
| `Order Details` | Chi tiết từng mặt hàng trong đơn |
| `Products` | Sản phẩm |
| `Suppliers` | Nhà cung cấp |
| `Shippers` | Đơn vị vận chuyển |
| `Regions` | Vùng địa lý |
| `Territories` | Khu vực bán hàng |

### Views Có Sẵn (trong `src/create.sql`)

| View | Mô tả |
|------|-------|
| `Alphabetical list of products` | Sản phẩm sắp xếp A-Z |
| `Current Product List` | Sản phẩm đang kinh doanh |
| `Customer and Suppliers by City` | Khách hàng và nhà cung cấp theo thành phố |
| `Invoices` | Hóa đơn chi tiết |
| `Orders Qry` | Đơn hàng đầy đủ thông tin |
| `Order Subtotals` | Tổng tiền từng đơn |
| `Product Sales for 1997` | Doanh thu sản phẩm năm 1997 |
| `Products Above Average Price` | Sản phẩm có giá trên trung bình |
| `Products by Category` | Sản phẩm theo danh mục |
| `Quarterly Orders` | Đơn hàng theo quý |
| `Sales Totals by Amount` | Doanh thu xếp theo giá trị |
| `Summary of Sales by Quarter` | Tóm tắt doanh thu theo quý |
| `Summary of Sales by Year` | Tóm tắt doanh thu theo năm |
| `Category Sales for 1997` | Doanh thu theo danh mục năm 1997 |
| `Order Details Extended` | Chi tiết đơn hàng mở rộng |
| `Sales by Category` | Doanh thu theo danh mục |

---

## 📝 Ví Dụ Truy Vấn SQL

### Đơn hàng của một khách hàng

```sql
SELECT o.OrderID, o.OrderDate, o.ShippedDate, o.Freight
FROM Orders o
WHERE o.CustomerID = 'ALFKI'
ORDER BY o.OrderDate DESC;
```

### Doanh thu theo danh mục

```sql
SELECT c.CategoryName,
       ROUND(SUM(od.UnitPrice * od.Quantity * (1 - od.Discount)), 2) AS Revenue
FROM [Order Details] od
JOIN Products p   ON od.ProductID = p.ProductID
JOIN Categories c ON p.CategoryID = c.CategoryID
GROUP BY c.CategoryName
ORDER BY Revenue DESC;
```

### Top 5 sản phẩm bán chạy

```sql
SELECT p.ProductName, SUM(od.Quantity) AS TotalSold
FROM [Order Details] od
JOIN Products p ON od.ProductID = p.ProductID
GROUP BY p.ProductName
ORDER BY TotalSold DESC
LIMIT 5;
```

### Nhân viên và số đơn đã xử lý

```sql
SELECT e.FirstName || ' ' || e.LastName AS EmployeeName,
       COUNT(o.OrderID) AS TotalOrders
FROM Employees e
JOIN Orders o ON e.EmployeeID = o.EmployeeID
GROUP BY e.EmployeeID
ORDER BY TotalOrders DESC;
```

### Sử dụng View có sẵn

```sql
SELECT * FROM [Sales by Category];
SELECT * FROM [Summary of Sales by Quarter];
```

---

## 🔧 Các Tác Vụ Thường Gặp

### Đổi mật khẩu từ dòng lệnh

```powershell
node scripts/hash-password.js "MậtKhẩuMới@123"
```

Cập nhật `ADMIN_PASSWORD_HASH` hoặc `USER_PASSWORD_HASH` trong `.env`.

### Backup database

```powershell
copy dist\northwind.db dist\northwind.db.bak
```

> Nên backup trước khi thực hiện các thao tác xóa hàng loạt qua web app.

### Kiểm tra database trực tiếp

```powershell
sqlite3 dist/northwind.db ".tables"
sqlite3 dist/northwind.db "SELECT COUNT(*) FROM Customers"
```

### Reset avatar admin

Mở `app/data/profile.json`, đặt `"avatar": null`.

### Build lại database gốc (chỉ dùng khi cần)

```bash
make build      # Tạo lại dist/northwind.db từ đầu (Linux/macOS)
make populate   # Thêm ~15.000 đơn hàng ngẫu nhiên
make report     # In số bản ghi từng bảng
```

---

## ⚠️ Lưu Ý Quan Trọng

- File `.env` chứa thông tin nhạy cảm — **không commit lên git**
- `dist/northwind.db` được tải vào memory khi khởi động; thay đổi qua web app được ghi lại vào file gốc
- **Backup database** trước khi xóa hoặc sửa dữ liệu hàng loạt
- Xem đầy đủ quy tắc phát triển tại [`rule.md`](./rule.md)

---

## ℹ️ Thông Tin Dự Án

| Mục | Thông tin |
|-----|-----------|
| Nguồn gốc | Microsoft Access 2000 Northwind Sample Database |
| Phiên bản | SQLite3 |
| Tác giả chuyển đổi | [jpwhite3](https://github.com/jpwhite3/northwind-SQLite3) |
| Giấy phép | MIT License |
| Mục đích | Học tập, thực hành SQL, kiểm thử ứng dụng |
