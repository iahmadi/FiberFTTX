// Pure AvaNetwork Fiber ERP domain logic:
// 1. 5-type ticketing metadata & dynamic field visibility
// 2. Hardware connection source validation (FAT vs FFAT)
// 3. Spool & Van Stock atomic deduction validation + low-spool alerts
// 4. Modem brand regex/prefix validation
// 5. Dynamic tariff templates, promotions/campaigns (weekly/monthly/carry_over), and ledger balance

import { JALALI_MONTH_NAMES, gregorianToJalali, toPersianDigits } from './jalali.ts';
import type {
  ServicePriceSnapshot,
  TariffCalcMode,
  TariffTemplateRulesJson,
  TariffTypeRule,
  TicketTypeKey,
} from '../db/schema.ts';

export type {
  ServicePriceSnapshot,
  TariffCalcMode,
  TariffTemplateRulesJson,
  TariffTypeRule,
  TicketTypeKey,
};
export type ModemSource = 'company' | 'customer';
export type ServiceSourceType = 'FAT' | 'FFAT';
export type TicketStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export const TICKET_TYPES: TicketTypeKey[] = [
  'internet_install',
  'internet_fault',
  'ffat_install',
  'ffat_fault',
  'voip_install',
];

export const TICKET_TYPE_LABELS: Record<TicketTypeKey, string> = {
  internet_install: 'نصب اینترنت FTTH',
  internet_fault: 'رفع خرابی اینترنت',
  ffat_install: 'نصب F-FAT جدید',
  ffat_fault: 'رفع خرابی F-FAT',
  voip_install: 'راه‌اندازی تلفن VoIP',
};

export interface TicketFieldVisibility {
  showPppoeVlan: boolean;
  showVoip: boolean;
  requiresModem: boolean;
  label: string;
}

export function getTicketTypeFieldVisibility(type: TicketTypeKey): TicketFieldVisibility {
  switch (type) {
    case 'internet_install':
      return {
        showPppoeVlan: true,
        showVoip: true,
        requiresModem: true,
        label: TICKET_TYPE_LABELS.internet_install,
      };
    case 'internet_fault':
      return {
        showPppoeVlan: true,
        showVoip: false,
        requiresModem: false,
        label: TICKET_TYPE_LABELS.internet_fault,
      };
    case 'voip_install':
      return {
        showPppoeVlan: false,
        showVoip: true,
        requiresModem: true,
        label: TICKET_TYPE_LABELS.voip_install,
      };
    case 'ffat_install':
      return {
        showPppoeVlan: false,
        showVoip: false,
        requiresModem: false,
        label: TICKET_TYPE_LABELS.ffat_install,
      };
    case 'ffat_fault':
      return {
        showPppoeVlan: false,
        showVoip: false,
        requiresModem: false,
        label: TICKET_TYPE_LABELS.ffat_fault,
      };
  }
}

export interface ModemBrandRule {
  id: number;
  name: string;
  serial_prefix: string;
  serial_pattern: string;
}

export function validateModemSerial(
  serial: string,
  brand: Pick<ModemBrandRule, 'name' | 'serial_prefix' | 'serial_pattern'>,
): { valid: boolean; reason?: string } {
  const trimmed = serial.trim();
  if (!trimmed) {
    return { valid: false, reason: 'شماره سریال مودم الزامی است.' };
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
        reason: `فرمت سریال با الگوی کارخانه ${brand.name} (${brand.serial_pattern}) مطابقت ندارد.`,
      };
    }
  } catch {
    return { valid: false, reason: 'الگوی Regex تعریف‌شده برای برند نامعتبر است.' };
  }
  return { valid: true };
}

export interface SpoolRecord {
  id: number;
  spool_code: string;
  cable_type: 'indoor' | 'outdoor';
  initial_length: number;
  current_length: number;
  assigned_installer_id: number | null;
}

export function validateSpoolConsumption(
  spool: SpoolRecord | undefined,
  expectedCableType: 'indoor' | 'outdoor',
  requestedMeters: number,
  installerId: number,
  canCrossUseCable: boolean,
): { ok: boolean; error?: string } {
  if (requestedMeters === 0) {
    return { ok: true };
  }
  if (!Number.isInteger(requestedMeters) || requestedMeters < 0) {
    return { ok: false, error: 'متراژ مصرفی باید عدد صحیح نامنفی باشد.' };
  }
  if (!spool) {
    return {
      ok: false,
      error: `قرقره ${expectedCableType === 'outdoor' ? 'فضای باز' : 'داخلی'} انتخاب نشده است.`,
    };
  }
  if (spool.cable_type !== expectedCableType) {
    return {
      ok: false,
      error: `نوع کابل قرقره ${spool.spool_code} با بخش انتخاب‌شده همخوانی ندارد.`,
    };
  }
  if (spool.assigned_installer_id === null) {
    return {
      ok: false,
      error: `قرقره ${spool.spool_code} هنوز به انبار خودروی هیچ نصابی تخصیص نیافته است.`,
    };
  }
  if (spool.assigned_installer_id !== installerId && !canCrossUseCable) {
    return {
      ok: false,
      error: `قرقره ${spool.spool_code} متعلق به نصاب دیگری است (مجوز can_cross_use_cable ندارید).`,
    };
  }
  if (spool.current_length < requestedMeters) {
    return {
      ok: false,
      error: `متراژ باقی‌مانده قرقره ${spool.spool_code} (${spool.current_length} متر) کمتر از میزان درخواستی (${requestedMeters} متر) است.`,
    };
  }
  return { ok: true };
}

export interface VanStockRecord {
  id: number;
  user_id: number;
  item_id: number;
  item_type: 'unit' | 'spool' | 'modem';
  serial_number: string | null;
  quantity: number;
}

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
    return {
      ok: false,
      error: 'برای مودم شرکت، انتخاب مودم از موجودی خودروی نصاب (Van Stock) الزامی است.',
    };
  }
  if (vanStock.item_type !== 'modem') {
    return { ok: false, error: 'ردیف انتخاب‌شده از نوع مودم نیست.' };
  }
  if (vanStock.quantity < 1) {
    return { ok: false, error: 'موجودی این مودم در انبار خودرو به اتمام رسیده است.' };
  }
  if (vanStock.user_id !== installerId && !canCrossUseInventory) {
    return { ok: false, error: 'این مودم متعلق به خودروی نصاب دیگری است.' };
  }
  if (
    vanStock.serial_number &&
    vanStock.serial_number.trim() &&
    vanStock.serial_number.trim().toUpperCase() !== modemSerial.trim().toUpperCase()
  ) {
    return {
      ok: false,
      error: `سریال واردشده باید با سریال انبار خودرو (${vanStock.serial_number}) یکسان باشد.`,
    };
  }
  return { ok: true };
}

