// Pure Fiber Optic ERP domain logic: F-FAT codes, modem regex validation,
// tariff snapshot calculations, spool deduction rules, and double-entry ledger totals.

import { JALALI_MONTH_NAMES, gregorianToJalali, toPersianDigits } from './jalali.ts';

export type ServiceType = 'install' | 'fault';
export type TariffCalcType = 'fixed' | 'per_meter' | 'hybrid';
export type ModemSource = 'company' | 'customer';

export interface ModemBrandRule {
  id: number;
  name: string;
  serial_pattern: string;
  serial_prefix: string;
}

export interface VanStockRecord {
  id: number;
  user_id: number;
  item_id: number;
  item_type: 'unit' | 'spool' | 'modem';
  serial_number: string | null;
  quantity: number;
}

export interface TicketProvisioningConfigLike {
  config_pppoe_user?: string | null;
  config_pppoe_pass?: string | null;
  config_vlan?: number | null;
  has_voip?: number | boolean | null;
  config_voip_data?: string | null;
}

export function hasTicketProvisioningConfig(ticket: TicketProvisioningConfigLike | null | undefined): boolean {
  if (!ticket) return false;
  return Boolean(
    (ticket.config_pppoe_user && ticket.config_pppoe_user.trim()) ||
      (ticket.config_pppoe_pass && ticket.config_pppoe_pass.trim()) ||
      (ticket.config_vlan !== null && ticket.config_vlan !== undefined && Number(ticket.config_vlan) > 0) ||
      Boolean(ticket.has_voip) ||
      (ticket.config_voip_data && ticket.config_voip_data.trim()),
  );
}

/**
 * Validates whether an installer can consume a modem from Van Stock or skip deduction for customer's own modem.
 */
export function validateVanModemConsumption(
  vanStock: VanStockRecord | undefined,
  modemSource: ModemSource,
  modemSerial: string,
  installerId: number,
  canCrossUseInventory: boolean,
): { ok: boolean; error?: string } {
  if (modemSource === 'customer') {
    return { ok: true };
  }
  if (!vanStock) {
    return { ok: false, error: 'برای مودم شرکت، انتخاب ردیف موجودی از انبار خودرو (Van Stock) الزامی است.' };
  }
  if (vanStock.item_type !== 'modem') {
    return { ok: false, error: 'کالای انتخاب‌شده از نوع مودم نیست.' };
  }
  if (vanStock.quantity < 1) {
    return { ok: false, error: 'موجودی این مودم در انبار خودرو به اتمام رسیده است.' };
  }
  if (vanStock.user_id !== installerId && !canCrossUseInventory) {
    return { ok: false, error: 'این مودم متعلق به انبار خودروی نصاب دیگری است.' };
  }
  if (
    vanStock.serial_number &&
    vanStock.serial_number.trim() &&
    vanStock.serial_number.trim().toUpperCase() !== modemSerial.trim().toUpperCase()
  ) {
    return {
      ok: false,
      error: `سریال واردشده باید با سریال ثبت‌شده در انبار خودرو (${vanStock.serial_number}) مطابقت داشته باشد.`,
    };
  }
  return { ok: true };
}

export interface TariffRule {
  id: number;
  installer_id: number;
  calc_type: TariffCalcType;
  base_price: number;
  meter_limit: number;
  extra_meter_price: number;
  bonus_target_count?: number;
  bonus_amount?: number;
}

export interface PriceSnapshot {
  calc_type: TariffCalcType;
  service_type: ServiceType;
  base_price: number;
  meter_limit: number;
  extra_meter_price: number;
  out_meter: number;
  in_meter: number;
  total_meter: number;
  billable_extra_meter: number;
  extra_meter_fee: number;
  bonus_applied: number;
  total_earned: number;
  computed_at: string;
}

export interface SpoolRecord {
  id: number;
  spool_code: string;
  cable_type: 'indoor' | 'outdoor';
  initial_length: number;
  current_length: number;
  assigned_installer_id: number | null;
}

export interface LedgerEntryLike {
  amount: number;
  type: 'credit' | 'debit';
}

/**
 * Dynamically generates F-FAT code from parent FAT number and user suffix input.
 * Example: fatNumber = 14, suffix = "A2" -> "FAT14-A2"
 */
