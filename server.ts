import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  tblActivityLogs,
  tblCustomerPackages,
  tblFats,
  tblFfats,
  tblImages,
  tblInventoryItems,
  tblKafos,
  tblLedger,
  tblModemBrands,
  tblOlts,
  tblPermissions,
  tblPromotions,
  tblRegions,
  tblRolePermissions,
  tblRoles,
  tblServiceImages,
  tblServiceRecords,
  tblServiceRecordsHistory,
  tblSettings,
  tblSpools,
  tblTariffTemplates,
  tblTicketComments,
  tblTickets,
  tblUserTariffs,
  tblUsers,
  tblVanStock,
  type CustomerPackageRules,
  type DynamicMaterialUsageItem,
  type SplitterChangesData,
  type TariffTemplateRulesJson,
  type TicketTypeKey,
} from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import {
  TICKET_TYPES,
  calculateCustomerInvoiceSnapshot,
  calculateTemplatePriceSnapshot,
  canUserDeleteComment,
  canUserEditComment,
  computeContractorSlaAveragesLast30Days,
  computeCurrentMonthSpoolConsumptionByContractor,
  computeLast30DaysCompletionByType,
  computeLedgerBalance,
  evaluatePromotionForTicket,
  findRecentCriticalSlaTransitions,
  generateFFatCode,
  getLowSpoolWarnings,
  getTicketTypeFieldVisibility,
  isWaitingInstallerStatus,
  validateDynamicMaterialRows,
  validateModemSerial,
  validatePortNumber,
  validatePublicRegistrationPayload,
  validateSplitterChanges,
  validateSpoolConsumption,
  validateUserProfileV3,
  validateVanModemConsumption,
  type AnyTicketTypeKey,
  type CompletedTicketEvent,
  type PromotionRule,
  type SpoolRecord,
  type TicketStatus,
  type VanStockRecord,
  type VanStockUnitRecord,
} from './src/lib/fiberLogic.ts';
import { gregorianToJalali } from './src/lib/jalali.ts';
import {
  hashLocalPassword,
  issueIntranetToken,
  requireAuth,
  requirePermission,
  userHasPermission,
  verifyLocalPassword,
  type AuthRequest,
  type AuthUserContext,
} from './src/middleware/auth.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Static local uploads
app.use('/uploads', express.static(UPLOADS_ROOT, { index: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function detectImageExtension(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function logActivity(params: {
  user?: AuthUserContext;
  actionType: string;
  entityType: string;
  entityId?: number | null;
  summary: string;
  details?: string | null;
}): Promise<void> {
  try {
    await db.insert(tblActivityLogs).values({
      user_id: params.user?.id ?? null,
      username: params.user?.username ?? 'system',
      user_full_name: params.user?.full_name ?? 'سامانه',
      action_type: params.actionType,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      summary: params.summary,
      details: params.details ?? null,
    });
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

function handleRouteError(res: Response, err: unknown, fallbackMsg = 'خطای سرور رخ داد.'): void {
  console.error(err);
  const pgCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  if (pgCode === '23505') {
    res.status(409).json({ error: 'مقدار تکراری است و قبلاً ثبت شده است.' });
    return;
  }
  if (pgCode === '23503') {
    res.status(400).json({ error: 'ارجاع انتخاب‌شده در پایگاه داده معتبر نیست.' });
    return;
  }
  if (err instanceof Error && err.message) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: fallbackMsg });
}

// ==========================================
// AUTHENTICATION & BOOTSTRAP ROUTES
// ==========================================

app.get('/api/auth/bootstrap-status', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const adminRows = await db
      .select({ id: tblUsers.id, password_hash: tblUsers.password_hash, full_name: tblUsers.full_name })
      .from(tblUsers)
      .where(eq(tblUsers.username, 'admin'))
      .limit(1);
    const admin = adminRows[0];
    const adminNeedsClaim = Boolean(admin && !admin.password_hash);
    res.json({ adminNeedsClaim });
  } catch (err) {
    handleRouteError(res, err, 'خطا در بررسی وضعیت اولیه سامانه');
  }
});

app.post('/api/auth/claim-admin', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const password = String(req.body?.password || '').trim();
    const fullName = String(req.body?.full_name || '').trim();
    if (password.length < 6) {
      res.status(400).json({ error: 'رمز عبور مدیر کل باید حداقل ۶ کاراکتر باشد.' });
      return;
    }

    const adminRows = await db
      .select({ id: tblUsers.id, username: tblUsers.username, password_hash: tblUsers.password_hash })
      .from(tblUsers)
      .where(eq(tblUsers.username, 'admin'))
      .limit(1);

    const admin = adminRows[0];
    if (!admin) {
      res.status(404).json({ error: 'کاربر مدیر کل یافت نشد.' });
      return;
    }
    if (admin.password_hash) {
      res.status(409).json({ error: 'رمز عبور مدیر کل قبلاً تنظیم شده است.' });
      return;
    }

    const hashed = hashLocalPassword(password);
    await db
      .update(tblUsers)
      .set({
        password_hash: hashed,
        ...(fullName ? { full_name: fullName } : {}),
      })
      .where(eq(tblUsers.id, admin.id));

    const token = issueIntranetToken(admin.id, admin.username);
    res.json({ token, username: admin.username });
  } catch (err) {
    handleRouteError(res, err, 'خطا در فعال‌سازی حساب مدیر کل');
  }
});

app.post('/api/auth/local-login', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است.' });
      return;
    }

    const rows = await db
      .select({
        id: tblUsers.id,
        username: tblUsers.username,
        password_hash: tblUsers.password_hash,
        is_active: tblUsers.is_active,
      })
      .from(tblUsers)
      .where(eq(tblUsers.username, username))
      .limit(1);

    const user = rows[0];
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است.' });
      return;
    }
    if (!user.password_hash) {
      res.status(401).json({
        error: 'برای این حساب رمز شبکه داخلی تعریف نشده است. از مدیر کل یا ورود گوگل استفاده کنید.',
      });
      return;
    }
    if (!verifyLocalPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است.' });
      return;
    }

    const token = issueIntranetToken(user.id, user.username);
    res.json({ token });
  } catch (err) {
    handleRouteError(res, err, 'خطا در ورود شبکه داخلی');
  }
});

app.get('/api/auth/session', async (req: AuthRequest, res: Response, next) => {
  try {
    await ensureSeeded();
    next();
  } catch (err) {
    handleRouteError(res, err, 'خطا در بارگذاری اولیه پایگاه داده');
  }
}, requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.authUser });
});

app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const authUser = req.authUser!;
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
      return;
    }

    const [userRow] = await db
      .select({ id: tblUsers.id, password_hash: tblUsers.password_hash, full_name: tblUsers.full_name })
      .from(tblUsers)
      .where(eq(tblUsers.id, authUser.id))
      .limit(1);

    if (!userRow) {
      res.status(404).json({ error: 'حساب کاربری یافت نشد.' });
      return;
    }
    if (userRow.password_hash) {
      if (!currentPassword || !verifyLocalPassword(currentPassword, userRow.password_hash)) {
        res.status(400).json({ error: 'رمز عبور فعلی نادرست است.' });
        return;
      }
    }

    const nextHash = hashLocalPassword(newPassword);
    await db
      .update(tblUsers)
      .set({ password_hash: nextHash })
      .where(eq(tblUsers.id, authUser.id));

    await logActivity({
      user: authUser,
      actionType: 'password_changed',
      entityType: 'user',
      entityId: authUser.id,
      summary: `تغییر رمز عبور توسط کاربر «${userRow.full_name}»`,
    });

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'خطا در تغییر رمز عبور');
  }
});

// ==========================================
// UPLOAD ROUTE (Local /uploads/YYYY/MM/<TicketID>/)
// ==========================================

app.post(
  '/api/upload',
  requireAuth,
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file;
      const ticketId = Number(req.body?.ticket_id);
      const imageType = String(req.body?.image_type || 'evidence').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!file) {
        res.status(400).json({ error: 'فایل تصویر ارسال نشده است.' });
        return;
      }
      if (!Number.isInteger(ticketId) || ticketId <= 0) {
        res.status(400).json({ error: 'شناسه تیکت نامعتبر است.' });
        return;
      }

      const ext = detectImageExtension(file.buffer);
      if (!ext) {
        res.status(400).json({ error: 'فرمت تصویر معتبر نیست (فقط JPG, PNG, WebP).' });
        return;
      }

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const targetDir = path.join(UPLOADS_ROOT, yyyy, mm, String(ticketId));
      fs.mkdirSync(targetDir, { recursive: true });

      const uniqueName = `${imageType || 'img'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const fullPath = path.join(targetDir, uniqueName);
      fs.writeFileSync(fullPath, file.buffer);

      const publicPath = `/uploads/${yyyy}/${mm}/${ticketId}/${uniqueName}`;
      res.status(201).json({
        file_path: publicPath,
        image_type: imageType || 'evidence',
        size_bytes: file.size,
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ذخیره فایل تصویر');
    }
  },
);

app.post(
  '/api/uploads/receipt',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'فایل تصویر رسید ارسال نشده است.' });
        return;
      }
      const ext = detectImageExtension(file.buffer);
      if (!ext) {
        res.status(400).json({ error: 'فرمت تصویر رسید معتبر نیست (فقط JPG, PNG, WebP).' });
        return;
      }

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const targetDir = path.join(UPLOADS_ROOT, 'receipts', yyyy, mm);
      fs.mkdirSync(targetDir, { recursive: true });

      const uniqueName = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const fullPath = path.join(targetDir, uniqueName);
      fs.writeFileSync(fullPath, file.buffer);

      res.status(201).json({
        file_path: `/uploads/receipts/${yyyy}/${mm}/${uniqueName}`,
        size_bytes: file.size,
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ذخیره تصویر رسید بانکی');
    }
  },
);

// ==========================================
// V3.0 PUBLIC CUSTOMER PORTAL & SETTINGS ROUTES
// ==========================================

async function loadSystemSettingsMap(): Promise<{ system_name: string; primary_color: string }> {
  const rows = await db.select().from(tblSettings);
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    system_name: map.get('system_name') || 'آوانتورک ERP فیبر نوری',
    primary_color: map.get('primary_color') || '#0f766e',
  };
}

app.get('/api/public/portal-config', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const settings = await loadSystemSettingsMap();
    const regions = await db
      .select({ id: tblRegions.id, name: tblRegions.name, is_active: tblRegions.is_active })
      .from(tblRegions)
      .where(eq(tblRegions.is_active, true))
      .orderBy(tblRegions.id);
    const packages = await db
      .select({
        id: tblCustomerPackages.id,
        name: tblCustomerPackages.name,
        rules_json: tblCustomerPackages.rules_json,
      })
      .from(tblCustomerPackages)
      .where(eq(tblCustomerPackages.is_active, true))
      .orderBy(tblCustomerPackages.id);
    res.json({ settings, regions, packages });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت تنظیمات پرتال مشتریان');
  }
});

app.post(
  '/api/public/upload-identity',
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const imageType = String(req.body?.image_type || 'document').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!file) {
        res.status(400).json({ error: 'فایل تصویر مدرک ارسال نشده است.' });
        return;
      }
      const ext = detectImageExtension(file.buffer);
      if (!ext) {
        res.status(400).json({ error: 'فرمت تصویر معتبر نیست (فقط JPG, PNG, WebP).' });
        return;
      }

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const targetDir = path.join(UPLOADS_ROOT, 'identity', yyyy, mm);
      fs.mkdirSync(targetDir, { recursive: true });

      const uniqueName = `${imageType || 'doc'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      fs.writeFileSync(path.join(targetDir, uniqueName), file.buffer);

      res.status(201).json({
        file_path: `/uploads/identity/${yyyy}/${mm}/${uniqueName}`,
        image_type: imageType || 'document',
        size_bytes: file.size,
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ذخیره فایل مدرک مشترک');
    }
  },
);

app.post('/api/public/requests', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const imagesInput = Array.isArray(req.body?.images)
      ? (req.body.images as Array<{ image_type: string; file_path: string; caption?: string }>)
      : [];
    const validImgs = imagesInput.filter(
      (im) => im.file_path && im.file_path.startsWith('/uploads/'),
    );

    const validation = validatePublicRegistrationPayload({
      requested_service: req.body?.requested_service,
      entity_type: req.body?.entity_type,
      region_id: req.body?.region_id,
      address: String(req.body?.address || ''),
      location_gps: String(req.body?.location_gps || ''),
      postal_code: String(req.body?.postal_code || ''),
      phone_1: String(req.body?.phone_1 || ''),
      phone_2: req.body?.phone_2 ? String(req.body.phone_2) : undefined,
      first_name: req.body?.first_name ? String(req.body.first_name) : undefined,
      last_name: req.body?.last_name ? String(req.body.last_name) : undefined,
      father_name: req.body?.father_name ? String(req.body.father_name) : undefined,
      national_code: req.body?.national_code ? String(req.body.national_code) : undefined,
      company_name: req.body?.company_name ? String(req.body.company_name) : undefined,
      registration_number: req.body?.registration_number
        ? String(req.body.registration_number)
        : undefined,
      national_id: req.body?.national_id ? String(req.body.national_id) : undefined,
      economic_code: req.body?.economic_code ? String(req.body.economic_code) : undefined,
      fault_description: req.body?.fault_description
        ? String(req.body.fault_description)
        : undefined,
      uploadedImageTypes: validImgs.map((im) => im.image_type),
    });

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const regionId = Number(req.body?.region_id);
    const [region] = await db
      .select()
      .from(tblRegions)
      .where(and(eq(tblRegions.id, regionId), eq(tblRegions.is_active, true)))
      .limit(1);
    if (!region) {
      res.status(400).json({ error: 'منطقه انتخاب‌شده فعال یا معتبر نیست.' });
      return;
    }

    const createdTicket = await db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(tblTickets)
        .values({
          type: 'public_preregistration',
          requested_service: req.body.requested_service,
          entity_type: req.body.entity_type,
          customer_name: validation.customerName,
          address: String(req.body.address).trim(),
          customer_details: validation.details,
          location_gps: String(req.body.location_gps).trim(),
          region_id: region.id,
          operator_notes:
            validation.details.fault_description ||
            (req.body.requested_service === 'new_service'
              ? 'درخواست ثبت سرویس اینترنت فیبر نوری از پرتال عمومی'
              : 'گزارش خرابی از پرتال عمومی مشترکین'),
          status: 'pending_operator',
        })
        .returning();

      if (validImgs.length > 0) {
        await tx.insert(tblImages).values(
          validImgs.map((im) => ({
            entity_type: 'ticket_identity',
            entity_id: ticket.id,
            image_type: String(im.image_type || 'document').slice(0, 40),
            file_path: im.file_path,
            caption: im.caption ? String(im.caption).trim().slice(0, 240) : null,
          })),
        );
      }

      return ticket;
    });

    await logActivity({
      actionType: 'public_request_submitted',
      entityType: 'ticket',
      entityId: createdTicket.id,
      summary: `ثبت درخواست آنلاین #${createdTicket.id} از پرتال مشتریان (${validation.customerName})`,
      details: `${region.name} | ${req.body.requested_service === 'new_service' ? 'سرویس جدید' : 'اعلام خرابی'}`,
    });

    const trackingCode = `AVA-${String(createdTicket.id).padStart(5, '0')}`;
    res.status(201).json({ ticket: createdTicket, trackingCode });
  } catch (err) {
    handleRouteError(res, err, 'خطا در ثبت درخواست آنلاین مشترک');
  }
});

app.get('/api/settings', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const settings = await loadSystemSettingsMap();
    const regions = await db.select().from(tblRegions).orderBy(tblRegions.id);
    res.json({ settings, regions });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت تنظیمات سامانه');
  }
});

app.put(
  '/api/settings',
  requireAuth,
  requirePermission('can_manage_settings'),
  async (req: AuthRequest, res: Response) => {
    try {
      const system_name = String(req.body?.system_name || '').trim();
      const primary_color = String(req.body?.primary_color || '').trim();
      if (!system_name || system_name.length < 2) {
        res.status(400).json({ error: 'نام سامانه نمی‌تواند خالی باشد.' });
        return;
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(primary_color)) {
        res.status(400).json({ error: 'کد رنگ اصلی باید با فرمت هگز ۶ رقمی (مثال: #0f766e) باشد.' });
        return;
      }

      await db
        .insert(tblSettings)
        .values([
          { setting_key: 'system_name', setting_value: system_name },
          { setting_key: 'primary_color', setting_value: primary_color },
        ])
        .onConflictDoUpdate({
          target: tblSettings.setting_key,
          set: { setting_value: sql`excluded.setting_value` },
        });

      await logActivity({
        user: req.authUser,
        actionType: 'settings_updated',
        entityType: 'settings',
        summary: `بروزرسانی تنظیمات کلی و برندینگ («${system_name}» / ${primary_color})`,
      });

      res.json({ settings: { system_name, primary_color } });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ذخیره تنظیمات');
    }
  },
);

app.get('/api/regions', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const regions = await db.select().from(tblRegions).orderBy(tblRegions.id);
    res.json({ regions });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت لیست مناطق');
  }
});

app.post(
  '/api/regions',
  requireAuth,
  requirePermission('can_manage_settings'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      const is_active = typeof req.body?.is_active === 'boolean' ? req.body.is_active : true;
      if (name.length < 2) {
        res.status(400).json({ error: 'نام منطقه باید حداقل ۲ کاراکتر باشد.' });
        return;
      }
      const [region] = await db.insert(tblRegions).values({ name, is_active }).returning();
      await logActivity({
        user: req.authUser,
        actionType: 'region_created',
        entityType: 'region',
        entityId: region.id,
        summary: `افزودن منطقه تحت پوشش جدید «${name}»`,
      });
      res.status(201).json({ region });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ایجاد منطقه جدید');
    }
  },
);

app.patch(
  '/api/regions/:id',
  requireAuth,
  requirePermission('can_manage_settings'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates: Partial<typeof tblRegions.$inferInsert> = {};
      if (typeof req.body?.name === 'string') {
        const name = req.body.name.trim();
        if (name.length < 2) {
          res.status(400).json({ error: 'نام منطقه باید حداقل ۲ کاراکتر باشد.' });
          return;
        }
        updates.name = name;
      }
      if (typeof req.body?.is_active === 'boolean') {
        updates.is_active = req.body.is_active;
      }
      const [region] = await db
        .update(tblRegions)
        .set(updates)
        .where(eq(tblRegions.id, id))
        .returning();
      if (!region) {
        res.status(404).json({ error: 'منطقه یافت نشد.' });
        return;
      }
      await logActivity({
        user: req.authUser,
        actionType: 'region_updated',
        entityType: 'region',
        entityId: id,
        summary: `بروزرسانی منطقه «${region.name}»`,
      });
      res.json({ region });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ویرایش منطقه');
    }
  },
);

