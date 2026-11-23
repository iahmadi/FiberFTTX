import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { getDb } from './server/db.ts';
import {
  createSessionToken,
  getSessionTimeoutMinutes,
  hashPassword,
  loadUserWithPermissions,
  requireAuth,
  requirePermission,
  revokeSessionToken,
  userHasPermission,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  calculateTariffSnapshot,
  computeLedgerBalance,
  generateFFatCode,
  validateModemSerial,
  validateSpoolConsumption,
  type SpoolRecord,
  type TariffRule,
} from './src/lib/fiberLogic.ts';

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_BASE_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_BASE_DIR)) {
  fs.mkdirSync(UPLOADS_BASE_DIR, { recursive: true });
}

// Initialize DB on startup
getDb();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Serve uploaded evidence files safely
app.use(
  '/uploads',
  express.static(UPLOADS_BASE_DIR, {
    dotfiles: 'deny',
    index: false,
  }),
);

// Multer memory storage so we validate ticketId & magic bytes before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB hard cap (compressed images are ~150KB)
});

function isValidImageBuffer(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function isAdminClaimed(): boolean {
  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM tbl_users WHERE username = ?')
    .get('admin') as { password_hash: string } | undefined;
  return Boolean(row && row.password_hash && row.password_hash.length > 0);
}

// ==========================================
// 1. AUTHENTICATION & SESSION ROUTES
// ==========================================

app.get('/api/auth/status', (_req, res) => {
  res.json({
    adminClaimed: isAdminClaimed(),
    timeoutMinutes: getSessionTimeoutMinutes(),
    demoModeAvailable: !isAdminClaimed(),
  });
});

app.post('/api/auth/claim-admin', (req, res) => {
  if (isAdminClaimed()) {
    res.status(403).json({ error: 'رمز عبور مدیر کل قبلاً تنظیم شده است.' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
    return;
  }

  const db = getDb();
  const hashed = hashPassword(password);
  const adminRow = db.prepare('SELECT id, role_id FROM tbl_users WHERE username = ?').get('admin') as
    | { id: number; role_id: number }
    | undefined;
  if (!adminRow) {
    res.status(404).json({ error: 'حساب مدیر کل یافت نشد.' });
    return;
  }

  db.prepare("UPDATE tbl_users SET password_hash = ?, last_login = datetime('now') WHERE id = ?").run(
    hashed,
    adminRow.id,
  );

  const user = loadUserWithPermissions(adminRow.id);
  const session = createSessionToken(adminRow.id, adminRow.role_id);
  res.json({ ...session, user });
});

app.post('/api/auth/demo-login', (req, res) => {
  if (isAdminClaimed()) {
    res.status(403).json({ error: 'پس از فعال‌سازی رمز مدیر کل، ورود آزمایشی غیرفعال می‌شود.' });
    return;
  }
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!['admin', 'operator', 'installer1', 'installer2'].includes(username)) {
    res.status(400).json({ error: 'حساب نمونه انتخاب‌شده معتبر نیست.' });
    return;
  }

  const db = getDb();
  const userRow = db
    .prepare('SELECT id, role_id, is_active FROM tbl_users WHERE username = ?')
    .get(username) as { id: number; role_id: number; is_active: number } | undefined;

  if (!userRow || userRow.is_active !== 1) {
    res.status(401).json({ error: 'حساب کاربری غیرفعال است.' });
    return;
  }

  db.prepare("UPDATE tbl_users SET last_login = datetime('now') WHERE id = ?").run(userRow.id);
  const user = loadUserWithPermissions(userRow.id);
  const session = createSessionToken(userRow.id, userRow.role_id);
  res.json({ ...session, user });
});

app.post('/api/auth/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است.' });
    return;
  }

  const db = getDb();
  const userRow = db
    .prepare('SELECT id, role_id, password_hash, is_active FROM tbl_users WHERE username = ?')
    .get(username) as
    | { id: number; role_id: number; password_hash: string; is_active: number }
    | undefined;

  if (!userRow || !userRow.password_hash || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است.' });
    return;
  }

  if (userRow.is_active !== 1) {
    res.status(403).json({ error: 'حساب کاربری شما غیرفعال شده است.' });
    return;
  }

  db.prepare("UPDATE tbl_users SET last_login = datetime('now') WHERE id = ?").run(userRow.id);
  const user = loadUserWithPermissions(userRow.id);
  const session = createSessionToken(userRow.id, userRow.role_id);
  res.json({ ...session, user });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.rawToken) {
    revokeSessionToken(req.rawToken);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    user: req.authUser,
    csrfToken: req.sessionPayload?.csrf,
    timeoutMinutes: getSessionTimeoutMinutes(),
  });
});

// ==========================================
// 2. DASHBOARD & INSTALLER INBOX
// ==========================================