export function generateFFatCode(fatNumber: number, suffixInput: string): string {
  const cleanSuffix = suffixInput.trim().toUpperCase().replace(/\s+/g, '');
  if (!Number.isInteger(fatNumber) || fatNumber <= 0) {
    throw new Error('شماره FAT نامعتبر است.');
  }
  if (!cleanSuffix || !/^[A-Z0-9_-]{1,20}$/.test(cleanSuffix)) {
    throw new Error('پسوند F-FAT باید شامل حروف انگلیسی یا عدد باشد (حداکثر ۲۰ کاراکتر).');
  }
  return `FAT${fatNumber}-${cleanSuffix}`;
}

/**
 * Validates a modem serial against brand prefix and regex pattern.
 */
export function validateModemSerial(
  serial: string,
  brand: Pick<ModemBrandRule, 'name' | 'serial_prefix' | 'serial_pattern'>,
): { valid: boolean; reason?: string } {
  const trimmed = serial.trim();
  if (!trimmed) {
    return { valid: false, reason: 'سریال مودم الزامی است.' };
  }
  if (trimmed.length > 100) {
    return { valid: false, reason: 'طول سریال مودم بیش از حد مجاز است.' };
  }
  if (brand.serial_prefix && !trimmed.startsWith(brand.serial_prefix)) {
    return {
      valid: false,
      reason: `سریال مودم ${brand.name} باید با پیشوند «${brand.serial_prefix}» شروع شود.`,
    };
  }
  try {
    const regex = new RegExp(brand.serial_pattern);
    if (!regex.test(trimmed)) {
      return {
        valid: false,
        reason: `فرمت سریال مودم با الگوی برند ${brand.name} (${brand.serial_pattern}) مطابقت ندارد.`,
      };
    }
  } catch {
    return { valid: false, reason: 'الگوی Regex تعریف‌شده برای این برند نامعتبر است.' };
  }
  return { valid: true };
}

/**
 * Validates whether an installer can deduct meters from a specific cable spool.
 */
export function validateSpoolConsumption(
  spool: SpoolRecord | undefined,
  expectedCableType: 'indoor' | 'outdoor',
  requestedMeters: number,
  installerId: number,
  canCrossUseCables: boolean,
): { ok: boolean; error?: string } {
  if (requestedMeters === 0) {
    return { ok: true };
  }
  if (!Number.isInteger(requestedMeters) || requestedMeters < 0) {
    return { ok: false, error: 'متراژ مصرفی باید یک عدد صحیح نامنفی باشد.' };
  }
  if (!spool) {
    return { ok: false, error: `قرقره ${expectedCableType === 'outdoor' ? 'فضای باز' : 'داخلی'} انتخاب نشده است.` };
  }
  if (spool.cable_type !== expectedCableType) {
    return {
      ok: false,
      error: `نوع کابل قرقره ${spool.spool_code} با بخش انتخابی مطابقت ندارد.`,
    };
  }
  if (spool.assigned_installer_id === null) {
    return {
      ok: false,
      error: `قرقره ${spool.spool_code} هنوز به انبار خودروی هیچ نصابی تحویل داده نشده است.`,
    };
  }
  if (spool.assigned_installer_id !== installerId && !canCrossUseCables) {
    return {
      ok: false,
      error: `قرقره ${spool.spool_code} متعلق به موجودی نصاب دیگری است و مجوز استفاده مشترک ندارید.`,
    };
  }
  if (spool.current_length < requestedMeters) {
    return {
      ok: false,
      error: `موجودی قرقره ${spool.spool_code} (${spool.current_length} متر) برای متراژ درخواستی (${requestedMeters} متر) کافی نیست.`,
    };
  }
  return { ok: true };
}

/**
 * Calculates immutable tariff price snapshot for a completed service record.
 * - fixed: base_price flat regardless of meters
 * - per_meter: total_meter * extra_meter_price (+ optional base_price)
 * - hybrid: base_price covers up to meter_limit meters; excess meters * extra_meter_price
 * Bonus target: if completedInstallCountThisCycle hits/exceeds bonus_target_count, bonus_amount applies.
 */
