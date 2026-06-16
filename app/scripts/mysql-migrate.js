require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || '../../dist/northwind.db');

const TABLES = [
  'Categories',
  'CustomerDemographics',
  'Customers',
  'Employees',
  'Shippers',
  'Suppliers',
  'Regions',
  'Territories',
  'Products',
  'Orders',
  'Order Details',
  'CustomerCustomerDemo',
  'EmployeeTerritories'
];

const CREATE_TABLES = [
  `CREATE TABLE Categories (
    CategoryID INT NOT NULL AUTO_INCREMENT,
    CategoryName VARCHAR(255),
    Description TEXT,
    Picture LONGBLOB,
    PRIMARY KEY (CategoryID)
  )`,
  `CREATE TABLE CustomerDemographics (
    CustomerTypeID VARCHAR(20) NOT NULL,
    CustomerDesc TEXT,
    PRIMARY KEY (CustomerTypeID)
  )`,
  `CREATE TABLE Customers (
    CustomerID VARCHAR(20) NOT NULL,
    CompanyName VARCHAR(255),
    ContactName VARCHAR(255),
    ContactTitle VARCHAR(255),
    Address VARCHAR(255),
    City VARCHAR(100),
    Region VARCHAR(100),
    PostalCode VARCHAR(50),
    Country VARCHAR(100),
    Phone VARCHAR(80),
    Fax VARCHAR(80),
    PRIMARY KEY (CustomerID)
  )`,
  `CREATE TABLE Employees (
    EmployeeID INT NOT NULL AUTO_INCREMENT,
    LastName VARCHAR(100),
    FirstName VARCHAR(100),
    Title VARCHAR(255),
    TitleOfCourtesy VARCHAR(50),
    BirthDate DATETIME,
    HireDate DATETIME,
    Address VARCHAR(255),
    City VARCHAR(100),
    Region VARCHAR(100),
    PostalCode VARCHAR(50),
    Country VARCHAR(100),
    HomePhone VARCHAR(80),
    Extension VARCHAR(20),
    Photo LONGBLOB,
    Notes TEXT,
    ReportsTo INT NULL,
    PhotoPath VARCHAR(255),
    PRIMARY KEY (EmployeeID),
    INDEX idx_employees_reports_to (ReportsTo)
  )`,
  `CREATE TABLE Shippers (
    ShipperID INT NOT NULL AUTO_INCREMENT,
    CompanyName VARCHAR(255),
    Phone VARCHAR(80),
    PRIMARY KEY (ShipperID)
  )`,
  `CREATE TABLE Suppliers (
    SupplierID INT NOT NULL AUTO_INCREMENT,
    CompanyName VARCHAR(255),
    ContactName VARCHAR(255),
    ContactTitle VARCHAR(255),
    Address VARCHAR(255),
    City VARCHAR(100),
    Region VARCHAR(100),
    PostalCode VARCHAR(50),
    Country VARCHAR(100),
    Phone VARCHAR(80),
    Fax VARCHAR(80),
    HomePage TEXT,
    PRIMARY KEY (SupplierID)
  )`,
  `CREATE TABLE Regions (
    RegionID INT NOT NULL,
    RegionDescription VARCHAR(255) NOT NULL,
    PRIMARY KEY (RegionID)
  )`,
  `CREATE TABLE Territories (
    TerritoryID VARCHAR(20) NOT NULL,
    TerritoryDescription VARCHAR(255) NOT NULL,
    RegionID INT NOT NULL,
    PRIMARY KEY (TerritoryID),
    INDEX idx_territories_region_id (RegionID)
  )`,
  `CREATE TABLE Products (
    ProductID INT NOT NULL AUTO_INCREMENT,
    ProductName VARCHAR(255),
    SupplierID INT,
    CategoryID INT,
    QuantityPerUnit VARCHAR(255),
    UnitPrice DECIMAL(12,2),
    UnitsInStock INT,
    UnitsOnOrder INT,
    ReorderLevel INT,
    Discontinued TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (ProductID),
    INDEX idx_products_supplier_id (SupplierID),
    INDEX idx_products_category_id (CategoryID)
  )`,
  `CREATE TABLE Orders (
    OrderID INT NOT NULL AUTO_INCREMENT,
    CustomerID VARCHAR(20),
    EmployeeID INT,
    OrderDate DATETIME,
    RequiredDate DATETIME,
    ShippedDate DATETIME,
    ShipVia INT,
    Freight DECIMAL(12,2),
    ShipName VARCHAR(255),
    ShipAddress VARCHAR(255),
    ShipCity VARCHAR(100),
    ShipRegion VARCHAR(100),
    ShipPostalCode VARCHAR(50),
    ShipCountry VARCHAR(100),
    PRIMARY KEY (OrderID),
    INDEX idx_orders_customer_id (CustomerID),
    INDEX idx_orders_employee_id (EmployeeID),
    INDEX idx_orders_ship_via (ShipVia)
  )`,
  `CREATE TABLE \`Order Details\` (
    OrderID INT NOT NULL,
    ProductID INT NOT NULL,
    UnitPrice DECIMAL(12,2) NOT NULL DEFAULT 0,
    Quantity INT NOT NULL DEFAULT 1,
    Discount DOUBLE NOT NULL DEFAULT 0,
    PRIMARY KEY (OrderID, ProductID),
    INDEX idx_order_details_product_id (ProductID)
  )`,
  `CREATE TABLE CustomerCustomerDemo (
    CustomerID VARCHAR(20) NOT NULL,
    CustomerTypeID VARCHAR(20) NOT NULL,
    PRIMARY KEY (CustomerID, CustomerTypeID)
  )`,
  `CREATE TABLE EmployeeTerritories (
    EmployeeID INT NOT NULL,
    TerritoryID VARCHAR(20) NOT NULL,
    PRIMARY KEY (EmployeeID, TerritoryID)
  )`
];