app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const db = getDb();
  const canViewAll = userHasPermission(user, 'can_view_all_tickets');

  const ticketStats = (
    canViewAll
      ? db
          .prepare(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
               SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
             FROM tbl_tickets`,
          )
          .get()
      : db
          .prepare(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
               SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
             FROM tbl_tickets
             WHERE assigned_installer = ?`,
          )
          .get(user.id)
  ) as { total: number; pending: number; assigned: number; completed: number };

  const meterRow = (
    canViewAll
      ? db
          .prepare(
            `SELECT
               COALESCE(SUM(out_total_meter), 0) as out_meters,
               COALESCE(SUM(in_total_meter), 0) as in_meters
             FROM tbl_service_records`,
          )
          .get()
      : db
          .prepare(
            `SELECT
               COALESCE(SUM(out_total_meter), 0) as out_meters,
               COALESCE(SUM(in_total_meter), 0) as in_meters
             FROM tbl_service_records
             WHERE installer_id = ?`,
          )
          .get(user.id)
  ) as { out_meters: number; in_meters: number };

  const spoolRow = (
    canViewAll
      ? db
          .prepare(
            `SELECT COALESCE(SUM(current_length), 0) as remaining_meters, COUNT(*) as spool_count
             FROM tbl_spools`,
          )
          .get()
      : db
          .prepare(
            `SELECT COALESCE(SUM(current_length), 0) as remaining_meters, COUNT(*) as spool_count
             FROM tbl_spools
             WHERE assigned_installer_id = ?`,
          )
          .get(user.id)
  ) as { remaining_meters: number; spool_count: number };

  const ledgerRows = db
    .prepare('SELECT amount, type FROM tbl_ledger WHERE user_id = ?')
    .all(user.id) as Array<{ amount: number; type: 'credit' | 'debit' }>;
  const myBalance = computeLedgerBalance(ledgerRows);

  const inboxTickets = db
    .prepare(
      `SELECT t.*, u.first_name || ' ' || u.last_name as installer_name
       FROM tbl_tickets t
       LEFT JOIN tbl_users u ON u.id = t.assigned_installer
       WHERE t.status != 'completed' ${canViewAll ? '' : 'AND t.assigned_installer = ?'}
       ORDER BY t.id DESC
       LIMIT 12`,
    )
    .all(...(canViewAll ? [] : [user.id]));

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const dailyMetrics = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as day,
              COUNT(*) as count,
              COALESCE(SUM(out_total_meter), 0) as outMeters,
              COALESCE(SUM(in_total_meter), 0) as inMeters,
              COALESCE(SUM(out_total_meter + in_total_meter), 0) as meters
       FROM tbl_service_records
       WHERE substr(created_at, 1, 7) = ? ${canViewAll ? '' : 'AND installer_id = ?'}
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC
       LIMIT 31`,
    )
    .all(...(canViewAll ? [currentMonthPrefix] : [currentMonthPrefix, user.id]));

  const monthlySpoolStats = db
    .prepare(
      `SELECT s.id,
              s.spool_code,
              s.cable_type,
              s.initial_length,
              s.current_length,
              COALESCE((
                SELECT SUM(
                  CASE WHEN sr.out_spool_id = s.id THEN sr.out_total_meter ELSE 0 END +
                  CASE WHEN sr.in_spool_id = s.id THEN sr.in_total_meter ELSE 0 END
                )
                FROM tbl_service_records sr
                WHERE substr(sr.created_at, 1, 7) = ?
                  ${canViewAll ? '' : 'AND sr.installer_id = ?'}
                  AND (sr.out_spool_id = s.id OR sr.in_spool_id = s.id)
              ), 0) as usedMetersThisMonth
       FROM tbl_spools s
       ${canViewAll ? '' : 'WHERE s.assigned_installer_id = ?'}
       ORDER BY usedMetersThisMonth DESC, s.id ASC`,
    )
    .all(
      ...(canViewAll
        ? [currentMonthPrefix]
        : [currentMonthPrefix, user.id, user.id]),
    );

  res.json({
    stats: {
      totalTickets: ticketStats.total || 0,
      pendingTickets: ticketStats.pending || 0,
      assignedTickets: ticketStats.assigned || 0,
      completedTickets: ticketStats.completed || 0,
      outMetersUsed: meterRow.out_meters || 0,
      inMetersUsed: meterRow.in_meters || 0,
      remainingSpoolMeters: spoolRow.remaining_meters || 0,
      spoolCount: spoolRow.spool_count || 0,
      myBalance,
    },
    inboxTickets,
    dailyMetrics,
    monthlySpoolStats,
  });
});

// ==========================================
// 3. TICKETS & SERVICE EXECUTION
// ==========================================

app.get('/api/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const db = getDb();
  const canViewAll = userHasPermission(user, 'can_view_all_tickets');

  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const typeFilter = typeof req.query.type === 'string' ? req.query.type : '';

  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (!canViewAll) {
    clauses.push('t.assigned_installer = ?');
    params.push(user.id);
  }
  if (['pending', 'assigned', 'completed'].includes(statusFilter)) {
    clauses.push('t.status = ?');
    params.push(statusFilter);
  }
  if (['install', 'fault'].includes(typeFilter)) {
    clauses.push('t.type = ?');
    params.push(typeFilter);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT t.*,
              u.first_name || ' ' || u.last_name as installer_name,
              sr.id as service_record_id,
              sr.modem_serial,
              ff.ffat_code,
              f.fat_number,
              o.name as olt_name,
              k.name as kaf_name
       FROM tbl_tickets t
       LEFT JOIN tbl_users u ON u.id = t.assigned_installer
       LEFT JOIN tbl_service_records sr ON sr.ticket_id = t.id
       LEFT JOIN tbl_ffats ff ON ff.id = sr.ffat_id
       LEFT JOIN tbl_fats f ON f.id = sr.fat_id
       LEFT JOIN tbl_olts o ON o.id = sr.olt_id
       LEFT JOIN tbl_kafos k ON k.id = sr.kaf_id
       ${whereSql}
       ORDER BY t.id DESC`,
    )
    .all(...params);

  res.json({ tickets: rows });
});

app.post(
  '/api/tickets',
  requireAuth,
  requirePermission('can_create_tickets'),
  (req: AuthenticatedRequest, res) => {
    const customerName =
      typeof req.body?.customer_name === 'string' ? req.body.customer_name.trim() : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const type = req.body?.type;
    const assignedRaw = req.body?.assigned_installer;

    if (!customerName || customerName.length > 150) {
      res.status(400).json({ error: 'نام مشترک الزامی است.' });
      return;
    }
    if (!address || address.length > 1000) {
      res.status(400).json({ error: 'آدرس محل سرویس الزامی است.' });
      return;
    }
    if (type !== 'install' && type !== 'fault') {
      res.status(400).json({ error: 'نوع تیکت باید نصب یا خرابی باشد.' });
      return;
    }

    const db = getDb();
    let assignedInstaller: number | null = null;
    let status: 'pending' | 'assigned' = 'pending';

    if (assignedRaw !== null && assignedRaw !== undefined && assignedRaw !== '') {
      if (!userHasPermission(req.authUser!, 'can_assign_tickets')) {
        res.status(403).json({ error: 'مجوز ارجاع تیکت به نصاب را ندارید.' });
        return;
      }
      const instId = Number(assignedRaw);
      const installerRow = db
        .prepare('SELECT id FROM tbl_users WHERE id = ? AND is_active = 1')
        .get(instId) as { id: number } | undefined;
      if (!installerRow) {
        res.status(400).json({ error: 'نصاب انتخاب‌شده معتبر نیست.' });
        return;
      }
      assignedInstaller = instId;
      status = 'assigned';
    }

    const info = db
      .prepare(
        'INSERT INTO tbl_tickets (customer_name, address, type, status, assigned_installer) VALUES (?, ?, ?, ?, ?)',
      )
      .run(customerName, address, type, status, assignedInstaller);

    const created = db
      .prepare(
        `SELECT t.*, u.first_name || ' ' || u.last_name as installer_name
         FROM tbl_tickets t
         LEFT JOIN tbl_users u ON u.id = t.assigned_installer
         WHERE t.id = ?`,
      )
      .get(Number(info.lastInsertRowid));

    res.status(201).json({ ticket: created });
  },
);