export function calculateTariffSnapshot(
  tariff: TariffRule,
  outMeter: number,
  inMeter: number,
  serviceType: ServiceType,
  completedCountAfterThis = 0,
  computedAt = new Date().toISOString(),
): PriceSnapshot {
  const safeOut = Math.max(0, Math.round(outMeter));
  const safeIn = Math.max(0, Math.round(inMeter));
  const totalMeter = safeOut + safeIn;

  const basePrice = Number(tariff.base_price) || 0;
  const meterLimit = Math.max(0, Math.round(Number(tariff.meter_limit) || 0));
  const extraPrice = Number(tariff.extra_meter_price) || 0;

  let billableExtraMeter = 0;
  let extraMeterFee = 0;
  let subtotal = 0;

  if (tariff.calc_type === 'fixed') {
    subtotal = basePrice;
  } else if (tariff.calc_type === 'per_meter') {
    billableExtraMeter = totalMeter;
    extraMeterFee = billableExtraMeter * extraPrice;
    subtotal = basePrice + extraMeterFee;
  } else {
    // hybrid
    billableExtraMeter = Math.max(0, totalMeter - meterLimit);
    extraMeterFee = billableExtraMeter * extraPrice;
    subtotal = basePrice + extraMeterFee;
  }

  let bonusApplied = 0;
  if (
    tariff.bonus_target_count &&
    tariff.bonus_target_count > 0 &&
    tariff.bonus_amount &&
    tariff.bonus_amount > 0 &&
    completedCountAfterThis > 0 &&
    completedCountAfterThis % tariff.bonus_target_count === 0
  ) {
    bonusApplied = Number(tariff.bonus_amount);
  }

  const totalEarned = Math.round((subtotal + bonusApplied) * 100) / 100;

  return {
    calc_type: tariff.calc_type,
    service_type: serviceType,
    base_price: basePrice,
    meter_limit: meterLimit,
    extra_meter_price: extraPrice,
    out_meter: safeOut,
    in_meter: safeIn,
    total_meter: totalMeter,
    billable_extra_meter: billableExtraMeter,
    extra_meter_fee: extraMeterFee,
    bonus_applied: bonusApplied,
    total_earned: totalEarned,
    computed_at: computedAt,
  };
}

/**
 * Computes double-entry ledger balance (credit = earned, debit = company paid).
 */
export function computeLedgerBalance(entries: LedgerEntryLike[]): {
  totalCredit: number;
  totalDebit: number;
  balance: number;
} {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const entry of entries) {
    const val = Number(entry.amount) || 0;
    if (entry.type === 'credit') {
      totalCredit += val;
    } else if (entry.type === 'debit') {
      totalDebit += val;
    }
  }
  return {
    totalCredit: Math.round(totalCredit * 100) / 100,
    totalDebit: Math.round(totalDebit * 100) / 100,
    balance: Math.round((totalCredit - totalDebit) * 100) / 100,
  };
}

export const LOW_SPOOL_THRESHOLD_PCT = 10;

export interface SpoolWarningItem {
  id: number;
  spool_code: string;
  current_length: number;
  initial_length: number;
  percentRemaining: number;
}

export interface SpoolDropEvent {
  spool: SpoolRecord;
  deductedMeters: number;
  isLow: boolean;
  percentRemaining: number;
}

export function getSpoolExactPercent(
  spool: Pick<SpoolRecord, 'initial_length' | 'current_length'>,
): number {
  if (!spool.initial_length || spool.initial_length <= 0) return 0;
  return Math.max(0, Math.min(100, (spool.current_length / spool.initial_length) * 100));
}

export function getSpoolPercentRemaining(
  spool: Pick<SpoolRecord, 'initial_length' | 'current_length'>,
): number {
  return Math.round(getSpoolExactPercent(spool));
}

export function isSpoolLowStock(
  spool: Pick<SpoolRecord, 'initial_length' | 'current_length'>,
  thresholdPct = LOW_SPOOL_THRESHOLD_PCT,
): boolean {
  if (!spool.initial_length || spool.initial_length <= 0) return true;
  if (spool.current_length <= 0) return true;
  return getSpoolExactPercent(spool) < thresholdPct;
}

export function getLowSpoolWarnings(
  spools: SpoolRecord[],
  thresholdPct = LOW_SPOOL_THRESHOLD_PCT,
): SpoolWarningItem[] {
  return spools
    .filter((s) => isSpoolLowStock(s, thresholdPct))
    .map((s) => ({
      id: s.id,
      spool_code: s.spool_code,
      current_length: s.current_length,
      initial_length: s.initial_length,
      percentRemaining: getSpoolPercentRemaining(s),
    }))
    .sort((a, b) => a.percentRemaining - b.percentRemaining || a.current_length - b.current_length);
}

