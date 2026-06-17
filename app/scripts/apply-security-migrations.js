require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const migrationDir = path.resolve(__dirname, '..', '..', 'migrations');

function splitSql(script) {
  return script
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'northwind',
    waitForConnections: true,
    connectionLimit: 2,
    charset: 'utf8mb4'
  });

  const files = fs.readdirSync(migrationDir)
    .filter(file => /^\d+_.*\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    console.log(`Applying ${file}`);
    for (const statement of splitSql(sql)) {
      try {
        await pool.query(statement);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
          console.log(`  skipped existing object: ${err.sqlMessage}`);
          continue;
        }
        throw err;
      }
    }
  }

  await pool.end();
  console.log('Security migrations completed.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