app.patch(
  '/api/tickets/:id/assign',
  requireAuth,
  requirePermission('can_assign_tickets'),
  (req: AuthenticatedRequest, res) => {
    const ticketId = Number(req.params.id);
    const installerId = Number(req.body?.assigned_installer);
    if (!Number.isInteger(ticketId) || ticketId <= 0 || !Number.isInteger(installerId)) {
      res.status(400).json({ error: 'شناسه تیکت یا نصاب نامعتبر است.' });
      return;
    }

    const db = getDb();
    const ticket = db.prepare('SELECT id, status FROM tbl_tickets WHERE id = ?').get(ticketId) as
      | { id: number; status: string }
      | undefined;
    if (!ticket) {
      res.status(404).json({ error: 'تیکت یافت نشد.' });
      return;
    }
    if (ticket.status === 'completed') {
      res.status(400).json({ error: 'تیکت تکمیل‌شده قابل ارجاع مجدد نیست.' });
      return;
    }

    const installer = db
      .prepare('SELECT id FROM tbl_users WHERE id = ? AND is_active = 1')
      .get(installerId) as { id: number } | undefined;
    if (!installer) {
      res.status(400).json({ error: 'نصاب انتخاب‌شده فعال نیست.' });
      return;
    }

    db.prepare('UPDATE tbl_tickets SET assigned_installer = ?, status = ? WHERE id = ?').run(
      installerId,
      'assigned',
      ticketId,
    );

    const updated = db
      .prepare(
        `SELECT t.*, u.first_name || ' ' || u.last_name as installer_name
         FROM tbl_tickets t
         LEFT JOIN tbl_users u ON u.id = t.assigned_installer
         WHERE t.id = ?`,
      )
      .get(ticketId);
    res.json({ ticket: updated });
  },
);

app.get('/api/tickets/:id/record', requireAuth, (req: AuthenticatedRequest, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ error: 'شناسه تیکت نامعتبر است.' });
    return;
  }

  const db = getDb();
  const record = db
    .prepare(
      `SELECT sr.*,
              t.customer_name, t.address, t.type as ticket_type, t.status as ticket_status,
              u.first_name || ' ' || u.last_name as installer_name,
              k.name as kaf_name,
              o.name as olt_name,
              f.fat_number,
              ff.ffat_code,
              so.spool_code as out_spool_code,
              si.spool_code as in_spool_code
       FROM tbl_service_records sr
       JOIN tbl_tickets t ON t.id = sr.ticket_id
       JOIN tbl_users u ON u.id = sr.installer_id
       JOIN tbl_kafos k ON k.id = sr.kaf_id
       JOIN tbl_olts o ON o.id = sr.olt_id
       JOIN tbl_fats f ON f.id = sr.fat_id
       JOIN tbl_ffats ff ON ff.id = sr.ffat_id
       LEFT JOIN tbl_spools so ON so.id = sr.out_spool_id
       LEFT JOIN tbl_spools si ON si.id = sr.in_spool_id
       WHERE sr.ticket_id = ?`,
    )
    .get(ticketId) as Record<string, unknown> | undefined;

  if (!record) {
    res.status(404).json({ error: 'سابقه اجرایی برای این تیکت ثبت نشده است.' });
    return;
  }

  const user = req.authUser!;
  if (
    !userHasPermission(user, 'can_view_all_tickets') &&
    Number(record.installer_id) !== user.id
  ) {
    res.status(403).json({ error: 'دسترسی به این پرونده مجاز نیست.' });
    return;
  }

  const images = db
    .prepare('SELECT id, image_type, file_path FROM tbl_images WHERE record_id = ?')
    .all(Number(record.id));

  res.json({
    record: {
      ...record,
      price_snapshot: JSON.parse(String(record.price_snapshot || '{}')),
      images,
    },
  });
});

