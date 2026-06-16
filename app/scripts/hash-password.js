/**
 * Script tạo bcrypt hash cho mật khẩu mới
 * Cách dùng: node scripts/hash-password.js <mật_khẩu_mới>
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('❌ Thiếu mật khẩu!\nCách dùng: node scripts/hash-password.js <mật_khẩu_mới>');
  process.exit(1);
}

bcrypt.hash(password, 12).then(hash => {
  console.log('\n✅ Mật khẩu đã được mã hoá (bcrypt cost=12):');
  console.log('\nADMIN_PASSWORD_HASH=' + hash);
  console.log('\n👉 Sao chép dòng trên vào file .env của bạn\n');
});