export function detectSpoolDrops(
  prevSpools: SpoolRecord[],
  nextSpools: SpoolRecord[],
  thresholdPct = LOW_SPOOL_THRESHOLD_PCT,
): SpoolDropEvent[] {
  const prevMap = new Map<number, SpoolRecord>();
  for (const s of prevSpools) {
    prevMap.set(s.id, s);
  }
  const drops: SpoolDropEvent[] = [];
  for (const next of nextSpools) {
    const prev = prevMap.get(next.id);
    if (prev && next.current_length < prev.current_length) {
      drops.push({
        spool: next,
        deductedMeters: prev.current_length - next.current_length,
        isLow: isSpoolLowStock(next, thresholdPct),
        percentRemaining: getSpoolPercentRemaining(next),
      });
    }
  }
  return drops;
}

export interface LedgerDateEntryLike {
  amount: number;
  type: 'credit' | 'debit';
  created_at: string;
}

export interface MonthlyContractorEarning {
  monthKey: string;
  monthLabel: string;
  totalEarnings: number;
  entryCount: number;
}

export type EarningsRangePreset = 'all' | '3m' | '6m' | '12m' | 'custom';

function parseEntryDate(raw: string): Date | null {
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Aggregates contractor earnings ('credit' ledger entries) per Jalali month, sorted chronologically.
 */
export function aggregateMonthlyContractorEarnings(
  entries: LedgerDateEntryLike[],
): MonthlyContractorEarning[] {
  const buckets = new Map<string, MonthlyContractorEarning>();

  for (const entry of entries) {
    if (entry.type !== 'credit') continue;
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    const d = parseEntryDate(entry.created_at);
    if (!d) continue;

    const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const monthKey = `${j.jy}-${String(j.jm).padStart(2, '0')}`;
    const monthLabel = `${JALALI_MONTH_NAMES[j.jm - 1]} ${toPersianDigits(j.jy)}`;

    const existing = buckets.get(monthKey);
    if (existing) {
      existing.totalEarnings = Math.round((existing.totalEarnings + amount) * 100) / 100;
      existing.entryCount += 1;
    } else {
      buckets.set(monthKey, {
        monthKey,
        monthLabel,
        totalEarnings: Math.round(amount * 100) / 100,
        entryCount: 1,
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function filterMonthlyEarningsByRange(
  months: MonthlyContractorEarning[],
  options: {
    preset: EarningsRangePreset;
    fromMonth?: string;
    toMonth?: string;
  },
): MonthlyContractorEarning[] {
  const sorted = [...months].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  if (options.preset === '3m') return sorted.slice(-3);
  if (options.preset === '6m') return sorted.slice(-6);
  if (options.preset === '12m') return sorted.slice(-12);
  if (options.preset === 'custom') {
    const from = options.fromMonth?.trim() || '';
    const to = options.toMonth?.trim() || '';
    return sorted.filter((m) => {
      if (from && m.monthKey < from) return false;
      if (to && m.monthKey > to) return false;
      return true;
    });
  }
  return sorted;
}

export type ActivityCategory = 'all' | 'ticket' | 'inventory' | 'financial' | 'rbac';

export interface ActivityLogLike {
  id: number;
  username: string;
  user_full_name: string;
  action_type: string;
  entity_type: string;
  entity_id?: number | null;
  summary: string;
  details?: string | null;
  created_at: string;
}

export function getActivityCategory(actionType: string): Exclude<ActivityCategory, 'all'> {
  if (
    actionType.startsWith('ticket_') ||
    actionType.startsWith('service_')
  ) {
    return 'ticket';
  }
  if (
    actionType.startsWith('spool_') ||
    actionType.startsWith('inventory_') ||
    actionType.startsWith('van_stock_')
  ) {
    return 'inventory';
  }
  if (
    actionType.startsWith('tariff_') ||
    actionType.startsWith('payout_') ||
    actionType.startsWith('financial_')
  ) {
    return 'financial';
  }
  return 'rbac';
}

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  ticket_created: 'ثبت تیکت جدید',
  ticket_config_updated: 'ویرایش کانفیگ فنی تیکت',
  ticket_assigned: 'تایید و ارجاع تیکت',
  service_completed: 'تایید و تکمیل عملیات نصب/خرابی',
  spool_created: 'ثبت قرقره کابل جدید',
  spool_transferred: 'انتقال قرقره کابل',
  spool_consumed: 'کسر متراژ قرقره کابل',
  inventory_item_created: 'افزودن کالا/مودم به انبار',
  inventory_adjusted: 'تغییر موجودی انبار مرکزی',
  van_stock_transferred: 'تحویل کالا به خودروی نصاب',
  van_stock_returned: 'عودت کالا از خودرو به انبار',
  tariff_updated: 'تنظیم تعرفه نصاب',
  payout_recorded: 'ثبت سند پرداخت مالی',
  user_created: 'ایجاد کاربر جدید',
  user_updated: 'تغییر وضعیت/نقش کاربر',
  role_created: 'ایجاد نقش دسترسی جدید',
  role_updated: 'ویرایش مجوزهای نقش',
  settings_updated: 'تغییر تنظیمات امنیتی نشست',
};

export function filterActivityLogs<T extends ActivityLogLike>(
  logs: T[],
  category: ActivityCategory,
  rawQuery: string,
): T[] {
  const q = rawQuery.trim().toLowerCase();
  return logs.filter((log) => {
    if (category !== 'all' && getActivityCategory(log.action_type) !== category) {
      return false;
    }
    if (!q) return true;
    const actionLabel = ACTIVITY_ACTION_LABELS[log.action_type] || log.action_type;
    const haystack = [
      log.user_full_name,
      log.username,
      log.summary,
      log.details || '',
      actionLabel,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export interface ServiceRecordPrintSource {
  id: number;
  ticket_id: number;
  ticket_type: ServiceType;
  modem_source: ModemSource;
  out_total_meter: number;
  in_total_meter: number;
}

export function buildServiceRecordPrintMeta(record: ServiceRecordPrintSource): {
  documentCode: string;
  serviceTypeLabel: string;
  modemSourceLabel: string;
  totalCableMeters: number;
} {
  const outM = Math.max(0, Number(record.out_total_meter) || 0);
  const inM = Math.max(0, Number(record.in_total_meter) || 0);
  return {
    documentCode: `FOB-${String(record.ticket_id).padStart(4, '0')}-${String(record.id).padStart(3, '0')}`,
    serviceTypeLabel: record.ticket_type === 'install' ? 'نصب و راه‌اندازی سرویس جدید (Install)' : 'رفع خرابی و پشتیبانی فنی (Fault)',
    modemSourceLabel: record.modem_source === 'customer' ? 'مودم شخصی مشترک' : 'مودم تحویلی شرکت',
    totalCableMeters: outM + inM,
  };
}

export interface ScheduledTicketLike {
  id: number;
  type: ServiceType;
  status: 'pending' | 'assigned' | 'completed';
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  created_at: string;
}

export function getTicketScheduleIsoDate(
  ticket: Pick<ScheduledTicketLike, 'scheduled_date' | 'created_at'>,
): string | null {
  const raw = (ticket.scheduled_date || ticket.created_at || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : null;
}

export function groupScheduledTicketsByJalaliDay<T extends ScheduledTicketLike>(
  tickets: T[],
  jy: number,
  jm: number,
  onlyInstallations = false,
): Record<number, T[]> {
  const grouped: Record<number, T[]> = {};
  for (const ticket of tickets) {
    if (ticket.status === 'completed') continue;
    if (onlyInstallations && ticket.type !== 'install') continue;
    const iso = getTicketScheduleIsoDate(ticket);
    if (!iso) continue;
    const [gy, gm, gd] = iso.split('-').map(Number);
    const j = gregorianToJalali(gy, gm, gd);
    if (j.jy !== jy || j.jm !== jm) continue;
    if (!grouped[j.jd]) grouped[j.jd] = [];
    grouped[j.jd].push(ticket);
  }
  for (const dayKey of Object.keys(grouped)) {
    grouped[Number(dayKey)].sort((a, b) => {
      const ta = (a.scheduled_time || '23:59').localeCompare(b.scheduled_time || '23:59');
      return ta !== 0 ? ta : a.id - b.id;
    });
  }
  return grouped;
}

export function getUpcomingScheduledTickets<T extends ScheduledTicketLike>(
  tickets: T[],
  fromIsoDate: string,
  onlyInstallations = false,
  limit = 6,
): T[] {
  return tickets
    .filter((t) => {
      if (t.status === 'completed') return false;
      if (onlyInstallations && t.type !== 'install') return false;
      const iso = getTicketScheduleIsoDate(t);
      return Boolean(iso && iso >= fromIsoDate);
    })
    .sort((a, b) => {
      const da = getTicketScheduleIsoDate(a) || '';
      const db = getTicketScheduleIsoDate(b) || '';
      if (da !== db) return da.localeCompare(db);
      const ta = (a.scheduled_time || '23:59').localeCompare(b.scheduled_time || '23:59');
      return ta !== 0 ? ta : a.id - b.id;
    })
    .slice(0, limit);
}