app.delete(
  '/api/regions/:id',
  requireAuth,
  requirePermission('can_manage_settings'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [usedTicket] = await db
        .select({ id: tblTickets.id })
        .from(tblTickets)
        .where(eq(tblTickets.region_id, id))
        .limit(1);
      if (usedTicket) {
        res.status(409).json({
          error: 'این منطقه در تیکت‌ها یا درخواست‌های ثبت‌شده استفاده شده است. می‌توانید آن را غیرفعال کنید.',
        });
        return;
      }
      const [deleted] = await db.delete(tblRegions).where(eq(tblRegions.id, id)).returning();
      if (!deleted) {
        res.status(404).json({ error: 'منطقه یافت نشد.' });
        return;
      }
      await logActivity({
        user: req.authUser,
        actionType: 'region_deleted',
        entityType: 'region',
        entityId: id,
        summary: `حذف منطقه «${deleted.name}»`,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err, 'خطا در حذف منطقه');
    }
  },
);

// ==========================================
// DASHBOARD ROUTE
// ==========================================

app.get('/api/dashboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const user = req.authUser!;
    const canSeeAll = userHasPermission(user, 'can_view_all_tickets');

    const allTickets = await db
      .select({
        id: tblTickets.id,
        type: tblTickets.type,
        customer_name: tblTickets.customer_name,
        address: tblTickets.address,
        status: tblTickets.status,
        assigned_installer: tblTickets.assigned_installer,
        installer_name: tblUsers.full_name,
        scheduled_date: tblTickets.scheduled_date,
        scheduled_time: tblTickets.scheduled_time,
        assigned_at: tblTickets.assigned_at,
        started_at: tblTickets.started_at,
        completed_at: tblTickets.completed_at,
        created_at: tblTickets.created_at,
      })
      .from(tblTickets)
      .leftJoin(tblUsers, eq(tblUsers.id, tblTickets.assigned_installer))
      .orderBy(desc(tblTickets.id));

    const visibleTickets = canSeeAll
      ? allTickets
      : allTickets.filter((t) => t.assigned_installer === user.id);

    const spools = await db
      .select({
        id: tblSpools.id,
        spool_code: tblSpools.spool_code,
        cable_type: tblSpools.cable_type,
        initial_length: tblSpools.initial_length,
        current_length: tblSpools.current_length,
        assigned_installer_id: tblSpools.assigned_installer_id,
      })
      .from(tblSpools);

    const records = await db
      .select({
        id: tblServiceRecords.id,
        installer_id: tblServiceRecords.installer_id,
        out_total_meter: tblServiceRecords.out_total_meter,
        in_total_meter: tblServiceRecords.in_total_meter,
        created_at: tblServiceRecords.created_at,
      })
      .from(tblServiceRecords);

    const canViewAllFinancials = userHasPermission(
      user,
      'can_view_financials',
      'can_manage_tariffs',
    );
    const ledgerFilter = canViewAllFinancials ? undefined : eq(tblLedger.user_id, user.id);
    const ledgerRows = await db.select().from(tblLedger).where(ledgerFilter);
    const balanceSummary = computeLedgerBalance(
      ledgerRows
        .filter((l) => l.ledger_type !== 'customer_payment')
        .map((l) => ({
          amount: l.amount,
          type: l.type === 'debit' ? 'debit' : 'credit',
        })),
    );

    // Build 6-month Jalali chart series for DashboardPage
    const now = new Date();
    const currentJalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const monthlySeries: Array<{
      monthKey: string;
      monthLabel: string;
      completedTickets: number;
      outdoorMeters: number;
      indoorMeters: number;
    }> = [];

    const jalaliMonths = [
      'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
      'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
    ];

    for (let offset = 5; offset >= 0; offset--) {
      let jm = currentJalali.jm - offset;
      let jy = currentJalali.jy;
      while (jm <= 0) {
        jm += 12;
        jy -= 1;
      }
      const key = `${jy}-${String(jm).padStart(2, '0')}`;
      monthlySeries.push({
        monthKey: key,
        monthLabel: `${jalaliMonths[jm - 1]} ${jy}`,
        completedTickets: 0,
        outdoorMeters: 0,
        indoorMeters: 0,
      });
    }

    const bucketMap = new Map(monthlySeries.map((m) => [m.monthKey, m]));
    for (const t of visibleTickets) {
      if (t.status !== 'completed' || !t.completed_at) continue;
      const d = new Date(t.completed_at);
      const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const key = `${j.jy}-${String(j.jm).padStart(2, '0')}`;
      const bucket = bucketMap.get(key);
      if (bucket) bucket.completedTickets += 1;
    }
    for (const r of records) {
      if (!canSeeAll && r.installer_id !== user.id) continue;
      const d = new Date(r.created_at);
      const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const key = `${j.jy}-${String(j.jm).padStart(2, '0')}`;
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.outdoorMeters += r.out_total_meter;
        bucket.indoorMeters += r.in_total_meter;
      }
    }

    const lowSpools = getLowSpoolWarnings(
      spools.map((s) => ({
        ...s,
        cable_type: s.cable_type as 'indoor' | 'outdoor',
      })),
    );

    const completionLast30Days = computeLast30DaysCompletionByType(
      visibleTickets.map((t) => ({
        type: t.type as AnyTicketTypeKey,
        status: t.status as TicketStatus,
        created_at: t.created_at,
        completed_at: t.completed_at,
      })),
    );

    const contractorSlaLast30Days = computeContractorSlaAveragesLast30Days(
      visibleTickets.map((t) => ({
        id: t.id,
        type: t.type as AnyTicketTypeKey,
        status: t.status as TicketStatus,
        assigned_installer: t.assigned_installer,
        installer_name: t.installer_name,
        assigned_at: t.assigned_at,
        started_at: t.started_at,
        completed_at: t.completed_at,
      })),
    );

    const userRows = await db
      .select({ id: tblUsers.id, full_name: tblUsers.full_name })
      .from(tblUsers);
    const userNameById = new Map(userRows.map((u) => [u.id, u.full_name]));

    const spoolAdjustLogs = await db
      .select({
        entity_id: tblActivityLogs.entity_id,
        user_id: tblActivityLogs.user_id,
        summary: tblActivityLogs.summary,
        created_at: tblActivityLogs.created_at,
      })
      .from(tblActivityLogs)
      .where(
        and(
          eq(tblActivityLogs.entity_type, 'spool'),
          eq(tblActivityLogs.action_type, 'inventory_adjusted'),
        ),
      );

    const spoolById = new Map(spools.map((sp) => [sp.id, sp]));
    const manualSpoolEvents = spoolAdjustLogs.flatMap((log) => {
      if (!log.entity_id) return [];
      const sp = spoolById.get(log.entity_id);
      if (!sp) return [];
      const match = /کسر\s+(\d+)\s+متر/.exec(log.summary);
      const meters = match ? Number(match[1]) : 0;
      if (meters <= 0) return [];
      const installerId = sp.assigned_installer_id ?? log.user_id ?? 0;
      if (!canSeeAll && installerId !== user.id) return [];
      return [
        {
          installer_id: installerId,
          installer_name: userNameById.get(installerId) ?? null,
          out_total_meter: sp.cable_type === 'outdoor' ? meters : 0,
          in_total_meter: sp.cable_type === 'indoor' ? meters : 0,
          created_at: log.created_at,
        },
      ];
    });

    const serviceSpoolEvents = records
      .filter((r) => canSeeAll || r.installer_id === user.id)
      .map((r) => ({
        installer_id: r.installer_id,
        installer_name: userNameById.get(r.installer_id) ?? null,
        out_total_meter: r.out_total_meter,
        in_total_meter: r.in_total_meter,
        created_at: r.created_at,
      }));

    const currentMonthSpoolConsumption = computeCurrentMonthSpoolConsumptionByContractor(
      [...serviceSpoolEvents, ...manualSpoolEvents],
      now,
    );

    const recentCriticalSlaTransitions = findRecentCriticalSlaTransitions(
      visibleTickets.map((t) => ({
        id: t.id,
        type: t.type as AnyTicketTypeKey,
        customer_name: t.customer_name,
        status: t.status as TicketStatus,
        installer_name: t.installer_name,
        assigned_at: t.assigned_at,
        started_at: t.started_at,
        completed_at: t.completed_at,
      })),
      180_000,
      4,
      now,
    );

    res.json({
      kpis: {
        pendingTickets: visibleTickets.filter(
          (t) => t.status === 'pending_operator' || isWaitingInstallerStatus(t.status as TicketStatus),
        ).length,
        inProgressTickets: visibleTickets.filter((t) => t.status === 'in_progress').length,
        completedTickets: visibleTickets.filter((t) => t.status === 'completed').length,
        totalSpoolMeters: spools.reduce((acc, s) => acc + s.current_length, 0),
        lowSpoolCount: lowSpools.length,
        balance: balanceSummary.balance,
      },
      lowSpools,
      monthlySeries,
      completionLast30Days,
      contractorSlaLast30Days,
      currentMonthSpoolConsumption,
      recentCriticalSlaTransitions,
      scheduledTickets: visibleTickets,
    });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت اطلاعات داشبورد');
  }
});

// ==========================================
// 5-TYPE TICKETS, SLA & IMMUTABLE COMMENTS
// ==========================================

app.get('/api/tickets', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const user = req.authUser!;
    const canSeeAll = userHasPermission(user, 'can_view_all_tickets');

    const rows = await db
      .select({
        id: tblTickets.id,
        type: tblTickets.type,
        requested_service: tblTickets.requested_service,
        entity_type: tblTickets.entity_type,
        customer_name: tblTickets.customer_name,
        address: tblTickets.address,
        customer_details: tblTickets.customer_details,
        location_gps: tblTickets.location_gps,
        region_id: tblTickets.region_id,
        region_name: tblRegions.name,
        customer_package_id: tblTickets.customer_package_id,
        customer_package_name: tblCustomerPackages.name,
        required_modem_id: tblTickets.required_modem_id,
        required_modem_name: tblModemBrands.name,
        pppoe_user: tblTickets.pppoe_user,
        pppoe_pass: tblTickets.pppoe_pass,
        vlan_id: tblTickets.vlan_id,
        voip_config: tblTickets.voip_config,
        operator_notes: tblTickets.operator_notes,
        status: tblTickets.status,
        assigned_installer: tblTickets.assigned_installer,
        installer_name: tblUsers.full_name,
        scheduled_date: tblTickets.scheduled_date,
        scheduled_time: tblTickets.scheduled_time,
        assigned_at: tblTickets.assigned_at,
        started_at: tblTickets.started_at,
        completed_at: tblTickets.completed_at,
        created_at: tblTickets.created_at,
      })
      .from(tblTickets)
      .leftJoin(tblUsers, eq(tblUsers.id, tblTickets.assigned_installer))
      .leftJoin(tblRegions, eq(tblRegions.id, tblTickets.region_id))
      .leftJoin(tblCustomerPackages, eq(tblCustomerPackages.id, tblTickets.customer_package_id))
      .leftJoin(tblModemBrands, eq(tblModemBrands.id, tblTickets.required_modem_id))
      .orderBy(desc(tblTickets.id));

    const visibleRows = canSeeAll ? rows : rows.filter((t) => t.assigned_installer === user.id);
    const ticketIds = visibleRows.map((t) => t.id);

    const identityImgRows =
      ticketIds.length > 0
        ? await db
            .select({
              id: tblImages.id,
              entity_id: tblImages.entity_id,
              image_type: tblImages.image_type,
              file_path: tblImages.file_path,
              caption: tblImages.caption,
              created_at: tblImages.created_at,
            })
            .from(tblImages)
            .where(
              and(
                eq(tblImages.entity_type, 'ticket_identity'),
                inArray(tblImages.entity_id, ticketIds),
              ),
            )
        : [];

    const imgsByTicket = new Map<number, typeof identityImgRows>();
    for (const img of identityImgRows) {
      const list = imgsByTicket.get(img.entity_id) ?? [];
      list.push(img);
      imgsByTicket.set(img.entity_id, list);
    }

    const tickets = visibleRows.map((t) => ({
      ...t,
      identity_images: imgsByTicket.get(t.id) ?? [],
    }));

    const installers = await db
      .select({
        id: tblUsers.id,
        full_name: tblUsers.full_name,
        username: tblUsers.username,
        role_name: tblRoles.name,
      })
      .from(tblUsers)
      .innerJoin(tblRoles, eq(tblRoles.id, tblUsers.role_id))
      .where(eq(tblUsers.is_active, true));

    const packages = await db
      .select()
      .from(tblCustomerPackages)
      .where(eq(tblCustomerPackages.is_active, true))
      .orderBy(tblCustomerPackages.id);

    const modemBrands = await db.select().from(tblModemBrands).orderBy(tblModemBrands.id);
    const regions = await db.select().from(tblRegions).orderBy(tblRegions.id);

    res.json({ tickets, installers, packages, modemBrands, regions });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت لیست تیکت‌ها');
  }
});

app.post(
  '/api/tickets',
  requireAuth,
  requirePermission('can_create_tickets'),
  async (req: AuthRequest, res: Response) => {
    try {
      const type = String(req.body?.type || '') as TicketTypeKey;
      if (!TICKET_TYPES.includes(type)) {
        res.status(400).json({ error: 'نوع تیکت انتخاب‌شده معتبر نیست.' });
        return;
      }
      const customer_name = String(req.body?.customer_name || '').trim();
      const address = String(req.body?.address || '').trim();
      if (!customer_name || !address) {
        res.status(400).json({ error: 'نام مشترک و آدرس الزامی است.' });
        return;
      }

      const visibility = getTicketTypeFieldVisibility(type);
      const assignedInstaller = req.body?.assigned_installer
        ? Number(req.body.assigned_installer)
        : null;
      const customerPackageId = req.body?.customer_package_id
        ? Number(req.body.customer_package_id)
        : null;
      const requiredModemId = req.body?.required_modem_id
        ? Number(req.body.required_modem_id)
        : null;
      const regionId = req.body?.region_id ? Number(req.body.region_id) : null;

      const [created] = await db
        .insert(tblTickets)
        .values({
          type,
          customer_name,
          address,
          region_id: regionId,
          customer_package_id: customerPackageId,
          required_modem_id: requiredModemId,
          pppoe_user: visibility.showPppoeVlan ? String(req.body?.pppoe_user || '').trim() || null : null,
          pppoe_pass: visibility.showPppoeVlan ? String(req.body?.pppoe_pass || '').trim() || null : null,
          vlan_id: visibility.showPppoeVlan ? String(req.body?.vlan_id || '').trim() || null : null,
          voip_config: visibility.showVoip ? String(req.body?.voip_config || '').trim() || null : null,
          operator_notes: String(req.body?.operator_notes || '').trim() || null,
          status: 'pending_installer',
          assigned_installer: assignedInstaller,
          scheduled_date: String(req.body?.scheduled_date || '').trim() || null,
          scheduled_time: String(req.body?.scheduled_time || '').trim() || null,
          assigned_at: assignedInstaller ? new Date() : null,
        })
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'ticket_created',
        entityType: 'ticket',
        entityId: created.id,
        summary: `ثبت تیکت جدید #${created.id} (${visibility.label})`,
        details: `${customer_name} - ${address}`,
      });

      res.status(201).json({ ticket: created });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ثبت تیکت جدید');
    }
  },
);

app.post(
  '/api/tickets/:id/review-assign',
  requireAuth,
  requirePermission('can_assign_tickets'),
  async (req: AuthRequest, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(tblTickets)
        .where(eq(tblTickets.id, ticketId))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: 'تیکت یافت نشد.' });
        return;
      }

      const opType = String(req.body?.type || '') as TicketTypeKey;
      if (!TICKET_TYPES.includes(opType)) {
        res.status(400).json({ error: 'نوع عملیات ۵گانه برای تیکت الزامی است.' });
        return;
      }

      const visibility = getTicketTypeFieldVisibility(opType);
      const customerPackageId = req.body?.customer_package_id
        ? Number(req.body.customer_package_id)
        : null;
      const requiredModemId = req.body?.required_modem_id
        ? Number(req.body.required_modem_id)
        : null;
      const installerId = req.body?.assigned_installer
        ? Number(req.body.assigned_installer)
        : null;
      const scheduledDate = String(req.body?.scheduled_date || '').trim() || null;
      const scheduledTime = String(req.body?.scheduled_time || '').trim() || null;
      const operatorNotes = String(req.body?.operator_notes || '').trim() || existing.operator_notes;

      if (!installerId) {
        res.status(400).json({ error: 'انتخاب پیمانکار نصاب برای ارجاع الزامی است.' });
        return;
      }

      const [updated] = await db
        .update(tblTickets)
        .set({
          type: opType,
          customer_package_id: customerPackageId,
          required_modem_id: requiredModemId,
          pppoe_user: visibility.showPppoeVlan
            ? String(req.body?.pppoe_user || '').trim() || null
            : null,
          pppoe_pass: visibility.showPppoeVlan
            ? String(req.body?.pppoe_pass || '').trim() || null
            : null,
          vlan_id: visibility.showPppoeVlan
            ? String(req.body?.vlan_id || '').trim() || null
            : null,
          voip_config: visibility.showVoip
            ? String(req.body?.voip_config || '').trim() || null
            : null,
          operator_notes: operatorNotes,
          assigned_installer: installerId,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          status: 'pending_installer',
          assigned_at: new Date(),
        })
        .where(eq(tblTickets.id, ticketId))
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'ticket_triaged',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `بررسی اپراتور و ارجاع تیکت #${ticketId} (${visibility.label})`,
        details: scheduledDate ? `زمان‌بندی: ${scheduledDate} ${scheduledTime || ''}` : null,
      });

      res.json({ ticket: updated });
    } catch (err) {
      handleRouteError(res, err, 'خطا در بررسی و ارجاع تیکت');
    }
  },
);