// Upload compressed evidence image to /uploads/YYYY/MM/<TicketID>/
app.post(
  '/api/upload',
  requireAuth,
  requirePermission('can_execute_service', 'can_create_tickets'),
  upload.single('image'),
  (req: AuthenticatedRequest, res) => {
    const ticketIdRaw = String(req.body?.ticket_id || '').trim();
    const imageType = String(req.body?.image_type || 'evidence').trim().slice(0, 50);

    if (!/^\d{1,10}$/.test(ticketIdRaw)) {
      res.status(400).json({ error: 'شناسه تیکت برای بارگذاری تصویر نامعتبر است.' });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: 'فایل تصویری ارسال نشده است.' });
      return;
    }

    const detectedExt = isValidImageBuffer(file.buffer);
    if (!detectedExt) {
      res.status(400).json({ error: 'فرمت فایل تصویری معتبر نیست (فقط JPEG/PNG/WEBP).' });
      return;
    }

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${detectedExt}`;

    const targetDir = path.resolve(UPLOADS_BASE_DIR, yyyy, mm, ticketIdRaw);
    if (!targetDir.startsWith(UPLOADS_BASE_DIR + path.sep)) {
      res.status(400).json({ error: 'مسیر ذخیره فایل نامعتبر است.' });
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const fullFilePath = path.resolve(targetDir, filename);
    if (!fullFilePath.startsWith(UPLOADS_BASE_DIR + path.sep)) {
      res.status(400).json({ error: 'مسیر نهایی فایل نامعتبر است.' });
      return;
    }

    fs.writeFileSync(fullFilePath, file.buffer);
    const publicPath = `/uploads/${yyyy}/${mm}/${ticketIdRaw}/${filename}`;
    res.status(201).json({
      file_path: publicPath,
      image_type: imageType,
      size_bytes: file.buffer.length,
    });
  },
);

// Submit complex Installation / Fault service form (Server-side calculation + Atomic Spool deduction)
app.post(
  '/api/service-records',
  requireAuth,
  requirePermission('can_execute_service'),
  (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const db = getDb();

    const ticketId = Number(req.body?.ticket_id);
    const kafId = Number(req.body?.kaf_id);
    const oltId = Number(req.body?.olt_id);
    const fatId = Number(req.body?.fat_id);
    const ffatId = Number(req.body?.ffat_id);
    const modemBrandId = Number(req.body?.modem_brand_id);
    const modemSerial =
      typeof req.body?.modem_serial === 'string' ? req.body.modem_serial.trim() : '';

    const outSpoolId = req.body?.out_spool_id ? Number(req.body.out_spool_id) : null;
    const outMeter = Math.max(0, Math.round(Number(req.body?.out_total_meter) || 0));
    const inSpoolId = req.body?.in_spool_id ? Number(req.body.in_spool_id) : null;
    const inMeter = Math.max(0, Math.round(Number(req.body?.in_total_meter) || 0));
    const serviceDateJalali =
      typeof req.body?.service_date_jalali === 'string'
        ? req.body.service_date_jalali.trim().slice(0, 20)
        : null;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : null;

    const imagesInput = Array.isArray(req.body?.images) ? req.body.images : [];

    if (
      !Number.isInteger(ticketId) ||
      !Number.isInteger(kafId) ||
      !Number.isInteger(oltId) ||
      !Number.isInteger(fatId) ||
      !Number.isInteger(ffatId)
    ) {
      res.status(400).json({ error: 'انتخاب کامل زنجیره تجهیزات (KAF / OLT / FAT / F-FAT) الزامی است.' });
      return;
    }

    const ticket = db
      .prepare('SELECT id, type, status, assigned_installer FROM tbl_tickets WHERE id = ?')
      .get(ticketId) as
      | { id: number; type: 'install' | 'fault'; status: string; assigned_installer: number | null }
      | undefined;

    if (!ticket) {
      res.status(404).json({ error: 'تیکت مورد نظر یافت نشد.' });
      return;
    }
    if (ticket.status === 'completed') {
      res.status(400).json({ error: 'این تیکت قبلاً تکمیل شده است.' });
      return;
    }
    if (
      !userHasPermission(user, 'can_view_all_tickets') &&
      ticket.assigned_installer !== user.id
    ) {
      res.status(403).json({ error: 'این تیکت به شما ارجاع داده نشده است.' });
      return;
    }

    const effectiveInstallerId = ticket.assigned_installer ?? user.id;

    // Validate relational hardware chain
    const chainValid = db
      .prepare(
        `SELECT ff.id
         FROM tbl_ffats ff
         JOIN tbl_fats f ON f.id = ff.fat_id
         JOIN tbl_olts o ON o.id = f.olt_id
         JOIN tbl_kafos k ON k.id = o.kaf_id
         WHERE ff.id = ? AND f.id = ? AND o.id = ? AND k.id = ?`,
      )
      .get(ffatId, fatId, oltId, kafId);
    if (!chainValid) {
      res.status(400).json({ error: 'ارتباط سلسله‌مراتب تجهیزات انتخابی معتبر نیست.' });
      return;
    }

    // Validate Modem Brand & Regex on Server
    const brand = db
      .prepare('SELECT id, name, serial_pattern, serial_prefix FROM tbl_modem_brands WHERE id = ?')
      .get(modemBrandId) as
      | { id: number; name: string; serial_pattern: string; serial_prefix: string }
      | undefined;
    if (!brand) {
      res.status(400).json({ error: 'برند مودم انتخاب نشده است.' });
      return;
    }
    const serialCheck = validateModemSerial(modemSerial, brand);
    if (!serialCheck.valid) {
      res.status(400).json({ error: serialCheck.reason || 'سریال مودم نامعتبر است.' });
      return;
    }

    // Validate uploaded image paths stay strictly within /uploads/
    const cleanImages: Array<{ image_type: string; file_path: string }> = [];
    for (const img of imagesInput) {
      if (
        img &&
        typeof img.file_path === 'string' &&
        typeof img.image_type === 'string' &&
        img.file_path.startsWith('/uploads/')
      ) {
        const diskPath = path.resolve(process.cwd(), img.file_path.slice(1));
        if (diskPath.startsWith(UPLOADS_BASE_DIR + path.sep) && fs.existsSync(diskPath)) {
          cleanImages.push({
            image_type: img.image_type.trim().slice(0, 50) || 'evidence',
            file_path: img.file_path,
          });
        }
      }
    }

    const canCrossUse = userHasPermission(user, 'can_cross_use_cables');

    db.exec('BEGIN IMMEDIATE;');
    try {
      let outSpool: SpoolRecord | undefined;
      if (outMeter > 0) {
        if (!outSpoolId) {
          throw new Error('برای متراژ کابل بیرونی، انتخاب قرقره الزامی است.');
        }
        outSpool = db
          .prepare('SELECT * FROM tbl_spools WHERE id = ?')
          .get(outSpoolId) as SpoolRecord | undefined;
        const vOut = validateSpoolConsumption(
          outSpool,
          'outdoor',
          outMeter,
          effectiveInstallerId,
          canCrossUse,
        );
        if (!vOut.ok) throw new Error(vOut.error);
      }

      let inSpool: SpoolRecord | undefined;
      if (inMeter > 0) {
        if (!inSpoolId) {
          throw new Error('برای متراژ کابل داخلی، انتخاب قرقره الزامی است.');
        }
        inSpool = db
          .prepare('SELECT * FROM tbl_spools WHERE id = ?')
          .get(inSpoolId) as SpoolRecord | undefined;
        const vIn = validateSpoolConsumption(
          inSpool,
          'indoor',
          inMeter,
          effectiveInstallerId,
          canCrossUse,
        );
        if (!vIn.ok) throw new Error(vIn.error);
      }

      // Deduct meters atomically
      if (outMeter > 0 && outSpoolId) {
        const upd = db
          .prepare(
            'UPDATE tbl_spools SET current_length = current_length - ? WHERE id = ? AND current_length >= ?',
          )
          .run(outMeter, outSpoolId, outMeter);
        if (upd.changes !== 1) {
          throw new Error('موجودی قرقره بیرونی تغییر کرده و کافی نیست.');
        }
      }
      if (inMeter > 0 && inSpoolId) {
        const upd = db
          .prepare(
            'UPDATE tbl_spools SET current_length = current_length - ? WHERE id = ? AND current_length >= ?',
          )
          .run(inMeter, inSpoolId, inMeter);
        if (upd.changes !== 1) {
          throw new Error('موجودی قرقره داخلی تغییر کرده و کافی نیست.');
        }
      }

      // Lookup installer tariff on server (never trust client pricing!)
      let tariff = db
        .prepare('SELECT * FROM tbl_tariffs WHERE installer_id = ?')
        .get(effectiveInstallerId) as TariffRule | undefined;

      if (!tariff) {
        // Default safe baseline tariff if none configured yet for newly added installer
        tariff = {
          id: 0,
          installer_id: effectiveInstallerId,
          calc_type: 'fixed',
          base_price: 500000,
          meter_limit: 0,
          extra_meter_price: 0,
        };
      }

      const priorCountRow = db
        .prepare('SELECT COUNT(*) as cnt FROM tbl_service_records WHERE installer_id = ?')
        .get(effectiveInstallerId) as { cnt: number };
      const completedCountAfterThis = (priorCountRow.cnt || 0) + 1;

      const snapshot = calculateTariffSnapshot(
        tariff,
        outMeter,
        inMeter,
        ticket.type,
        completedCountAfterThis,
      );

      const recRes = db
        .prepare(
          `INSERT INTO tbl_service_records
           (ticket_id, installer_id, kaf_id, olt_id, fat_id, ffat_id, out_spool_id, out_total_meter, in_spool_id, in_total_meter, modem_serial, price_snapshot, service_date_jalali, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ticketId,
          effectiveInstallerId,
          kafId,
          oltId,
          fatId,
          ffatId,
          outMeter > 0 ? outSpoolId : null,
          outMeter,
          inMeter > 0 ? inSpoolId : null,
          inMeter,
          modemSerial,
          JSON.stringify(snapshot),
          serviceDateJalali,
          notes,
        );

      const recordId = Number(recRes.lastInsertRowid);

      const imgStmt = db.prepare(
        'INSERT INTO tbl_images (record_id, image_type, file_path) VALUES (?, ?, ?)',
      );
      for (const img of cleanImages) {
        imgStmt.run(recordId, img.image_type, img.file_path);
      }

      // Double-entry ledger credit
      db.prepare(
        'INSERT INTO tbl_ledger (user_id, record_id, amount, type, description) VALUES (?, ?, ?, ?, ?)',
      ).run(
        effectiveInstallerId,
        recordId,
        snapshot.total_earned,
        'credit',
        `دستمزد سرویس تیکت #${ticketId} (${snapshot.total_meter} متر کابل)`,
      );

      db.prepare('UPDATE tbl_tickets SET status = ? WHERE id = ?').run('completed', ticketId);

      db.exec('COMMIT;');
      res.status(201).json({
        record_id: recordId,
        price_snapshot: snapshot,
      });
    } catch (err) {
      db.exec('ROLLBACK;');
      res.status(400).json({
        error: err instanceof Error ? err.message : 'خطا در ثبت عملیات سرویس.',
      });
    }
  },
);

