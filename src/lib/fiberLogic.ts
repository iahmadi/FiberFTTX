// Pure Fiber Optic ERP domain logic: F-FAT codes, modem regex validation,
// tariff snapshot calculations, spool deduction rules, and double-entry ledger totals.

export type ServiceType = 'install' | 'fault';
export type TariffCalcType = 'fixed' | 'per_meter' | 'hybrid';

export interface ModemBrandRule {
  id: number;
  name: string;
  serial_pattern: string;
  serial_prefix: string;
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