app.post(
  '/api/tickets/:id/assign',
  requireAuth,
  requirePermission('can_assign_tickets'),
  async (req: AuthRequest, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const installerId = req.body?.assigned_installer ? Number(req.body.assigned_installer) : null;
      const scheduledDate = String(req.body?.scheduled_date || '').trim() || null;
      const scheduledTime = String(req.body?.scheduled_time || '').trim() || null;

      const [updated] = await db
        .update(tblTickets)
        .set({
          assigned_installer: installerId,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          assigned_at: installerId ? new Date() : null,
          status: installerId ? 'pending_installer' : undefined,
        })
        .where(eq(tblTickets.id, ticketId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: 'تیکت یافت نشد.' });
        return;
      }

      await logActivity({
        user: req.authUser,
        actionType: 'ticket_assigned',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `ارجاع و زمان‌بندی تیکت #${ticketId}`,
        details: scheduledDate ? `تاریخ زمان‌بندی: ${scheduledDate} ${scheduledTime || ''}` : null,
      });

      res.json({ ticket: updated });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ارجاع تیکت');
    }
  },
);

app.post(
  '/api/tickets/:id/start',
  requireAuth,
  requirePermission('can_execute_service', 'can_assign_tickets'),
  async (req: AuthRequest, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const user = req.authUser!;
      const rows = await db
        .select()
        .from(tblTickets)
        .where(eq(tblTickets.id, ticketId))
        .limit(1);
      const existing = rows[0];
      if (!existing) {
        res.status(404).json({ error: 'تیکت یافت نشد.' });
        return;
      }
      if (
        !userHasPermission(user, 'can_view_all_tickets') &&
        existing.assigned_installer !== user.id
      ) {
        res.status(403).json({ error: 'این تیکت به شما ارجاع نشده است.' });
        return;
      }
      if (existing.status === 'completed') {
        res.json({ ticket: existing });
        return;
      }

      const [updated] = await db
        .update(tblTickets)
        .set({
          status: 'in_progress',
          started_at: existing.started_at ?? new Date(),
        })
        .where(eq(tblTickets.id, ticketId))
        .returning();

      await logActivity({
        user,
        actionType: 'ticket_started',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `شروع عملیات میدانی تیکت #${ticketId}`,
        details: existing.customer_name,
      });

      res.json({ ticket: updated });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ثبت شروع عملیات');
    }
  },
);

app.post(
  '/api/tickets/:id/sla-reminder',
  requireAuth,
  requirePermission('can_assign_tickets', 'can_create_tickets', 'can_view_all_tickets'),
  async (req: AuthRequest, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const customMessage = String(req.body?.message || '').trim();

      const rows = await db
        .select({
          id: tblTickets.id,
          status: tblTickets.status,
          customer_name: tblTickets.customer_name,
          assigned_installer: tblTickets.assigned_installer,
          assigned_at: tblTickets.assigned_at,
          installer_name: tblUsers.full_name,
        })
        .from(tblTickets)
        .leftJoin(tblUsers, eq(tblUsers.id, tblTickets.assigned_installer))
        .where(eq(tblTickets.id, ticketId))
        .limit(1);

      const ticket = rows[0];
      if (!ticket) {
        res.status(404).json({ error: 'تیکت یافت نشد.' });
        return;
      }
      if (!isWaitingInstallerStatus(ticket.status as TicketStatus)) {
        res.status(400).json({ error: 'ارسال یادآوری SLA فقط برای تیکت‌های در انتظار اجرا مجاز است.' });
        return;
      }
      if (!ticket.assigned_installer) {
        res.status(400).json({ error: 'این تیکت هنوز به پیمانکاری ارجاع داده نشده است.' });
        return;
      }

      const targetInstaller = ticket.installer_name || `پیمانکار #${ticket.assigned_installer}`;
      const bodyText =
        customMessage ||
        `یادآوری فوری SLA: بیش از ۴ ساعت از زمان ارجاع تیکت #${ticketId} (${ticket.customer_name}) گذشته است. لطفاً وضعیت اجرا را بررسی و عملیات را آغاز نمایید.`;
      const commentContent = `[یادآوری فوری SLA به ${targetInstaller}]: ${bodyText}`;

      const [created] = await db
        .insert(tblTicketComments)
        .values({
          ticket_id: ticketId,
          user_id: req.authUser!.id,
          comment: commentContent,
        })
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'sla_reminder_sent',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `ارسال یادآوری فوری SLA برای تیکت #${ticketId} به ${targetInstaller}`,
        details: bodyText.slice(0, 160),
      });

      res.status(201).json({
        ok: true,
        sentTo: targetInstaller,
        comment: {
          ...created,
          user_full_name: req.authUser!.full_name,
          user_role_name: req.authUser!.role_name,
        },
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ارسال یادآوری فوری SLA');
    }
  },
);

app.get('/api/tickets/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const user = req.authUser!;
    const [ticketRow] = await db
      .select({ assigned_installer: tblTickets.assigned_installer })
      .from(tblTickets)
      .where(eq(tblTickets.id, ticketId))
      .limit(1);
    if (!ticketRow) {
      res.status(404).json({ error: 'تیکت یافت نشد.' });
      return;
    }
    if (!userHasPermission(user, 'can_view_all_tickets') && ticketRow.assigned_installer !== user.id) {
      res.status(403).json({ error: 'شما مجوز مشاهده نظرات این تیکت را ندارید.' });
      return;
    }

    const rawComments = await db
      .select({
        id: tblTicketComments.id,
        ticket_id: tblTicketComments.ticket_id,
        user_id: tblTicketComments.user_id,
        user_full_name: tblUsers.full_name,
        user_role_name: tblRoles.name,
        comment: tblTicketComments.comment,
        is_deleted: tblTicketComments.is_deleted,
        edited_at: tblTicketComments.edited_at,
        created_at: tblTicketComments.created_at,
      })
      .from(tblTicketComments)
      .innerJoin(tblUsers, eq(tblUsers.id, tblTicketComments.user_id))
      .innerJoin(tblRoles, eq(tblRoles.id, tblUsers.role_id))
      .where(eq(tblTicketComments.ticket_id, ticketId))
      .orderBy(tblTicketComments.created_at, tblTicketComments.id);

    const canManageAll = userHasPermission(user, 'can_manage_all_comments');
    const comments = rawComments.map((c) => ({
      ...c,
      comment: c.is_deleted && !canManageAll ? 'این یادداشت توسط کاربر حذف شده است.' : c.comment,
    }));

    res.json({ comments });
  } catch (err) {
    handleRouteError(res, err, 'خطا در بارگذاری خط زمانی نظرات');
  }
});

// Timeline comments with RBAC edit/soft-delete and immutable audit retention
app.post('/api/tickets/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const user = req.authUser!;
    const commentText = String(req.body?.comment || '').trim();
    if (!commentText) {
      res.status(400).json({ error: 'متن گزارش یا نظر نمی‌تواند خالی باشد.' });
      return;
    }

    const ticketExists = await db
      .select({ id: tblTickets.id, assigned_installer: tblTickets.assigned_installer })
      .from(tblTickets)
      .where(eq(tblTickets.id, ticketId))
      .limit(1);
    if (!ticketExists[0]) {
      res.status(404).json({ error: 'تیکت یافت نشد.' });
      return;
    }
    if (
      !userHasPermission(user, 'can_view_all_tickets') &&
      ticketExists[0].assigned_installer !== user.id
    ) {
      res.status(403).json({ error: 'شما مجوز ثبت نظر روی این تیکت را ندارید.' });
      return;
    }

    const [created] = await db
      .insert(tblTicketComments)
      .values({
        ticket_id: ticketId,
        user_id: req.authUser!.id,
        comment: commentText,
      })
      .returning();

    await logActivity({
      user: req.authUser,
      actionType: 'ticket_comment_added',
      entityType: 'ticket',
      entityId: ticketId,
      summary: `ثبت یادداشت در تایم‌لاین تیکت #${ticketId}`,
      details: commentText.slice(0, 120),
    });

    res.status(201).json({
      comment: {
        ...created,
        user_full_name: req.authUser!.full_name,
        user_role_name: req.authUser!.role_name,
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'خطا در ثبت نظر');
  }
});

app.patch(
  '/api/tickets/:id/comments/:commentId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const commentId = Number(req.params.commentId);
      const user = req.authUser!;
      const nextText = String(req.body?.comment || '').trim();
      if (!nextText) {
        res.status(400).json({ error: 'متن جدید یادداشت نمی‌تواند خالی باشد.' });
        return;
      }

      const [existing] = await db
        .select()
        .from(tblTicketComments)
        .where(and(eq(tblTicketComments.id, commentId), eq(tblTicketComments.ticket_id, ticketId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'یادداشت یافت نشد.' });
        return;
      }
      if (existing.is_deleted) {
        res.status(400).json({ error: 'یادداشت حذف‌شده قابل ویرایش نیست.' });
        return;
      }
      if (!canUserEditComment(user, existing.user_id, existing.is_deleted)) {
        res.status(403).json({ error: 'شما مجوز ویرایش این یادداشت را ندارید.' });
        return;
      }

      const [updated] = await db
        .update(tblTicketComments)
        .set({
          comment: nextText,
          edited_at: new Date(),
        })
        .where(eq(tblTicketComments.id, commentId))
        .returning();

      await logActivity({
        user,
        actionType: 'comment_edited',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `ویرایش یادداشت #${commentId} در تیکت #${ticketId} (نسخه قبلی در لاگ نگهداری شد)`,
        details: JSON.stringify({
          comment_id: commentId,
          previous_comment: existing.comment,
          new_comment: nextText,
        }),
      });

      const [author] = await db
        .select({ full_name: tblUsers.full_name, role_name: tblRoles.name })
        .from(tblUsers)
        .innerJoin(tblRoles, eq(tblRoles.id, tblUsers.role_id))
        .where(eq(tblUsers.id, existing.user_id))
        .limit(1);

      res.json({
        comment: {
          ...updated,
          user_full_name: author?.full_name || user.full_name,
          user_role_name: author?.role_name || user.role_name,
        },
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ویرایش یادداشت');
    }
  },
);

app.delete(
  '/api/tickets/:id/comments/:commentId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const ticketId = Number(req.params.id);
      const commentId = Number(req.params.commentId);
      const user = req.authUser!;

      const [existing] = await db
        .select()
        .from(tblTicketComments)
        .where(and(eq(tblTicketComments.id, commentId), eq(tblTicketComments.ticket_id, ticketId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'یادداشت یافت نشد.' });
        return;
      }
      if (existing.is_deleted) {
        res.status(400).json({ error: 'این یادداشت قبلاً حذف نرم شده است.' });
        return;
      }
      if (!canUserDeleteComment(user, existing.user_id, existing.is_deleted)) {
        res.status(403).json({ error: 'شما مجوز حذف این یادداشت را ندارید.' });
        return;
      }

      const [updated] = await db
        .update(tblTicketComments)
        .set({
          is_deleted: true,
          edited_at: new Date(),
        })
        .where(eq(tblTicketComments.id, commentId))
        .returning();

      await logActivity({
        user,
        actionType: 'comment_deleted',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `حذف نرم یادداشت #${commentId} در تیکت #${ticketId} (متن اصلی آرشیو شد)`,
        details: JSON.stringify({
          comment_id: commentId,
          original_comment: existing.comment,
        }),
      });

      const [author] = await db
        .select({ full_name: tblUsers.full_name, role_name: tblRoles.name })
        .from(tblUsers)
        .innerJoin(tblRoles, eq(tblRoles.id, tblUsers.role_id))
        .where(eq(tblUsers.id, existing.user_id))
        .limit(1);

      res.json({
        ok: true,
        commentId,
        comment: {
          ...updated,
          user_full_name: author?.full_name || user.full_name,
          user_role_name: author?.role_name || user.role_name,
        },
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در حذف یادداشت');
    }
  },
);

// ==========================================
// SERVICE RECORDS (ATOMIC SPOOL, VAN STOCK & DYNAMIC TARIFF LEDGER)
// ==========================================

app.get('/api/tickets/:id/service-record', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const user = req.authUser!;
    const rows = await db
      .select()
      .from(tblServiceRecords)
      .where(eq(tblServiceRecords.ticket_id, ticketId))
      .limit(1);
    const rec = rows[0];
    if (!rec) {
      res.status(404).json({ error: 'گزارش تکمیل عملیات برای این تیکت یافت نشد.' });
      return;
    }

    const [ticket] = await db.select().from(tblTickets).where(eq(tblTickets.id, ticketId)).limit(1);
    if (
      !userHasPermission(user, 'can_view_all_tickets', 'can_view_financials') &&
      rec.installer_id !== user.id &&
      ticket?.assigned_installer !== user.id
    ) {
      res.status(403).json({ error: 'شما مجوز مشاهده فاکتور و صورت‌جلسه این تیکت را ندارید.' });
      return;
    }
    const [installer] = await db
      .select({ full_name: tblUsers.full_name })
      .from(tblUsers)
      .where(eq(tblUsers.id, rec.installer_id))
      .limit(1);

    let sourceLabel = '';
    let kafName = '';
    let oltName = '';
    if (rec.source_type === 'FAT') {
      const fatRow = await db
        .select({
          fat_number: tblFats.fat_number,
          olt_name: tblOlts.name,
          kaf_name: tblKafos.name,
        })
        .from(tblFats)
        .innerJoin(tblOlts, eq(tblOlts.id, tblFats.olt_id))
        .innerJoin(tblKafos, eq(tblKafos.id, tblOlts.kaf_id))
        .where(eq(tblFats.id, rec.source_id))
        .limit(1);
      if (fatRow[0]) {
        sourceLabel = `FAT ${fatRow[0].fat_number}`;
        oltName = fatRow[0].olt_name;
        kafName = fatRow[0].kaf_name;
      }
    } else {
      const ffatRow = await db
        .select({
          ffat_code: tblFfats.ffat_code,
          olt_name: tblOlts.name,
          kaf_name: tblKafos.name,
        })
        .from(tblFfats)
        .innerJoin(tblFats, eq(tblFats.id, tblFfats.fat_id))
        .innerJoin(tblOlts, eq(tblOlts.id, tblFats.olt_id))
        .innerJoin(tblKafos, eq(tblKafos.id, tblOlts.kaf_id))
        .where(eq(tblFfats.id, rec.source_id))
        .limit(1);
      if (ffatRow[0]) {
        sourceLabel = ffatRow[0].ffat_code;
        oltName = ffatRow[0].olt_name;
        kafName = ffatRow[0].kaf_name;
      }
    }

    const outSpool = rec.out_spool_id
      ? (
          await db
            .select({ spool_code: tblSpools.spool_code })
            .from(tblSpools)
            .where(eq(tblSpools.id, rec.out_spool_id))
            .limit(1)
        )[0]
      : null;
    const inSpool = rec.in_spool_id
      ? (
          await db
            .select({ spool_code: tblSpools.spool_code })
            .from(tblSpools)
            .where(eq(tblSpools.id, rec.in_spool_id))
            .limit(1)
        )[0]
      : null;
    const brand = rec.modem_brand_id
      ? (
          await db
            .select({ name: tblModemBrands.name })
            .from(tblModemBrands)
            .where(eq(tblModemBrands.id, rec.modem_brand_id))
            .limit(1)
        )[0]
      : null;
    const serviceImgs = await db
      .select({
        id: tblServiceImages.id,
        image_type: tblServiceImages.image_type,
        file_path: tblServiceImages.file_path,
        caption: tblServiceImages.caption,
      })
      .from(tblServiceImages)
      .where(eq(tblServiceImages.record_id, rec.id));

    const unifiedImgs = await db
      .select({
        id: tblImages.id,
        image_type: tblImages.image_type,
        file_path: tblImages.file_path,
        caption: tblImages.caption,
      })
      .from(tblImages)
      .where(and(eq(tblImages.entity_type, 'service_record'), eq(tblImages.entity_id, rec.id)));

    const seenPaths = new Set(serviceImgs.map((i) => i.file_path));
    const images = [
      ...serviceImgs,
      ...unifiedImgs.filter((i) => !seenPaths.has(i.file_path)),
    ];

    const historyRows = await db
      .select({
        id: tblServiceRecordsHistory.id,
        record_id: tblServiceRecordsHistory.record_id,
        changed_by: tblServiceRecordsHistory.changed_by,
        changed_by_name: tblUsers.full_name,
        changed_at: tblServiceRecordsHistory.changed_at,
        old_data: tblServiceRecordsHistory.old_data,
      })
      .from(tblServiceRecordsHistory)
      .leftJoin(tblUsers, eq(tblUsers.id, tblServiceRecordsHistory.changed_by))
      .where(eq(tblServiceRecordsHistory.record_id, rec.id))
      .orderBy(desc(tblServiceRecordsHistory.changed_at), desc(tblServiceRecordsHistory.id));

    const customerPaymentsRows = await db
      .select({ amount: tblLedger.amount })
      .from(tblLedger)
      .where(and(eq(tblLedger.ticket_id, ticketId), eq(tblLedger.ledger_type, 'customer_payment')));
    const customerPaymentsTotal = customerPaymentsRows.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0,
    );

    res.json({
      record: {
        ...rec,
        installer_name: installer?.full_name || 'نامشخص',
        customer_name: ticket?.customer_name || '',
        address: ticket?.address || '',
        ticket_type: (ticket?.type || 'internet_install') as TicketTypeKey,
        source_label: sourceLabel || `${rec.source_type} #${rec.source_id}`,
        kaf_name: kafName,
        olt_name: oltName,
        out_spool_code: outSpool?.spool_code || null,
        in_spool_code: inSpool?.spool_code || null,
        modem_brand_name: brand?.name || null,
        dynamic_materials: Array.isArray(rec.dynamic_materials) ? rec.dynamic_materials : [],
        splitter_changes: rec.splitter_changes ?? null,
        customer_invoice_snapshot: rec.customer_invoice_snapshot ?? null,
        customer_payments_total: customerPaymentsTotal,
        images,
        history: historyRows,
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت گزارش عملیات');
  }
});