export function generateFFatCode(fatNumber: number, suffixInput: string): string {
  const cleanSuffix = suffixInput.trim().toUpperCase().replace(/\s+/g, '');
  if (!Number.isInteger(fatNumber) || fatNumber <= 0) {
    throw new Error('شماره FAT نامعتبر است.');
  }
  if (!cleanSuffix || !/^[A-Z0-9_-]{1,20}$/.test(cleanSuffix)) {
    throw new Error('پسوند F-FAT باید حروف انگلیسی یا عدد باشد (حداکثر ۲۰ کاراکتر).');
  }
  return `FAT${fatNumber}-${cleanSuffix}`;
}

export interface PromotionRule {
  id: number;
  name: string;
  target_type: string; // 'all' | 'installs' | TicketTypeKey
  target_value: number;
  reward_amount: number;
  reset_cycle: 'weekly' | 'monthly' | 'campaign';
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  carry_over: boolean;
}

export interface CompletedTicketEvent {
  ticket_id: number;
  type: TicketTypeKey;
  completed_at: string; // ISO date or timestamp
}

export interface PromotionEvaluation {
  eligible: boolean;
  cycleCountAfterThis: number;
  targetValue: number;
  bonusEarned: number;
  progressPercent: number;
  carriedOverCount: number;
}