// ==========================================
// 4. HARDWARE TOPOLOGY & MODEM BRANDS
// ==========================================

app.get('/api/hardware', requireAuth, (_req, res) => {
  const db = getDb();
  const kafs = db.prepare('SELECT * FROM tbl_kafos ORDER BY id ASC').all();
  const olts = db
    .prepare(
      `SELECT o.*, k.name as kaf_name
       FROM tbl_olts o JOIN tbl_kafos k ON k.id = o.kaf_id
       ORDER BY o.id ASC`,
    )
    .all();
  const fats = db
    .prepare(
      `SELECT f.*, o.name as olt_name, o.kaf_id
       FROM tbl_fats f JOIN tbl_olts o ON o.id = f.olt_id
       ORDER BY f.fat_number ASC`,
    )
    .all();
  const ffats = db
    .prepare(
      `SELECT ff.*, f.fat_number, f.olt_id
       FROM tbl_ffats ff JOIN tbl_fats f ON f.id = ff.fat_id
       ORDER BY ff.id DESC`,
    )
    .all();
  const modemBrands = db.prepare('SELECT * FROM tbl_modem_brands ORDER BY id ASC').all();

  res.json({ kafs, olts, fats, ffats, modemBrands });
});

app.post(
  '/api/hardware/kafs',
  requireAuth,
  requirePermission('can_manage_hardware'),
  (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 150) {
      res.status(400).json({ error: 'نام کافو الزامی است.' });
      return;
    }
    try {
      const info = getDb().prepare('INSERT INTO tbl_kafos (name) VALUES (?)').run(name);
      res.status(201).json({ id: Number(info.lastInsertRowid), name });
    } catch {
      res.status(400).json({ error: 'این نام کافو قبلاً ثبت شده است.' });
    }
  },
);

app.post(
  '/api/hardware/olts',
  requireAuth,
  requirePermission('can_manage_hardware'),
  (req, res) => {
    const kafId = Number(req.body?.kaf_id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!Number.isInteger(kafId) || !name || name.length > 150) {
      res.status(400).json({ error: 'کافو و نام OLT الزامی است.' });
      return;
    }
    const info = getDb()
      .prepare('INSERT INTO tbl_olts (kaf_id, name) VALUES (?, ?)')
      .run(kafId, name);
    res.status(201).json({ id: Number(info.lastInsertRowid), kaf_id: kafId, name });
  },
);