app.post(
  '/api/service-records',
  requireAuth,
  requirePermission('can_execute_service'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const ticketId = Number(req.body?.ticket_id);
      const sourceType = String(req.body?.source_type || '');
      const sourceId = Number(req.body?.source_id);
      const portInput = req.body?.port_number;
      const fusionCount = Math.max(0, Math.round(Number(req.body?.fusion_count || 0)));
      const outSpoolId = req.body?.out_spool_id ? Number(req.body.out_spool_id) : null;
      const outTotalMeter = Math.max(0, Math.round(Number(req.body?.out_total_meter || 0)));
      const inSpoolId = req.body?.in_spool_id ? Number(req.body.in_spool_id) : null;
      const inTotalMeter = Math.max(0, Math.round(Number(req.body?.in_total_meter || 0)));
      const modemSource = String(req.body?.modem_source || 'customer') as 'company' | 'customer';
      const modemBrandId = req.body?.modem_brand_id ? Number(req.body.modem_brand_id) : null;
      const modemSerial = String(req.body?.modem_serial || '').trim();
      const vanStockId = req.body?.van_stock_id ? Number(req.body.van_stock_id) : null;
      const dynamicMaterialsInput = Array.isArray(req.body?.dynamic_materials)
        ? (req.body.dynamic_materials as Array<{ item_id: number; quantity: number }>)
        : [];
      const splitterChangesInput = (req.body?.splitter_changes ?? null) as Partial<SplitterChangesData> | null;
      const notes = String(req.body?.notes || '').trim() || null;
      const imagesInput = Array.isArray(req.body?.images)
        ? (req.body.images as Array<{ image_type: string; file_path: string; caption?: string }>)
        : [];

      if (!Number.isInteger(ticketId) || ticketId <= 0) {
        res.status(400).json({ error: 'شناسه تیکت معتبر نیست.' });
        return;
      }
      if (sourceType !== 'FAT' && sourceType !== 'FFAT') {
        res.status(400).json({ error: 'نوع تجهیزات مبدا باید FAT یا FFAT باشد.' });
        return;
      }
      if (!Number.isInteger(sourceId) || sourceId <= 0) {
        res.status(400).json({ error: 'انتخاب تجهیزات مبدا (FAT یا F-FAT) الزامی است.' });
        return;
      }

      const canCrossUseCable = userHasPermission(user, 'can_cross_use_cable');
      const canSeeAll = userHasPermission(user, 'can_view_all_tickets');

      const result = await db.transaction(async (tx) => {
        const [ticket] = await tx
          .select()
          .from(tblTickets)
          .where(eq(tblTickets.id, ticketId))
          .limit(1);
        if (!ticket) {
          throw new Error('تیکت انتخاب‌شده یافت نشد.');
        }
        if (ticket.status === 'completed') {
          throw new Error('این تیکت قبلاً تکمیل و ثبت شده است.');
        }
        if (!canSeeAll && ticket.assigned_installer && ticket.assigned_installer !== user.id) {
          throw new Error('شما مجاز به تکمیل تیکت نصاب دیگر نیستید.');
        }

        const installerId = ticket.assigned_installer || user.id;
        const ticketType = ticket.type as TicketTypeKey;

        // Validate port number (1..128)
        const portRequired = ticketType !== 'ffat_install';
        const portCheck = validatePortNumber(portInput, portRequired);
        if (!portCheck.ok) throw new Error(portCheck.error);

        // Validate splitter changes for ffat_install
        const splitterCheck = validateSplitterChanges(ticketType, splitterChangesInput);
        if (!splitterCheck.ok) throw new Error(splitterCheck.error);

        // Verify source equipment exists
        if (sourceType === 'FAT') {
          const [fat] = await tx.select().from(tblFats).where(eq(tblFats.id, sourceId)).limit(1);
          if (!fat) throw new Error('باکس FAT انتخاب‌شده در شبکه وجود ندارد.');
        } else {
          const [ffat] = await tx.select().from(tblFfats).where(eq(tblFfats.id, sourceId)).limit(1);
          if (!ffat) throw new Error('باکس F-FAT انتخاب‌شده در شبکه وجود ندارد.');
        }

        // Validate & atomically deduct outdoor spool
        const lowSpoolAlerts: Array<{ spool_code: string; percentRemaining: number }> = [];
        if (outTotalMeter > 0) {
          const spoolRows = outSpoolId
            ? await tx.select().from(tblSpools).where(eq(tblSpools.id, outSpoolId)).limit(1)
            : [];
          const spoolRow = spoolRows[0] as SpoolRecord | undefined;
          const outCheck = validateSpoolConsumption(
            spoolRow,
            'outdoor',
            outTotalMeter,
            installerId,
            canCrossUseCable,
          );
          if (!outCheck.ok) throw new Error(outCheck.error);

          const updatedOut = await tx
            .update(tblSpools)
            .set({ current_length: sql`${tblSpools.current_length} - ${outTotalMeter}` })
            .where(and(eq(tblSpools.id, outSpoolId!), gte(tblSpools.current_length, outTotalMeter)))
            .returning();
          if (!updatedOut[0]) {
            throw new Error('موجودی قرقره فضای باز هنگام تراکنش کافی نبود.');
          }
          const pct = Math.round((updatedOut[0].current_length / updatedOut[0].initial_length) * 100);
          if (pct < 10 || updatedOut[0].current_length <= 0) {
            lowSpoolAlerts.push({ spool_code: updatedOut[0].spool_code, percentRemaining: pct });
          }
        }

        // Validate & atomically deduct indoor spool
        if (inTotalMeter > 0) {
          const spoolRows = inSpoolId
            ? await tx.select().from(tblSpools).where(eq(tblSpools.id, inSpoolId)).limit(1)
            : [];
          const spoolRow = spoolRows[0] as SpoolRecord | undefined;
          const inCheck = validateSpoolConsumption(
            spoolRow,
            'indoor',
            inTotalMeter,
            installerId,
            canCrossUseCable,
          );
          if (!inCheck.ok) throw new Error(inCheck.error);

          const updatedIn = await tx
            .update(tblSpools)
            .set({ current_length: sql`${tblSpools.current_length} - ${inTotalMeter}` })
            .where(and(eq(tblSpools.id, inSpoolId!), gte(tblSpools.current_length, inTotalMeter)))
            .returning();
          if (!updatedIn[0]) {
            throw new Error('موجودی قرقره داخلی هنگام تراکنش کافی نبود.');
          }
          const pct = Math.round((updatedIn[0].current_length / updatedIn[0].initial_length) * 100);
          if (pct < 10 || updatedIn[0].current_length <= 0) {
            lowSpoolAlerts.push({ spool_code: updatedIn[0].spool_code, percentRemaining: pct });
          }
        }

        // Validate & atomically deduct dynamic Van Stock unit materials (ATB, OTO, Pigtails, Adapters, etc.)
        let normalizedMaterials: DynamicMaterialUsageItem[] = [];
        if (dynamicMaterialsInput.length > 0) {
          const allVanUnits = await tx
            .select({
              id: tblVanStock.id,
              user_id: tblVanStock.user_id,
              item_id: tblVanStock.item_id,
              item_name: tblInventoryItems.name,
              item_type: tblInventoryItems.type,
              serial_number: tblVanStock.serial_number,
              quantity: tblVanStock.quantity,
            })
            .from(tblVanStock)
            .innerJoin(tblInventoryItems, eq(tblInventoryItems.id, tblVanStock.item_id))
            .where(eq(tblInventoryItems.type, 'unit'));

          const matCheck = validateDynamicMaterialRows(
            dynamicMaterialsInput,
            allVanUnits as VanStockUnitRecord[],
            installerId,
            canSeeAll,
          );
          if (!matCheck.ok) throw new Error(matCheck.error);
          normalizedMaterials = matCheck.normalized;

          for (const mat of normalizedMaterials) {
            let remainingToDeduct = mat.quantity;
            const candidateRows = allVanUnits
              .filter(
                (v) =>
                  v.item_id === mat.item_id &&
                  v.quantity > 0 &&
                  (v.user_id === installerId || canSeeAll),
              )
              .sort((a, b) => (a.user_id === installerId ? -1 : b.user_id === installerId ? 1 : 0));

            for (const row of candidateRows) {
              if (remainingToDeduct <= 0) break;
              const take = Math.min(remainingToDeduct, row.quantity);
              const [dec] = await tx
                .update(tblVanStock)
                .set({ quantity: sql`${tblVanStock.quantity} - ${take}` })
                .where(and(eq(tblVanStock.id, row.id), gte(tblVanStock.quantity, take)))
                .returning();
              if (!dec) {
                throw new Error(`موجودی «${mat.item_name}» هنگام کسر کافی نبود.`);
              }
              if (dec.quantity <= 0) {
                await tx.delete(tblVanStock).where(eq(tblVanStock.id, dec.id));
              }
              remainingToDeduct -= take;
            }
            if (remainingToDeduct > 0) {
              throw new Error(`موجودی «${mat.item_name}» در انبار خودرو کافی نیست.`);
            }
          }
        }

        // Validate modem brand regex & Van Stock deduction
        const ticketVis = getTicketTypeFieldVisibility(ticketType);
        if (ticketVis.requiresModem || modemSerial) {
          if (modemBrandId) {
            const [brand] = await tx
              .select()
              .from(tblModemBrands)
              .where(eq(tblModemBrands.id, modemBrandId))
              .limit(1);
            if (!brand) throw new Error('برند مودم انتخاب‌شده نامعتبر است.');
            const serialRes = validateModemSerial(modemSerial, brand);
            if (!serialRes.valid) throw new Error(serialRes.reason);
          } else if (ticketVis.requiresModem) {
            throw new Error('انتخاب برند مودم برای این نوع سرویس الزامی است.');
          }

          if (modemSource === 'company') {
            const vanRows = vanStockId
              ? await tx
                  .select({
                    id: tblVanStock.id,
                    user_id: tblVanStock.user_id,
                    item_id: tblVanStock.item_id,
                    item_type: tblInventoryItems.type,
                    serial_number: tblVanStock.serial_number,
                    quantity: tblVanStock.quantity,
                  })
                  .from(tblVanStock)
                  .innerJoin(tblInventoryItems, eq(tblInventoryItems.id, tblVanStock.item_id))
                  .where(eq(tblVanStock.id, vanStockId))
                  .limit(1)
              : [];

            const vanRow = vanRows[0] as VanStockRecord | undefined;
            const vanCheck = validateVanModemConsumption(
              vanRow,
              modemSource,
              modemSerial,
              installerId,
              canSeeAll,
            );
            if (!vanCheck.ok) throw new Error(vanCheck.error);

            const [decVan] = await tx
              .update(tblVanStock)
              .set({ quantity: sql`${tblVanStock.quantity} - 1` })
              .where(and(eq(tblVanStock.id, vanStockId!), gte(tblVanStock.quantity, 1)))
              .returning();
            if (!decVan) throw new Error('موجودی مودم در انبار خودرو کافی نیست.');
            if (decVan.quantity <= 0) {
              await tx.delete(tblVanStock).where(eq(tblVanStock.id, decVan.id));
            }
          }
        }

        // Compute dynamic tariff + fusion cost + promotion bonus + price_snapshot
        const userTariffRows = await tx
          .select({
            template_name: tblTariffTemplates.name,
            rules_json: tblTariffTemplates.rules_json,
            promo_id: tblPromotions.id,
            promo_name: tblPromotions.name,
            promo_target_type: tblPromotions.target_type,
            promo_target_value: tblPromotions.target_value,
            promo_reward_amount: tblPromotions.reward_amount,
            promo_reset_cycle: tblPromotions.reset_cycle,
            promo_start_date: tblPromotions.start_date,
            promo_end_date: tblPromotions.end_date,
            promo_carry_over: tblPromotions.carry_over,
          })
          .from(tblUserTariffs)
          .innerJoin(tblTariffTemplates, eq(tblTariffTemplates.id, tblUserTariffs.template_id))
          .leftJoin(tblPromotions, eq(tblPromotions.id, tblUserTariffs.promotion_id))
          .where(eq(tblUserTariffs.user_id, installerId))
          .limit(1);

        let templateName = 'تعرفه پیش‌فرض';
        let rulesJson: TariffTemplateRulesJson;
        if (userTariffRows[0]) {
          templateName = userTariffRows[0].template_name;
          rulesJson = userTariffRows[0].rules_json;
        } else {
          const [firstTpl] = await tx.select().from(tblTariffTemplates).limit(1);
          if (!firstTpl) throw new Error('هیچ الگوی تعرفه‌ای در سیستم تعریف نشده است.');
          templateName = firstTpl.name;
          rulesJson = firstTpl.rules_json;
        }

        const now = new Date();
        const nowIso = now.toISOString();
        let promoBonus = 0;
        let promoName: string | null = null;

        if (userTariffRows[0]?.promo_id) {
          const promoRule: PromotionRule = {
            id: userTariffRows[0].promo_id,
            name: userTariffRows[0].promo_name!,
            target_type: userTariffRows[0].promo_target_type!,
            target_value: userTariffRows[0].promo_target_value!,
            reward_amount: Number(userTariffRows[0].promo_reward_amount!),
            reset_cycle: userTariffRows[0].promo_reset_cycle! as PromotionRule['reset_cycle'],
            start_date: String(userTariffRows[0].promo_start_date!),
            end_date: String(userTariffRows[0].promo_end_date!),
            carry_over: Boolean(userTariffRows[0].promo_carry_over),
          };

          const priorTickets = await tx
            .select({
              ticket_id: tblTickets.id,
              type: tblTickets.type,
              completed_at: tblTickets.completed_at,
            })
            .from(tblTickets)
            .where(
              and(
                eq(tblTickets.assigned_installer, installerId),
                eq(tblTickets.status, 'completed'),
                isNotNull(tblTickets.completed_at),
              ),
            );

          const priorEvents: CompletedTicketEvent[] = priorTickets.map((pt) => ({
            ticket_id: pt.ticket_id,
            type: pt.type as TicketTypeKey,
            completed_at: new Date(pt.completed_at!).toISOString(),
          }));

          const promoEval = evaluatePromotionForTicket(
            promoRule,
            priorEvents,
            ticketType,
            nowIso,
          );
          if (promoEval.bonusEarned > 0) {
            promoBonus = promoEval.bonusEarned;
            promoName = promoRule.name;
          }
        }

        const priceSnapshot = calculateTemplatePriceSnapshot({
          templateName,
          rulesJson,
          ticketType,
          outMeter: outTotalMeter,
          inMeter: inTotalMeter,
          fusionCount,
          promotionName: promoName,
          promotionBonus: promoBonus,
          computedAt: nowIso,
        });

        const jNow = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const serviceDateJalali = `${jNow.jy}/${String(jNow.jm).padStart(2, '0')}/${String(jNow.jd).padStart(2, '0')}`;

        // Compute V3.0 Customer Invoice Snapshot
        const allInvItemsForPricing = await tx.select().from(tblInventoryItems);
        const invPriceById = new Map(
          allInvItemsForPricing.map((it) => [it.id, Number(it.unit_price || 0)]),
        );
        let modemUnitPrice = 0;
        if (modemSource === 'company' && modemBrandId) {
          const matchingModemItem = allInvItemsForPricing.find(
            (it) => it.type === 'modem' && it.modem_brand_id === modemBrandId,
          );
          modemUnitPrice = matchingModemItem ? Number(matchingModemItem.unit_price || 0) : 0;
        }
        const assignedPkg = ticket.customer_package_id
          ? (
              await tx
                .select()
                .from(tblCustomerPackages)
                .where(eq(tblCustomerPackages.id, ticket.customer_package_id))
                .limit(1)
            )[0]
          : null;
        const pkgRules: CustomerPackageRules = assignedPkg?.rules_json ?? {
          install_fee: 0,
          install_discount_pct: 0,
          modem_price: modemUnitPrice,
          modem_included: modemSource === 'customer',
          free_config: true,
          config_fee: 0,
          free_meter_limit: 0,
          extra_meter_price: 0,
          charge_materials: true,
        };
        const customerInvoiceSnapshot = calculateCustomerInvoiceSnapshot({
          packageId: assignedPkg?.id ?? null,
          packageName: assignedPkg?.name ?? 'تعرفه آزاد (بدون پکیج)',
          rules: pkgRules,
          outMeter: outTotalMeter,
          inMeter: inTotalMeter,
          modemSource,
          modemItemUnitPrice: modemUnitPrice,
          materialsUsed: normalizedMaterials.map((m) => ({
            item_id: m.item_id,
            item_name: m.item_name,
            quantity: m.quantity,
            unit_price: invPriceById.get(m.item_id) ?? 0,
          })),
          computedAt: nowIso,
        });

        const [record] = await tx
          .insert(tblServiceRecords)
          .values({
            ticket_id: ticketId,
            installer_id: installerId,
            source_type: sourceType,
            source_id: sourceId,
            port_number: portCheck.value,
            fusion_count: fusionCount,
            out_spool_id: outTotalMeter > 0 ? outSpoolId : null,
            out_total_meter: outTotalMeter,
            in_spool_id: inTotalMeter > 0 ? inSpoolId : null,
            in_total_meter: inTotalMeter,
            modem_brand_id: modemBrandId,
            modem_serial: modemSerial || null,
            modem_source: modemSource,
            van_stock_id: modemSource === 'company' ? vanStockId : null,
            dynamic_materials: normalizedMaterials,
            splitter_changes: splitterCheck.normalized,
            price_snapshot: priceSnapshot,
            customer_invoice_snapshot: customerInvoiceSnapshot,
            service_date_jalali: serviceDateJalali,
            notes,
          })
          .returning();

        const validImgs = imagesInput.filter(
          (im) => im.file_path && im.file_path.startsWith('/uploads/'),
        );
        if (validImgs.length > 0) {
          await tx.insert(tblServiceImages).values(
            validImgs.map((im) => ({
              record_id: record.id,
              ticket_id: ticketId,
              image_type: String(im.image_type || 'evidence').slice(0, 40),
              file_path: im.file_path,
              caption: im.caption ? String(im.caption).trim().slice(0, 240) : null,
            })),
          );
          await tx.insert(tblImages).values(
            validImgs.map((im) => ({
              entity_type: 'service_record',
              entity_id: record.id,
              image_type: String(im.image_type || 'evidence').slice(0, 40),
              file_path: im.file_path,
              caption: im.caption ? String(im.caption).trim().slice(0, 240) : null,
            })),
          );
        }

        await tx
          .update(tblTickets)
          .set({
            status: 'completed',
            assigned_installer: installerId,
            started_at: ticket.started_at ?? now,
            completed_at: now,
          })
          .where(eq(tblTickets.id, ticketId));

        await tx.insert(tblLedger).values({
          user_id: installerId,
          ticket_id: ticketId,
          ledger_type: 'installer_work',
          amount: priceSnapshot.total_earned.toFixed(2),
          type: 'credit',
          description: `دستمزد تکمیل تیکت #${ticketId} (${priceSnapshot.total_meter} متر کابل${fusionCount > 0 ? `، ${fusionCount} فیوژن` : ''}${promoBonus > 0 ? ' + پاداش کمپین' : ''})`,
        });

        return { record, priceSnapshot, customerInvoiceSnapshot, lowSpoolAlerts };
      });

      await logActivity({
        user,
        actionType: 'service_completed',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `تکمیل عملیات تیکت #${ticketId} و ثبت درآمد ${result.priceSnapshot.total_earned.toLocaleString('en-US')} تومان`,
        details: `مبدا: ${sourceType} #${sourceId} | پورت: ${req.body?.port_number ?? '-'} | فیوژن: ${fusionCount} | مصرف کابل: ${outTotalMeter + inTotalMeter} متر`,
      });

      res.status(201).json(result);
    } catch (err) {
      handleRouteError(res, err, 'خطا در ثبت گزارش عملیات');
    }
  },
);