function getCycleStartIso(refDate: Date, cycle: PromotionRule['reset_cycle'], campaignStart: string): string {
  if (cycle === 'campaign') return campaignStart;
  if (cycle === 'weekly') {
    const d = new Date(refDate);
    const jalaliDayOffset = (d.getDay() + 1) % 7; // Saturday start of week
    d.setDate(d.getDate() - jalaliDayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // monthly (Jalali month start mapped to Gregorian ISO)
  const j = gregorianToJalali(refDate.getFullYear(), refDate.getMonth() + 1, refDate.getDate());
  // Approximate/exact scan back up to 31 days to find day 1 of the current Jalali month
  const d = new Date(refDate);
  d.setDate(d.getDate() - (j.jd - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function doesTicketMatchPromotionTarget(
  ticketType: TicketTypeKey,
  targetType: string,
): boolean {
  if (targetType === 'all') return true;
  if (targetType === 'installs') {
    return ticketType === 'internet_install' || ticketType === 'ffat_install' || ticketType === 'voip_install';
  }
  return ticketType === targetType;
}

export function evaluatePromotionForTicket(
  promo: PromotionRule | null | undefined,
  priorCompletedEvents: CompletedTicketEvent[],
  currentTicketType: TicketTypeKey,
  referenceTimestampIso: string,
): PromotionEvaluation {
  if (!promo || promo.target_value <= 0 || promo.reward_amount <= 0) {
    return {
      eligible: false,
      cycleCountAfterThis: 0,
      targetValue: 0,
      bonusEarned: 0,
      progressPercent: 0,
      carriedOverCount: 0,
    };
  }

  const refIsoDate = referenceTimestampIso.slice(0, 10);
  const inDateRange = refIsoDate >= promo.start_date && refIsoDate <= promo.end_date;
  if (!inDateRange || !doesTicketMatchPromotionTarget(currentTicketType, promo.target_type)) {
    return {
      eligible: false,
      cycleCountAfterThis: 0,
      targetValue: promo.target_value,
      bonusEarned: 0,
      progressPercent: 0,
      carriedOverCount: 0,
    };
  }

  const refDate = new Date(referenceTimestampIso);
  const cycleStart = getCycleStartIso(refDate, promo.reset_cycle, promo.start_date);
  const effectiveCycleStart = cycleStart > promo.start_date ? cycleStart : promo.start_date;

  const matchingInCampaign = priorCompletedEvents.filter((ev) => {
    const d = ev.completed_at.slice(0, 10);
    return (
      d >= promo.start_date &&
      d <= refIsoDate &&
      doesTicketMatchPromotionTarget(ev.type, promo.target_type)
    );
  });

  const matchingInCurrentCycle = matchingInCampaign.filter(
    (ev) => ev.completed_at.slice(0, 10) >= effectiveCycleStart,
  );

  let carriedOverCount = 0;
  if (promo.carry_over && effectiveCycleStart > promo.start_date) {
    const priorBeforeCycle = matchingInCampaign.filter(
      (ev) => ev.completed_at.slice(0, 10) < effectiveCycleStart,
    ).length;
    carriedOverCount = priorBeforeCycle % promo.target_value;
  }

  const effectiveTotalBeforeThis = matchingInCurrentCycle.length + carriedOverCount;
  const cycleCountAfterThis = effectiveTotalBeforeThis + 1;

  // Reward unlocks every time the target threshold is hit within the active cycle
  const hitTargetNow = cycleCountAfterThis > 0 && cycleCountAfterThis % promo.target_value === 0;
  const currentModulo = cycleCountAfterThis % promo.target_value;
  const progressPercent = hitTargetNow
    ? 100
    : Math.min(99, Math.round((currentModulo / promo.target_value) * 100));

  return {
    eligible: true,
    cycleCountAfterThis,
    targetValue: promo.target_value,
    bonusEarned: hitTargetNow ? Number(promo.reward_amount) : 0,
    progressPercent,
    carriedOverCount,
  };
}

export function calculateTemplatePriceSnapshot(params: {
  templateName: string;
  rulesJson: TariffTemplateRulesJson;
  ticketType: TicketTypeKey;
  outMeter: number;
  inMeter: number;
  promotionName?: string | null;
  promotionBonus?: number;
  computedAt?: string;
}): ServicePriceSnapshot {
  const rule: TariffTypeRule = params.rulesJson[params.ticketType] || {
    calc_type: 'fixed',
    base_price: 500000,
    meter_limit: 0,
    extra_meter_price: 0,
  };

  const safeOut = Math.max(0, Math.round(params.outMeter));
  const safeIn = Math.max(0, Math.round(params.inMeter));
  const totalMeter = safeOut + safeIn;

  const basePrice = Number(rule.base_price) || 0;
  const meterLimit = Math.max(0, Math.round(Number(rule.meter_limit) || 0));
  const extraPrice = Number(rule.extra_meter_price) || 0;

  let billableExtraMeter = 0;
  let extraMeterFee = 0;
  let subtotal = 0;

  if (rule.calc_type === 'fixed') {
    subtotal = basePrice;
  } else if (rule.calc_type === 'per_meter') {
    billableExtraMeter = totalMeter;
    extraMeterFee = billableExtraMeter * extraPrice;
    subtotal = basePrice + extraMeterFee;
  } else {
    billableExtraMeter = Math.max(0, totalMeter - meterLimit);
    extraMeterFee = billableExtraMeter * extraPrice;
    subtotal = basePrice + extraMeterFee;
  }

  const promoBonus = Math.max(0, Number(params.promotionBonus) || 0);
  const totalEarned = Math.round((subtotal + promoBonus) * 100) / 100;

  return {
    template_name: params.templateName,
    calc_type: rule.calc_type,
    ticket_type: params.ticketType,
    base_price: basePrice,
    meter_limit: meterLimit,
    extra_meter_price: extraPrice,
    out_meter: safeOut,
    in_meter: safeIn,
    total_meter: totalMeter,
    billable_extra_meter: billableExtraMeter,
    extra_meter_fee: extraMeterFee,
    promotion_name: params.promotionName || null,
    promotion_bonus: promoBonus,
    total_earned: totalEarned,
    computed_at: params.computedAt || new Date().toISOString(),
  };
}

export interface LedgerEntryLike {
  amount: number | string;
  type: 'credit' | 'debit';
}

export function computeLedgerBalance(entries: LedgerEntryLike[]): {
  totalCredit: number;
  totalDebit: number;
  balance: number;
} {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const entry of entries) {
    const val = Number(entry.amount) || 0;
    if (entry.type === 'credit') totalCredit += val;
    else if (entry.type === 'debit') totalDebit += val;
  }
  return {
    totalCredit: Math.round(totalCredit * 100) / 100,
    totalDebit: Math.round(totalDebit * 100) / 100,
    balance: Math.round((totalCredit - totalDebit) * 100) / 100,
  };
}

export const LOW_SPOOL_THRESHOLD_PCT = 10;

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

export interface SpoolWarningItem {
  id: number;
  spool_code: string;
  current_length: number;
  initial_length: number;
  percentRemaining: number;
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

export interface MonthlyContractorEarning {
  monthKey: string;
  monthLabel: string;
  totalEarnings: number;
  entryCount: number;
}

export type EarningsRangePreset = 'all' | '3m' | '6m' | '12m' | 'custom';

export function aggregateMonthlyContractorEarnings(
  entries: Array<{ amount: number | string; type: string; created_at: string }>,
): MonthlyContractorEarning[] {
  const buckets = new Map<string, MonthlyContractorEarning>();
  for (const entry of entries) {
    if (entry.type !== 'credit') continue;
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;
    const d = new Date(entry.created_at);
    if (Number.isNaN(d.getTime())) continue;

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
  options: { preset: EarningsRangePreset; fromMonth?: string; toMonth?: string },
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

export interface ScheduledTicketLike {
  id: number;
  type: TicketTypeKey;
  status: TicketStatus;
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
  onlyInstalls = false,
): Record<number, T[]> {
  const grouped: Record<number, T[]> = {};
  for (const t of tickets) {
    if (t.status === 'completed' || t.status === 'failed') continue;
    if (
      onlyInstalls &&
      t.type !== 'internet_install' &&
      t.type !== 'ffat_install' &&
      t.type !== 'voip_install'
    ) {
      continue;
    }
    const iso = getTicketScheduleIsoDate(t);
    if (!iso) continue;
    const [gy, gm, gd] = iso.split('-').map(Number);
    const j = gregorianToJalali(gy, gm, gd);
    if (j.jy !== jy || j.jm !== jm) continue;
    if (!grouped[j.jd]) grouped[j.jd] = [];
    grouped[j.jd].push(t);
  }
  for (const k of Object.keys(grouped)) {
    grouped[Number(k)].sort((a, b) => {
      const cmp = (a.scheduled_time || '23:59').localeCompare(b.scheduled_time || '23:59');
      return cmp !== 0 ? cmp : a.id - b.id;
    });
  }
  return grouped;
}

export interface TicketCompletionStatItem {
  type: TicketTypeKey;
  label: string;
  totalCount: number;
  completedCount: number;
  completionRatePct: number;
  shareOfCompletedPct: number;
}

export interface Last30DaysCompletionSummary {
  windowDays: number;
  overallTotal: number;
  overallCompleted: number;
  overallCompletionRatePct: number;
  byType: TicketCompletionStatItem[];
}

export function computeLast30DaysCompletionByType(
  tickets: Array<{
    type: TicketTypeKey;
    status: TicketStatus;
    created_at: string | Date;
    completed_at?: string | Date | null;
  }>,
  referenceDate: Date = new Date(),
): Last30DaysCompletionSummary {
  const refMs = referenceDate.getTime();
  const cutoffMs = refMs - 30 * 24 * 60 * 60 * 1000;

  const statsMap = new Map<TicketTypeKey, { total: number; completed: number }>();
  for (const tType of TICKET_TYPES) {
    statsMap.set(tType, { total: 0, completed: 0 });
  }

  for (const ticket of tickets) {
    const createdMs = new Date(ticket.created_at).getTime();
    const completedMs = ticket.completed_at ? new Date(ticket.completed_at).getTime() : NaN;
    const activeMs =
      ticket.status === 'completed' && !Number.isNaN(completedMs) ? completedMs : createdMs;

    if (Number.isNaN(activeMs) || activeMs < cutoffMs || activeMs > refMs + 24 * 60 * 60 * 1000) {
      continue;
    }

    const bucket = statsMap.get(ticket.type);
    if (!bucket) continue;
    bucket.total += 1;
    if (ticket.status === 'completed') {
      bucket.completed += 1;
    }
  }

  let overallTotal = 0;
  let overallCompleted = 0;
  for (const b of statsMap.values()) {
    overallTotal += b.total;
    overallCompleted += b.completed;
  }

  const byType: TicketCompletionStatItem[] = TICKET_TYPES.map((tType) => {
    const b = statsMap.get(tType) ?? { total: 0, completed: 0 };
    return {
      type: tType,
      label: TICKET_TYPE_LABELS[tType],
      totalCount: b.total,
      completedCount: b.completed,
      completionRatePct: b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0,
      shareOfCompletedPct:
        overallCompleted > 0 ? Math.round((b.completed / overallCompleted) * 100) : 0,
    };
  });

  return {
    windowDays: 30,
    overallTotal,
    overallCompleted,
    overallCompletionRatePct:
      overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0,
    byType,
  };
}

export interface SpoolConsumptionEventLike {
  installer_id: number;
  installer_name?: string | null;
  out_spool_id: number | null;
  out_total_meter: number;
  in_spool_id: number | null;
  in_total_meter: number;
  created_at: string | Date;
}

export type ReorderUrgency = 'immediate' | 'soon' | 'planned' | 'no_usage';

export interface SpoolForecastItem {
  spoolId: number;
  spoolCode: string;
  cableType: 'indoor' | 'outdoor';
  installerName: string;
  initialLength: number;
  currentLength: number;
  monthlyRateMeters: number;
  dailyRateMeters: number;
  rateSource: 'spool_history' | 'contractor_avg' | 'company_avg' | 'depletion_delta' | 'none';
  estimatedDaysRemaining: number | null;
  estimatedDepletionIsoDate: string | null;
  reorderPointMeters: number;
  daysUntilReorder: number | null;
  recommendedReorderIsoDate: string | null;
  urgency: ReorderUrgency;
  recommendedActionText: string;
}

export interface ContractorMonthlyUsageItem {
  installerId: number;
  installerName: string;
  outdoorMonthlyMeters: number;
  indoorMonthlyMeters: number;
  totalMonthlyMeters: number;
}

export interface InventoryForecastReport {
  lookbackDays: number;
  leadTimeDays: number;
  avgOutdoorMonthlyMeters: number;
  avgIndoorMonthlyMeters: number;
  immediateReorderCount: number;
  soonReorderCount: number;
  contractorUsages: ContractorMonthlyUsageItem[];
  spoolForecasts: SpoolForecastItem[];
}

function addDaysToIso(refDate: Date, days: number): string {
  const d = new Date(refDate.getTime());
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function computeSpoolConsumptionForecasts(
  spools: Array<SpoolRecord & { installer_name?: string | null }>,
  events: SpoolConsumptionEventLike[],
  options: {
    lookbackDays?: number;
    leadTimeDays?: number;
    safetyStockPct?: number;
    referenceDate?: Date;
  } = {},
): InventoryForecastReport {
  const lookbackDays = Math.max(7, Math.round(options.lookbackDays ?? 30));
  const leadTimeDays = Math.max(1, Math.round(options.leadTimeDays ?? 7));
  const safetyStockPct = Math.max(0, Math.min(50, options.safetyStockPct ?? LOW_SPOOL_THRESHOLD_PCT));
  const refDate = options.referenceDate ?? new Date();
  const refMs = refDate.getTime();
  const cutoffMs = refMs - lookbackDays * 24 * 60 * 60 * 1000;
  const monthScale = 30 / lookbackDays;

  const spoolDirectMeters = new Map<number, number>();
  const contractorStats = new Map<
    number,
    { name: string; outdoorMeters: number; indoorMeters: number }
  >();

  let totalOutdoorWindow = 0;
  let totalIndoorWindow = 0;

  for (const ev of events) {
    const evMs = new Date(ev.created_at).getTime();
    if (Number.isNaN(evMs) || evMs < cutoffMs || evMs > refMs + 24 * 60 * 60 * 1000) continue;

    if (ev.out_spool_id && ev.out_total_meter > 0) {
      spoolDirectMeters.set(
        ev.out_spool_id,
        (spoolDirectMeters.get(ev.out_spool_id) ?? 0) + ev.out_total_meter,
      );
    }
    if (ev.in_spool_id && ev.in_total_meter > 0) {
      spoolDirectMeters.set(
        ev.in_spool_id,
        (spoolDirectMeters.get(ev.in_spool_id) ?? 0) + ev.in_total_meter,
      );
    }

    totalOutdoorWindow += Math.max(0, ev.out_total_meter);
    totalIndoorWindow += Math.max(0, ev.in_total_meter);

    const existing = contractorStats.get(ev.installer_id) ?? {
      name: ev.installer_name || `پیمانکار #${ev.installer_id}`,
      outdoorMeters: 0,
      indoorMeters: 0,
    };
    existing.outdoorMeters += Math.max(0, ev.out_total_meter);
    existing.indoorMeters += Math.max(0, ev.in_total_meter);
    contractorStats.set(ev.installer_id, existing);
  }

  const contractorUsages: ContractorMonthlyUsageItem[] = Array.from(contractorStats.entries())
    .map(([installerId, st]) => {
      const outdoorMonthlyMeters = Math.round(st.outdoorMeters * monthScale);
      const indoorMonthlyMeters = Math.round(st.indoorMeters * monthScale);
      return {
        installerId,
        installerName: st.name,
        outdoorMonthlyMeters,
        indoorMonthlyMeters,
        totalMonthlyMeters: outdoorMonthlyMeters + indoorMonthlyMeters,
      };
    })
    .filter((item) => item.totalMonthlyMeters > 0)
    .sort((a, b) => b.totalMonthlyMeters - a.totalMonthlyMeters);

  const activeContractorCount = Math.max(1, contractorUsages.length);
  const avgOutdoorMonthlyMeters = Math.round((totalOutdoorWindow * monthScale) / activeContractorCount);
  const avgIndoorMonthlyMeters = Math.round((totalIndoorWindow * monthScale) / activeContractorCount);

  let immediateReorderCount = 0;
  let soonReorderCount = 0;

  const spoolForecasts: SpoolForecastItem[] = spools.map((sp) => {
    const directMonthly = Math.round((spoolDirectMeters.get(sp.id) ?? 0) * monthScale);
    const contractorUsage = sp.assigned_installer_id
      ? contractorUsages.find((c) => c.installerId === sp.assigned_installer_id)
      : undefined;
    const contractorTypeMonthly = contractorUsage
      ? sp.cable_type === 'outdoor'
        ? contractorUsage.outdoorMonthlyMeters
        : contractorUsage.indoorMonthlyMeters
      : 0;
    const companyTypeAvg =
      sp.cable_type === 'outdoor' ? avgOutdoorMonthlyMeters : avgIndoorMonthlyMeters;
    const observedDepletion = Math.max(0, sp.initial_length - sp.current_length);

    let monthlyRateMeters = 0;
    let rateSource: SpoolForecastItem['rateSource'] = 'none';

    if (directMonthly > 0) {
      monthlyRateMeters = directMonthly;
      rateSource = 'spool_history';
    } else if (contractorTypeMonthly > 0) {
      monthlyRateMeters = contractorTypeMonthly;
      rateSource = 'contractor_avg';
    } else if (observedDepletion > 0) {
      monthlyRateMeters = Math.max(1, Math.round(observedDepletion * monthScale));
      rateSource = 'depletion_delta';
    } else if (companyTypeAvg > 0) {
      monthlyRateMeters = companyTypeAvg;
      rateSource = 'company_avg';
    }

    const dailyRateMeters =
      monthlyRateMeters > 0 ? Math.round((monthlyRateMeters / 30) * 10) / 10 : 0;

    const safetyMeters = (sp.initial_length * safetyStockPct) / 100;

    if (dailyRateMeters <= 0) {
      const lowNow = isSpoolLowStock(sp, safetyStockPct);
      if (lowNow) immediateReorderCount += 1;
      return {
        spoolId: sp.id,
        spoolCode: sp.spool_code,
        cableType: sp.cable_type,
        installerName: sp.installer_name || 'انبار مرکزی',
        initialLength: sp.initial_length,
        currentLength: sp.current_length,
        monthlyRateMeters: 0,
        dailyRateMeters: 0,
        rateSource: 'none',
        estimatedDaysRemaining: null,
        estimatedDepletionIsoDate: null,
        reorderPointMeters: Math.round(safetyMeters),
        daysUntilReorder: lowNow ? 0 : null,
        recommendedReorderIsoDate: lowNow ? addDaysToIso(refDate, 0) : null,
        urgency: lowNow ? 'immediate' : 'no_usage',
        recommendedActionText: lowNow
          ? 'موجودی زیر آستانه است — سفارش خرید فوری'
          : 'مصرف اخیری برای این قرقره ثبت نشده است',
      };
    }

    const estimatedDaysRemaining = Math.max(0, Math.round(sp.current_length / dailyRateMeters));
    const estimatedDepletionIsoDate = addDaysToIso(refDate, estimatedDaysRemaining);

    const reorderPointMeters = Math.min(
      sp.initial_length,
      Math.round(safetyMeters + dailyRateMeters * leadTimeDays),
    );
    const metersAboveSafety = Math.max(0, sp.current_length - safetyMeters);
    const daysUntilSafety = Math.round(metersAboveSafety / dailyRateMeters);
    const daysUntilReorder = Math.max(0, daysUntilSafety - leadTimeDays);
    const recommendedReorderIsoDate = addDaysToIso(refDate, daysUntilReorder);

    let urgency: ReorderUrgency = 'planned';
    let recommendedActionText = `پیشنهاد ثبت سفارش تا ${toPersianDigits(daysUntilReorder)} روز آینده`;

    if (sp.current_length <= safetyMeters || daysUntilReorder === 0) {
      urgency = 'immediate';
      immediateReorderCount += 1;
      recommendedActionText = 'سفارش خرید فوری (امروز)';
    } else if (daysUntilReorder <= 14) {
      urgency = 'soon';
      soonReorderCount += 1;
      recommendedActionText = `نیاز به خرید مجدد طی ${toPersianDigits(daysUntilReorder)} روز آینده`;
    }

    return {
      spoolId: sp.id,
      spoolCode: sp.spool_code,
      cableType: sp.cable_type,
      installerName: sp.installer_name || 'انبار مرکزی',
      initialLength: sp.initial_length,
      currentLength: sp.current_length,
      monthlyRateMeters,
      dailyRateMeters,
      rateSource,
      estimatedDaysRemaining,
      estimatedDepletionIsoDate,
      reorderPointMeters,
      daysUntilReorder,
      recommendedReorderIsoDate,
      urgency,
      recommendedActionText,
    };
  });

  spoolForecasts.sort((a, b) => {
    const da = a.estimatedDaysRemaining ?? Number.MAX_SAFE_INTEGER;
    const dbVal = b.estimatedDaysRemaining ?? Number.MAX_SAFE_INTEGER;
    return da - dbVal;
  });

  return {
    lookbackDays,
    leadTimeDays,
    avgOutdoorMonthlyMeters,
    avgIndoorMonthlyMeters,
    immediateReorderCount,
    soonReorderCount,
    contractorUsages,
    spoolForecasts,
  };
}

export interface RbacPolicySubject {
  id: number;
  role_id: number;
  role_name: string;
  is_active: boolean;
  permissions: string[];
}

export interface RbacPolicyDecision {
  allowed: boolean;
  reason?: string;
}

export function evaluateRbacPolicy(
  subject: RbacPolicySubject | null | undefined,
  requiredPermissions: string[],
  options: { requireAll?: boolean } = {},
): RbacPolicyDecision {
  if (!subject || !subject.is_active) {
    return { allowed: false, reason: 'حساب کاربری غیرفعال یا فاقد نشست معتبر است.' };
  }
  if (!Number.isInteger(subject.role_id) || subject.role_id <= 0) {
    return { allowed: false, reason: 'نقش کاربری معتبر برای این حساب تعریف نشده است.' };
  }
  if (subject.role_name === 'SuperAdmin') {
    return { allowed: true };
  }
  if (requiredPermissions.length === 0) {
    return { allowed: true };
  }
  const permSet = new Set(subject.permissions);
  const hasMatch = options.requireAll
    ? requiredPermissions.every((p) => permSet.has(p))
    : requiredPermissions.some((p) => permSet.has(p));

  if (!hasMatch) {
    return { allowed: false, reason: 'سطح دسترسی (role_id) شما مجوز انجام این عملیات را ندارد.' };
  }
  return { allowed: true };
}

export interface TicketSlaStatus {
  isBreached: boolean;
  elapsedHours: number;
  elapsedMinutes: number;
  elapsedLabel: string;
}

export function evaluateTicketSla(
  ticket: {
    status: TicketStatus;
    assigned_at?: string | Date | null;
  },
  thresholdHours = 4,
  referenceDate: Date = new Date(),
): TicketSlaStatus {
  if (ticket.status !== 'pending' || !ticket.assigned_at) {
    return { isBreached: false, elapsedHours: 0, elapsedMinutes: 0, elapsedLabel: '' };
  }
  const assignedMs = new Date(ticket.assigned_at).getTime();
  if (Number.isNaN(assignedMs)) {
    return { isBreached: false, elapsedHours: 0, elapsedMinutes: 0, elapsedLabel: '' };
  }
  const diffMs = Math.max(0, referenceDate.getTime() - assignedMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const elapsedHours = Math.floor(totalMinutes / 60);
  const elapsedMinutes = totalMinutes % 60;
  const isBreached = diffMs > thresholdHours * 60 * 60 * 1000;

  const elapsedLabel =
    elapsedHours >= 24
      ? `${toPersianDigits(Math.floor(elapsedHours / 24))} روز و ${toPersianDigits(
          elapsedHours % 24,
        )} ساعت`
      : elapsedMinutes > 0
        ? `${toPersianDigits(elapsedHours)} ساعت و ${toPersianDigits(elapsedMinutes)} دقیقه`
        : `${toPersianDigits(elapsedHours)} ساعت`;

  return {
    isBreached,
    elapsedHours,
    elapsedMinutes,
    elapsedLabel,
  };
}

export type TicketSlaFilterKey = 'all' | 'breached' | 'on_track' | 'unassigned';

export interface TicketFilterCriteria {
  customerQuery?: string;
  typeFilter?: string;
  statusFilter?: string;
  assignedFromIso?: string;
  assignedToIso?: string;
  slaStatusFilter?: TicketSlaFilterKey;
  slaThresholdHours?: number;
}

export interface FilterableTicket {
  id: number;
  type: TicketTypeKey;
  customer_name: string;
  address: string;
  status: TicketStatus;
  assigned_at?: string | Date | null;
}

function toLocalIsoDateYmd(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filterTicketsAdvanced<T extends FilterableTicket>(
  tickets: T[],
  criteria: TicketFilterCriteria,
  referenceDate: Date = new Date(),
): T[] {
  const q = (criteria.customerQuery || '').trim().toLowerCase();
  const typeFilter = criteria.typeFilter || 'all';
  const statusFilter = criteria.statusFilter || 'all';
  const assignedFrom = (criteria.assignedFromIso || '').trim();
  const assignedTo = (criteria.assignedToIso || '').trim();
  const slaStatus = criteria.slaStatusFilter || 'all';
  const thresholdHours = criteria.slaThresholdHours ?? 4;

  return tickets.filter((ticket) => {
    if (typeFilter !== 'all' && ticket.type !== typeFilter) return false;
    if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;

    if (q) {
      const matchesQuery =
        ticket.customer_name.toLowerCase().includes(q) ||
        ticket.address.toLowerCase().includes(q) ||
        String(ticket.id).includes(q);
      if (!matchesQuery) return false;
    }

    const assignedYmd = toLocalIsoDateYmd(ticket.assigned_at);
    if (assignedFrom) {
      if (!assignedYmd || assignedYmd < assignedFrom) return false;
    }
    if (assignedTo) {
      if (!assignedYmd || assignedYmd > assignedTo) return false;
    }

    if (slaStatus !== 'all') {
      const sla = evaluateTicketSla(ticket, thresholdHours, referenceDate);
      if (slaStatus === 'breached' && !sla.isBreached) return false;
      if (slaStatus === 'unassigned' && ticket.assigned_at) return false;
      if (slaStatus === 'on_track' && (!ticket.assigned_at || sla.isBreached)) return false;
    }

    return true;
  });
}

export interface SlaDurationTicketInput {
  id?: number;
  type: TicketTypeKey;
  status: TicketStatus;
  assigned_installer?: number | null;
  installer_name?: string | null;
  assigned_at?: string | Date | null;
  started_at?: string | Date | null;
  completed_at?: string | Date | null;
}

export interface ContractorSlaRow {
  installerId: number;
  installerName: string;
  completedCount: number;
  overallAvgHours: number;
  internet_install: number | null;
  internet_fault: number | null;
  ffat_install: number | null;
  ffat_fault: number | null;
  voip_install: number | null;
  typeCounts: Record<TicketTypeKey, number>;
}

export interface ContractorSlaSummary {
  windowDays: number;
  totalCompletedAnalyzed: number;
  activeTicketTypes: TicketTypeKey[];
  contractors: ContractorSlaRow[];
}

export function computeContractorSlaAveragesLast30Days(
  tickets: SlaDurationTicketInput[],
  referenceDate: Date = new Date(),
  maxContractors = 5,
): ContractorSlaSummary {
  const windowDays = 30;
  const endMs = referenceDate.getTime();
  const startMs = endMs - windowDays * 24 * 60 * 60 * 1000;

  interface AccBucket {
    installerId: number;
    installerName: string;
    totalCount: number;
    totalHours: number;
    byTypeHours: Record<TicketTypeKey, number>;
    byTypeCount: Record<TicketTypeKey, number>;
  }

  const byInstaller = new Map<number, AccBucket>();
  const activeTypesSet = new Set<TicketTypeKey>();
  let totalCompletedAnalyzed = 0;

  for (const t of tickets) {
    if (t.status !== 'completed' || !t.completed_at || !t.assigned_installer) continue;
    const completedMs = new Date(t.completed_at).getTime();
    if (Number.isNaN(completedMs) || completedMs < startMs || completedMs > endMs) continue;

    const anchorRaw = t.assigned_at || t.started_at;
    if (!anchorRaw) continue;
    const anchorMs = new Date(anchorRaw).getTime();
    if (Number.isNaN(anchorMs) || completedMs < anchorMs) continue;

    const durationHours = (completedMs - anchorMs) / (1000 * 60 * 60);
    const installerId = t.assigned_installer;
    const installerName = (t.installer_name || '').trim() || `پیمانکار #${toPersianDigits(installerId)}`;

    let acc = byInstaller.get(installerId);
    if (!acc) {
      acc = {
        installerId,
        installerName,
        totalCount: 0,
        totalHours: 0,
        byTypeHours: {
          internet_install: 0,
          internet_fault: 0,
          ffat_install: 0,
          ffat_fault: 0,
          voip_install: 0,
        },
        byTypeCount: {
          internet_install: 0,
          internet_fault: 0,
          ffat_install: 0,
          ffat_fault: 0,
          voip_install: 0,
        },
      };
      byInstaller.set(installerId, acc);
    }

    acc.totalCount += 1;
    acc.totalHours += durationHours;
    acc.byTypeHours[t.type] += durationHours;
    acc.byTypeCount[t.type] += 1;
    activeTypesSet.add(t.type);
    totalCompletedAnalyzed += 1;
  }

  const round1 = (val: number) => Math.round(val * 10) / 10;

  const contractors: ContractorSlaRow[] = Array.from(byInstaller.values())
    .sort((a, b) => {
      if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
      return a.totalHours / a.totalCount - b.totalHours / b.totalCount;
    })
    .slice(0, maxContractors)
    .map((acc) => ({
      installerId: acc.installerId,
      installerName: acc.installerName,
      completedCount: acc.totalCount,
      overallAvgHours: round1(acc.totalHours / acc.totalCount),
      internet_install:
        acc.byTypeCount.internet_install > 0
          ? round1(acc.byTypeHours.internet_install / acc.byTypeCount.internet_install)
          : null,
      internet_fault:
        acc.byTypeCount.internet_fault > 0
          ? round1(acc.byTypeHours.internet_fault / acc.byTypeCount.internet_fault)
          : null,
      ffat_install:
        acc.byTypeCount.ffat_install > 0
          ? round1(acc.byTypeHours.ffat_install / acc.byTypeCount.ffat_install)
          : null,
      ffat_fault:
        acc.byTypeCount.ffat_fault > 0
          ? round1(acc.byTypeHours.ffat_fault / acc.byTypeCount.ffat_fault)
          : null,
      voip_install:
        acc.byTypeCount.voip_install > 0
          ? round1(acc.byTypeHours.voip_install / acc.byTypeCount.voip_install)
          : null,
      typeCounts: acc.byTypeCount,
    }));

  const activeTicketTypes = TICKET_TYPES.filter((type) => activeTypesSet.has(type));

  return {
    windowDays,
    totalCompletedAnalyzed,
    activeTicketTypes,
    contractors,
  };
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending: 'در انتظار شروع',
  in_progress: 'در حال اجرا',
  completed: 'تکمیل‌شده',
  failed: 'ناموفق / لغو',
};

export interface CriticalSlaComparableTicket {
  id: number;
  type: TicketTypeKey;
  customer_name: string;
  status: TicketStatus;
  installer_name?: string | null;
  assigned_at?: string | Date | null;
  started_at?: string | Date | null;
  completed_at?: string | Date | null;
}

export interface CriticalSlaTransitionAlert {
  eventKey: string;
  ticketId: number;
  customerName: string;
  ticketType: TicketTypeKey;
  previousStatus: TicketStatus;
  newStatus: TicketStatus;
  previousStatusLabel: string;
  newStatusLabel: string;
  installerName: string;
  elapsedHours: number;
  elapsedLabel: string;
  changedAt: string;
}

function formatSlaDurationLabel(diffMs: number): { elapsedHours: number; elapsedLabel: string } {
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const elapsedHours = Math.floor(totalMinutes / 60);
  const elapsedMinutes = totalMinutes % 60;
  const elapsedLabel =
    elapsedHours >= 24
      ? `${toPersianDigits(Math.floor(elapsedHours / 24))} روز و ${toPersianDigits(
          elapsedHours % 24,
        )} ساعت`
      : elapsedMinutes > 0
        ? `${toPersianDigits(elapsedHours)} ساعت و ${toPersianDigits(elapsedMinutes)} دقیقه`
        : `${toPersianDigits(elapsedHours)} ساعت`;
  return { elapsedHours, elapsedLabel };
}

export function detectCriticalSlaStatusTransitions(
  previousTickets: CriticalSlaComparableTicket[],
  currentTickets: CriticalSlaComparableTicket[],
  thresholdHours = 4,
  referenceDate: Date = new Date(),
): CriticalSlaTransitionAlert[] {
  const prevById = new Map(previousTickets.map((t) => [t.id, t]));
  const alerts: CriticalSlaTransitionAlert[] = [];
  const thresholdMs = thresholdHours * 60 * 60 * 1000;

  for (const curr of currentTickets) {
    const prev = prevById.get(curr.id);
    if (!prev || prev.status === curr.status) continue;

    const assignedRaw = prev.assigned_at ?? curr.assigned_at;
    if (!assignedRaw) continue;
    const assignedMs = new Date(assignedRaw).getTime();
    if (Number.isNaN(assignedMs)) continue;

    const actionRaw =
      curr.status === 'completed' && curr.completed_at
        ? curr.completed_at
        : curr.status === 'in_progress' && curr.started_at
          ? curr.started_at
          : referenceDate;
    const actionDate = actionRaw instanceof Date ? actionRaw : new Date(actionRaw);
    const actionMs = Number.isNaN(actionDate.getTime())
      ? referenceDate.getTime()
      : actionDate.getTime();

    const diffMs = Math.max(0, actionMs - assignedMs);
    if (diffMs <= thresholdMs) continue;

    // Critical SLA applies specifically when a breached pending ticket or overdue ticket advances
    if (prev.status !== 'pending' && curr.status === 'pending') continue;

    const { elapsedHours, elapsedLabel } = formatSlaDurationLabel(diffMs);
    const changedAt = new Date(actionMs).toISOString();

    alerts.push({
      eventKey: `${curr.id}:${prev.status}->${curr.status}:${changedAt.slice(0, 16)}`,
      ticketId: curr.id,
      customerName: curr.customer_name,
      ticketType: curr.type,
      previousStatus: prev.status,
      newStatus: curr.status,
      previousStatusLabel: TICKET_STATUS_LABELS[prev.status],
      newStatusLabel: TICKET_STATUS_LABELS[curr.status],
      installerName:
        (curr.installer_name || prev.installer_name || '').trim() || 'تیم فنی پیمانکار',
      elapsedHours,
      elapsedLabel,
      changedAt,
    });
  }

  return alerts;
}

export function findRecentCriticalSlaTransitions(
  tickets: CriticalSlaComparableTicket[],
  recentWindowMs = 180_000,
  thresholdHours = 4,
  referenceDate: Date = new Date(),
): CriticalSlaTransitionAlert[] {
  const refMs = referenceDate.getTime();
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const alerts: CriticalSlaTransitionAlert[] = [];

  for (const t of tickets) {
    if (t.status === 'pending' || !t.assigned_at) continue;
    const assignedMs = new Date(t.assigned_at).getTime();
    if (Number.isNaN(assignedMs)) continue;

    let previousStatus: TicketStatus | null = null;
    let actionMs: number | null = null;

    if (t.status === 'in_progress' && t.started_at) {
      previousStatus = 'pending';
      actionMs = new Date(t.started_at).getTime();
    } else if (t.status === 'completed' && t.completed_at) {
      previousStatus = t.started_at ? 'in_progress' : 'pending';
      actionMs = new Date(t.completed_at).getTime();
    } else if (t.status === 'failed' && (t.completed_at || t.started_at)) {
      previousStatus = t.started_at ? 'in_progress' : 'pending';
      actionMs = new Date(t.completed_at || t.started_at!).getTime();
    }

    if (!previousStatus || actionMs === null || Number.isNaN(actionMs)) continue;
    if (refMs - actionMs > recentWindowMs || actionMs - refMs > 60_000) continue;

    const diffMs = actionMs - assignedMs;
    if (diffMs <= thresholdMs) continue;

    const { elapsedHours, elapsedLabel } = formatSlaDurationLabel(diffMs);
    const changedAt = new Date(actionMs).toISOString();

    alerts.push({
      eventKey: `${t.id}:${previousStatus}->${t.status}:${changedAt.slice(0, 16)}`,
      ticketId: t.id,
      customerName: t.customer_name,
      ticketType: t.type,
      previousStatus,
      newStatus: t.status,
      previousStatusLabel: TICKET_STATUS_LABELS[previousStatus],
      newStatusLabel: TICKET_STATUS_LABELS[t.status],
      installerName: (t.installer_name || '').trim() || 'تیم فنی پیمانکار',
      elapsedHours,
      elapsedLabel,
      changedAt,
    });
  }

  alerts.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  return alerts;
}

export interface ContractorSpoolConsumptionRow {
  installerId: number;
  installerName: string;
  outdoorMeters: number;
  indoorMeters: number;
  totalMeters: number;
  sharePct: number;
  eventCount: number;
}

export interface CurrentMonthSpoolConsumptionSummary {
  monthKey: string;
  monthLabel: string;
  totalOutdoorMeters: number;
  totalIndoorMeters: number;
  totalMeters: number;
  contractorCount: number;
  contractors: ContractorSpoolConsumptionRow[];
}

export function computeCurrentMonthSpoolConsumptionByContractor(
  events: Array<{
    installer_id: number;
    installer_name?: string | null;
    out_total_meter: number;
    in_total_meter: number;
    created_at: string | Date;
  }>,
  referenceDate: Date = new Date(),
): CurrentMonthSpoolConsumptionSummary {
  const refJalali = gregorianToJalali(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    referenceDate.getDate(),
  );
  const monthKey = `${refJalali.jy}-${String(refJalali.jm).padStart(2, '0')}`;
  const monthLabel = `${JALALI_MONTH_NAMES[refJalali.jm - 1]} ${toPersianDigits(refJalali.jy)}`;

  const buckets = new Map<
    number,
    {
      installerId: number;
      installerName: string;
      outdoorMeters: number;
      indoorMeters: number;
      eventCount: number;
    }
  >();

  let totalOutdoorMeters = 0;
  let totalIndoorMeters = 0;

  for (const ev of events) {
    const d = ev.created_at instanceof Date ? ev.created_at : new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;

    const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (j.jy !== refJalali.jy || j.jm !== refJalali.jm) continue;

    const outM = Math.max(0, Number(ev.out_total_meter) || 0);
    const inM = Math.max(0, Number(ev.in_total_meter) || 0);
    if (outM + inM <= 0) continue;

    const installerId = Number(ev.installer_id) || 0;
    const fallbackName =
      installerId === 0 ? 'انبار مرکزی' : `پیمانکار #${toPersianDigits(installerId)}`;
    const installerName = (ev.installer_name || '').trim() || fallbackName;

    const existing = buckets.get(installerId) ?? {
      installerId,
      installerName,
      outdoorMeters: 0,
      indoorMeters: 0,
      eventCount: 0,
    };
    existing.outdoorMeters += outM;
    existing.indoorMeters += inM;
    existing.eventCount += 1;
    if (ev.installer_name?.trim()) {
      existing.installerName = ev.installer_name.trim();
    }
    buckets.set(installerId, existing);

    totalOutdoorMeters += outM;
    totalIndoorMeters += inM;
  }

  const totalMeters = totalOutdoorMeters + totalIndoorMeters;

  const contractors: ContractorSpoolConsumptionRow[] = Array.from(buckets.values())
    .map((b) => {
      const rowTotal = b.outdoorMeters + b.indoorMeters;
      return {
        installerId: b.installerId,
        installerName: b.installerName,
        outdoorMeters: b.outdoorMeters,
        indoorMeters: b.indoorMeters,
        totalMeters: rowTotal,
        sharePct: totalMeters > 0 ? Math.round((rowTotal / totalMeters) * 100) : 0,
        eventCount: b.eventCount,
      };
    })
    .sort((a, b) => b.totalMeters - a.totalMeters);

  return {
    monthKey,
    monthLabel,
    totalOutdoorMeters,
    totalIndoorMeters,
    totalMeters,
    contractorCount: contractors.length,
    contractors,
  };
}

