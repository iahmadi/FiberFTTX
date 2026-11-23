import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianToJalali,
  jalaliToGregorian,
  getJalaliMonthLength,
  toPersianDigits,
} from './jalali.ts';
import {
  generateFFatCode,
  validateModemSerial,
  validateSpoolConsumption,
  calculateTariffSnapshot,
  computeLedgerBalance,
} from './fiberLogic.ts';
import {
  filterTicketsByQuery,
  matchesHardwareQuery,
  normalizeSearchText,
} from './searchFilter.ts';

test('Jalali converter round-trips standard and leap dates accurately', () => {
  // 2024-03-20 is 1403/01/01 (Nowruz 1403 - leap year)
  const j1 = gregorianToJalali(2024, 3, 20);
  assert.deepEqual(j1, { jy: 1403, jm: 1, jd: 1 });
  assert.equal(getJalaliMonthLength(1403, 12), 30);
  assert.equal(getJalaliMonthLength(1404, 12), 29);

  const g1 = jalaliToGregorian(1403, 12, 30);
  assert.deepEqual(g1, { gy: 2025, gm: 3, gd: 20 });
  assert.equal(toPersianDigits('1403/12/30'), '۱۴۰۳/۱۲/۳۰');
});

test('F-FAT dynamic code generation formats and validates properly', () => {
  assert.equal(generateFFatCode(12, 'a3'), 'FAT12-A3');
  assert.throws(() => generateFFatCode(0, 'A1'));
  assert.throws(() => generateFFatCode(12, 'bad code!'));
});

test('Modem serial regex & prefix validation catches invalid serials', () => {
  const huawei = {
    name: 'Huawei HG8245H',
    serial_prefix: '48575443',
    serial_pattern: '^48575443[A-F0-9]{8}$',
  };
  assert.equal(validateModemSerial('48575443A1B2C3D4', huawei).valid, true);
  assert.equal(validateModemSerial('99999999A1B2C3D4', huawei).valid, false);
  assert.equal(validateModemSerial('48575443XYZ', huawei).valid, false);
});

test('Spool consumption checks stock sufficiency and cross-use permission', () => {
  const spool = {
    id: 1,
    spool_code: 'OUT-100',
    cable_type: 'outdoor' as const,
    initial_length: 1000,
    current_length: 120,
    assigned_installer_id: 3,
  };

  assert.equal(validateSpoolConsumption(spool, 'outdoor', 80, 3, false).ok, true);
  assert.equal(validateSpoolConsumption(spool, 'outdoor', 150, 3, false).ok, false);
  // Another installer without cross-use permission
  assert.equal(validateSpoolConsumption(spool, 'outdoor', 50, 4, false).ok, false);
  // Another installer WITH can_cross_use_cables
  assert.equal(validateSpoolConsumption(spool, 'outdoor', 50, 4, true).ok, true);
});

test('Tariff snapshot calculates fixed, per_meter, hybrid, and milestone bonus accurately', () => {
  const hybridTariff = {
    id: 1,
    installer_id: 3,
    calc_type: 'hybrid' as const,
    base_price: 850000,
    meter_limit: 50,
    extra_meter_price: 12000,
    bonus_target_count: 5,
    bonus_amount: 500000,
  };

  const snap1 = calculateTariffSnapshot(hybridTariff, 45, 25, 'install', 4, '2026-01-01T00:00:00Z');
  assert.equal(snap1.total_meter, 70);
  assert.equal(snap1.billable_extra_meter, 20);
  assert.equal(snap1.extra_meter_fee, 240000);
  assert.equal(snap1.bonus_applied, 0);
  assert.equal(snap1.total_earned, 1090000);

  // 5th completed service triggers milestone bonus
  const snap2 = calculateTariffSnapshot(hybridTariff, 30, 10, 'install', 5, '2026-01-01T00:00:00Z');
  assert.equal(snap2.billable_extra_meter, 0);
  assert.equal(snap2.bonus_applied, 500000);
  assert.equal(snap2.total_earned, 1350000);

  const perMeter = calculateTariffSnapshot(
    { id: 2, installer_id: 4, calc_type: 'per_meter', base_price: 200000, meter_limit: 0, extra_meter_price: 15000 },
    40,
    10,
    'install',
    1,
    '2026-01-01T00:00:00Z',
  );
  assert.equal(perMeter.total_earned, 950000);
});

test('Double-entry ledger computes credits minus debits', () => {
  const summary = computeLedgerBalance([
    { amount: 1090000, type: 'credit' },
    { amount: 1350000, type: 'credit' },
    { amount: 800000, type: 'debit' },
  ]);
  assert.equal(summary.totalCredit, 2440000);
  assert.equal(summary.totalDebit, 800000);
  assert.equal(summary.balance, 1640000);
});

test('Real-time search filters tickets by customer name, address, Persian/Latin digits, and technical codes', () => {
  const sampleTickets = [
    {
      id: 5,
      customer_name: 'دفتر حقوقی آوا',
      address: 'شهرک غرب، دادمان',
      status: 'completed',
      installer_name: 'حسین کریمی',
      ffat_code: 'FAT301-D2',
      fat_number: 301,
      modem_serial: '4857544399AA11BB',
    },
    {
      id: 6,
      customer_name: 'نیما فرهادی',
      address: 'میرداماد، خیابان حصاری',
      status: 'assigned',
      installer_name: 'رضا قاسمی',
      ffat_code: null,
      fat_number: null,
      modem_serial: null,
    },
  ];

  assert.equal(normalizeSearchText('FAT۳۰۱-D2'), 'fat301-d2');
  assert.equal(filterTicketsByQuery(sampleTickets, 'آوا').length, 1);
  assert.equal(filterTicketsByQuery(sampleTickets, 'دادمان')[0]?.id, 5);
  assert.equal(filterTicketsByQuery(sampleTickets, 'میرداماد')[0]?.id, 6);
  assert.equal(filterTicketsByQuery(sampleTickets, 'FAT301-D2')[0]?.id, 5);
  assert.equal(filterTicketsByQuery(sampleTickets, '۴۸۵۷۵۴۴۳')[0]?.id, 5);
  assert.equal(filterTicketsByQuery(sampleTickets, '۶', 'assigned')[0]?.id, 6);
  assert.equal(filterTicketsByQuery(sampleTickets, 'آوا', 'pending').length, 0);
});

test('Real-time hardware matcher matches Persian names, Arabic variants, and technical codes', () => {
  assert.equal(matchesHardwareQuery(['کافو مرکزی ونک (KAF-VN01)', 'OLT-HUAWEI'], 'vn01'), true);
  assert.equal(matchesHardwareQuery(['FAT101-A2', 101], '۱۰۱'), true);
  assert.equal(matchesHardwareQuery(['Huawei HG8245H5', '48575443'], 'ZTEG'), false);
});