app.patch(
  '/api/service-records/:ticketId',
  requireAuth,
  requirePermission('can_edit_completed_forms'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const ticketId = Number(req.params.ticketId);
      const sourceType = String(req.body?.source_type || '');
      const sourceId = Number(req.body?.source_id);
      const portInput = req.body?.port_number;
      const fusionCount = Math.max(0, Math.round(Number(req.body?.fusion_count || 0)));
      const outSpoolId = req.body?.out_spool_id ? Number(req.body.out_spool_id) : null;
      const outTotalMeter = Math.max(0, Math.round(Number(req.body?.out_total_meter || 0)));
      const inSpoolId = req.body?.in_spool_id ? Number(req.body.in_spool_id) : null;
      const inTotalMeter = Math.max(0, Math.round(Number(req.body?.in_total_meter || 0)));
      const modemSource = String(req.body?.modem_source || 'customer') as 'company' | 'customer';
      const modemBrandId = req.body?.modem_brand_id ? Number(req.body.modem_brand_id) : null;
      const modemSerial = String(req.body?.modem_serial || '').trim();
      const dynamicMaterialsInput = Array.isArray(req.body?.dynamic_materials)
        ? (req.body.dynamic_materials as Array<{ item_id: number; quantity: number }>)
        : [];
      const splitterChangesInput = (req.body?.splitter_changes ?? null) as Partial<SplitterChangesData> | null;
      const notes = String(req.body?.notes || '').trim() || null;
      const imagesInput = Array.isArray(req.body?.images)
        ? (req.body.images as Array<{ image_type: string; file_path: string; caption?: string }>)
        : null;

      if (!Number.isInteger(ticketId) || ticketId <= 0) {
        res.status(400).json({ error: 'شناسه تیکت معتبر نیست.' });
        return;
      }
      if (sourceType !== 'FAT' && sourceType !== 'FFAT') {
        res.status(400).json({ error: 'نوع تجهیزات مبدا باید FAT یا FFAT باشد.' });
        return;
      }
      if (!Number.isInteger(sourceId) || sourceId <= 0) {
        res.status(400).json({ error: 'انتخاب تجهیزات مبدا الزامی است.' });
        return;
      }

      const canCrossUseCable = userHasPermission(user, 'can_cross_use_cable');
      const canSeeAll = userHasPermission(user, 'can_view_all_tickets');

      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(tblServiceRecords)
          .where(eq(tblServiceRecords.ticket_id, ticketId))
          .limit(1);
        if (!existing) throw new Error('گزارش عملیات تکمیل‌شده برای این تیکت یافت نشد.');

        const [ticket] = await tx
          .select()
          .from(tblTickets)
          .where(eq(tblTickets.id, ticketId))
          .limit(1);
        if (!ticket) throw new Error('تیکت یافت نشد.');

        const oldImages = await tx
          .select()
          .from(tblServiceImages)
          .where(eq(tblServiceImages.record_id, existing.id));

        // 1. Archive immutable history snapshot before editing
        await tx.insert(tblServiceRecordsHistory).values({
          record_id: existing.id,
          old_data: {
            ...existing,
            images: oldImages,
          },
          changed_by: user.id,
        });

        const ticketType = ticket.type as TicketTypeKey;
        const installerId = existing.installer_id;

        const portCheck = validatePortNumber(portInput, ticketType !== 'ffat_install');
        if (!portCheck.ok) throw new Error(portCheck.error);

        const splitterCheck = validateSplitterChanges(ticketType, splitterChangesInput);
        if (!splitterCheck.ok) throw new Error(splitterCheck.error);

        if (sourceType === 'FAT') {
          const [fat] = await tx.select().from(tblFats).where(eq(tblFats.id, sourceId)).limit(1);
          if (!fat) throw new Error('باکس FAT انتخاب‌شده وجود ندارد.');
        } else {
          const [ffat] = await tx.select().from(tblFfats).where(eq(tblFfats.id, sourceId)).limit(1);
          if (!ffat) throw new Error('باکس F-FAT انتخاب‌شده وجود ندارد.');
        }

        // 2. Refund previous spool meters then deduct updated spool meters
        if (existing.out_spool_id && existing.out_total_meter > 0) {
          await tx
            .update(tblSpools)
            .set({ current_length: sql`${tblSpools.current_length} + ${existing.out_total_meter}` })
            .where(eq(tblSpools.id, existing.out_spool_id));
        }
        if (existing.in_spool_id && existing.in_total_meter > 0) {
          await tx
            .update(tblSpools)
            .set({ current_length: sql`${tblSpools.current_length} + ${existing.in_total_meter}` })
            .where(eq(tblSpools.id, existing.in_spool_id));
        }

        const lowSpoolAlerts: Array<{ spool_code: string; percentRemaining: number }> = [];
        if (outTotalMeter > 0) {
          const [spOut] = outSpoolId
            ? await tx.select().from(tblSpools).where(eq(tblSpools.id, outSpoolId)).limit(1)
            : [];
          const outCheck = validateSpoolConsumption(
            spOut as SpoolRecord | undefined,
            'outdoor',
            outTotalMeter,
            installerId,
            canCrossUseCable,
          );
          if (!outCheck.ok) throw new Error(outCheck.error);
          const [updatedOut] = await tx
            .update(tblSpools)
            .set({ current_length: sql`${tblSpools.current_length} - ${outTotalMeter}` })
            .where(and(eq(tblSpools.id, outSpoolId!), gte(tblSpools.current_length, outTotalMeter)))
            .returning();
          if (!updatedOut) throw new Error('موجودی قرقره فضای باز کافی نیست.');
          const pct = Math.round((updatedOut.current_length / updatedOut.initial_length) * 100);
          if (pct < 10) lowSpoolAlerts.push({ spool_code: updatedOut.spool_code, percentRemaining: pct });
        }

        if (inTotalMeter > 0) {
          const [spIn] = inSpoolId
            ? await tx.select().from(tblSpools).where(eq(tblSpools.id, inSpoolId)).limit(1)
            : [];
          const inCheck = validateSpoolConsumption(
            spIn as SpoolRecord | undefined,
            'indoor',
            inTotalMeter,
            installerId,
            canCrossUseCable,
          );
          if (!inCheck.ok) throw new Error(inCheck.error);
          const [updatedIn] = await tx
            .update(tblSpools)
            .set({ current_length: sql`${tblSpools.current_length} - ${inTotalMeter}` })
            .where(and(eq(tblSpools.id, inSpoolId!), gte(tblSpools.current_length, inTotalMeter)))
            .returning();
          if (!updatedIn) throw new Error('موجودی قرقره داخلی کافی نیست.');
          const pct = Math.round((updatedIn.current_length / updatedIn.initial_length) * 100);
          if (pct < 10) lowSpoolAlerts.push({ spool_code: updatedIn.spool_code, percentRemaining: pct });
        }

        // 3. Refund previous dynamic materials back to installer Van Stock then apply updated materials
        const prevMaterials = Array.isArray(existing.dynamic_materials) ? existing.dynamic_materials : [];
        for (const pm of prevMaterials) {
          const [existingStock] = await tx
            .select()
            .from(tblVanStock)
            .where(and(eq(tblVanStock.user_id, installerId), eq(tblVanStock.item_id, pm.item_id)))
            .limit(1);
          if (existingStock) {
            await tx
              .update(tblVanStock)
              .set({ quantity: sql`${tblVanStock.quantity} + ${pm.quantity}` })
              .where(eq(tblVanStock.id, existingStock.id));
          } else {
            await tx.insert(tblVanStock).values({
              user_id: installerId,
              item_id: pm.item_id,
              quantity: pm.quantity,
            });
          }
        }

        let normalizedMaterials: DynamicMaterialUsageItem[] = [];
        if (dynamicMaterialsInput.length > 0) {
          const allVanUnits = await tx
            .select({
              id: tblVanStock.id,
              user_id: tblVanStock.user_id,
              item_id: tblVanStock.item_id,
              item_name: tblInventoryItems.name,
              item_type: tblInventoryItems.type,
              serial_number: tblVanStock.serial_number,
              quantity: tblVanStock.quantity,
            })
            .from(tblVanStock)
            .innerJoin(tblInventoryItems, eq(tblInventoryItems.id, tblVanStock.item_id))
            .where(eq(tblInventoryItems.type, 'unit'));

          const matCheck = validateDynamicMaterialRows(
            dynamicMaterialsInput,
            allVanUnits as VanStockUnitRecord[],
            installerId,
            canSeeAll,
          );
          if (!matCheck.ok) throw new Error(matCheck.error);
          normalizedMaterials = matCheck.normalized;

          for (const mat of normalizedMaterials) {
            let remainingToDeduct = mat.quantity;
            const candidateRows = allVanUnits
              .filter(
                (v) =>
                  v.item_id === mat.item_id &&
                  v.quantity > 0 &&
                  (v.user_id === installerId || canSeeAll),
              )
              .sort((a, b) => (a.user_id === installerId ? -1 : b.user_id === installerId ? 1 : 0));

            for (const row of candidateRows) {
              if (remainingToDeduct <= 0) break;
              const take = Math.min(remainingToDeduct, row.quantity);
              const [dec] = await tx
                .update(tblVanStock)
                .set({ quantity: sql`${tblVanStock.quantity} - ${take}` })
                .where(and(eq(tblVanStock.id, row.id), gte(tblVanStock.quantity, take)))
                .returning();
              if (!dec) throw new Error(`موجودی «${mat.item_name}» کافی نیست.`);
              if (dec.quantity <= 0) {
                await tx.delete(tblVanStock).where(eq(tblVanStock.id, dec.id));
              }
              remainingToDeduct -= take;
            }
            if (remainingToDeduct > 0) throw new Error(`موجودی «${mat.item_name}» کافی نیست.`);
          }
        }

        // 4. Validate modem serial if changed
        const ticketVis = getTicketTypeFieldVisibility(ticketType);
        if ((ticketVis.requiresModem || modemSerial) && modemBrandId) {
          const [brand] = await tx
            .select()
            .from(tblModemBrands)
            .where(eq(tblModemBrands.id, modemBrandId))
            .limit(1);
          if (!brand) throw new Error('برند مودم انتخاب‌شده نامعتبر است.');
          const serialRes = validateModemSerial(modemSerial, brand);
          if (!serialRes.valid) throw new Error(serialRes.reason);
        }

        // 5. Recalculate price snapshot & post immutable ledger adjustment if total changed
        const userTariffRows = await tx
          .select({
            template_name: tblTariffTemplates.name,
            rules_json: tblTariffTemplates.rules_json,
          })
          .from(tblUserTariffs)
          .innerJoin(tblTariffTemplates, eq(tblTariffTemplates.id, tblUserTariffs.template_id))
          .where(eq(tblUserTariffs.user_id, installerId))
          .limit(1);

        let templateName = existing.price_snapshot.template_name;
        let rulesJson: TariffTemplateRulesJson | null = userTariffRows[0]?.rules_json ?? null;
        if (userTariffRows[0]) {
          templateName = userTariffRows[0].template_name;
        } else {
          const [firstTpl] = await tx.select().from(tblTariffTemplates).limit(1);
          if (firstTpl) {
            templateName = firstTpl.name;
            rulesJson = firstTpl.rules_json;
          }
        }

        const effectiveRules: TariffTemplateRulesJson = rulesJson ?? ({
          [ticketType]: {
            calc_type: existing.price_snapshot.calc_type,
            base_price: existing.price_snapshot.base_price,
            meter_limit: existing.price_snapshot.meter_limit,
            extra_meter_price: existing.price_snapshot.extra_meter_price,
            fusion_base_price: existing.price_snapshot.fusion_base_price ?? 0,
            fusion_limit: existing.price_snapshot.fusion_limit ?? 0,
            extra_fusion_price: existing.price_snapshot.extra_fusion_price ?? 0,
          },
        } as TariffTemplateRulesJson);

        const nextSnapshot = calculateTemplatePriceSnapshot({
          templateName,
          rulesJson: effectiveRules,
          ticketType,
          outMeter: outTotalMeter,
          inMeter: inTotalMeter,
          fusionCount,
          promotionName: existing.price_snapshot.promotion_name,
          promotionBonus: existing.price_snapshot.promotion_bonus,
          computedAt: new Date().toISOString(),
        });

        const deltaAmount = Math.round((nextSnapshot.total_earned - existing.price_snapshot.total_earned) * 100) / 100;
        if (deltaAmount !== 0) {
          await tx.insert(tblLedger).values({
            user_id: installerId,
            ticket_id: ticketId,
            ledger_type: 'installer_work',
            amount: Math.abs(deltaAmount).toFixed(2),
            type: deltaAmount > 0 ? 'credit' : 'debit',
            description: `تعدیل مالی پس از ویرایش گزارش تکمیل‌شده تیکت #${ticketId}`,
          });
        }

        // Recompute V3.0 Customer Invoice Snapshot
        const allInvItemsForPricing = await tx.select().from(tblInventoryItems);
        const invPriceById = new Map(
          allInvItemsForPricing.map((it) => [it.id, Number(it.unit_price || 0)]),
        );
        let modemUnitPrice = 0;
        if (modemSource === 'company' && modemBrandId) {
          const matchingModemItem = allInvItemsForPricing.find(
            (it) => it.type === 'modem' && it.modem_brand_id === modemBrandId,
          );
          modemUnitPrice = matchingModemItem ? Number(matchingModemItem.unit_price || 0) : 0;
        }
        const assignedPkg = ticket.customer_package_id
          ? (
              await tx
                .select()
                .from(tblCustomerPackages)
                .where(eq(tblCustomerPackages.id, ticket.customer_package_id))
                .limit(1)
            )[0]
          : null;
        const pkgRules: CustomerPackageRules = assignedPkg?.rules_json ?? {
          install_fee: 0,
          install_discount_pct: 0,
          modem_price: modemUnitPrice,
          modem_included: modemSource === 'customer',
          free_config: true,
          config_fee: 0,
          free_meter_limit: 0,
          extra_meter_price: 0,
          charge_materials: true,
        };
        const nextCustomerInvoice = calculateCustomerInvoiceSnapshot({
          packageId: assignedPkg?.id ?? null,
          packageName: assignedPkg?.name ?? 'تعرفه آزاد (بدون پکیج)',
          rules: pkgRules,
          outMeter: outTotalMeter,
          inMeter: inTotalMeter,
          modemSource,
          modemItemUnitPrice: modemUnitPrice,
          materialsUsed: normalizedMaterials.map((m) => ({
            item_id: m.item_id,
            item_name: m.item_name,
            quantity: m.quantity,
            unit_price: invPriceById.get(m.item_id) ?? 0,
          })),
          computedAt: new Date().toISOString(),
        });

        const [updated] = await tx
          .update(tblServiceRecords)
          .set({
            source_type: sourceType,
            source_id: sourceId,
            port_number: portCheck.value,
            fusion_count: fusionCount,
            out_spool_id: outTotalMeter > 0 ? outSpoolId : null,
            out_total_meter: outTotalMeter,
            in_spool_id: inTotalMeter > 0 ? inSpoolId : null,
            in_total_meter: inTotalMeter,
            modem_brand_id: modemBrandId,
            modem_serial: modemSerial || null,
            modem_source: modemSource,
            dynamic_materials: normalizedMaterials,
            splitter_changes: splitterCheck.normalized,
            price_snapshot: nextSnapshot,
            customer_invoice_snapshot: nextCustomerInvoice,
            notes,
          })
          .where(eq(tblServiceRecords.id, existing.id))
          .returning();

        if (imagesInput) {
          const validImgs = imagesInput.filter(
            (im) => im.file_path && im.file_path.startsWith('/uploads/'),
          );
          await tx.delete(tblServiceImages).where(eq(tblServiceImages.record_id, existing.id));
          await tx
            .delete(tblImages)
            .where(and(eq(tblImages.entity_type, 'service_record'), eq(tblImages.entity_id, existing.id)));
          if (validImgs.length > 0) {
            await tx.insert(tblServiceImages).values(
              validImgs.map((im) => ({
                record_id: existing.id,
                ticket_id: ticketId,
                image_type: String(im.image_type || 'evidence').slice(0, 40),
                file_path: im.file_path,
                caption: im.caption ? String(im.caption).trim().slice(0, 240) : null,
              })),
            );
            await tx.insert(tblImages).values(
              validImgs.map((im) => ({
                entity_type: 'service_record',
                entity_id: existing.id,
                image_type: String(im.image_type || 'evidence').slice(0, 40),
                file_path: im.file_path,
                caption: im.caption ? String(im.caption).trim().slice(0, 240) : null,
              })),
            );
          }
        }

        return { record: updated, priceSnapshot: nextSnapshot, lowSpoolAlerts, deltaAmount };
      });

      await logActivity({
        user,
        actionType: 'service_record_edited',
        entityType: 'ticket',
        entityId: ticketId,
        summary: `ویرایش گزارش تکمیل‌شده تیکت #${ticketId} و ثبت نسخه در تاریخچه`,
        details: `اختلاف مالی: ${result.deltaAmount.toLocaleString('en-US')} تومان`,
      });

      res.json(result);
    } catch (err) {
      handleRouteError(res, err, 'خطا در ویرایش فرم عملیات تکمیل‌شده');
    }
  },
);

// ==========================================
// HARDWARE TOPOLOGY & MODEM BRANDS (FULL CRUD)
// ==========================================

