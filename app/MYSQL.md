# MySQL Workbench Setup

This file explains how to move the sample data from `dist/northwind.db` to MySQL and run the web app with MySQL.

## 1. Install dependencies

```powershell
cd app
npm install
```

## 2. Configure `.env`

In `app/.env`, set:

```env
DB_CLIENT=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=northwind
MYSQL_CONNECTION_LIMIT=10
```

To keep using SQLite, use:

```env
DB_CLIENT=sqlite
DB_PATH=../dist/northwind.db
```

## 3. Import schema and data into MySQL

Start MySQL Server first, then run:

```powershell
cd app
npm run mysql:migrate
```

The migration script will:

- Create the `northwind` database if it does not exist.
- Drop and recreate the Northwind tables in the target MySQL database.
- Copy data from SQLite to MySQL.
- Create a small set of common Northwind views.

Warning: the migration drops existing Northwind tables in the target MySQL database. Do not point it at a database that contains important data.

## 4. Run the app with MySQL

```powershell
cd app
npm start
```

Open:

```text
http://localhost:3000
```

## 5. Check data in MySQL Workbench

```sql
USE northwind;
SHOW TABLES;
SELECT COUNT(*) FROM Customers;
SELECT COUNT(*) FROM Orders;
SELECT COUNT(*) FROM `Order Details`;
```
