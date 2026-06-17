ALTER TABLE Products
  ADD COLUMN IsVerified TINYINT(1) NOT NULL DEFAULT 1;

UPDATE Products
SET IsVerified = 1
WHERE IsVerified IS NULL;

CREATE INDEX idx_products_is_verified ON Products(IsVerified);