app.get(
  '/api/hardware',
  requireAuth,
  requirePermission('can_manage_hardware', 'can_add_fat', 'can_execute_service'),
  async (_req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const kafs = await db.select().from(tblKafos).orderBy(tblKafos.id);
    const olts = await db
      .select({
        id: tblOlts.id,
        kaf_id: tblOlts.kaf_id,
        kaf_name: tblKafos.name,
        name: tblOlts.name,
      })
      .from(tblOlts)
      .innerJoin(tblKafos, eq(tblKafos.id, tblOlts.kaf_id))
      .orderBy(tblOlts.id);
    const fats = await db
      .select({
        id: tblFats.id,
        olt_id: tblFats.olt_id,
        olt_name: tblOlts.name,
        kaf_id: tblOlts.kaf_id,
        fat_number: tblFats.fat_number,
      })
      .from(tblFats)
      .innerJoin(tblOlts, eq(tblOlts.id, tblFats.olt_id))
      .orderBy(tblFats.fat_number);
    const ffats = await db
      .select({
        id: tblFfats.id,
        fat_id: tblFfats.fat_id,
        fat_number: tblFats.fat_number,
        olt_id: tblFats.olt_id,
        ffat_code: tblFfats.ffat_code,
      })
      .from(tblFfats)
      .innerJoin(tblFats, eq(tblFats.id, tblFfats.fat_id))
      .orderBy(tblFfats.id);
    const modemBrands = await db.select().from(tblModemBrands).orderBy(tblModemBrands.id);

    res.json({ kafs, olts, fats, ffats, modemBrands });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت توپولوژی شبکه');
  }
});

