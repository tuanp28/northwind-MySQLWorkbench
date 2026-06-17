const fs = require('fs');
const path = require('path');

const DB_CLIENT = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
const DB_PATH = path.resolve(__dirname, process.env.DB_PATH || '../dist/northwind.db');

let sqliteDb = null;
let mysqlPool = null;

function normalizeSql(sql) {
  if (DB_CLIENT !== 'mysql') return sql;
  return sql
    .replace(/\[([^\]]+)\]/g, '`$1`')
    .replace(/(\w+\.\w+)\s*\|\|\s*' '\s*\|\|\s*(\w+\.\w+)/g, "CONCAT($1, ' ', $2)");
}

function quoteId(name) {
  return DB_CLIENT === 'mysql' ? `\`${name}\`` : `[${name}]`;
}

async function initDatabase() {
  if (DB_CLIENT === 'mysql') {
    let mysql;
    try {
      mysql = require('mysql2/promise');
    } catch (err) {
      throw new Error('Missing mysql2 package. Run "npm install" inside app/ first.');
    }

    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'northwind',
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      namedPlaceholders: false,
      charset: 'utf8mb4'
    });

    await mysqlPool.query('SELECT 1');
    console.log(`Database connected: MySQL ${process.env.MYSQL_HOST || 'localhost'}/${process.env.MYSQL_DATABASE || 'northwind'}`);
    return;
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  sqliteDb = new SQL.Database(fileBuffer);
  console.log('Database loaded into memory:', DB_PATH);
}

async function dbAll(sql, params = []) {
  if (DB_CLIENT === 'mysql') {
    const [rows] = await mysqlPool.query(normalizeSql(sql), params);
    return rows;
  }

  const stmt = sqliteDb.prepare(sql);
  if (params && params.length > 0) stmt.bind(params);
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) {
    const vals = stmt.get();
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    rows.push(obj);
  }
  stmt.free();
  return rows;
}

async function dbGet(sql, params = []) {
  return (await dbAll(sql, params))[0] || null;
}

async function dbRun(sql, params = []) {
  if (DB_CLIENT === 'mysql') {
    const [result] = await mysqlPool.query(normalizeSql(sql), params);
    return result;
  }

  sqliteDb.run(sql, params);
  const data = sqliteDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function withTransaction(work) {
  if (DB_CLIENT !== 'mysql') {
    sqliteDb.run('BEGIN TRANSACTION');
    try {
      const tx = {
        all: dbAll,
        get: dbGet,
        run: async (sql, params = []) => sqliteDb.run(sql, params)
      };
      const result = await work(tx);
      sqliteDb.run('COMMIT');
      const data = sqliteDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
      return result;
    } catch (err) {
      sqliteDb.run('ROLLBACK');
      throw err;
    }
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      all: async (sql, params = []) => {
        const [rows] = await conn.query(normalizeSql(sql), params);
        return rows;
      },
      get: async (sql, params = []) => {
        const [rows] = await conn.query(normalizeSql(sql), params);
        return rows[0] || null;
      },
      run: async (sql, params = []) => {
        const [result] = await conn.query(normalizeSql(sql), params);
        return result;
      }
    };
    const result = await work(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  dbAll,
  dbGet,
  dbRun,
  dbClient: DB_CLIENT,
  initDatabase,
  quoteId,
  withTransaction
};
