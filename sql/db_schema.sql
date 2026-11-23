-- Foundation SQL Schema for Fiber Optic ERP & CRM (MySQL 8.0+ / MariaDB)
-- Note: Local runtime uses embedded SQLite with identical relational structure.

CREATE DATABASE IF NOT EXISTS `fiber_erp` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `fiber_erp`;

-- RBAC
CREATE TABLE IF NOT EXISTS tbl_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(100) UNIQUE NOT NULL,
    descr VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS tbl_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tbl_role_perms (
    role_id INT NOT NULL,
    perm_id INT NOT NULL,
    PRIMARY KEY (role_id, perm_id),
    FOREIGN KEY (role_id) REFERENCES tbl_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (perm_id) REFERENCES tbl_permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tbl_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id INT NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    last_login TIMESTAMP NULL,
    FOREIGN KEY (role_id) REFERENCES tbl_roles(id)
);

-- Hardware
CREATE TABLE IF NOT EXISTS tbl_kafos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS tbl_olts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kaf_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,
    FOREIGN KEY (kaf_id) REFERENCES tbl_kafos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tbl_fats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    olt_id INT NOT NULL,
    fat_number INT NOT NULL,
    FOREIGN KEY (olt_id) REFERENCES tbl_olts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tbl_ffats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fat_id INT NOT NULL,
    ffat_code VARCHAR(50) NOT NULL,
    FOREIGN KEY (fat_id) REFERENCES tbl_fats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tbl_modem_brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    serial_pattern VARCHAR(255) NOT NULL,
    serial_prefix VARCHAR(50) NOT NULL
);

-- Inventory & Spools
CREATE TABLE IF NOT EXISTS tbl_spools (
    id INT AUTO_INCREMENT PRIMARY KEY,
    spool_code VARCHAR(100) UNIQUE NOT NULL,
    cable_type ENUM('indoor', 'outdoor') NOT NULL,
    initial_length INT NOT NULL,
    current_length INT NOT NULL,
    assigned_installer_id INT NULL,
    FOREIGN KEY (assigned_installer_id) REFERENCES tbl_users(id)
);

-- Workflow & Services
CREATE TABLE IF NOT EXISTS tbl_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    type ENUM('install', 'fault') NOT NULL,
    status ENUM('pending', 'assigned', 'completed') DEFAULT 'pending',
    assigned_installer INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_installer) REFERENCES tbl_users(id)
);

CREATE TABLE IF NOT EXISTS tbl_service_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNIQUE NOT NULL,
    installer_id INT NOT NULL,
    kaf_id INT NOT NULL,
    olt_id INT NOT NULL,
    fat_id INT NOT NULL,
    ffat_id INT NOT NULL,
    out_spool_id INT NULL,
    out_total_meter INT DEFAULT 0,
    in_spool_id INT NULL,
    in_total_meter INT DEFAULT 0,
    modem_serial VARCHAR(100) NOT NULL,
    price_snapshot JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tbl_tickets(id),
    FOREIGN KEY (installer_id) REFERENCES tbl_users(id)
);

CREATE TABLE IF NOT EXISTS tbl_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_id INT NOT NULL,
    image_type VARCHAR(50) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    FOREIGN KEY (record_id) REFERENCES tbl_service_records(id) ON DELETE CASCADE
);

-- Financials
CREATE TABLE IF NOT EXISTS tbl_tariffs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    installer_id INT NOT NULL,
    calc_type ENUM('fixed', 'per_meter', 'hybrid') NOT NULL,
    base_price DECIMAL(15,2) NOT NULL DEFAULT 0,
    meter_limit INT NOT NULL DEFAULT 0,
    extra_meter_price DECIMAL(15,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (installer_id) REFERENCES tbl_users(id)
);

CREATE TABLE IF NOT EXISTS tbl_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    record_id INT NULL,
    amount DECIMAL(15,2) NOT NULL,
    type ENUM('credit', 'debit') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES tbl_users(id)
);
