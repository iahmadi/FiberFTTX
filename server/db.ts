import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'fiber_erp.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  initSchema(db);
  seedInitialData(db);
  seedExtendedModules(db);

  dbInstance = db;
  return db;
}

function ensureColumn(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tbl_settings (
      key_name TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tbl_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_name TEXT UNIQUE NOT NULL,
      descr TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tbl_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tbl_role_perms (
      role_id INTEGER NOT NULL,
      perm_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, perm_id),
      FOREIGN KEY (role_id) REFERENCES tbl_roles(id) ON DELETE CASCADE,
      FOREIGN KEY (perm_id) REFERENCES tbl_permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tbl_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT NULL,
      FOREIGN KEY (role_id) REFERENCES tbl_roles(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_kafos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tbl_olts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kaf_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (kaf_id) REFERENCES tbl_kafos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tbl_fats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      olt_id INTEGER NOT NULL,
      fat_number INTEGER NOT NULL,
      FOREIGN KEY (olt_id) REFERENCES tbl_olts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tbl_ffats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fat_id INTEGER NOT NULL,
      ffat_code TEXT NOT NULL,
      FOREIGN KEY (fat_id) REFERENCES tbl_fats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tbl_modem_brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      serial_pattern TEXT NOT NULL,
      serial_prefix TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tbl_inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('unit', 'spool', 'modem')),
      modem_brand_id INTEGER NULL,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (modem_brand_id) REFERENCES tbl_modem_brands(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_spools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NULL,
      spool_code TEXT UNIQUE NOT NULL,
      cable_type TEXT NOT NULL CHECK(cable_type IN ('indoor', 'outdoor')),
      initial_length INTEGER NOT NULL,
      current_length INTEGER NOT NULL,
      assigned_installer_id INTEGER NULL,
      FOREIGN KEY (item_id) REFERENCES tbl_inventory_items(id),
      FOREIGN KEY (assigned_installer_id) REFERENCES tbl_users(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_van_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      serial_number TEXT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES tbl_users(id),
      FOREIGN KEY (item_id) REFERENCES tbl_inventory_items(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      address TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('install', 'fault')),
      config_pppoe_user TEXT NULL,
      config_pppoe_pass TEXT NULL,
      config_vlan INTEGER NULL,
      has_voip INTEGER NOT NULL DEFAULT 0,
      config_voip_data TEXT NULL,
      operator_notes TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'completed')),
      assigned_installer INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_installer) REFERENCES tbl_users(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_service_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER UNIQUE NOT NULL,
      installer_id INTEGER NOT NULL,
      kaf_id INTEGER NOT NULL,
      olt_id INTEGER NOT NULL,
      fat_id INTEGER NOT NULL,
      ffat_id INTEGER NOT NULL,
      out_spool_id INTEGER NULL,
      out_total_meter INTEGER NOT NULL DEFAULT 0,
      in_spool_id INTEGER NULL,
      in_total_meter INTEGER NOT NULL DEFAULT 0,
      modem_source TEXT NOT NULL DEFAULT 'company' CHECK(modem_source IN ('company', 'customer')),
      modem_brand_id INTEGER NULL,
      van_stock_id INTEGER NULL,
      modem_serial TEXT NOT NULL,
      price_snapshot TEXT NOT NULL,
      service_date_jalali TEXT NULL,
      notes TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tbl_tickets(id),
      FOREIGN KEY (installer_id) REFERENCES tbl_users(id),
      FOREIGN KEY (modem_brand_id) REFERENCES tbl_modem_brands(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      image_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      FOREIGN KEY (record_id) REFERENCES tbl_service_records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tbl_tariffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installer_id INTEGER UNIQUE NOT NULL,
      calc_type TEXT NOT NULL CHECK(calc_type IN ('fixed', 'per_meter', 'hybrid')),
      base_price REAL NOT NULL DEFAULT 0,
      meter_limit INTEGER NOT NULL DEFAULT 0,
      extra_meter_price REAL NOT NULL DEFAULT 0,
      bonus_target_count INTEGER NOT NULL DEFAULT 0,
      bonus_amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (installer_id) REFERENCES tbl_users(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      record_id INTEGER NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
      description TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES tbl_users(id)
    );

    CREATE TABLE IF NOT EXISTS tbl_activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NULL,
      username TEXT NOT NULL,
      user_full_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NULL,
      summary TEXT NOT NULL,
      details TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES tbl_users(id) ON DELETE SET NULL
    );
  `);

  // Idempotent column migrations for existing databases
  ensureColumn(db, 'tbl_spools', 'item_id', 'INTEGER NULL');
  ensureColumn(db, 'tbl_tickets', 'config_pppoe_user', 'TEXT NULL');
  ensureColumn(db, 'tbl_tickets', 'config_pppoe_pass', 'TEXT NULL');
  ensureColumn(db, 'tbl_tickets', 'config_vlan', 'INTEGER NULL');
  ensureColumn(db, 'tbl_tickets', 'has_voip', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'tbl_tickets', 'config_voip_data', 'TEXT NULL');
  ensureColumn(db, 'tbl_tickets', 'operator_notes', 'TEXT NULL');
  ensureColumn(db, 'tbl_tickets', 'scheduled_date', 'TEXT NULL');
  ensureColumn(db, 'tbl_tickets', 'scheduled_time', 'TEXT NULL');
  ensureColumn(db, 'tbl_service_records', 'modem_source', "TEXT NOT NULL DEFAULT 'company'");
  ensureColumn(db, 'tbl_service_records', 'modem_brand_id', 'INTEGER NULL');
  ensureColumn(db, 'tbl_service_records', 'van_stock_id', 'INTEGER NULL');
}

function seedInitialData(db: DatabaseSync): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as cnt FROM tbl_users').get() as { cnt: number };
  if (existingUsers.cnt > 0) return;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare('INSERT OR IGNORE INTO tbl_settings (key_name, value) VALUES (?, ?)').run(
      'session_timeout_minutes',
      '30',
    );

    const permissions: Array<[string, string]> = [
      ['can_view_dashboard', 'مشاهده داشبورد و آمار عملیاتی'],
      ['can_create_tickets', 'ثبت تیکت جدید نصب یا خرابی'],
      ['can_assign_tickets', 'ارجاع و تخصیص تیکت به نصابان'],
      ['can_execute_service', 'ثبت فرم اجرا، متراژ کابل و سریال مودم'],
      ['can_view_all_tickets', 'مشاهده فهرست کامل تیکت‌های شرکت'],
      ['can_manage_hardware', 'مدیریت سلسله‌مراتب تجهیزات (KAF/OLT/FAT) و مودم‌ها'],
      ['can_add_fat', 'افزودن FAT و تولید کد پویا F-FAT'],
      ['can_manage_inventory', 'مدیریت انبار قرقره‌ها و تحویل به خودروی نصاب'],
      ['can_cross_use_cables', 'امکان مصرف از قرقره سایر نصابان'],
      ['can_view_financials', 'مشاهده امور مالی، تعرفه‌ها و دفتر کل'],
      ['can_manage_tariffs', 'تنظیم تعرفه نصابان و ثبت سند پرداخت'],
      ['can_manage_users', 'مدیریت کاربران، ایجاد نقش و تنظیم دسترسی‌ها (RBAC)'],
    ];

    const insertPerm = db.prepare('INSERT INTO tbl_permissions (key_name, descr) VALUES (?, ?)');
    for (const [k, d] of permissions) {
      insertPerm.run(k, d);
    }

    const insertRole = db.prepare('INSERT INTO tbl_roles (role_name) VALUES (?)');
    const superAdminRoleId = Number(insertRole.run('SuperAdmin').lastInsertRowid);
    const operatorRoleId = Number(insertRole.run('اپراتور تیکتینگ').lastInsertRowid);
    const installerRoleId = Number(insertRole.run('تکنسین نصاب').lastInsertRowid);
    const financeRoleId = Number(insertRole.run('حسابدار و انباردار').lastInsertRowid);

    const permMap = new Map<string, number>();
    const allPermRows = db.prepare('SELECT id, key_name FROM tbl_permissions').all() as Array<{
      id: number;
      key_name: string;
    }>;
    for (const r of allPermRows) permMap.set(r.key_name, r.id);

    const grantPerm = db.prepare('INSERT INTO tbl_role_perms (role_id, perm_id) VALUES (?, ?)');
    for (const pid of permMap.values()) {
      grantPerm.run(superAdminRoleId, pid);
    }

    for (const key of [
      'can_view_dashboard',
      'can_create_tickets',
      'can_assign_tickets',
      'can_view_all_tickets',
    ]) {
      const pid = permMap.get(key);
      if (pid) grantPerm.run(operatorRoleId, pid);
    }

    for (const key of ['can_view_dashboard', 'can_execute_service', 'can_add_fat']) {
      const pid = permMap.get(key);
      if (pid) grantPerm.run(installerRoleId, pid);
    }

    for (const key of [
      'can_view_dashboard',
      'can_view_all_tickets',
      'can_manage_inventory',
      'can_view_financials',
      'can_manage_tariffs',
    ]) {
      const pid = permMap.get(key);
      if (pid) grantPerm.run(financeRoleId, pid);
    }

    // Admin password comes from env var if configured, otherwise empty (first-run claimable)
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const adminHash = envPasscode ? hashPassword(envPasscode) : '';

    const insertUser = db.prepare(
      'INSERT INTO tbl_users (username, password_hash, first_name, last_name, role_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    );
    const adminId = Number(
      insertUser.run('admin', adminHash, 'علیرضا', 'محمدی', superAdminRoleId).lastInsertRowid,
    );
    const operatorId = Number(
      insertUser.run('operator', '', 'سارا', 'احمدی', operatorRoleId).lastInsertRowid,
    );
    const installer1Id = Number(
      insertUser.run('installer1', '', 'حسین', 'کریمی', installerRoleId).lastInsertRowid,
    );
    const installer2Id = Number(
      insertUser.run('installer2', '', 'رضا', 'قاسمی', installerRoleId).lastInsertRowid,
    );
    void adminId;
    void operatorId;

    // Hardware Topology: KAF -> OLT -> FAT -> F-FAT
    const insertKaf = db.prepare('INSERT INTO tbl_kafos (name) VALUES (?)');
    const kaf1 = Number(insertKaf.run('کافو مرکزی ونک (KAF-VN01)').lastInsertRowid);
    const kaf2 = Number(insertKaf.run('کافو شمال سعادت‌آباد (KAF-SA02)').lastInsertRowid);

    const insertOlt = db.prepare('INSERT INTO tbl_olts (kaf_id, name) VALUES (?, ?)');
    const olt1 = Number(insertOlt.run(kaf1, 'OLT-HUAWEI-MA5800-01').lastInsertRowid);
    const olt2 = Number(insertOlt.run(kaf1, 'OLT-ZTE-C600-02').lastInsertRowid);
    const olt3 = Number(insertOlt.run(kaf2, 'OLT-HUAWEI-MA5800-03').lastInsertRowid);

    const insertFat = db.prepare('INSERT INTO tbl_fats (olt_id, fat_number) VALUES (?, ?)');
    const fat1 = Number(insertFat.run(olt1, 101).lastInsertRowid);
    const fat2 = Number(insertFat.run(olt1, 102).lastInsertRowid);
    const fat3 = Number(insertFat.run(olt2, 201).lastInsertRowid);
    const fat4 = Number(insertFat.run(olt3, 301).lastInsertRowid);

    const insertFFat = db.prepare('INSERT INTO tbl_ffats (fat_id, ffat_code) VALUES (?, ?)');
    insertFFat.run(fat1, 'FAT101-A1');
    insertFFat.run(fat1, 'FAT101-A2');
    insertFFat.run(fat2, 'FAT102-B1');
    insertFFat.run(fat3, 'FAT201-C1');
    insertFFat.run(fat4, 'FAT301-D1');
    const ffat4 = Number(insertFFat.run(fat4, 'FAT301-D2').lastInsertRowid);

    // Modem Brands with Regex validation rules
    const insertBrand = db.prepare(
      'INSERT INTO tbl_modem_brands (name, serial_pattern, serial_prefix) VALUES (?, ?, ?)',
    );
    insertBrand.run('Huawei HG8245H5', '^48575443[A-F0-9]{8}$', '48575443');
    insertBrand.run('ZTE F660 V8', '^ZTEG[A-Z0-9]{8}$', 'ZTEG');
    insertBrand.run('TP-Link XZ000-G3', '^TPLK[0-9]{10}$', 'TPLK');
    insertBrand.run('FiberHome AN5506', '^FHTT[A-F0-9]{8}$', 'FHTT');

    // Inventory Spools (Van Stock + Central Warehouse)
    const insertSpool = db.prepare(
      'INSERT INTO tbl_spools (spool_code, cable_type, initial_length, current_length, assigned_installer_id) VALUES (?, ?, ?, ?, ?)',
    );
    const spOut1 = Number(
      insertSpool.run('OUT-1405-01', 'outdoor', 1000, 780, installer1Id).lastInsertRowid,
    );
    const spIn1 = Number(
      insertSpool.run('IN-1405-01', 'indoor', 500, 415, installer1Id).lastInsertRowid,
    );
    insertSpool.run('OUT-1405-02', 'outdoor', 1000, 920, installer2Id);
    insertSpool.run('IN-1405-02', 'indoor', 500, 460, installer2Id);
    insertSpool.run('OUT-WH-09', 'outdoor', 2000, 2000, null);
    insertSpool.run('IN-WH-12', 'indoor', 1000, 1000, null);

    // Installer Tariffs
    const insertTariff = db.prepare(
      'INSERT INTO tbl_tariffs (installer_id, calc_type, base_price, meter_limit, extra_meter_price, bonus_target_count, bonus_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insertTariff.run(installer1Id, 'hybrid', 950000, 50, 15000, 5, 600000);
    insertTariff.run(installer2Id, 'per_meter', 250000, 0, 18000, 10, 1000000);

    // Tickets
    const insertTicket = db.prepare(
      'INSERT INTO tbl_tickets (customer_name, address, type, status, assigned_installer, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertTicket.run(
      'شرکت مهندسی پارس‌نور',
      'تهران، میدان ونک، خیابان ملاصدرا، پلاک ۴۲، واحد ۳',
      'install',
      'assigned',
      installer1Id,
      '2026-11-20 09:15:00',
    );
    insertTicket.run(
      'امیرحسین رضایی',
      'تهران، سعادت‌آباد، بلوار سرو غربی، کوچه صدف، پلاک ۱۸',
      'fault',
      'assigned',
      installer1Id,
      '2026-11-21 11:30:00',
    );
    insertTicket.run(
      'مریم کاظمی',
      'تهران، جردن، خیابان ناهید شرقی، پلاک ۹، طبقه ۴',
      'install',
      'assigned',
      installer2Id,
      '2026-11-21 14:10:00',
    );
    insertTicket.run(
      'کلینیک تخصصی بهار',
      'تهران، گاندی شمالی، نبش کوچه ششم، پلاک ۱۲',
      'install',
      'pending',
      null,
      '2026-11-22 08:20:00',
    );
    const completedTicket1 = Number(
      insertTicket.run(
        'دفتر حقوقی آوا',
        'تهران، شهرک غرب، بلوار دادمان، پلاک ۱۰۵',
        'install',
        'completed',
        installer1Id,
        '2026-11-18 10:00:00',
      ).lastInsertRowid,
    );
    const completedTicket2 = Number(
      insertTicket.run(
        'نیما فرهادی',
        'تهران، میرداماد، خیابان شمس تبریزی، پلاک ۲۷',
        'install',
        'completed',
        installer1Id,
        '2026-11-19 15:40:00',
      ).lastInsertRowid,
    );

    // Seed 2 historical service records + ledger entries
    const insertRecord = db.prepare(
      `INSERT INTO tbl_service_records
       (ticket_id, installer_id, kaf_id, olt_id, fat_id, ffat_id, out_spool_id, out_total_meter, in_spool_id, in_total_meter, modem_serial, price_snapshot, service_date_jalali, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const snap1 = JSON.stringify({
      calc_type: 'hybrid',
      service_type: 'install',
      base_price: 950000,
      meter_limit: 50,
      extra_meter_price: 15000,
      out_meter: 55,
      in_meter: 20,
      total_meter: 75,
      billable_extra_meter: 25,
      extra_meter_fee: 375000,
      bonus_applied: 0,
      total_earned: 1325000,
      computed_at: '2026-11-18T13:30:00Z',
    });

    const rec1Id = Number(
      insertRecord.run(
        completedTicket1,
        installer1Id,
        kaf2,
        olt3,
        fat4,
        ffat4,
        spOut1,
        55,
        spIn1,
        20,
        '4857544399AA11BB',
        snap1,
        '1405/08/27',
        'نصب با موفقیت انجام شد. تست پاور -18.4 dBm ثبت گردید.',
        '2026-11-18 13:30:00',
      ).lastInsertRowid,
    );

    const snap2 = JSON.stringify({
      calc_type: 'hybrid',
      service_type: 'install',
      base_price: 950000,
      meter_limit: 50,
      extra_meter_price: 15000,
      out_meter: 35,
      in_meter: 10,
      total_meter: 45,
      billable_extra_meter: 0,
      extra_meter_fee: 0,
      bonus_applied: 0,
      total_earned: 950000,
      computed_at: '2026-11-19T17:10:00Z',
    });

    const rec2Id = Number(
      insertRecord.run(
        completedTicket2,
        installer1Id,
        kaf1,
        olt1,
        fat1,
        1,
        spOut1,
        35,
        spIn1,
        10,
        'ZTEG882211AA',
        snap2,
        '1405/08/28',
        'نصب مودم ZTE در واحد مسکونی و تحویل لینک.',
        '2026-11-19 17:10:00',
      ).lastInsertRowid,
    );

    const insertLedger = db.prepare(
      'INSERT INTO tbl_ledger (user_id, record_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertLedger.run(
      installer1Id,
      rec1Id,
      1325000,
      'credit',
      `دستمزد سرویس تیکت #${completedTicket1} (۷۵ متر کابل)`,
      '2026-11-18 13:30:00',
    );
    insertLedger.run(
      installer1Id,
      rec2Id,
      950000,
      'credit',
      `دستمزد سرویس تیکت #${completedTicket2} (۴۵ متر کابل)`,
      '2026-11-19 17:10:00',
    );
    insertLedger.run(
      installer1Id,
      null,
      1000000,
      'debit',
      'تسویه علی‌الحساب هفتگی - حواله شماره ۴۴۱۲',
      '2026-11-20 10:00:00',
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function seedExtendedModules(db: DatabaseSync): void {
  const existingItems = db
    .prepare('SELECT COUNT(*) as cnt FROM tbl_inventory_items')
    .get() as { cnt: number };
  if (existingItems.cnt === 0) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const huawei = db
        .prepare('SELECT id FROM tbl_modem_brands WHERE serial_prefix = ? LIMIT 1')
        .get('48575443') as { id: number } | undefined;
      const zte = db
        .prepare('SELECT id FROM tbl_modem_brands WHERE serial_prefix = ? LIMIT 1')
        .get('ZTEG') as { id: number } | undefined;
      const inst1 = db
        .prepare('SELECT id FROM tbl_users WHERE username = ?')
        .get('installer1') as { id: number } | undefined;
      const inst2 = db
        .prepare('SELECT id FROM tbl_users WHERE username = ?')
        .get('installer2') as { id: number } | undefined;

      const insItem = db.prepare(
        'INSERT INTO tbl_inventory_items (name, type, modem_brand_id, total_quantity) VALUES (?, ?, ?, ?)',
      );
      const outCableItemId = Number(
        insItem.run('کابل دراپ فضای باز (Drop Outdoor)', 'spool', null, 3).lastInsertRowid,
      );
      const inCableItemId = Number(
        insItem.run('کابل داخلی فلت (Indoor Flat)', 'spool', null, 3).lastInsertRowid,
      );
      const huaweiModemItemId = Number(
        insItem.run('مودم فیبر نوری Huawei HG8245H5', 'modem', huawei?.id ?? null, 18)
          .lastInsertRowid,
      );
      const zteModemItemId = Number(
        insItem.run('مودم فیبر نوری ZTE F660 V8', 'modem', zte?.id ?? null, 12).lastInsertRowid,
      );
      const patchCordItemId = Number(
        insItem.run('پچ‌کورد فیبر SC/APC 3 متری', 'unit', null, 45).lastInsertRowid,
      );
      const rosetteItemId = Number(
        insItem.run('پریز فیبر نوری دیواری (Rosette 2-Port)', 'unit', null, 30).lastInsertRowid,
      );

      db.prepare("UPDATE tbl_spools SET item_id = ? WHERE cable_type = 'outdoor' AND item_id IS NULL").run(
        outCableItemId,
      );
      db.prepare("UPDATE tbl_spools SET item_id = ? WHERE cable_type = 'indoor' AND item_id IS NULL").run(
        inCableItemId,
      );

      const insVan = db.prepare(
        'INSERT INTO tbl_van_stock (user_id, item_id, serial_number, quantity) VALUES (?, ?, ?, ?)',
      );
      if (inst1) {
        // Pre-registered serial modem + bulk quantity modem + unit consumables
        insVan.run(inst1.id, huaweiModemItemId, '48575443AABB1122', 1);
        insVan.run(inst1.id, huaweiModemItemId, null, 3);
        insVan.run(inst1.id, zteModemItemId, null, 2);
        insVan.run(inst1.id, patchCordItemId, null, 8);
        insVan.run(inst1.id, rosetteItemId, null, 6);
      }
      if (inst2) {
        insVan.run(inst2.id, zteModemItemId, 'ZTEG77441122', 1);
        insVan.run(inst2.id, zteModemItemId, null, 2);
        insVan.run(inst2.id, patchCordItemId, null, 5);
      }

      // Populate realistic provisioning config on first ticket (#1) and operator notes on #2 if empty
      const t1 = db
        .prepare('SELECT id, config_pppoe_user, operator_notes FROM tbl_tickets WHERE id = 1')
        .get() as { id: number; config_pppoe_user: string | null; operator_notes: string | null } | undefined;
      if (t1 && !t1.config_pppoe_user && !t1.operator_notes) {
        db.prepare(
          `UPDATE tbl_tickets
           SET config_pppoe_user = ?,
               config_pppoe_pass = ?,
               config_vlan = ?,
               has_voip = ?,
               config_voip_data = ?,
               operator_notes = ?
           WHERE id = 1`,
        ).run(
          'parsnoor@ftth.local',
          'PN#884210',
          1042,
          1,
          'شماره داخلی: 02188991100 | SIP Server: 10.20.30.5 | Auth: 88991100',
          'ساختمان تجاری است؛ پس از کانفیگ مودم، خط تلفن VoIP روی پورت TEL1 تست شود.',
        );
      }

      const t2 = db
        .prepare('SELECT id, operator_notes FROM tbl_tickets WHERE id = 2')
        .get() as { id: number; operator_notes: string | null } | undefined;
      if (t2 && !t2.operator_notes) {
        db.prepare('UPDATE tbl_tickets SET operator_notes = ? WHERE id = 2').run(
          'مشترک قطعی لینک (چراغ LOS قرمز) گزارش کرده است. احتمال شکستگی پچ‌کورد داخل واحد.',
        );
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  const existingLogs = db
    .prepare('SELECT COUNT(*) as cnt FROM tbl_activity_logs')
    .get() as { cnt: number };
  if (existingLogs.cnt === 0) {
    const adminUser = db
      .prepare('SELECT id, username, first_name, last_name FROM tbl_users WHERE username = ?')
      .get('admin') as { id: number; username: string; first_name: string; last_name: string } | undefined;
    const operatorUser = db
      .prepare('SELECT id, username, first_name, last_name FROM tbl_users WHERE username = ?')
      .get('operator') as { id: number; username: string; first_name: string; last_name: string } | undefined;
    const inst1User = db
      .prepare('SELECT id, username, first_name, last_name FROM tbl_users WHERE username = ?')
      .get('installer1') as { id: number; username: string; first_name: string; last_name: string } | undefined;

    const insLog = db.prepare(
      `INSERT INTO tbl_activity_logs (user_id, username, user_full_name, action_type, entity_type, entity_id, summary, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    if (operatorUser) {
      const opName = `${operatorUser.first_name} ${operatorUser.last_name}`;
      insLog.run(
        operatorUser.id,
        operatorUser.username,
        opName,
        'ticket_assigned',
        'ticket',
        1,
        'تایید و ارجاع تیکت #1 به حسین کریمی',
        'مشترک: شرکت مهندسی پارس نور — کانفیگ PPPoE و VLAN 1042 ثبت شد.',
        '2026-11-22 09:20:00',
      );
      insLog.run(
        operatorUser.id,
        operatorUser.username,
        opName,
        'ticket_created',
        'ticket',
        8,
        'ثبت تیکت جدید نصب #8 برای مجتمع مسکونی سرو',
        'وضعیت: در انتظار ارجاع به نصاب',
        '2026-11-22 10:05:00',
      );
    }

    if (inst1User) {
      const iName = `${inst1User.first_name} ${inst1User.last_name}`;
      insLog.run(
        inst1User.id,
        inst1User.username,
        iName,
        'service_completed',
        'ticket',
        5,
        'تایید و تکمیل عملیات نصب تیکت #5 (دفتر حقوقی آوا)',
        'کد F-FAT: FAT301-D2 — متراژ کل: ۷۵ متر — مودم: 4857544399AA11BB',
        '2026-11-22 13:40:00',
      );
    }

    if (adminUser) {
      const aName = `${adminUser.first_name} ${adminUser.last_name}`;
      insLog.run(
        adminUser.id,
        adminUser.username,
        aName,
        'van_stock_transferred',
        'inventory',
        3,
        'تحویل مودم Huawei HG8245H5 به موجودی خودروی حسین کریمی',
        'تعداد: ۳ عدد مودم انبار شرکت',
        '2026-11-22 14:15:00',
      );
      insLog.run(
        adminUser.id,
        adminUser.username,
        aName,
        'payout_recorded',
        'financial',
        null,
        'ثبت سند پرداخت مالی ۱,۰۰۰,۰۰۰ تومان برای حسین کریمی',
        'تسویه علی‌الحساب هفتگی - حواله شماره ۴۴۱۲',
        '2026-11-22 15:00:00',
      );
    }
  }

  const existingHistoricalLedger = db
    .prepare("SELECT COUNT(*) as cnt FROM tbl_ledger WHERE created_at < '2026-11-01'")
    .get() as { cnt: number };
  if (existingHistoricalLedger.cnt === 0) {
    const inst1 = db
      .prepare('SELECT id FROM tbl_users WHERE username = ?')
      .get('installer1') as { id: number } | undefined;
    const inst2 = db
      .prepare('SELECT id FROM tbl_users WHERE username = ?')
      .get('installer2') as { id: number } | undefined;

    if (inst1 || inst2) {
      const insHistLedger = db.prepare(
        'INSERT INTO tbl_ledger (user_id, record_id, amount, type, description, created_at) VALUES (?, NULL, ?, ?, ?, ?)',
      );
      const historicalRows: Array<{
        userId: number;
        credit: number;
        creditDesc: string;
        debitDesc: string;
        date: string;
      }> = [];

      if (inst1) {
        historicalRows.push(
          {
            userId: inst1.id,
            credit: 2150000,
            creditDesc: 'کارکرد تجمیعی پروژه‌های نصب تیر ۱۴۰۵ (۳ فقره)',
            debitDesc: 'تسویه نهایی کارکرد تیر ۱۴۰۵',
            date: '2026-07-10 14:00:00', // تیر ۱۴۰۵
          },
          {
            userId: inst1.id,
            credit: 2680000,
            creditDesc: 'کارکرد تجمیعی پروژه‌های نصب مرداد ۱۴۰۵ (۴ فقره)',
            debitDesc: 'تسویه نهایی کارکرد مرداد ۱۴۰۵',
            date: '2026-08-12 15:20:00', // مرداد ۱۴۰۵
          },
          {
            userId: inst1.id,
            credit: 3120000,
            creditDesc: 'کارکرد تجمیعی نصب و رفع خرابی شهریور ۱۴۰۵ (۴ فقره)',
            debitDesc: 'تسویه نهایی کارکرد شهریور ۱۴۰۵',
            date: '2026-09-14 16:10:00', // شهریور ۱۴۰۵
          },
          {
            userId: inst1.id,
            credit: 2890000,
            creditDesc: 'کارکرد تجمیعی پروژه‌های مهر ۱۴۰۵ (۳ فقره)',
            debitDesc: 'تسویه نهایی کارکرد مهر ۱۴۰۵',
            date: '2026-10-15 13:45:00', // مهر ۱۴۰۵
          },
        );
      }
      if (inst2) {
        historicalRows.push(
          {
            userId: inst2.id,
            credit: 1420000,
            creditDesc: 'کارکرد پروژه‌های نصب مرداد ۱۴۰۵ (۲ فقره)',
            debitDesc: 'تسویه نهایی کارکرد مرداد ۱۴۰۵',
            date: '2026-08-15 11:30:00', // مرداد ۱۴۰۵
          },
          {
            userId: inst2.id,
            credit: 1950000,
            creditDesc: 'کارکرد پروژه‌های نصب شهریور ۱۴۰۵ (۳ فقره)',
            debitDesc: 'تسویه نهایی کارکرد شهریور ۱۴۰۵',
            date: '2026-09-16 12:00:00', // شهریور ۱۴۰۵
          },
          {
            userId: inst2.id,
            credit: 1780000,
            creditDesc: 'کارکرد پروژه‌های نصب مهر ۱۴۰۵ (۲ فقره)',
            debitDesc: 'تسویه نهایی کارکرد مهر ۱۴۰۵',
            date: '2026-10-17 17:00:00', // مهر ۱۴۰۵
          },
        );
      }

      db.exec('BEGIN IMMEDIATE;');
      try {
        for (const r of historicalRows) {
          insHistLedger.run(r.userId, r.credit, 'credit', r.creditDesc, r.date);
          insHistLedger.run(r.userId, r.credit, 'debit', r.debitDesc, r.date);
        }
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }

  // Assign upcoming daily schedule dates/times to open tickets that don't have one yet
  const unscheduledOpen = db
    .prepare(
      "SELECT id, type FROM tbl_tickets WHERE status != 'completed' AND (scheduled_date IS NULL OR scheduled_date = '') ORDER BY id ASC",
    )
    .all() as Array<{ id: number; type: string }>;
  if (unscheduledOpen.length > 0) {
    const slotTimes = ['09:30', '11:30', '14:00', '16:00'];
    const dayOffsets = [0, 1, 2, 3, 1, 4];
    const updateSched = db.prepare(
      'UPDATE tbl_tickets SET scheduled_date = ?, scheduled_time = ? WHERE id = ?',
    );
    const base = new Date();
    unscheduledOpen.forEach((row, idx) => {
      const target = new Date(base);
      target.setDate(base.getDate() + (dayOffsets[idx % dayOffsets.length] ?? idx));
      const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
      const time = slotTimes[idx % slotTimes.length] || '10:00';
      updateSched.run(iso, time, row.id);
    });
  }
}
