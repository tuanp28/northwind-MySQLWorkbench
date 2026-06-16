# 📋 Rule – Quy Tắc Phát Triển Dự Án Northwind SQLite3

> Tài liệu này định nghĩa các quy tắc bắt buộc áp dụng cho mọi AI coding assistant (Vibe Code, Copilot, Cursor, v.v.) khi làm việc trong dự án này.
> **Mọi quy tắc dưới đây đều có mức độ ưu tiên cao nhất và không được vi phạm dù bất kỳ lý do gì.**

---

## 🔒 RULE 1 – Không Được Sửa Đổi File Gốc

**Các file sau đây là FILE GỐC, được bảo vệ hoàn toàn. Tuyệt đối không được chỉnh sửa, xóa, hoặc thay thế nội dung:**

| File được bảo vệ | Lý do |
|------------------|-------|
| `src/create.sql` | Script gốc tạo cấu trúc database |
| `src/update.sql` | Script gốc cập nhật dữ liệu ban đầu |
| `src/populate.py` | Script gốc sinh dữ liệu mẫu |
| `src/report.sql` | Script gốc báo cáo thống kê |
| `makefile` | File build gốc của dự án |
| `README.md` | Tài liệu gốc tiếng Anh |
| `LICENSE` | Giấy phép dự án |
| `CODE_OF_CONDUCT.md` | Quy tắc ứng xử cộng đồng |
| `CONTRIBUTING.md` | Hướng dẫn đóng góp gốc |
| `.gitignore` | Cấu hình git gốc |

### ✅ Được phép
- Đọc nội dung các file trên để hiểu cấu trúc
- Tham chiếu tên bảng, cột, views từ `src/create.sql` để viết code mới

### ❌ Không được phép
- Sửa bất kỳ dòng nào trong các file trên
- Xóa hoặc tạo lại các file trên
- Thêm nội dung vào cuối các file trên

---

## 🗄️ RULE 2 – Quy Tắc Ghi Database

**File `dist/northwind.db` là database chính của dự án.**

### ✅ Được phép
- Thực hiện `SELECT` để đọc dữ liệu
- Sử dụng các views có sẵn để truy vấn
- Thực hiện `UPDATE` / `DELETE` trên dữ liệu nghiệp vụ (Customers, Products, Employees, Suppliers, Orders, Order Details) **thông qua lớp ứng dụng** (`app/server.js`) — đây là thiết kế có chủ đích của web app
- Tạo database riêng để test tại thư mục `test/`

### ❌ Không được phép
- Thực hiện `DROP TABLE`, `ALTER TABLE`, `CREATE TABLE`, hoặc thay đổi **schema** trên `dist/northwind.db`
- Chạy lại `make build` hoặc `make populate` (ghi đè toàn bộ database)
- Thay thế hoặc xóa file `dist/northwind.db`
- Tạo trigger, stored procedure, hoặc thay đổi cấu trúc bảng/views gốc

### 🔧 Khi cần database riêng để test
```
test/
└── northwind_test.db    ✅ Được phép tạo mới ở đây
```
Không được đặt database test trong thư mục `dist/`.

### 💾 Backup trước khi thao tác lớn
Luôn backup database trước khi xóa hoặc sửa dữ liệu hàng loạt:
```powershell
copy dist\northwind.db dist\northwind.db.bak
```

---

## 📁 RULE 3 – Quy Tắc Tạo File Mới

Khi thêm chức năng mới, chỉ được tạo file trong các thư mục được phép:

### ✅ Thư mục được phép tạo file mới
```
northwind-SQLite3-main/
├── app/          ← Code ứng dụng mới (web app, API, v.v.)
├── test/         ← Code kiểm thử và database test
├── scripts/      ← Script tiện ích bổ sung (không thay thế src/)
└── *.md          ← Tài liệu bổ sung tại root (như file này)
```

### ❌ Không được tạo file mới trong
- `src/` – Thư mục chỉ chứa các script gốc
- `dist/` – Thư mục chỉ chứa database đã build
- `docs/` – Thư mục tài liệu gốc

---