app.post(
  '/api/hardware/fats',
  requireAuth,
  requirePermission('can_add_fat', 'can_manage_hardware'),
  (req, res) => {
    const oltId = Number(req.body?.olt_id);
    const fatNumber = Number(req.body?.fat_number);
    if (!Number.isInteger(oltId) || !Number.isInteger(fatNumber) || fatNumber <= 0) {
      res.status(400).json({ error: 'OLT و شماره صحیح FAT الزامی است.' });
      return;
    }
    const info = getDb()
      .prepare('INSERT INTO tbl_fats (olt_id, fat_number) VALUES (?, ?)')
      .run(oltId, fatNumber);
    res.status(201).json({ id: Number(info.lastInsertRowid), olt_id: oltId, fat_number: fatNumber });
  },
);

app.post(
  '/api/hardware/ffats',
  requireAuth,
  requirePermission('can_add_fat', 'can_manage_hardware'),
  (req, res) => {
    const fatId = Number(req.body?.fat_id);
    const suffix = typeof req.body?.suffix === 'string' ? req.body.suffix : '';
    const db = getDb();
    const fat = db.prepare('SELECT id, fat_number FROM tbl_fats WHERE id = ?').get(fatId) as
      | { id: number; fat_number: number }
      | undefined;
    if (!fat) {
      res.status(404).json({ error: 'FAT والد یافت نشد.' });
      return;
    }
    try {
      const ffatCode = generateFFatCode(fat.fat_number, suffix);
      const info = db
        .prepare('INSERT INTO tbl_ffats (fat_id, ffat_code) VALUES (?, ?)')
        .run(fatId, ffatCode);
      res.status(201).json({
        id: Number(info.lastInsertRowid),
        fat_id: fatId,
        ffat_code: ffatCode,
        fat_number: fat.fat_number,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'خطا در تولید کد F-FAT' });
    }
  },
);

app.post(
  '/api/hardware/modem-brands',
  requireAuth,
  requirePermission('can_manage_hardware'),
  (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const serialPattern =
      typeof req.body?.serial_pattern === 'string' ? req.body.serial_pattern.trim() : '';
    const serialPrefix =
      typeof req.body?.serial_prefix === 'string' ? req.body.serial_prefix.trim() : '';

    if (!name || !serialPattern) {
      res.status(400).json({ error: 'نام برند و الگوی Regex سریال الزامی است.' });
      return;
    }
    try {
      new RegExp(serialPattern);
    } catch {
      res.status(400).json({ error: 'عبارت منظم (Regex) وارد شده معتبر نیست.' });
      return;
    }
    const info = getDb()
      .prepare('INSERT INTO tbl_modem_brands (name, serial_pattern, serial_prefix) VALUES (?, ?, ?)')
      .run(name, serialPattern, serialPrefix);
    res.status(201).json({
      id: Number(info.lastInsertRowid),
      name,
      serial_pattern: serialPattern,
      serial_prefix: serialPrefix,
    });
  },
);

// ==========================================
// 5. INVENTORY & SPOOLS (VAN STOCK)
// ==========================================

app.get('/api/spools', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const db = getDb();
  const canSeeAll =
    userHasPermission(user, 'can_manage_inventory') ||
    userHasPermission(user, 'can_cross_use_cables') ||
    userHasPermission(user, 'can_view_all_tickets');

  const rows = db
    .prepare(
      `SELECT s.*, u.first_name || ' ' || u.last_name as installer_name
       FROM tbl_spools s
       LEFT JOIN tbl_users u ON u.id = s.assigned_installer_id
       ${canSeeAll ? '' : 'WHERE s.assigned_installer_id = ?'}
       ORDER BY s.id DESC`,
    )
    .all(...(canSeeAll ? [] : [user.id]));

  res.json({ spools: rows });
});

