CREATE TABLE IF NOT EXISTS Users (
  UserID INT NOT NULL AUTO_INCREMENT,
  Username VARCHAR(80) NOT NULL,
  PasswordHash VARCHAR(255) NOT NULL,
  Role ENUM('Admin','Employee') NOT NULL DEFAULT 'Employee',
  EmployeeID INT NULL,
  Status ENUM('Active','Disabled') NOT NULL DEFAULT 'Active',
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (UserID),
  UNIQUE KEY uq_users_username (Username),
  KEY idx_users_employee_id (EmployeeID),
  CONSTRAINT fk_users_employee FOREIGN KEY (EmployeeID)
    REFERENCES Employees(EmployeeID)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

INSERT INTO Users (Username, PasswordHash, Role, EmployeeID, Status)
VALUES
  ('admin', '$2a$12$bIyfD/RvpyNuGMM.0iDEHuEICvebv.bekICUruJxmUhBfP4ua/kYG', 'Admin', NULL, 'Active'),
  ('employee', '$2a$12$2xldIPzFCLwHBaOsebgyauWK7bsaHoff9hcQAzaPVZvyAg5.MVATW', 'Employee', 1, 'Active')
ON DUPLICATE KEY UPDATE
  Role = VALUES(Role),
  EmployeeID = VALUES(EmployeeID),
  Status = VALUES(Status);
