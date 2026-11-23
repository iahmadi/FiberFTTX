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