## 🔌 RULE 4 – Quy Tắc Kết Nối Database

Mọi code mới kết nối tới database **bắt buộc** phải sử dụng chế độ chỉ đọc:

### Python
```python
import sqlite3

# ✅ ĐÚNG – Kết nối chỉ đọc
conn = sqlite3.connect("file:dist/northwind.db?mode=ro", uri=True)

# ❌ SAI – Kết nối có thể ghi
conn = sqlite3.connect("dist/northwind.db")
```

### Node.js (better-sqlite3)
```javascript
// ✅ ĐÚNG – Kết nối chỉ đọc
const db = new Database('dist/northwind.db', { readonly: true });

// ❌ SAI – Kết nối mặc định có thể ghi
const db = new Database('dist/northwind.db');
```

### SQL trực tiếp
```bash
# ✅ ĐÚNG – Chỉ dùng để đọc/báo cáo
sqlite3 dist/northwind.db "SELECT * FROM Customers LIMIT 10"

# ❌ SAI – Lệnh có thể thay đổi dữ liệu
sqlite3 dist/northwind.db < src/populate.py
```

---

## 🏗️ RULE 5 – Quy Tắc Khi Thêm Chức Năng Mới

Khi AI được yêu cầu thêm bất kỳ chức năng nào:

1. **Tạo code mới trong thư mục `app/`** – không đặt lẫn vào các thư mục gốc
2. **Chỉ đọc dữ liệu từ database** – dùng kết nối read-only
3. **Không import hoặc gọi lại** `populate.py`, `create.sql`, `update.sql`
4. **Kiểm tra xem chức năng có ảnh hưởng database không** trước khi viết code
5. **Nếu cần dữ liệu test** – tạo database riêng tại `test/` với dữ liệu tự tạo

### Checklist trước khi viết code mới
```
[ ] Code mới KHÔNG chứa INSERT / UPDATE / DELETE / DROP / ALTER
[ ] Kết nối database sử dụng chế độ read-only
[ ] File mới được đặt trong app/ hoặc test/ hoặc scripts/
[ ] Không sửa bất kỳ file nào trong danh sách FILE GỐC
[ ] Không gọi lại các lệnh make build / make populate
```

---

## 📊 RULE 6 – Quy Tắc Về Tài Liệu

- **`README.md`** – Không được sửa. Đây là tài liệu gốc tiếng Anh của tác giả
- **`huongdan.md`** – Tài liệu tiếng Việt, chỉ được cập nhật khi có thêm chức năng mới thực sự
- **`rule.md`** (file này) – Chỉ được cập nhật khi có quy tắc mới cần bổ sung, không được xóa quy tắc cũ
- Mọi tài liệu bổ sung cho chức năng mới phải được tạo trong `app/` hoặc `docs_app/`

---

## ⚠️ Tóm Tắt Các Điều CẤM

| Hành động | Mức độ |
|-----------|--------|
| Sửa `src/create.sql`, `src/update.sql`, `src/populate.py`, `src/report.sql` | 🚫 **CẤM TUYỆT ĐỐI** |
| Sửa `makefile`, `README.md`, `LICENSE` | 🚫 **CẤM TUYỆT ĐỐI** |
| Thay đổi schema (DROP/ALTER/CREATE TABLE, thay đổi cột/views) trong database gốc | 🚫 **CẤM TUYỆT ĐỐI** |
| Chạy `make build` hoặc `make populate` ghi đè toàn bộ database | 🚫 **CẤM TUYỆT ĐỐI** |
| Ghi dữ liệu vào `dist/northwind.db` ngoài lớp app/ (trực tiếp qua script) | ⛔ **KHÔNG ĐƯỢC PHÉP** |
| Tạo file mới trong thư mục `src/` hoặc `dist/` | ⛔ **KHÔNG ĐƯỢC PHÉP** |
| Kết nối database ngoài lớp app/ mà không có lý do rõ ràng | ⚠️ **PHẢI TRÁNH** |

---

*Tài liệu này được tạo để đảm bảo tính toàn vẹn của dữ liệu gốc Northwind trong suốt quá trình phát triển.*