app.post(
  '/api/spools',
  requireAuth,
  requirePermission('can_manage_inventory'),
  (req, res) => {
    const spoolCode =
      typeof req.body?.spool_code === 'string' ? req.body.spool_code.trim().toUpperCase() : '';
    const cableType = req.body?.cable_type;
    const initialLength = Math.round(Number(req.body?.initial_length) || 0);
    const assignedInstallerId = req.body?.assigned_installer_id
      ? Number(req.body.assigned_installer_id)
      : null;

    if (!spoolCode || spoolCode.length > 100) {
      res.status(400).json({ error: 'کد قرقره الزامی است.' });
      return;
    }
    if (cableType !== 'indoor' && cableType !== 'outdoor') {
      res.status(400).json({ error: 'نوع کابل باید داخلی (indoor) یا بیرونی (outdoor) باشد.' });
      return;
    }
    if (initialLength <= 0 || initialLength > 50000) {
      res.status(400).json({ error: 'متراژ اولیه قرقره نامعتبر است.' });
      return;
    }

    try {
      const info = getDb()
        .prepare(
          'INSERT INTO tbl_spools (spool_code, cable_type, initial_length, current_length, assigned_installer_id) VALUES (?, ?, ?, ?, ?)',
        )
        .run(spoolCode, cableType, initialLength, initialLength, assignedInstallerId);
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch {
      res.status(400).json({ error: 'کد قرقره تکراری است.' });
    }
  },
);

app.patch(
  '/api/spools/:id/transfer',
  requireAuth,
  requirePermission('can_manage_inventory'),
  (req, res) => {
    const spoolId = Number(req.params.id);
    const assignedId =
      req.body?.assigned_installer_id === null || req.body?.assigned_installer_id === ''
        ? null
        : Number(req.body?.assigned_installer_id);

    const db = getDb();
    if (assignedId !== null) {
      const u = db.prepare('SELECT id FROM tbl_users WHERE id = ? AND is_active = 1').get(assignedId);
      if (!u) {
        res.status(400).json({ error: 'نصاب مقصد معتبر نیست.' });
        return;
      }
    }
    const upd = db
      .prepare('UPDATE tbl_spools SET assigned_installer_id = ? WHERE id = ?')
      .run(assignedId, spoolId);
    if (upd.changes === 0) {
      res.status(404).json({ error: 'قرقره یافت نشد.' });
      return;
    }
    res.json({ ok: true });
  },
);

// ==========================================
// 6. FINANCIALS, TARIFFS & DOUBLE-ENTRY LEDGER
// ==========================================

app.get(
  '/api/financial',
  requireAuth,
  requirePermission('can_view_financials', 'can_manage_tariffs'),
  (_req, res) => {
    const db = getDb();
    const tariffs = db
      .prepare(
        `SELECT tf.*, u.first_name || ' ' || u.last_name as installer_name, u.username
         FROM tbl_tariffs tf
         JOIN tbl_users u ON u.id = tf.installer_id
         ORDER BY tf.id ASC`,
      )
      .all();

    const ledger = db
      .prepare(
        `SELECT l.*, u.first_name || ' ' || u.last_name as user_name, sr.ticket_id
         FROM tbl_ledger l
         JOIN tbl_users u ON u.id = l.user_id
         LEFT JOIN tbl_service_records sr ON sr.id = l.record_id
         ORDER BY l.id DESC
         LIMIT 100`,
      )
      .all();

    const users = db
      .prepare(
        `SELECT u.id, u.first_name || ' ' || u.last_name as full_name, r.role_name
         FROM tbl_users u JOIN tbl_roles r ON r.id = u.role_id
         WHERE u.is_active = 1`,
      )
      .all() as Array<{ id: number; full_name: string; role_name: string }>;

    const allEntries = db
      .prepare('SELECT user_id, amount, type FROM tbl_ledger')
      .all() as Array<{ user_id: number; amount: number; type: 'credit' | 'debit' }>;

    const balances = users.map((u) => {
      const userEntries = allEntries.filter((e) => e.user_id === u.id);
      const summary = computeLedgerBalance(userEntries);
      return {
        user_id: u.id,
        full_name: u.full_name,
        role_name: u.role_name,
        ...summary,
      };
    });

    res.json({ tariffs, ledger, balances });
  },
);

app.post(
  '/api/financial/tariffs',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  (req, res) => {
    const installerId = Number(req.body?.installer_id);
    const calcType = req.body?.calc_type;
    const basePrice = Math.max(0, Number(req.body?.base_price) || 0);
    const meterLimit = Math.max(0, Math.round(Number(req.body?.meter_limit) || 0));
    const extraMeterPrice = Math.max(0, Number(req.body?.extra_meter_price) || 0);
    const bonusTargetCount = Math.max(0, Math.round(Number(req.body?.bonus_target_count) || 0));
    const bonusAmount = Math.max(0, Number(req.body?.bonus_amount) || 0);

    if (!Number.isInteger(installerId) || !['fixed', 'per_meter', 'hybrid'].includes(calcType)) {
      res.status(400).json({ error: 'مشخصات تعرفه نامعتبر است.' });
      return;
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO tbl_tariffs (installer_id, calc_type, base_price, meter_limit, extra_meter_price, bonus_target_count, bonus_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(installer_id) DO UPDATE SET
         calc_type = excluded.calc_type,
         base_price = excluded.base_price,
         meter_limit = excluded.meter_limit,
         extra_meter_price = excluded.extra_meter_price,
         bonus_target_count = excluded.bonus_target_count,
         bonus_amount = excluded.bonus_amount`,
    ).run(installerId, calcType, basePrice, meterLimit, extraMeterPrice, bonusTargetCount, bonusAmount);

    res.json({ ok: true });
  },
);

app.post(
  '/api/financial/payout',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  (req, res) => {
    const userId = Number(req.body?.user_id);
    const amount = Number(req.body?.amount);
    const description =
      typeof req.body?.description === 'string' && req.body.description.trim()
        ? req.body.description.trim().slice(0, 255)
        : 'پرداخت تسویه حساب به پیمانکار';

    if (!Number.isInteger(userId) || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'مبلغ پرداختی و کاربر دریافت‌کننده باید معتبر باشد.' });
      return;
    }

    const db = getDb();
    const u = db.prepare('SELECT id FROM tbl_users WHERE id = ?').get(userId);
    if (!u) {
      res.status(404).json({ error: 'کاربر یافت نشد.' });
      return;
    }

    db.prepare(
      'INSERT INTO tbl_ledger (user_id, record_id, amount, type, description) VALUES (?, NULL, ?, ?, ?)',
    ).run(userId, amount, 'debit', description);

    res.status(201).json({ ok: true });
  },
);

// ==========================================
// 7. USERS & CUSTOM RBAC
// ==========================================

app.get(
  '/api/users/installers',
  requireAuth,
  requirePermission(
    'can_assign_tickets',
    'can_manage_inventory',
    'can_manage_tariffs',
    'can_manage_users',
    'can_view_all_tickets',
  ),
  (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT u.id, u.username, u.first_name, u.last_name, r.role_name
         FROM tbl_users u
         JOIN tbl_roles r ON r.id = u.role_id
         WHERE u.is_active = 1
         ORDER BY u.id ASC`,
      )
      .all();
    res.json({ users: rows });
  },
);

app.get(
  '/api/rbac',
  requireAuth,
  requirePermission('can_manage_users'),
  (_req, res) => {
    const db = getDb();
    const permissions = db.prepare('SELECT * FROM tbl_permissions ORDER BY id ASC').all();
    const roles = db.prepare('SELECT * FROM tbl_roles ORDER BY id ASC').all() as Array<{
      id: number;
      role_name: string;
    }>;
    const rolePerms = db.prepare('SELECT role_id, perm_id FROM tbl_role_perms').all() as Array<{
      role_id: number;
      perm_id: number;
    }>;

    const rolesWithPerms = roles.map((r) => ({
      ...r,
      perm_ids: rolePerms.filter((rp) => rp.role_id === r.id).map((rp) => rp.perm_id),
    }));

    const users = db
      .prepare(
        `SELECT u.id, u.username, u.first_name, u.last_name, u.role_id, u.is_active, u.last_login,
                r.role_name,
                CASE WHEN length(u.password_hash) > 0 THEN 1 ELSE 0 END as has_password
         FROM tbl_users u
         JOIN tbl_roles r ON r.id = u.role_id
         ORDER BY u.id ASC`,
      )
      .all();

    res.json({
      permissions,
      roles: rolesWithPerms,
      users,
      timeoutMinutes: getSessionTimeoutMinutes(),
    });
  },
);

// Only SuperAdmin can create/modify custom roles and permission matrices
app.post('/api/rbac/roles', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!req.authUser!.isSuperAdmin) {
    res.status(403).json({ error: 'تنها مدیر کل (SuperAdmin) مجاز به ایجاد نقش جدید است.' });
    return;
  }
  const roleName = typeof req.body?.role_name === 'string' ? req.body.role_name.trim() : '';
  const permIds = Array.isArray(req.body?.perm_ids)
    ? req.body.perm_ids.map(Number).filter(Number.isInteger)
    : [];

  if (!roleName || roleName.length > 100) {
    res.status(400).json({ error: 'نام نقش الزامی است.' });
    return;
  }

  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const info = db.prepare('INSERT INTO tbl_roles (role_name) VALUES (?)').run(roleName);
    const roleId = Number(info.lastInsertRowid);
    const ins = db.prepare('INSERT OR IGNORE INTO tbl_role_perms (role_id, perm_id) VALUES (?, ?)');
    for (const pid of permIds) {
      ins.run(roleId, pid);
    }
    db.exec('COMMIT;');
    res.status(201).json({ id: roleId, role_name: roleName, perm_ids: permIds });
  } catch {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: 'نام نقش تکراری است.' });
  }
});