app.post(
  '/api/hardware/kafs',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) throw new Error('نام کافو الزامی است.');
      const [kaf] = await db.insert(tblKafos).values({ name }).returning();
      res.status(201).json({ kaf });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/hardware/kafs/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const name = String(req.body?.name || '').trim();
      if (!name) throw new Error('نام کافو الزامی است.');
      const [kaf] = await db.update(tblKafos).set({ name }).where(eq(tblKafos.id, id)).returning();
      if (!kaf) {
        res.status(404).json({ error: 'کافو یافت نشد.' });
        return;
      }
      res.json({ kaf });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/hardware/kafs/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [childOlt] = await db.select().from(tblOlts).where(eq(tblOlts.kaf_id, id)).limit(1);
      if (childOlt) {
        res.status(409).json({ error: 'این کافو دارای OLT متصل است و ابتدا باید OLTهای آن حذف شوند.' });
        return;
      }
      const [deleted] = await db.delete(tblKafos).where(eq(tblKafos.id, id)).returning();
      if (!deleted) {
        res.status(404).json({ error: 'کافو یافت نشد.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/hardware/olts',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const kaf_id = Number(req.body?.kaf_id);
      const name = String(req.body?.name || '').trim();
      if (!kaf_id || !name) throw new Error('انتخاب کافو و نام OLT الزامی است.');
      const [olt] = await db.insert(tblOlts).values({ kaf_id, name }).returning();
      res.status(201).json({ olt });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/hardware/olts/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const kaf_id = Number(req.body?.kaf_id);
      const name = String(req.body?.name || '').trim();
      if (!kaf_id || !name) throw new Error('انتخاب کافو و نام OLT الزامی است.');
      const [olt] = await db
        .update(tblOlts)
        .set({ kaf_id, name })
        .where(eq(tblOlts.id, id))
        .returning();
      if (!olt) {
        res.status(404).json({ error: 'OLT یافت نشد.' });
        return;
      }
      res.json({ olt });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/hardware/olts/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [childFat] = await db.select().from(tblFats).where(eq(tblFats.olt_id, id)).limit(1);
      if (childFat) {
        res.status(409).json({ error: 'این OLT دارای باکس FAT متصل است و قابل حذف نیست.' });
        return;
      }
      const [deleted] = await db.delete(tblOlts).where(eq(tblOlts.id, id)).returning();
      if (!deleted) {
        res.status(404).json({ error: 'OLT یافت نشد.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/hardware/fats',
  requireAuth,
  requirePermission('can_manage_hardware', 'can_add_fat'),
  async (req: AuthRequest, res: Response) => {
    try {
      const olt_id = Number(req.body?.olt_id);
      const fat_number = Number(req.body?.fat_number);
      if (!olt_id || !Number.isInteger(fat_number) || fat_number <= 0) {
        throw new Error('انتخاب OLT و شماره صحیح FAT الزامی است.');
      }
      const [fat] = await db.insert(tblFats).values({ olt_id, fat_number }).returning();
      res.status(201).json({ fat });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/hardware/fats/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const olt_id = Number(req.body?.olt_id);
      const fat_number = Number(req.body?.fat_number);
      if (!olt_id || !Number.isInteger(fat_number) || fat_number <= 0) {
        throw new Error('انتخاب OLT و شماره صحیح FAT الزامی است.');
      }
      const [fat] = await db
        .update(tblFats)
        .set({ olt_id, fat_number })
        .where(eq(tblFats.id, id))
        .returning();
      if (!fat) {
        res.status(404).json({ error: 'FAT یافت نشد.' });
        return;
      }
      res.json({ fat });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/hardware/fats/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [childFfat] = await db.select().from(tblFfats).where(eq(tblFfats.fat_id, id)).limit(1);
      if (childFfat) {
        res.status(409).json({ error: 'این FAT دارای F-FAT زیرمجموعه است و ابتدا باید F-FATها حذف شوند.' });
        return;
      }
      const [usedRec] = await db
        .select({ id: tblServiceRecords.id })
        .from(tblServiceRecords)
        .where(and(eq(tblServiceRecords.source_type, 'FAT'), eq(tblServiceRecords.source_id, id)))
        .limit(1);
      if (usedRec) {
        res.status(409).json({ error: 'این FAT در گزارش‌های عملیات ثبت شده و قابل حذف نیست.' });
        return;
      }
      const [deleted] = await db.delete(tblFats).where(eq(tblFats.id, id)).returning();
      if (!deleted) {
        res.status(404).json({ error: 'FAT یافت نشد.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/hardware/ffats',
  requireAuth,
  requirePermission('can_manage_hardware', 'can_add_fat'),
  async (req: AuthRequest, res: Response) => {
    try {
      const fat_id = Number(req.body?.fat_id);
      const suffix = String(req.body?.suffix || '').trim();
      const [fat] = await db.select().from(tblFats).where(eq(tblFats.id, fat_id)).limit(1);
      if (!fat) throw new Error('FAT والد یافت نشد.');
      const ffat_code = generateFFatCode(fat.fat_number, suffix);
      const [ffat] = await db.insert(tblFfats).values({ fat_id, ffat_code }).returning();
      res.status(201).json({ ffat });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/hardware/ffats/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const fat_id = Number(req.body?.fat_id);
      const suffix = String(req.body?.suffix || '').trim();
      const [fat] = await db.select().from(tblFats).where(eq(tblFats.id, fat_id)).limit(1);
      if (!fat) throw new Error('FAT والد یافت نشد.');
      const ffat_code = generateFFatCode(fat.fat_number, suffix);
      const [ffat] = await db
        .update(tblFfats)
        .set({ fat_id, ffat_code })
        .where(eq(tblFfats.id, id))
        .returning();
      if (!ffat) {
        res.status(404).json({ error: 'F-FAT یافت نشد.' });
        return;
      }
      res.json({ ffat });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/hardware/ffats/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [usedRec] = await db
        .select({ id: tblServiceRecords.id })
        .from(tblServiceRecords)
        .where(and(eq(tblServiceRecords.source_type, 'FFAT'), eq(tblServiceRecords.source_id, id)))
        .limit(1);
      if (usedRec) {
        res.status(409).json({ error: 'این F-FAT در گزارش‌های عملیات استفاده شده و قابل حذف نیست.' });
        return;
      }
      const [deleted] = await db.delete(tblFfats).where(eq(tblFfats.id, id)).returning();
      if (!deleted) {
        res.status(404).json({ error: 'F-FAT یافت نشد.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/hardware/modem-brands',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      const serial_prefix = String(req.body?.serial_prefix || '').trim();
      const serial_pattern = String(req.body?.serial_pattern || '').trim();
      if (!name || !serial_pattern) {
        throw new Error('نام برند و الگوی Regex الزامی است.');
      }
      new RegExp(serial_pattern);
      const [brand] = await db
        .insert(tblModemBrands)
        .values({ name, serial_prefix, serial_pattern })
        .returning();
      res.status(201).json({ brand });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/hardware/modem-brands/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const name = String(req.body?.name || '').trim();
      const serial_prefix = String(req.body?.serial_prefix || '').trim();
      const serial_pattern = String(req.body?.serial_pattern || '').trim();
      if (!name || !serial_pattern) {
        throw new Error('نام برند و الگوی Regex الزامی است.');
      }
      new RegExp(serial_pattern);
      const [brand] = await db
        .update(tblModemBrands)
        .set({ name, serial_prefix, serial_pattern })
        .where(eq(tblModemBrands.id, id))
        .returning();
      if (!brand) {
        res.status(404).json({ error: 'برند مودم یافت نشد.' });
        return;
      }
      res.json({ brand });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/hardware/modem-brands/:id',
  requireAuth,
  requirePermission('can_manage_hardware'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [usedInv] = await db
        .select({ id: tblInventoryItems.id })
        .from(tblInventoryItems)
        .where(eq(tblInventoryItems.modem_brand_id, id))
        .limit(1);
      const [usedRec] = await db
        .select({ id: tblServiceRecords.id })
        .from(tblServiceRecords)
        .where(eq(tblServiceRecords.modem_brand_id, id))
        .limit(1);
      if (usedInv || usedRec) {
        res.status(409).json({ error: 'این برند مودم در انبار یا گزارش‌های عملیات استفاده شده و قابل حذف نیست.' });
        return;
      }
      const [deleted] = await db.delete(tblModemBrands).where(eq(tblModemBrands.id, id)).returning();
      if (!deleted) {
        res.status(404).json({ error: 'برند مودم یافت نشد.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// ==========================================
// INVENTORY, SPOOLS & VAN STOCK
// ==========================================

app.get(
  '/api/inventory',
  requireAuth,
  requirePermission('can_manage_inventory', 'can_execute_service'),
  async (_req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const spools = await db
      .select({
        id: tblSpools.id,
        item_id: tblSpools.item_id,
        spool_code: tblSpools.spool_code,
        cable_type: tblSpools.cable_type,
        initial_length: tblSpools.initial_length,
        current_length: tblSpools.current_length,
        assigned_installer_id: tblSpools.assigned_installer_id,
        installer_name: tblUsers.full_name,
      })
      .from(tblSpools)
      .leftJoin(tblUsers, eq(tblUsers.id, tblSpools.assigned_installer_id))
      .orderBy(tblSpools.id);

    const rawItems = await db
      .select({
        id: tblInventoryItems.id,
        name: tblInventoryItems.name,
        type: tblInventoryItems.type,
        modem_brand_id: tblInventoryItems.modem_brand_id,
        brand_name: tblModemBrands.name,
        unit_price: tblInventoryItems.unit_price,
        total_quantity: tblInventoryItems.total_quantity,
      })
      .from(tblInventoryItems)
      .leftJoin(tblModemBrands, eq(tblModemBrands.id, tblInventoryItems.modem_brand_id))
      .orderBy(tblInventoryItems.id);

    const vanStock = await db
      .select({
        id: tblVanStock.id,
        user_id: tblVanStock.user_id,
        item_id: tblVanStock.item_id,
        item_name: tblInventoryItems.name,
        item_type: tblInventoryItems.type,
        modem_brand_id: tblInventoryItems.modem_brand_id,
        brand_name: tblModemBrands.name,
        serial_prefix: tblModemBrands.serial_prefix,
        serial_pattern: tblModemBrands.serial_pattern,
        serial_number: tblVanStock.serial_number,
        quantity: tblVanStock.quantity,
        installer_name: tblUsers.full_name,
        created_at: tblVanStock.created_at,
      })
      .from(tblVanStock)
      .innerJoin(tblInventoryItems, eq(tblInventoryItems.id, tblVanStock.item_id))
      .innerJoin(tblUsers, eq(tblUsers.id, tblVanStock.user_id))
      .leftJoin(tblModemBrands, eq(tblModemBrands.id, tblInventoryItems.modem_brand_id))
      .orderBy(desc(tblVanStock.id));

    const vanCountByItem = new Map<number, number>();
    for (const v of vanStock) {
      vanCountByItem.set(v.item_id, (vanCountByItem.get(v.item_id) || 0) + v.quantity);
    }

    const items = rawItems.map((it) => ({
      ...it,
      unit_price: Number(it.unit_price || 0),
      van_allocated_quantity: vanCountByItem.get(it.id) || 0,
    }));

    const installers = await db
      .select({ id: tblUsers.id, full_name: tblUsers.full_name })
      .from(tblUsers)
      .where(eq(tblUsers.is_active, true));

    const serviceConsumption = await db
      .select({
        installer_id: tblServiceRecords.installer_id,
        installer_name: tblUsers.full_name,
        out_spool_id: tblServiceRecords.out_spool_id,
        out_total_meter: tblServiceRecords.out_total_meter,
        in_spool_id: tblServiceRecords.in_spool_id,
        in_total_meter: tblServiceRecords.in_total_meter,
        created_at: tblServiceRecords.created_at,
      })
      .from(tblServiceRecords)
      .leftJoin(tblUsers, eq(tblUsers.id, tblServiceRecords.installer_id))
      .orderBy(desc(tblServiceRecords.created_at));

    const spoolAdjustLogs = await db
      .select({
        entity_id: tblActivityLogs.entity_id,
        user_id: tblActivityLogs.user_id,
        summary: tblActivityLogs.summary,
        created_at: tblActivityLogs.created_at,
      })
      .from(tblActivityLogs)
      .where(
        and(
          eq(tblActivityLogs.entity_type, 'spool'),
          eq(tblActivityLogs.action_type, 'inventory_adjusted'),
        ),
      )
      .orderBy(desc(tblActivityLogs.created_at));

    const spoolById = new Map(spools.map((sp) => [sp.id, sp]));
    const manualConsumption = spoolAdjustLogs.flatMap((log) => {
      if (!log.entity_id) return [];
      const sp = spoolById.get(log.entity_id);
      if (!sp) return [];
      const match = /کسر\s+(\d+)\s+متر/.exec(log.summary);
      const meters = match ? Number(match[1]) : 0;
      if (meters <= 0) return [];
      const installerId = sp.assigned_installer_id ?? log.user_id ?? 0;
      return [
        {
          installer_id: installerId,
          installer_name: sp.installer_name ?? null,
          out_spool_id: sp.cable_type === 'outdoor' ? sp.id : null,
          out_total_meter: sp.cable_type === 'outdoor' ? meters : 0,
          in_spool_id: sp.cable_type === 'indoor' ? sp.id : null,
          in_total_meter: sp.cable_type === 'indoor' ? meters : 0,
          created_at: log.created_at,
        },
      ];
    });

    const consumptionHistory = [...serviceConsumption, ...manualConsumption];

    res.json({ spools, items, vanStock, installers, consumptionHistory });
  } catch (err) {
    handleRouteError(res, err, 'خطا در دریافت موجودی انبار');
  }
});

app.post(
  '/api/spools',
  requireAuth,
  requirePermission('can_manage_inventory'),
  async (req: AuthRequest, res: Response) => {
    try {
      const spool_code = String(req.body?.spool_code || '').trim().toUpperCase();
      const cable_type = req.body?.cable_type === 'indoor' ? 'indoor' : 'outdoor';
      const initial_length = Math.max(1, Math.round(Number(req.body?.initial_length || 1000)));
      const assigned_installer_id = req.body?.assigned_installer_id
        ? Number(req.body.assigned_installer_id)
        : null;
      if (!spool_code) throw new Error('کد قرقره الزامی است.');

      const [spool] = await db
        .insert(tblSpools)
        .values({
          spool_code,
          cable_type,
          initial_length,
          current_length: initial_length,
          assigned_installer_id,
        })
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'spool_created',
        entityType: 'spool',
        entityId: spool.id,
        summary: `ثبت قرقره جدید ${spool_code} (${initial_length} متر)`,
      });

      res.status(201).json({ spool });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/spools/transfer',
  requireAuth,
  requirePermission('can_manage_inventory'),
  async (req: AuthRequest, res: Response) => {
    try {
      const spoolId = Number(req.body?.spool_id);
      const installerId = req.body?.installer_id ? Number(req.body.installer_id) : null;
      const [updated] = await db
        .update(tblSpools)
        .set({ assigned_installer_id: installerId })
        .where(eq(tblSpools.id, spoolId))
        .returning();
      if (!updated) throw new Error('قرقره یافت نشد.');

      await logActivity({
        user: req.authUser,
        actionType: 'spool_transferred',
        entityType: 'spool',
        entityId: spoolId,
        summary: `تحویل قرقره ${updated.spool_code} به انبار خودرو`,
      });

      res.json({ spool: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/spools/consume',
  requireAuth,
  requirePermission('can_manage_inventory', 'can_execute_service'),
  async (req: AuthRequest, res: Response) => {
    try {
      const spoolId = Number(req.body?.spool_id);
      const meters = Math.max(1, Math.round(Number(req.body?.meters || 0)));
      const [updated] = await db
        .update(tblSpools)
        .set({ current_length: sql`${tblSpools.current_length} - ${meters}` })
        .where(and(eq(tblSpools.id, spoolId), gte(tblSpools.current_length, meters)))
        .returning();
      if (!updated) {
        res.status(400).json({ error: 'متراژ باقی‌مانده قرقره کافی نیست.' });
        return;
      }

      await logActivity({
        user: req.authUser,
        actionType: 'inventory_adjusted',
        entityType: 'spool',
        entityId: spoolId,
        summary: `کسر ${meters} متر از قرقره ${updated.spool_code}`,
        details: `باقیمانده جدید: ${updated.current_length} متر`,
      });

      res.json({ spool: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/inventory/transfer-to-van',
  requireAuth,
  requirePermission('can_manage_inventory'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = Number(req.body?.user_id);
      const itemId = Number(req.body?.item_id);
      const quantity = Math.max(1, Math.round(Number(req.body?.quantity || 1)));
      const serialNumber = String(req.body?.serial_number || '').trim() || null;

      if (!userId || !itemId) throw new Error('انتخاب نصاب و کالا الزامی است.');

      const vanItem = await db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(tblInventoryItems)
          .where(eq(tblInventoryItems.id, itemId))
          .limit(1);
        if (!item) throw new Error('کالا یافت نشد.');
        if (item.type === 'modem') {
          if (!serialNumber) throw new Error('برای انتقال مودم به خودرو، ورود شماره سریال الزامی است.');
          if (item.modem_brand_id) {
            const [brand] = await tx
              .select()
              .from(tblModemBrands)
              .where(eq(tblModemBrands.id, item.modem_brand_id))
              .limit(1);
            if (brand) {
              const check = validateModemSerial(serialNumber, brand);
              if (!check.valid) throw new Error(check.reason);
            }
          }
        }

        const effectiveQty = item.type === 'modem' ? 1 : quantity;
        const [dec] = await tx
          .update(tblInventoryItems)
          .set({ total_quantity: sql`${tblInventoryItems.total_quantity} - ${effectiveQty}` })
          .where(and(eq(tblInventoryItems.id, itemId), gte(tblInventoryItems.total_quantity, effectiveQty)))
          .returning();
        if (!dec) throw new Error('موجودی انبار مرکزی کافی نیست.');

        const [inserted] = await tx
          .insert(tblVanStock)
          .values({
            user_id: userId,
            item_id: itemId,
            serial_number: serialNumber,
            quantity: effectiveQty,
          })
          .returning();
        return inserted;
      });

      await logActivity({
        user: req.authUser,
        actionType: 'van_stock_transferred',
        entityType: 'inventory',
        entityId: itemId,
        summary: `تحویل تجهیزات به انبار خودرو نصاب`,
        details: serialNumber ? `سریال: ${serialNumber}` : `تعداد: ${quantity}`,
      });

      res.status(201).json({ vanItem });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/inventory/items',
  requireAuth,
  requirePermission('can_manage_inventory'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      const type = String(req.body?.type || 'unit');
      const modem_brand_id =
        type === 'modem' && req.body?.modem_brand_id ? Number(req.body.modem_brand_id) : null;
      const unit_price = Math.max(0, Number(req.body?.unit_price || 0));
      const total_quantity = Math.max(0, Math.round(Number(req.body?.total_quantity || 0)));

      if (!name) throw new Error('نام کالا الزامی است.');
      if (type !== 'unit' && type !== 'spool' && type !== 'modem') {
        throw new Error('نوع کالا باید مصرفی (unit)، قرقره (spool) یا مودم (modem) باشد.');
      }

      const [created] = await db
        .insert(tblInventoryItems)
        .values({
          name,
          type,
          modem_brand_id,
          unit_price: unit_price.toFixed(2),
          total_quantity,
        })
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'inventory_item_created',
        entityType: 'inventory',
        entityId: created.id,
        summary: `افزودن قلم کالای جدید «${name}» (${total_quantity} عدد)`,
      });

      res.status(201).json({
        item: { ...created, unit_price: Number(created.unit_price || 0) },
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/inventory/items/:id',
  requireAuth,
  requirePermission('can_manage_inventory'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates: Partial<typeof tblInventoryItems.$inferInsert> = {};
      if (typeof req.body?.name === 'string') {
        const name = req.body.name.trim();
        if (!name) throw new Error('نام کالا نمی‌تواند خالی باشد.');
        updates.name = name;
      }
      if (req.body?.type === 'unit' || req.body?.type === 'spool' || req.body?.type === 'modem') {
        updates.type = req.body.type;
      }
      if (req.body?.modem_brand_id !== undefined) {
        updates.modem_brand_id = req.body.modem_brand_id ? Number(req.body.modem_brand_id) : null;
      }
      if (req.body?.unit_price !== undefined) {
        updates.unit_price = Math.max(0, Number(req.body.unit_price || 0)).toFixed(2);
      }
      if (req.body?.total_quantity !== undefined) {
        updates.total_quantity = Math.max(0, Math.round(Number(req.body.total_quantity || 0)));
      }

      const [updated] = await db
        .update(tblInventoryItems)
        .set(updates)
        .where(eq(tblInventoryItems.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: 'کالای انبار یافت نشد.' });
        return;
      }

      await logActivity({
        user: req.authUser,
        actionType: 'inventory_item_updated',
        entityType: 'inventory',
        entityId: id,
        summary: `ویرایش کالای انبار «${updated.name}»`,
      });

      res.json({ item: { ...updated, unit_price: Number(updated.unit_price || 0) } });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/inventory/items/:id',
  requireAuth,
  requirePermission('can_manage_inventory'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [vanRef] = await db
        .select({ id: tblVanStock.id })
        .from(tblVanStock)
        .where(eq(tblVanStock.item_id, id))
        .limit(1);
      if (vanRef) {
        res.status(409).json({ error: 'این کالا در انبار خودروی نصابان تخصیص دارد و قابل حذف نیست.' });
        return;
      }
      const [spoolRef] = await db
        .select({ id: tblSpools.id })
        .from(tblSpools)
        .where(eq(tblSpools.item_id, id))
        .limit(1);
      if (spoolRef) {
        res.status(409).json({ error: 'این کالا به قرقره‌های ثبت‌شده متصل است و قابل حذف نیست.' });
        return;
      }
      const [deleted] = await db
        .delete(tblInventoryItems)
        .where(eq(tblInventoryItems.id, id))
        .returning();
      if (!deleted) {
        res.status(404).json({ error: 'کالا یافت نشد.' });
        return;
      }
      await logActivity({
        user: req.authUser,
        actionType: 'inventory_item_deleted',
        entityType: 'inventory',
        entityId: id,
        summary: `حذف کالای انبار «${deleted.name}»`,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// ==========================================
// FINANCIALS, PACKAGES, TARIFF TEMPLATES, PROMOTIONS & DUAL LEDGER
// ==========================================

app.get(
  '/api/financial',
  requireAuth,
  requirePermission('can_view_financials', 'can_manage_tariffs', 'can_execute_service'),
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureSeeded();
      const user = req.authUser!;
      const canSeeAll = userHasPermission(user, 'can_view_financials', 'can_manage_tariffs');

      const templates = canSeeAll
        ? await db.select().from(tblTariffTemplates).orderBy(tblTariffTemplates.id)
        : [];
      const rawPromos = await db.select().from(tblPromotions).orderBy(tblPromotions.id);
      const promotions = rawPromos.map((p) => ({
        ...p,
        reward_amount: Number(p.reward_amount),
        start_date: String(p.start_date),
        end_date: String(p.end_date),
      }));

      const allUserTariffs = await db
        .select({
          user_id: tblUserTariffs.user_id,
          username: tblUsers.username,
          full_name: tblUsers.full_name,
          template_id: tblUserTariffs.template_id,
          template_name: tblTariffTemplates.name,
          promotion_id: tblUserTariffs.promotion_id,
          promotion_name: tblPromotions.name,
        })
        .from(tblUserTariffs)
        .innerJoin(tblUsers, eq(tblUsers.id, tblUserTariffs.user_id))
        .innerJoin(tblTariffTemplates, eq(tblTariffTemplates.id, tblUserTariffs.template_id))
        .leftJoin(tblPromotions, eq(tblPromotions.id, tblUserTariffs.promotion_id));
      const userTariffs = canSeeAll
        ? allUserTariffs
        : allUserTariffs.filter((ut) => ut.user_id === user.id);

      const ledgerFilter = canSeeAll ? undefined : eq(tblLedger.user_id, user.id);
      const ledgerRows = await db
        .select({
          id: tblLedger.id,
          user_id: tblLedger.user_id,
          user_full_name: tblUsers.full_name,
          ledger_type: tblLedger.ledger_type,
          customer_name: tblLedger.customer_name,
          ticket_id: tblLedger.ticket_id,
          amount: tblLedger.amount,
          type: tblLedger.type,
          description: tblLedger.description,
          bank_name: tblLedger.bank_name,
          tracking_code: tblLedger.tracking_code,
          target_account: tblLedger.target_account,
          source_account: tblLedger.source_account,
          paid_at: tblLedger.paid_at,
          receipt_image: tblLedger.receipt_image,
          created_at: tblLedger.created_at,
        })
        .from(tblLedger)
        .leftJoin(tblUsers, eq(tblUsers.id, tblLedger.user_id))
        .where(ledgerFilter)
        .orderBy(desc(tblLedger.created_at), desc(tblLedger.id));

      const normalizedLedger = ledgerRows.map((l) => ({
        ...l,
        amount: Number(l.amount),
        type: l.type as 'credit' | 'debit',
        ledger_type: (l.ledger_type || 'installer_work') as
          | 'installer_work'
          | 'installer_payout'
          | 'customer_payment',
      }));

      const packages = canSeeAll
        ? await db.select().from(tblCustomerPackages).orderBy(tblCustomerPackages.id)
        : [];

      const users = await db
        .select({ id: tblUsers.id, username: tblUsers.username, full_name: tblUsers.full_name })
        .from(tblUsers)
        .where(eq(tblUsers.is_active, true));

      const completedAll = await db
        .select({
          ticket_id: tblTickets.id,
          type: tblTickets.type,
          assigned_installer: tblTickets.assigned_installer,
          completed_at: tblTickets.completed_at,
        })
        .from(tblTickets)
        .where(and(eq(tblTickets.status, 'completed'), isNotNull(tblTickets.completed_at)));

      const nowIso = new Date().toISOString();
      const targetUsers = canSeeAll ? users : users.filter((u) => u.id === user.id);

      const contractorSummaries = targetUsers.map((u) => {
        const userEntries = normalizedLedger.filter(
          (l) => l.user_id === u.id && l.ledger_type !== 'customer_payment',
        );
        const bal = computeLedgerBalance(userEntries);
        const assigned = userTariffs.find((ut) => ut.user_id === u.id);
        const promo = assigned?.promotion_id
          ? promotions.find((p) => p.id === assigned.promotion_id)
          : undefined;

        let promotionProgress = null;
        if (promo) {
          const events: CompletedTicketEvent[] = completedAll
            .filter((t) => t.assigned_installer === u.id)
            .map((t) => ({
              ticket_id: t.ticket_id,
              type: t.type as TicketTypeKey,
              completed_at: new Date(t.completed_at!).toISOString(),
            }));
          const evalRes = evaluatePromotionForTicket(
            { ...promo, reset_cycle: promo.reset_cycle as PromotionRule['reset_cycle'] },
            events,
            'internet_install',
            nowIso,
          );
          const currentInCycle = Math.max(0, evalRes.cycleCountAfterThis - 1);
          promotionProgress = {
            promotion_name: promo.name,
            cycle_count: currentInCycle,
            target_value: promo.target_value,
            progress_percent: Math.min(100, Math.round((currentInCycle / promo.target_value) * 100)),
            reward_amount: promo.reward_amount,
            carried_over: evalRes.carriedOverCount,
          };
        }

        return {
          user_id: u.id,
          username: u.username,
          full_name: u.full_name,
          ...bal,
          promotionProgress,
        };
      });

      res.json({
        templates,
        promotions,
        packages,
        userTariffs,
        ledger: normalizedLedger,
        contractorSummaries,
        users,
      });
    } catch (err) {
      handleRouteError(res, err, 'خطا در دریافت اطلاعات مالی');
    }
  },
);

app.post(
  '/api/financial/templates',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.body?.id ? Number(req.body.id) : null;
      const name = String(req.body?.name || '').trim();
      const rules_json = req.body?.rules_json as TariffTemplateRulesJson;
      if (!name || !rules_json) throw new Error('نام الگو و قوانین ۵گانه الزامی است.');

      if (id) {
        const [updated] = await db
          .update(tblTariffTemplates)
          .set({ name, rules_json })
          .where(eq(tblTariffTemplates.id, id))
          .returning();
        await logActivity({
          user: req.authUser,
          actionType: 'tariff_updated',
          entityType: 'tariff',
          entityId: id,
          summary: `بروزرسانی الگوی تعرفه «${name}»`,
        });
        res.json({ template: updated });
      } else {
        const [created] = await db
          .insert(tblTariffTemplates)
          .values({ name, rules_json })
          .returning();
        await logActivity({
          user: req.authUser,
          actionType: 'tariff_created',
          entityType: 'tariff',
          entityId: created.id,
          summary: `ایجاد الگوی تعرفه جدید «${name}»`,
        });
        res.status(201).json({ template: created });
      }
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/financial/promotions',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      const target_type = String(req.body?.target_type || 'installs');
      const target_value = Math.max(1, Math.round(Number(req.body?.target_value || 10)));
      const reward_amount = Math.max(0, Number(req.body?.reward_amount || 0));
      const reset_cycle = String(req.body?.reset_cycle || 'monthly');
      const start_date = String(req.body?.start_date || '').trim();
      const end_date = String(req.body?.end_date || '').trim();
      const carry_over = Boolean(req.body?.carry_over);

      if (!name || !start_date || !end_date) {
        throw new Error('عنوان کمپین، تاریخ شروع و تاریخ پایان الزامی است.');
      }

      const [promo] = await db
        .insert(tblPromotions)
        .values({
          name,
          target_type,
          target_value,
          reward_amount: reward_amount.toFixed(2),
          reset_cycle,
          start_date,
          end_date,
          carry_over,
        })
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'promotion_created',
        entityType: 'promotion',
        entityId: promo.id,
        summary: `تعریف کمپین پاداش «${name}» (هدف ${target_value} مورد)`,
      });

      res.status(201).json({ promotion: promo });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/financial/assign-tariff',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user_id = Number(req.body?.user_id);
      const template_id = Number(req.body?.template_id);
      const promotion_id = req.body?.promotion_id ? Number(req.body.promotion_id) : null;
      if (!user_id || !template_id) throw new Error('انتخاب نصاب و الگوی تعرفه الزامی است.');

      await db
        .insert(tblUserTariffs)
        .values({ user_id, template_id, promotion_id })
        .onConflictDoUpdate({
          target: tblUserTariffs.user_id,
          set: { template_id, promotion_id },
        });

      await logActivity({
        user: req.authUser,
        actionType: 'user_tariff_assigned',
        entityType: 'financial',
        entityId: user_id,
        summary: `تخصیص الگوی تعرفه و کمپین به نصاب #${user_id}`,
      });

      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/financial/payouts',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const user_id = Number(req.body?.user_id);
      const amount = Number(req.body?.amount || 0);
      const description = String(req.body?.description || 'تسویه حساب پیمانکار').trim();
      const bank_name = String(req.body?.bank_name || '').trim() || null;
      const tracking_code = String(req.body?.tracking_code || '').trim() || null;
      const target_account = String(req.body?.target_account || '').trim() || null;
      const source_account = String(req.body?.source_account || '').trim() || null;
      const paidAtRaw = String(req.body?.paid_at || '').trim();
      const paid_at = paidAtRaw && !Number.isNaN(new Date(paidAtRaw).getTime()) ? new Date(paidAtRaw) : new Date();
      const receiptRaw = String(req.body?.receipt_image || '').trim();
      const receipt_image = receiptRaw.startsWith('/uploads/') ? receiptRaw : null;

      if (!user_id || amount <= 0) throw new Error('انتخاب نصاب و مبلغ معتبر الزامی است.');

      const entry = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(tblLedger)
          .values({
            user_id,
            ticket_id: null,
            ledger_type: 'installer_payout',
            amount: amount.toFixed(2),
            type: 'debit',
            description,
            bank_name,
            tracking_code,
            target_account,
            source_account,
            paid_at,
            receipt_image,
          })
          .returning();

        if (receipt_image) {
          await tx.insert(tblImages).values({
            entity_type: 'ledger_receipt',
            entity_id: inserted.id,
            image_type: 'bank_receipt',
            file_path: receipt_image,
            caption: tracking_code ? `رسید بانکی کد پیگیری ${tracking_code}` : 'رسید بانکی تسویه پیمانکار',
          });
        }
        return inserted;
      });

      await logActivity({
        user: req.authUser,
        actionType: 'payout_recorded',
        entityType: 'financial',
        entityId: entry.id,
        summary: `ثبت پرداخت تسویه حساب به مبلغ ${amount.toLocaleString('en-US')} تومان`,
        details: [description, bank_name ? `بانک: ${bank_name}` : '', tracking_code ? `پیگیری: ${tracking_code}` : '']
          .filter(Boolean)
          .join(' | '),
      });

      res.status(201).json({ entry });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/financial/customer-payments',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const customer_name = String(req.body?.customer_name || '').trim();
      const ticket_id = req.body?.ticket_id ? Number(req.body.ticket_id) : null;
      const amount = Number(req.body?.amount || 0);
      const description = String(req.body?.description || 'دریافت وجه از مشترک').trim();
      const bank_name = String(req.body?.bank_name || '').trim() || null;
      const tracking_code = String(req.body?.tracking_code || '').trim() || null;
      const target_account = String(req.body?.target_account || '').trim() || null;
      const source_account = String(req.body?.source_account || '').trim() || null;
      const paidAtRaw = String(req.body?.paid_at || '').trim();
      const paid_at =
        paidAtRaw && !Number.isNaN(new Date(paidAtRaw).getTime()) ? new Date(paidAtRaw) : new Date();
      const receiptRaw = String(req.body?.receipt_image || '').trim();
      const receipt_image = receiptRaw.startsWith('/uploads/') ? receiptRaw : null;

      if (!customer_name || amount <= 0) {
        throw new Error('نام مشترک و مبلغ واریزی معتبر الزامی است.');
      }

      const entry = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(tblLedger)
          .values({
            user_id: null,
            ticket_id,
            ledger_type: 'customer_payment',
            customer_name,
            amount: amount.toFixed(2),
            type: 'credit',
            description,
            bank_name,
            tracking_code,
            target_account,
            source_account,
            paid_at,
            receipt_image,
          })
          .returning();

        if (receipt_image) {
          await tx.insert(tblImages).values({
            entity_type: 'ledger_receipt',
            entity_id: inserted.id,
            image_type: 'customer_receipt',
            file_path: receipt_image,
            caption: tracking_code
              ? `فیش واریزی مشترک ${customer_name} - کد پیگیری ${tracking_code}`
              : `فیش واریزی مشترک ${customer_name}`,
          });
        }
        return inserted;
      });

      await logActivity({
        user: req.authUser,
        actionType: 'customer_payment_recorded',
        entityType: 'financial',
        entityId: entry.id,
        summary: `ثبت واریزی مشترک «${customer_name}» به مبلغ ${amount.toLocaleString('en-US')} تومان`,
        details: [description, bank_name ? `بانک: ${bank_name}` : '', tracking_code ? `پیگیری: ${tracking_code}` : '']
          .filter(Boolean)
          .join(' | '),
      });

      res.status(201).json({ entry });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.get(
  '/api/financial/packages',
  requireAuth,
  requirePermission('can_view_financials', 'can_manage_tariffs', 'can_assign_tickets'),
  async (_req: AuthRequest, res: Response) => {
    try {
      await ensureSeeded();
      const packages = await db.select().from(tblCustomerPackages).orderBy(tblCustomerPackages.id);
      res.json({ packages });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/financial/packages',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      const rules = req.body?.rules_json as CustomerPackageRules;
      const is_active = typeof req.body?.is_active === 'boolean' ? req.body.is_active : true;
      if (!name || !rules) throw new Error('نام پکیج و قوانین تعرفه مشترک الزامی است.');

      const normalizedRules: CustomerPackageRules = {
        install_fee: Math.max(0, Number(rules.install_fee || 0)),
        install_discount_pct: Math.max(0, Math.min(100, Number(rules.install_discount_pct || 0))),
        modem_price: Math.max(0, Number(rules.modem_price || 0)),
        modem_included: Boolean(rules.modem_included),
        free_config: Boolean(rules.free_config),
        config_fee: Math.max(0, Number(rules.config_fee || 0)),
        free_meter_limit: Math.max(0, Math.round(Number(rules.free_meter_limit || 0))),
        extra_meter_price: Math.max(0, Number(rules.extra_meter_price || 0)),
        charge_materials: Boolean(rules.charge_materials),
      };

      const [pkg] = await db
        .insert(tblCustomerPackages)
        .values({ name, rules_json: normalizedRules, is_active })
        .returning();

      await logActivity({
        user: req.authUser,
        actionType: 'customer_package_created',
        entityType: 'package',
        entityId: pkg.id,
        summary: `ایجاد پکیج فروش مشترک «${name}»`,
      });

      res.status(201).json({ package: pkg });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/financial/packages/:id',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const updates: Partial<typeof tblCustomerPackages.$inferInsert> = {};
      if (typeof req.body?.name === 'string') {
        const name = req.body.name.trim();
        if (!name) throw new Error('نام پکیج نمی‌تواند خالی باشد.');
        updates.name = name;
      }
      if (typeof req.body?.is_active === 'boolean') {
        updates.is_active = req.body.is_active;
      }
      if (req.body?.rules_json) {
        const r = req.body.rules_json as CustomerPackageRules;
        updates.rules_json = {
          install_fee: Math.max(0, Number(r.install_fee || 0)),
          install_discount_pct: Math.max(0, Math.min(100, Number(r.install_discount_pct || 0))),
          modem_price: Math.max(0, Number(r.modem_price || 0)),
          modem_included: Boolean(r.modem_included),
          free_config: Boolean(r.free_config),
          config_fee: Math.max(0, Number(r.config_fee || 0)),
          free_meter_limit: Math.max(0, Math.round(Number(r.free_meter_limit || 0))),
          extra_meter_price: Math.max(0, Number(r.extra_meter_price || 0)),
          charge_materials: Boolean(r.charge_materials),
        };
      }

      const [pkg] = await db
        .update(tblCustomerPackages)
        .set(updates)
        .where(eq(tblCustomerPackages.id, id))
        .returning();
      if (!pkg) {
        res.status(404).json({ error: 'پکیج فروش یافت نشد.' });
        return;
      }

      await logActivity({
        user: req.authUser,
        actionType: 'customer_package_updated',
        entityType: 'package',
        entityId: id,
        summary: `ویرایش پکیج فروش «${pkg.name}»`,
      });

      res.json({ package: pkg });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/financial/packages/:id',
  requireAuth,
  requirePermission('can_manage_tariffs'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [usedTicket] = await db
        .select({ id: tblTickets.id })
        .from(tblTickets)
        .where(eq(tblTickets.customer_package_id, id))
        .limit(1);
      if (usedTicket) {
        res.status(409).json({
          error: 'این پکیج در تیکت‌ها استفاده شده و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.',
        });
        return;
      }
      const [deleted] = await db
        .delete(tblCustomerPackages)
        .where(eq(tblCustomerPackages.id, id))
        .returning();
      if (!deleted) {
        res.status(404).json({ error: 'پکیج یافت نشد.' });
        return;
      }
      await logActivity({
        user: req.authUser,
        actionType: 'customer_package_deleted',
        entityType: 'package',
        entityId: id,
        summary: `حذف پکیج فروش «${deleted.name}»`,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

// ==========================================
// USERS, GRANULAR RBAC & ACTIVITY LOGS
// ==========================================

app.get(
  '/api/users',
  requireAuth,
  requirePermission('can_manage_users'),
  async (_req: AuthRequest, res: Response) => {
    try {
      await ensureSeeded();
      const users = await db
        .select({
          id: tblUsers.id,
          uid: tblUsers.uid,
          username: tblUsers.username,
          email: tblUsers.email,
          full_name: tblUsers.full_name,
          first_name: tblUsers.first_name,
          last_name: tblUsers.last_name,
          father_name: tblUsers.father_name,
          birth_date: tblUsers.birth_date,
          national_code: tblUsers.national_code,
          id_number: tblUsers.id_number,
          phone_1: tblUsers.phone_1,
          phone_2: tblUsers.phone_2,
          address: tblUsers.address,
          referrer: tblUsers.referrer,
          role_id: tblUsers.role_id,
          role_name: tblRoles.name,
          is_active: tblUsers.is_active,
        })
        .from(tblUsers)
        .innerJoin(tblRoles, eq(tblRoles.id, tblUsers.role_id))
        .orderBy(tblUsers.id);

      const rolesRows = await db.select().from(tblRoles).orderBy(tblRoles.id);
      const permissions = await db.select().from(tblPermissions).orderBy(tblPermissions.id);
      const rolePerms = await db.select().from(tblRolePermissions);

      const roles = rolesRows.map((r) => ({
        ...r,
        permissionIds: rolePerms
          .filter((rp) => rp.role_id === r.id)
          .map((rp) => rp.permission_id),
      }));

      res.json({ users, roles, permissions });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/users',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '').trim();
      const role_id = Number(req.body?.role_id);

      if (!username || !role_id) {
        throw new Error('نام کاربری و نقش کاربری الزامی است.');
      }
      if (password && password.length < 6) {
        throw new Error('رمز عبور کاربر باید حداقل ۶ کاراکتر باشد.');
      }

      const hrCheck = validateUserProfileV3({
        first_name: String(req.body?.first_name || ''),
        last_name: String(req.body?.last_name || ''),
        father_name: String(req.body?.father_name || ''),
        birth_date: String(req.body?.birth_date || ''),
        national_code: String(req.body?.national_code || ''),
        id_number: String(req.body?.id_number || ''),
        email: String(req.body?.email || ''),
        phone_1: String(req.body?.phone_1 || ''),
        phone_2: req.body?.phone_2 ? String(req.body.phone_2) : null,
        address: String(req.body?.address || ''),
        referrer: req.body?.referrer ? String(req.body.referrer) : null,
      });

      if (!hrCheck.ok) {
        res.status(400).json({ error: hrCheck.error });
        return;
      }

      const [created] = await db
        .insert(tblUsers)
        .values({
          username,
          ...hrCheck.normalized,
          password_hash: password ? hashLocalPassword(password) : '',
          role_id,
          is_active: true,
        })
        .returning({ id: tblUsers.id, username: tblUsers.username, full_name: tblUsers.full_name });

      await logActivity({
        user: req.authUser,
        actionType: 'user_created',
        entityType: 'user',
        entityId: created.id,
        summary: `ایجاد پرسنل جدید «${hrCheck.fullName}» (${username})`,
      });

      res.status(201).json({ user: created });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.patch(
  '/api/users/:id',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = Number(req.params.id);
      const [existing] = await db.select().from(tblUsers).where(eq(tblUsers.id, userId)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'کاربر یافت نشد.' });
        return;
      }

      const updates: Partial<typeof tblUsers.$inferInsert> = {};
      if (req.body?.role_id) updates.role_id = Number(req.body.role_id);
      if (typeof req.body?.is_active === 'boolean') updates.is_active = req.body.is_active;

      const hasHrFields =
        req.body?.first_name !== undefined ||
        req.body?.last_name !== undefined ||
        req.body?.national_code !== undefined ||
        req.body?.email !== undefined;

      if (hasHrFields) {
        const hrCheck = validateUserProfileV3({
          first_name: String(req.body?.first_name ?? existing.first_name),
          last_name: String(req.body?.last_name ?? existing.last_name),
          father_name: String(req.body?.father_name ?? existing.father_name),
          birth_date: String(req.body?.birth_date ?? existing.birth_date),
          national_code: String(req.body?.national_code ?? existing.national_code),
          id_number: String(req.body?.id_number ?? existing.id_number),
          email: String(req.body?.email ?? existing.email ?? ''),
          phone_1: String(req.body?.phone_1 ?? existing.phone_1),
          phone_2: req.body?.phone_2 !== undefined ? req.body.phone_2 : existing.phone_2,
          address: String(req.body?.address ?? existing.address),
          referrer: req.body?.referrer !== undefined ? req.body.referrer : existing.referrer,
        });
        if (!hrCheck.ok) {
          res.status(400).json({ error: hrCheck.error });
          return;
        }
        Object.assign(updates, hrCheck.normalized);
      } else if (req.body?.full_name) {
        updates.full_name = String(req.body.full_name).trim();
      }

      if (req.body?.password !== undefined && String(req.body.password).length > 0) {
        if (String(req.body.password).length < 6) {
          res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
          return;
        }
        updates.password_hash = hashLocalPassword(String(req.body.password));
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'تغییری برای ذخیره ارسال نشده است.' });
        return;
      }

      const [updated] = await db
        .update(tblUsers)
        .set(updates)
        .where(eq(tblUsers.id, userId))
        .returning({ id: tblUsers.id, username: tblUsers.username, full_name: tblUsers.full_name });

      await logActivity({
        user: req.authUser,
        actionType: updates.password_hash ? 'user_password_reset' : 'user_updated',
        entityType: 'user',
        entityId: userId,
        summary: updates.password_hash
          ? `بازنشانی رمز عبور کاربر «${updated.full_name}» توسط مدیر`
          : `ویرایش مشخصات یا دسترسی کاربر «${updated.full_name}»`,
      });

      res.json({ user: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.delete(
  '/api/users/:id',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = Number(req.params.id);
      if (userId === req.authUser!.id) {
        res.status(400).json({ error: 'امکان حذف حساب کاربری فعال خودتان وجود ندارد.' });
        return;
      }
      const [target] = await db.select().from(tblUsers).where(eq(tblUsers.id, userId)).limit(1);
      if (!target) {
        res.status(404).json({ error: 'کاربر یافت نشد.' });
        return;
      }
      if (target.username === 'admin') {
        res.status(403).json({ error: 'کاربر اصلی admin قابل حذف نیست.' });
        return;
      }

      const [hasTicket] = await db
        .select({ id: tblTickets.id })
        .from(tblTickets)
        .where(eq(tblTickets.assigned_installer, userId))
        .limit(1);
      const [hasRecord] = await db
        .select({ id: tblServiceRecords.id })
        .from(tblServiceRecords)
        .where(eq(tblServiceRecords.installer_id, userId))
        .limit(1);
      const [hasLedger] = await db
        .select({ id: tblLedger.id })
        .from(tblLedger)
        .where(eq(tblLedger.user_id, userId))
        .limit(1);

      if (hasTicket || hasRecord || hasLedger) {
        res.status(409).json({
          error:
            'این کاربر دارای سوابق تیکت، گزارش عملیات یا دفتر کل است و برای حفظ یکپارچگی مالی قابل حذف نیست. می‌توانید وضعیت او را غیرفعال کنید.',
        });
        return;
      }

      await db.delete(tblUsers).where(eq(tblUsers.id, userId));
      await logActivity({
        user: req.authUser,
        actionType: 'user_deleted',
        entityType: 'user',
        entityId: userId,
        summary: `حذف کاربر «${target.full_name}» (${target.username})`,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.post(
  '/api/roles',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim();
      const permissionIds = Array.isArray(req.body?.permissionIds)
        ? (req.body.permissionIds as number[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : [];
      if (name.length < 2 || name.length > 60) {
        res.status(400).json({ error: 'نام سطح دسترسی باید بین ۲ تا ۶۰ کاراکتر باشد.' });
        return;
      }

      const existing = await db.select().from(tblRoles).where(eq(tblRoles.name, name)).limit(1);
      if (existing[0]) {
        res.status(409).json({ error: 'سطح دسترسی با این نام قبلاً ثبت شده است.' });
        return;
      }

      const created = await db.transaction(async (tx) => {
        const [role] = await tx.insert(tblRoles).values({ name }).returning();
        if (permissionIds.length > 0) {
          await tx
            .insert(tblRolePermissions)
            .values(permissionIds.map((permission_id) => ({ role_id: role.id, permission_id })));
        }
        return role;
      });

      await logActivity({
        user: req.authUser,
        actionType: 'role_created',
        entityType: 'role',
        entityId: created.id,
        summary: `ایجاد سطح دسترسی جدید «${name}» (${permissionIds.length} مجوز)`,
      });

      res.status(201).json({ role: { ...created, permissionIds } });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ایجاد سطح دسترسی جدید');
    }
  },
);

app.patch(
  '/api/roles/:id',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const roleId = Number(req.params.id);
      const [existing] = await db.select().from(tblRoles).where(eq(tblRoles.id, roleId)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'سطح دسترسی یافت نشد.' });
        return;
      }
      if (existing.name === 'SuperAdmin') {
        res.status(403).json({ error: 'نقش اصلی SuperAdmin قابل تغییر نام یا محدودسازی نیست.' });
        return;
      }

      const nextName =
        typeof req.body?.name === 'string' ? req.body.name.trim() : existing.name;
      if (nextName.length < 2 || nextName.length > 60) {
        res.status(400).json({ error: 'نام سطح دسترسی باید بین ۲ تا ۶۰ کاراکتر باشد.' });
        return;
      }
      if (nextName !== existing.name) {
        const dup = await db.select().from(tblRoles).where(eq(tblRoles.name, nextName)).limit(1);
        if (dup[0] && dup[0].id !== roleId) {
          res.status(409).json({ error: 'نام انتخاب‌شده برای سطح دسترسی تکراری است.' });
          return;
        }
      }

      const hasPermsPayload = Array.isArray(req.body?.permissionIds);
      const permissionIds = hasPermsPayload
        ? (req.body.permissionIds as number[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : null;

      const updated = await db.transaction(async (tx) => {
        const [role] = await tx
          .update(tblRoles)
          .set({ name: nextName })
          .where(eq(tblRoles.id, roleId))
          .returning();
        if (permissionIds !== null) {
          await tx.delete(tblRolePermissions).where(eq(tblRolePermissions.role_id, roleId));
          if (permissionIds.length > 0) {
            await tx
              .insert(tblRolePermissions)
              .values(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
          }
        }
        return role;
      });

      await logActivity({
        user: req.authUser,
        actionType: 'role_updated',
        entityType: 'role',
        entityId: roleId,
        summary: `ویرایش سطح دسترسی «${existing.name}» به «${nextName}»`,
      });

      res.json({ role: updated });
    } catch (err) {
      handleRouteError(res, err, 'خطا در ویرایش سطح دسترسی');
    }
  },
);

app.delete(
  '/api/roles/:id',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const roleId = Number(req.params.id);
      const [existing] = await db.select().from(tblRoles).where(eq(tblRoles.id, roleId)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'سطح دسترسی یافت نشد.' });
        return;
      }
      if (existing.name === 'SuperAdmin') {
        res.status(403).json({ error: 'نقش SuperAdmin قابل حذف نیست.' });
        return;
      }
      const assigned = await db
        .select({ id: tblUsers.id })
        .from(tblUsers)
        .where(eq(tblUsers.role_id, roleId))
        .limit(1);
      if (assigned[0]) {
        res.status(400).json({ error: 'این سطح دسترسی به کاربرانی تخصیص یافته و قابل حذف نیست.' });
        return;
      }

      await db.delete(tblRoles).where(eq(tblRoles.id, roleId));
      await logActivity({
        user: req.authUser,
        actionType: 'role_deleted',
        entityType: 'role',
        entityId: roleId,
        summary: `حذف سطح دسترسی «${existing.name}»`,
      });
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err, 'خطا در حذف سطح دسترسی');
    }
  },
);

app.post(
  '/api/roles/:id/permissions',
  requireAuth,
  requirePermission('can_manage_users'),
  async (req: AuthRequest, res: Response) => {
    try {
      const roleId = Number(req.params.id);
      const permissionIds = Array.isArray(req.body?.permissionIds)
        ? (req.body.permissionIds as number[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
        : [];

      const [role] = await db.select().from(tblRoles).where(eq(tblRoles.id, roleId)).limit(1);
      if (!role) throw new Error('نقش یافت نشد.');
      if (role.name === 'SuperAdmin') {
        throw new Error('دسترسی‌های نقش SuperAdmin قابل محدودسازی نیست.');
      }

      await db.transaction(async (tx) => {
        await tx.delete(tblRolePermissions).where(eq(tblRolePermissions.role_id, roleId));
        if (permissionIds.length > 0) {
          await tx
            .insert(tblRolePermissions)
            .values(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
        }
      });

      await logActivity({
        user: req.authUser,
        actionType: 'rbac_updated',
        entityType: 'role',
        entityId: roleId,
        summary: `بروزرسانی ماتریس مجوزهای نقش «${role.name}» (${permissionIds.length} مجوز)`,
      });

      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  },
);

app.get(
  '/api/activity-logs',
  requireAuth,
  requirePermission('can_manage_users'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const logs = await db
        .select()
        .from(tblActivityLogs)
        .orderBy(desc(tblActivityLogs.created_at), desc(tblActivityLogs.id))
        .limit(120);
      res.json({ logs });
    } catch (err) {
      handleRouteError(res, err, 'خطا در دریافت گزارش فعالیت‌ها');
    }
  },
);

// ==========================================
// START SERVER + VITE MIDDLEWARE (PORT 3000)
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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
    console.log(`AvaNetwork Fiber ERP server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
