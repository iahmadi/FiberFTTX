import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  tblActivityLogs,
  tblFats,
  tblFfats,
  tblInventoryItems,
  tblKafos,
  tblLedger,
  tblModemBrands,
  tblOlts,
  tblPermissions,
  tblPromotions,
  tblRolePermissions,
  tblRoles,
  tblServiceRecords,
  tblSpools,
  tblTariffTemplates,
  tblTicketComments,
  tblTickets,
  tblUserTariffs,
  tblUsers,
  tblVanStock,
  type TariffTemplateRulesJson,
} from './schema.ts';
import { hashLocalPassword } from '../middleware/auth.ts';
import { calculateTemplatePriceSnapshot } from '../lib/fiberLogic.ts';

const DEFAULT_PERMISSIONS: Array<{ key_name: string; descr: string }> = [
  { key_name: 'can_view_dashboard', descr: 'مشاهده داشبورد و تقویم عملیاتی' },
  { key_name: 'can_create_tickets', descr: 'ثبت تیکت ۵گانه و تنظیمات شبکه' },
  { key_name: 'can_assign_tickets', descr: 'ارجاع تیکت به نصابان و زمان‌بندی' },
  { key_name: 'can_execute_service', descr: 'اجرای عملیات، مصرف قرقره و ثبت گزارش' },
  { key_name: 'can_view_all_tickets', descr: 'مشاهده کل تیکت‌های شرکت' },
  { key_name: 'can_manage_hardware', descr: 'مدیریت توپولوژی (KAF/OLT/FAT) و مودم‌ها' },
  { key_name: 'can_add_fat', descr: 'ساخت FAT و کد پویای F-FAT' },
  { key_name: 'can_manage_inventory', descr: 'مدیریت انبار قرقره‌ها و Van Stock' },
  { key_name: 'can_cross_use_cable', descr: 'مصرف مشترک از قرقره سایر نصابان' },
  { key_name: 'can_view_financials', descr: 'مشاهده دفتر کل و گزارش‌های مالی' },
  { key_name: 'can_manage_tariffs', descr: 'تعریف الگوهای تعرفه، کمپین و پرداخت' },
  { key_name: 'can_manage_users', descr: 'مدیریت کاربران و ماتریس دسترسی RBAC' },
];