const CREATE_VIEWS = [
  `CREATE VIEW \`Alphabetical list of products\` AS
   SELECT Products.*, Categories.CategoryName
   FROM Categories INNER JOIN Products ON Categories.CategoryID = Products.CategoryID
   WHERE Products.Discontinued = 0`,
  `CREATE VIEW \`Current Product List\` AS
   SELECT ProductID, ProductName FROM Products WHERE Discontinued = 0`,
  `CREATE VIEW \`Customer and Suppliers by City\` AS
   SELECT City, CompanyName, ContactName, 'Customers' AS Relationship FROM Customers
   UNION
   SELECT City, CompanyName, ContactName, 'Suppliers' FROM Suppliers`,
  `CREATE VIEW \`Order Subtotals\` AS
   SELECT \`Order Details\`.OrderID,
          SUM(\`Order Details\`.UnitPrice * Quantity * (1 - Discount)) AS Subtotal
   FROM \`Order Details\`
   GROUP BY \`Order Details\`.OrderID`,
  `CREATE VIEW \`Order Details Extended\` AS
   SELECT \`Order Details\`.OrderID,
          \`Order Details\`.ProductID,
          Products.ProductName,
          \`Order Details\`.UnitPrice,
          \`Order Details\`.Quantity,
          \`Order Details\`.Discount,
          (\`Order Details\`.UnitPrice * Quantity * (1 - Discount)) AS ExtendedPrice
   FROM Products JOIN \`Order Details\` ON Products.ProductID = \`Order Details\`.ProductID`
];

function q(name) {
  return `\`${name.replace(/`/g, '``')}\``;
}

function placeholders(count) {
  return Array(count).fill('?').join(',');
}

async function main() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (err) {
    throw new Error('Missing mysql2 package. Run "npm install" inside app/ first.');
  }

  const database = process.env.MYSQL_DATABASE || 'northwind';
  const adminPool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 2,
    charset: 'utf8mb4'
  });

  await adminPool.query(`CREATE DATABASE IF NOT EXISTS ${q(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await adminPool.end();

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: 2,
    charset: 'utf8mb4'
  });

  console.log(`Loading SQLite database: ${DB_PATH}`);
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database(fs.readFileSync(DB_PATH));

  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const view of ['Order Details Extended', 'Order Subtotals', 'Customer and Suppliers by City', 'Current Product List', 'Alphabetical list of products']) {
    await pool.query(`DROP VIEW IF EXISTS ${q(view)}`);
  }
  for (const table of [...TABLES].reverse()) {
    await pool.query(`DROP TABLE IF EXISTS ${q(table)}`);
  }

  for (const statement of CREATE_TABLES) {
    await pool.query(statement);
  }

  for (const table of TABLES) {
    const result = sqlite.exec(`SELECT * FROM [${table}]`);
    if (!result.length) {
      console.log(`${table}: 0 rows`);
      continue;
    }

    const { columns, values } = result[0];
    const sql = `INSERT INTO ${q(table)} (${columns.map(q).join(',')}) VALUES (${placeholders(columns.length)})`;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of values) {
        await conn.execute(sql, row);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    console.log(`${table}: ${values.length} rows`);
  }

  for (const statement of CREATE_VIEWS) {
    await pool.query(statement);
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await pool.end();

  console.log('MySQL migration completed.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