app.put('/api/rbac/roles/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!req.authUser!.isSuperAdmin) {
    res.status(403).json({ error: 'تنها مدیر کل (SuperAdmin) مجاز به ویرایش دسترسی نقش‌هاست.' });
    return;
  }
  const roleId = Number(req.params.id);
  const permIds = Array.isArray(req.body?.perm_ids)
    ? req.body.perm_ids.map(Number).filter(Number.isInteger)
    : [];

  const db = getDb();
  const role = db.prepare('SELECT id, role_name FROM tbl_roles WHERE id = ?').get(roleId) as
    | { id: number; role_name: string }
    | undefined;
  if (!role) {
    res.status(404).json({ error: 'نقش یافت نشد.' });
    return;
  }
  if (role.role_name === 'SuperAdmin') {
    res.status(400).json({ error: 'دسترسی‌های مدیر کل همیشه کامل است و قابل محدود کردن نیست.' });
    return;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare('DELETE FROM tbl_role_perms WHERE role_id = ?').run(roleId);
    const ins = db.prepare('INSERT OR IGNORE INTO tbl_role_perms (role_id, perm_id) VALUES (?, ?)');
    for (const pid of permIds) {
      ins.run(roleId, pid);
    }
    db.exec('COMMIT;');
    res.json({ ok: true });
  } catch {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: 'خطا در به‌روزرسانی دسترسی‌ها.' });
  }
});

app.post(
  '/api/rbac/users',
  requireAuth,
  requirePermission('can_manage_users'),
  (req: AuthenticatedRequest, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const firstName = typeof req.body?.first_name === 'string' ? req.body.first_name.trim() : '';
    const lastName = typeof req.body?.last_name === 'string' ? req.body.last_name.trim() : '';
    const roleId = Number(req.body?.role_id);

    if (!username || !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
      res.status(400).json({ error: 'نام کاربری باید بین ۳ تا ۵۰ کاراکتر انگلیسی/عدد باشد.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      return;
    }
    if (!firstName || !lastName || !Number.isInteger(roleId)) {
      res.status(400).json({ error: 'نام، نام خانوادگی و نقش الزامی است.' });
      return;
    }

    const db = getDb();
    const role = db.prepare('SELECT id, role_name FROM tbl_roles WHERE id = ?').get(roleId) as
      | { id: number; role_name: string }
      | undefined;
    if (!role) {
      res.status(400).json({ error: 'نقش انتخابی یافت نشد.' });
      return;
    }
    if (role.role_name === 'SuperAdmin' && !req.authUser!.isSuperAdmin) {
      res.status(403).json({ error: 'فقط مدیر کل می‌تواند کاربر SuperAdmin ایجاد کند.' });
      return;
    }

    try {
      const info = db
        .prepare(
          'INSERT INTO tbl_users (username, password_hash, first_name, last_name, role_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        )
        .run(username, hashPassword(password), firstName, lastName, roleId);
      res.status(201).json({ id: Number(info.lastInsertRowid) });
    } catch {
      res.status(400).json({ error: 'این نام کاربری قبلاً ثبت شده است.' });
    }
  },
);

app.patch(
  '/api/rbac/users/:id',
  requireAuth,
  requirePermission('can_manage_users'),
  (req: AuthenticatedRequest, res) => {
    const userId = Number(req.params.id);
    const db = getDb();
    const existing = db
      .prepare('SELECT id, username, role_id, is_active FROM tbl_users WHERE id = ?')
      .get(userId) as { id: number; username: string; role_id: number; is_active: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'کاربر یافت نشد.' });
      return;
    }

    const roleId = req.body?.role_id !== undefined ? Number(req.body.role_id) : existing.role_id;
    const isActive =
      req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
    const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (existing.username === 'admin' && isActive === 0) {
      res.status(400).json({ error: 'حساب مدیر کل اصلی را نمی‌توان غیرفعال کرد.' });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
        return;
      }
      db.prepare('UPDATE tbl_users SET role_id = ?, is_active = ?, password_hash = ? WHERE id = ?').run(
        roleId,
        isActive,
        hashPassword(newPassword),
        userId,
      );
    } else {
      db.prepare('UPDATE tbl_users SET role_id = ?, is_active = ? WHERE id = ?').run(
        roleId,
        isActive,
        userId,
      );
    }

    res.json({ ok: true });
  },
);

app.patch('/api/rbac/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!req.authUser!.isSuperAdmin) {
    res.status(403).json({ error: 'تنظیمات امنیتی فقط توسط مدیر کل قابل تغییر است.' });
    return;
  }
  const minutes = Math.round(Number(req.body?.session_timeout_minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    res.status(400).json({ error: 'زمان خروج خودکار باید بین ۱ تا ۱۴۴۰ دقیقه باشد.' });
    return;
  }
  getDb()
    .prepare(
      'INSERT INTO tbl_settings (key_name, value) VALUES (?, ?) ON CONFLICT(key_name) DO UPDATE SET value = excluded.value',
    )
    .run('session_timeout_minutes', String(minutes));
  res.json({ timeoutMinutes: minutes });
});

// ==========================================
// 8. VITE DEV / STATIC PRODUCTION SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fiber ERP local server running on http://localhost:${PORT}`);
  });
}

startServer();