async function ensureDefaultRbacIntegrity(): Promise<void> {
  await db
    .insert(tblPermissions)
    .values(DEFAULT_PERMISSIONS)
    .onConflictDoNothing();
}

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runIdempotentSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runIdempotentSeed(): Promise<void> {
  const existing = await db.select({ cnt: count() }).from(tblUsers);
  if ((existing[0]?.cnt ?? 0) > 0) {
    await ensureDefaultRbacIntegrity();
    return;
  }

  await db.transaction(async (tx) => {
    const doubleCheck = await tx.select({ cnt: count() }).from(tblUsers);
    if ((doubleCheck[0]?.cnt ?? 0) > 0) return;

    const permsData = DEFAULT_PERMISSIONS;

    const insertedPerms = await tx
      .insert(tblPermissions)
      .values(permsData)
      .onConflictDoNothing()
      .returning();

    const permMap = new Map<string, number>();
    for (const p of insertedPerms) permMap.set(p.key_name, p.id);

    const [superRole] = await tx
      .insert(tblRoles)
      .values({ name: 'SuperAdmin' })
      .returning();
    const [operatorRole] = await tx
      .insert(tblRoles)
      .values({ name: 'اپراتور تیکتینگ' })
      .returning();
    const [installerRole] = await tx
      .insert(tblRoles)
      .values({ name: 'تکنسین نصاب' })
      .returning();
    const [financeRole] = await tx
      .insert(tblRoles)
      .values({ name: 'حسابدار و انباردار' })
      .returning();

    const rolePermRows: Array<{ role_id: number; permission_id: number }> = [];
    for (const pid of permMap.values()) {
      rolePermRows.push({ role_id: superRole.id, permission_id: pid });
    }
    for (const key of [
      'can_view_dashboard',
      'can_create_tickets',
      'can_assign_tickets',
      'can_view_all_tickets',
    ]) {
      const pid = permMap.get(key);
      if (pid) rolePermRows.push({ role_id: operatorRole.id, permission_id: pid });
    }
    for (const key of ['can_view_dashboard', 'can_execute_service', 'can_add_fat']) {
      const pid = permMap.get(key);
      if (pid) rolePermRows.push({ role_id: installerRole.id, permission_id: pid });
    }
    for (const key of [
      'can_view_dashboard',
      'can_view_all_tickets',
      'can_manage_inventory',
      'can_view_financials',
      'can_manage_tariffs',
    ]) {
      const pid = permMap.get(key);
      if (pid) rolePermRows.push({ role_id: financeRole.id, permission_id: pid });
    }
    if (rolePermRows.length > 0) {
      await tx.insert(tblRolePermissions).values(rolePermRows).onConflictDoNothing();
    }

    const envPass = process.env.ADMIN_PASSCODE?.trim();
    const adminPassHash = envPass ? hashLocalPassword(envPass) : '';

    const [adminUser] = await tx
      .insert(tblUsers)
      .values({
        username: 'admin',
        password_hash: adminPassHash,
        full_name: 'علیرضا محمدی (مدیر کل)',
        role_id: superRole.id,
        is_active: true,
      })
      .returning();

    const [operatorUser] = await tx
      .insert(tblUsers)
      .values({
        username: 'operator',
        password_hash: '',
        full_name: 'سارا احمدی',
        role_id: operatorRole.id,
        is_active: true,
      })
      .returning();

    const [installer1] = await tx
      .insert(tblUsers)
      .values({
        username: 'installer1',
        password_hash: '',
        full_name: 'حسین کریمی',
        role_id: installerRole.id,
        is_active: true,
      })
      .returning();

    const [installer2] = await tx
      .insert(tblUsers)
      .values({
        username: 'installer2',
        password_hash: '',
        full_name: 'رضا قاسمی',
        role_id: installerRole.id,
        is_active: true,
      })
      .returning();

    // Hardware topology
    const [kaf1] = await tx
      .insert(tblKafos)
      .values({ name: 'کافو مرکزی ونک (KAF-VN01)' })
      .returning();
    const [kaf2] = await tx
      .insert(tblKafos)
      .values({ name: 'کافو شمال سعادت‌آباد (KAF-SA02)' })
      .returning();

    const [olt1] = await tx
      .insert(tblOlts)
      .values({ kaf_id: kaf1.id, name: 'OLT-HUAWEI-MA5800-01' })
      .returning();
    const [olt2] = await tx
      .insert(tblOlts)
      .values({ kaf_id: kaf2.id, name: 'OLT-ZTE-C600-02' })
      .returning();

    const [fat101] = await tx
      .insert(tblFats)
      .values({ olt_id: olt1.id, fat_number: 101 })
      .returning();
    const [fat102] = await tx
      .insert(tblFats)
      .values({ olt_id: olt1.id, fat_number: 102 })
      .returning();
    const [fat201] = await tx
      .insert(tblFats)
      .values({ olt_id: olt2.id, fat_number: 201 })
      .returning();

    const [ffat1] = await tx
      .insert(tblFfats)
      .values({ fat_id: fat101.id, ffat_code: 'FAT101-A1' })
      .returning();
    await tx.insert(tblFfats).values([
      { fat_id: fat101.id, ffat_code: 'FAT101-A2' },
      { fat_id: fat102.id, ffat_code: 'FAT102-B1' },
      { fat_id: fat201.id, ffat_code: 'FAT201-C1' },
    ]);

    // Modem brands
    const [brandHuawei] = await tx
      .insert(tblModemBrands)
      .values({
        name: 'Huawei HG8245H5',
        serial_prefix: '48575443',
        serial_pattern: '^48575443[A-F0-9]{8}$',
      })
      .returning();
    const [brandZte] = await tx
      .insert(tblModemBrands)
      .values({
        name: 'ZTE F660 V8',
        serial_prefix: 'ZTEG',
        serial_pattern: '^ZTEG[A-Z0-9]{8}$',
      })
      .returning();
    await tx.insert(tblModemBrands).values([
      { name: 'TP-Link XZ000-G3', serial_prefix: 'TPLK', serial_pattern: '^TPLK[0-9]{10}$' },
      { name: 'FiberHome AN5506', serial_prefix: 'FHTT', serial_pattern: '^FHTT[A-F0-9]{8}$' },
    ]);

    // Inventory items & Spools
    const [itemOutCable] = await tx
      .insert(tblInventoryItems)
      .values({ name: 'قرقره کابل دراپ فضای باز ۱۰۰۰ متری', type: 'spool', total_quantity: 2 })
      .returning();
    const [itemInCable] = await tx
      .insert(tblInventoryItems)
      .values({ name: 'قرقره کابل داخلی ۵۰۰ متری', type: 'spool', total_quantity: 2 })
      .returning();
    const [itemHuaweiModem] = await tx
      .insert(tblInventoryItems)
      .values({
        name: 'مودم فیبر Huawei HG8245H5',
        type: 'modem',
        modem_brand_id: brandHuawei.id,
        total_quantity: 12,
      })
      .returning();
    const [itemZteModem] = await tx
      .insert(tblInventoryItems)
      .values({
        name: 'مودم فیبر ZTE F660 V8',
        type: 'modem',
        modem_brand_id: brandZte.id,
        total_quantity: 8,
      })
      .returning();
    await tx.insert(tblInventoryItems).values({
      name: 'پچ‌کورد SC/APC زرد ۳ متری',
      type: 'unit',
      total_quantity: 140,
    });

    const [spOut1] = await tx
      .insert(tblSpools)
      .values({
        item_id: itemOutCable.id,
        spool_code: 'OUT-101',
        cable_type: 'outdoor',
        initial_length: 1000,
        current_length: 760,
        assigned_installer_id: installer1.id,
      })
      .returning();
    const [spIn1] = await tx
      .insert(tblSpools)
      .values({
        item_id: itemInCable.id,
        spool_code: 'IN-12',
        cable_type: 'indoor',
        initial_length: 800,
        current_length: 766,
        assigned_installer_id: installer1.id,
      })
      .returning();
    await tx.insert(tblSpools).values([
      {
        item_id: itemOutCable.id,
        spool_code: 'OUT-102',
        cable_type: 'outdoor',
        initial_length: 1000,
        current_length: 910,
        assigned_installer_id: installer2.id,
      },
      {
        item_id: itemInCable.id,
        spool_code: 'IN-102',
        cable_type: 'indoor',
        initial_length: 500,
        current_length: 440,
        assigned_installer_id: installer2.id,
      },
      {
        item_id: itemOutCable.id,
        spool_code: 'OUT-WH-09',
        cable_type: 'outdoor',
        initial_length: 2000,
        current_length: 2000,
        assigned_installer_id: null,
      },
    ]);

    // Van stock modems for installers
    await tx.insert(tblVanStock).values([
      {
        user_id: installer1.id,
        item_id: itemHuaweiModem.id,
        serial_number: '48575443AABB1122',
        quantity: 1,
      },
      {
        user_id: installer1.id,
        item_id: itemZteModem.id,
        serial_number: 'ZTEG99887766',
        quantity: 1,
      },
      {
        user_id: installer2.id,
        item_id: itemHuaweiModem.id,
        serial_number: '48575443CCDD3344',
        quantity: 1,
      },
    ]);

    // Tariff Templates & Promotions
    const hybridRules: TariffTemplateRulesJson = {
      internet_install: { calc_type: 'hybrid', base_price: 1000000, meter_limit: 120, extra_meter_price: 25000 },
      internet_fault: { calc_type: 'fixed', base_price: 450000, meter_limit: 0, extra_meter_price: 0 },
      ffat_install: { calc_type: 'per_meter', base_price: 350000, meter_limit: 0, extra_meter_price: 20000 },
      ffat_fault: { calc_type: 'fixed', base_price: 600000, meter_limit: 0, extra_meter_price: 0 },
      voip_install: { calc_type: 'fixed', base_price: 750000, meter_limit: 0, extra_meter_price: 0 },
    };

    const fixedRules: TariffTemplateRulesJson = {
      internet_install: { calc_type: 'fixed', base_price: 1200000, meter_limit: 0, extra_meter_price: 0 },
      internet_fault: { calc_type: 'fixed', base_price: 500000, meter_limit: 0, extra_meter_price: 0 },
      ffat_install: { calc_type: 'fixed', base_price: 900000, meter_limit: 0, extra_meter_price: 0 },
      ffat_fault: { calc_type: 'fixed', base_price: 650000, meter_limit: 0, extra_meter_price: 0 },
      voip_install: { calc_type: 'fixed', base_price: 800000, meter_limit: 0, extra_meter_price: 0 },
    };

    const [tplHybrid] = await tx
      .insert(tblTariffTemplates)
      .values({ name: 'الگوی ترکیبی پیمانکار (Hybrid Tech)', rules_json: hybridRules })
      .returning();
    const [tplFixed] = await tx
      .insert(tblTariffTemplates)
      .values({ name: 'الگوی نرخ ثابت (Fixed Rate)', rules_json: fixedRules })
      .returning();

    const [promo80] = await tx
      .insert(tblPromotions)
      .values({
        name: 'پاداش ۸۰ نصب ماهانه پاییز',
        target_type: 'installs',
        target_value: 80,
        reward_amount: '35000000.00',
        reset_cycle: 'monthly',
        start_date: '2026-09-23',
        end_date: '2026-12-21',
        carry_over: false,
      })
      .returning();

    const [promoWeekly] = await tx
      .insert(tblPromotions)
      .values({
        name: 'کمپین هفتگی ۱۰ نصب (با انتقال مازاد)',
        target_type: 'all',
        target_value: 10,
        reward_amount: '2500000.00',
        reset_cycle: 'weekly',
        start_date: '2026-10-01',
        end_date: '2027-03-20',
        carry_over: true,
      })
      .returning();

    await tx.insert(tblUserTariffs).values([
      { user_id: installer1.id, template_id: tplHybrid.id, promotion_id: promo80.id },
      { user_id: installer2.id, template_id: tplFixed.id, promotion_id: promoWeekly.id },
    ]);

    // 5-type tickets
    const [t1] = await tx
      .insert(tblTickets)
      .values({
        type: 'internet_install',
        customer_name: 'شرکت مهندسی پارس‌نور',
        address: 'تهران، میدان ونک، خیابان ملاصدرا، پلاک ۴۲',
        pppoe_user: 'parsnoor@avafiber.ir',
        pppoe_pass: 'Ava#4421',
        vlan_id: '402',
        voip_config: 'SIP: 172.16.20.10 | Ext: 2104',
        operator_notes: 'دسترسی پشت‌بام با نگهبانی هماهنگ شده است.',
        status: 'in_progress',
        assigned_installer: installer1.id,
        scheduled_date: '2026-11-23',
        scheduled_time: '10:30',
        assigned_at: new Date('2026-11-22T09:00:00Z'),
        started_at: new Date('2026-11-23T08:15:00Z'),
      })
      .returning();

    await tx.insert(tblTickets).values([
      {
        type: 'voip_install',
        customer_name: 'کلینیک تخصصی بهار',
        address: 'تهران، گاندی شمالی، نبش کوچه ششم، پلاک ۱۲',
        voip_config: 'SIP Proxy: 10.40.10.2 | DID: 02188904100',
        operator_notes: 'نیاز به تست خط تلفنی پس از پچ کردن روی مودم',
        status: 'pending',
        assigned_installer: installer1.id,
        scheduled_date: '2026-11-24',
        scheduled_time: '14:00',
        assigned_at: new Date('2026-11-22T11:30:00Z'),
      },
      {
        type: 'ffat_install',
        customer_name: 'برج مسکونی سروستان (بلوک B)',
        address: 'تهران، سعادت‌آباد، بلوار سرو غربی، پلاک ۱۸',
        operator_notes: 'نصب باکس F-FAT جدید ۱ به ۸ در رایزر طبقه سوم',
        status: 'pending',
        assigned_installer: installer2.id,
        scheduled_date: '2026-11-25',
        scheduled_time: '09:30',
        assigned_at: new Date('2026-11-22T12:15:00Z'),
      },
      {
        type: 'internet_fault',
        customer_name: 'امیرحسین رضایی',
        address: 'تهران، جردن، خیابان ناهید شرقی، پلاک ۹',
        pppoe_user: 'rezaei90@avafiber.ir',
        pppoe_pass: 'Rz#9910',
        vlan_id: '318',
        operator_notes: 'چراغ LOS قرمز گزارش شده است.',
        status: 'pending',
        assigned_installer: null,
        scheduled_date: '2026-11-26',
        scheduled_time: '11:00',
      },
    ]);

    const [tCompleted1] = await tx
      .insert(tblTickets)
      .values({
        type: 'internet_install',
        customer_name: 'دفتر حقوقی آوا',
        address: 'تهران، شهرک غرب، بلوار دادمان، پلاک ۱۰۵',
        pppoe_user: 'avalawoffice@avafiber.ir',
        pppoe_pass: 'Ava@7781',
        vlan_id: '405',
        status: 'completed',
        assigned_installer: installer1.id,
        scheduled_date: '2026-11-18',
        scheduled_time: '10:00',
        assigned_at: new Date('2026-11-17T10:00:00Z'),
        started_at: new Date('2026-11-18T09:15:00Z'),
        completed_at: new Date('2026-11-18T11:45:00Z'),
      })
      .returning();

    // Immutable ticket comments
    await tx.insert(tblTicketComments).values([
      {
        ticket_id: t1.id,
        user_id: operatorUser.id,
        comment: 'تیکت ثبت شد و پورت OLT شماره ۰۱ جهت رانش سرویس اختصاص یافت.',
        created_at: new Date('2026-11-22T09:05:00Z'),
      },
      {
        ticket_id: t1.id,
        user_id: installer1.id,
        comment: 'به محل مراجعه شد، مسیر داکت از FAT101 تا واحد بررسی و آماده کابل‌کشی است.',
        created_at: new Date('2026-11-23T08:25:00Z'),
      },
    ]);

    // Historical Service Record + Price Snapshot + Multi-month Ledger
    const snap1 = calculateTemplatePriceSnapshot({
      templateName: tplHybrid.name,
      rulesJson: hybridRules,
      ticketType: 'internet_install',
      outMeter: 100,
      inMeter: 35,
      promotionName: null,
      promotionBonus: 0,
      computedAt: '2026-11-18T11:45:00Z',
    });

    await tx.insert(tblServiceRecords).values({
      ticket_id: tCompleted1.id,
      installer_id: installer1.id,
      source_type: 'FFAT',
      source_id: ffat1.id,
      out_spool_id: spOut1.id,
      out_total_meter: 100,
      in_spool_id: spIn1.id,
      in_total_meter: 35,
      modem_brand_id: brandHuawei.id,
      modem_serial: '4857544399AA11BB',
      modem_source: 'company',
      price_snapshot: snap1,
      service_date_jalali: '1405/08/27',
      notes: 'تست پاور -18.2 dBm، تحویل مودم و آموزش مشترک انجام شد.',
      created_at: new Date('2026-11-18T11:45:00Z'),
    });

    await tx.insert(tblLedger).values([
      {
        user_id: installer1.id,
        ticket_id: null,
        amount: '3100000.00',
        type: 'credit',
        description: 'کارکرد نصب و راه‌اندازی مرداد ۱۴۰۵',
        created_at: new Date('2026-08-14T12:00:00Z'),
      },
      {
        user_id: installer1.id,
        ticket_id: null,
        amount: '4250000.00',
        type: 'credit',
        description: 'کارکرد پروژه فیبر نوری شهریور ۱۴۰۵',
        created_at: new Date('2026-09-12T12:00:00Z'),
      },
      {
        user_id: installer2.id,
        ticket_id: null,
        amount: '3800000.00',
        type: 'credit',
        description: 'کارکرد مهر ۱۴۰۵ پیمانکار',
        created_at: new Date('2026-10-10T12:00:00Z'),
      },
      {
        user_id: installer1.id,
        ticket_id: tCompleted1.id,
        amount: String(snap1.total_earned),
        type: 'credit',
        description: `دستمزد سرویس تیکت #${tCompleted1.id} (${snap1.total_meter} متر کابل)`,
        created_at: new Date('2026-11-18T11:45:00Z'),
      },
      {
        user_id: installer1.id,
        ticket_id: null,
        amount: '2500000.00',
        type: 'debit',
        description: 'تسویه علی‌الحساب پیمانکار',
        created_at: new Date('2026-11-19T14:00:00Z'),
      },
    ]);

    await tx.insert(tblActivityLogs).values([
      {
        user_id: adminUser.id,
        username: adminUser.username,
        user_full_name: adminUser.full_name,
        action_type: 'tariff_updated',
        entity_type: 'tariff',
        entity_id: tplHybrid.id,
        summary: 'ایجاد الگوی تعرفه ترکیبی و فعال‌سازی کمپین پاییز',
        details: 'الگوی تعرفه ۵گانه برای پیمانکاران تنظیم گردید.',
      },
      {
        user_id: operatorUser.id,
        username: operatorUser.username,
        user_full_name: operatorUser.full_name,
        action_type: 'ticket_assigned',
        entity_type: 'ticket',
        entity_id: t1.id,
        summary: `ارجاع تیکت #${t1.id} به حسین کریمی`,
        details: 'نصب اینترنت FTTH شرکت مهندسی پارس‌نور',
      },
    ]);
  });
}
