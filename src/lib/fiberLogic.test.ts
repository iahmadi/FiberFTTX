import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianToJalali,
  jalaliToGregorian,
  jalaliYmdToIso,
  isoToJalaliYmd,
  getJalaliMonthLength,
  toPersianDigits,
} from './jalali.ts';
import {
  generateFFatCode,
  validateModemSerial,
  validateSpoolConsumption,
  validateVanModemConsumption,
  hasTicketProvisioningConfig,
  calculateTariffSnapshot,
  computeLedgerBalance,
  getLowSpoolWarnings,
  detectSpoolDrops,
  aggregateMonthlyContractorEarnings,
  filterMonthlyEarningsByRange,
  getActivityCategory,
  filterActivityLogs,
  buildServiceRecordPrintMeta,
  groupScheduledTicketsByJalaliDay,
  getUpcomingScheduledTickets,
} from './fiberLogic.ts';
import {
  buildContractorEarningsExcelXml,
  filterLedgerEntriesByMonths,
} from './excelExport.ts';
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

test('Van stock modem consumption enforces company stock & skips deduction for customer modem', () => {
  const bulkModem = {
    id: 10,
    user_id: 3,
    item_id: 2,
    item_type: 'modem' as const,
    serial_number: null,
    quantity: 2,
  };
  const preRegisteredModem = {
    id: 11,
    user_id: 3,
    item_id: 2,
    item_type: 'modem' as const,
    serial_number: '48575443AABBCC11',
    quantity: 1,
  };

  // Customer own modem: no van stock required
  assert.equal(validateVanModemConsumption(undefined, 'customer', 'ZTEG11223344', 3, false).ok, true);
  // Company modem requires van stock row
  assert.equal(validateVanModemConsumption(undefined, 'company', '48575443AABBCC11', 3, false).ok, false);
  // Bulk quantity van stock accepts installer-entered serial
  assert.equal(validateVanModemConsumption(bulkModem, 'company', '4857544312345678', 3, false).ok, true);
  // Pre-registered serial must match
  assert.equal(validateVanModemConsumption(preRegisteredModem, 'company', '4857544300000000', 3, false).ok, false);
  assert.equal(validateVanModemConsumption(preRegisteredModem, 'company', '48575443AABBCC11', 3, false).ok, true);
  // Ownership check
  assert.equal(validateVanModemConsumption(bulkModem, 'company', '4857544312345678', 4, false).ok, false);
});

test('Provisioning config detector identifies PPPoE/VLAN/VoIP presence', () => {
  assert.equal(hasTicketProvisioningConfig({}), false);
  assert.equal(hasTicketProvisioningConfig({ config_pppoe_user: 'ali@isp', config_vlan: 1042 }), true);
  assert.equal(hasTicketProvisioningConfig({ has_voip: 1, config_voip_data: '0218899' }), true);
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

test('Low spool warning and drop detection flag spools below 10% threshold', () => {
  const before = [
    { id: 1, spool_code: 'OUT-101', cable_type: 'outdoor' as const, initial_length: 1000, current_length: 180, assigned_installer_id: 3 }, // 18% -> not below 10%
    { id: 2, spool_code: 'IN-102', cable_type: 'indoor' as const, initial_length: 500, current_length: 415, assigned_installer_id: 3 },
  ];
  assert.equal(getLowSpoolWarnings(before).length, 0);

  const after = [
    { id: 1, spool_code: 'OUT-101', cable_type: 'outdoor' as const, initial_length: 1000, current_length: 85, assigned_installer_id: 3 }, // 8.5% -> below 10%
    { id: 2, spool_code: 'IN-102', cable_type: 'indoor' as const, initial_length: 500, current_length: 415, assigned_installer_id: 3 },
  ];

  const warnings = getLowSpoolWarnings(after);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.spool_code, 'OUT-101');
  assert.equal(warnings[0]?.percentRemaining, 9);

  const drops = detectSpoolDrops(before, after);
  assert.equal(drops.length, 1);
  assert.equal(drops[0]?.deductedMeters, 95);
  assert.equal(drops[0]?.isLow, true);
});

test('Monthly contractor earnings aggregates credit ledger rows and filters by time range', () => {
  const entries = [
    { amount: 1100000, type: 'credit' as const, created_at: '2026-11-18 10:15:00' }, // 1405/08/27 Aban
    { amount: 950000, type: 'credit' as const, created_at: '2026-11-19 14:30:00' },  // 1405/08/28 Aban
    { amount: 500000, type: 'debit' as const, created_at: '2026-11-20 09:00:00' },   // ignored debit
    { amount: 1450000, type: 'credit' as const, created_at: '2026-11-22 11:00:00' }, // 1405/09/01 Azar
  ];

  const monthly = aggregateMonthlyContractorEarnings(entries);
  assert.equal(monthly.length, 2);
  assert.deepEqual(monthly[0], {
    monthKey: '1405-08',
    monthLabel: 'آبان ۱۴۰۵',
    totalEarnings: 2050000,
    entryCount: 2,
  });
  assert.deepEqual(monthly[1], {
    monthKey: '1405-09',
    monthLabel: 'آذر ۱۴۰۵',
    totalEarnings: 1450000,
    entryCount: 1,
  });

  const sample6 = [
    { monthKey: '1405-04', monthLabel: 'تیر ۱۴۰۵', totalEarnings: 2100000, entryCount: 2 },
    { monthKey: '1405-05', monthLabel: 'مرداد ۱۴۰۵', totalEarnings: 2950000, entryCount: 3 },
    { monthKey: '1405-06', monthLabel: 'شهریور ۱۴۰۵', totalEarnings: 3400000, entryCount: 3 },
    { monthKey: '1405-07', monthLabel: 'مهر ۱۴۰۵', totalEarnings: 2700000, entryCount: 2 },
    { monthKey: '1405-08', monthLabel: 'آبان ۱۴۰۵', totalEarnings: 2275000, entryCount: 2 },
    { monthKey: '1405-09', monthLabel: 'آذر ۱۴۰۵', totalEarnings: 1675000, entryCount: 2 },
  ];

  assert.equal(filterMonthlyEarningsByRange(sample6, { preset: 'all' }).length, 6);
  assert.deepEqual(
    filterMonthlyEarningsByRange(sample6, { preset: '3m' }).map((m) => m.monthKey),
    ['1405-07', '1405-08', '1405-09'],
  );
  assert.deepEqual(
    filterMonthlyEarningsByRange(sample6, { preset: 'custom', fromMonth: '1405-05', toMonth: '1405-07' }).map((m) => m.monthKey),
    ['1405-05', '1405-06', '1405-07'],
  );
  assert.equal(
    filterMonthlyEarningsByRange(sample6, { preset: 'custom', fromMonth: '1405-08', toMonth: '1405-05' }).length,
    0,
  );
});

test('Activity log category mapper and search filter isolate ticket, inventory, financial, and RBAC events', () => {
  const logs = [
    {
      id: 1,
      username: 'operator',
      user_full_name: 'سارا احمدی',
      action_type: 'ticket_assigned',
      entity_type: 'ticket',
      entity_id: 7,
      summary: 'تایید و ارجاع تیکت #7 به حسین کریمی',
      details: 'مشترک: شرکت پارس',
      created_at: '2026-11-22 10:00:00',
    },
    {
      id: 2,
      username: 'admin',
      user_full_name: 'علیرضا محمدی',
      action_type: 'spool_consumed',
      entity_type: 'spool',
      entity_id: 4,
      summary: 'کسر متراژ ۳۵۰ متر از قرقره IN-1405-02',
      details: 'مانده: ۱۱۰ متر',
      created_at: '2026-11-22 11:00:00',
    },
    {
      id: 3,
      username: 'admin',
      user_full_name: 'علیرضا محمدی',
      action_type: 'user_created',
      entity_type: 'user',
      entity_id: 5,
      summary: 'ایجاد کاربر جدید tech3',
      details: null,
      created_at: '2026-11-22 12:00:00',
    },
  ];

  assert.equal(getActivityCategory('ticket_assigned'), 'ticket');
  assert.equal(getActivityCategory('spool_consumed'), 'inventory');
  assert.equal(getActivityCategory('payout_recorded'), 'financial');
  assert.equal(getActivityCategory('user_created'), 'rbac');

  assert.equal(filterActivityLogs(logs, 'ticket', '').length, 1);
  assert.equal(filterActivityLogs(logs, 'inventory', 'IN-1405-02').length, 1);
  assert.equal(filterActivityLogs(logs, 'all', 'سارا').length, 1);
  assert.equal(filterActivityLogs(logs, 'financial', '').length, 0);
});

test('Service record print metadata formats document code and total cable length', () => {
  const meta = buildServiceRecordPrintMeta({
    id: 5,
    ticket_id: 12,
    ticket_type: 'install',
    modem_source: 'company',
    out_total_meter: 45,
    in_total_meter: 25,
  });

  assert.equal(meta.documentCode, 'FOB-0012-005');
  assert.equal(meta.totalCableMeters, 70);
  assert.equal(meta.modemSourceLabel, 'مودم تحویلی شرکت');
});

test('Jalali YYYY/MM/DD <-> ISO YYYY-MM-DD converters round-trip accurately', () => {
  const iso = jalaliYmdToIso('1405/09/02');
  assert.equal(iso, '2026-11-23');
  assert.equal(isoToJalaliYmd('2026-11-23', false), '1405/09/02');
  assert.equal(jalaliYmdToIso('invalid'), null);
});

test('Scheduled tickets calendar helper groups upcoming installations by Jalali day and sorts by time', () => {
  const tickets = [
    { id: 1, type: 'install' as const, status: 'assigned' as const, scheduled_date: '2026-11-23', scheduled_time: '14:00', created_at: '2026-11-20' },
    { id: 2, type: 'fault' as const, status: 'assigned' as const, scheduled_date: '2026-11-23', scheduled_time: '09:00', created_at: '2026-11-20' },
    { id: 3, type: 'install' as const, status: 'pending' as const, scheduled_date: '2026-11-23', scheduled_time: '10:30', created_at: '2026-11-21' },
    { id: 4, type: 'install' as const, status: 'completed' as const, scheduled_date: '2026-11-23', scheduled_time: '08:00', created_at: '2026-11-21' },
    { id: 5, type: 'install' as const, status: 'assigned' as const, scheduled_date: '2026-11-25', scheduled_time: '11:00', created_at: '2026-11-21' },
  ];

  // 2026-11-23 = 1405/09/02, 2026-11-25 = 1405/09/04
  const allGrouped = groupScheduledTicketsByJalaliDay(tickets, 1405, 9, false);
  assert.equal(allGrouped[2]?.length, 3); // excludes completed ticket #4
  assert.deepEqual(allGrouped[2]?.map((t) => t.id), [2, 3, 1]);

  const installOnly = groupScheduledTicketsByJalaliDay(tickets, 1405, 9, true);
  assert.deepEqual(installOnly[2]?.map((t) => t.id), [3, 1]);
  assert.deepEqual(installOnly[4]?.map((t) => t.id), [5]);

  const upcoming = getUpcomingScheduledTickets(tickets, '2026-11-23', true, 5);
  assert.deepEqual(upcoming.map((t) => t.id), [3, 1, 5]);
});

test('Offline Excel XML builder escapes special characters and builds RTL monthly & ledger sheets', () => {
  const monthly = [
    { monthKey: '1405-08', monthLabel: 'آبان ۱۴۰۵', totalEarnings: 2275000, entryCount: 2 },
  ];
  const ledger = [
    {
      id: 10,
      user_name: 'حسین کریمی',
      ticket_id: 5,
      amount: 1325000,
      type: 'credit' as const,
      description: 'نصب <پروژه> & تست',
      created_at: '2026-11-18 13:30:00',
    },
    {
      id: 11,
      user_name: 'حسین کریمی',
      ticket_id: null,
      amount: 500000,
      type: 'credit' as const,
      description: 'آذر ماه',
      created_at: '2026-11-23 10:00:00',
    },
  ];

  const scopedLedger = filterLedgerEntriesByMonths(ledger, ['1405-08']);
  assert.equal(scopedLedger.length, 1);
  assert.equal(scopedLedger[0]?.id, 10);

  const xml = buildContractorEarningsExcelXml({
    monthlyEarnings: monthly,
    ledgerEntries: scopedLedger,
    rangeLabel: 'آبان ۱۴۰۵',
    contractorScopeLabel: 'حسین کریمی',
    exportedAtJalali: '1405/09/02',
  });

  assert.equal(xml.includes('<?mso-application progid="Excel.Sheet"?>'), true);
  assert.equal(xml.includes('ss:RightToLeft="1"'), true);
  assert.equal(xml.includes('خلاصه ماهانه درآمد'), true);
  assert.equal(xml.includes('ریز تراکنش‌های مالی'), true);
  assert.equal(xml.includes('نصب &lt;پروژه&gt; &amp; تست'), true);
  assert.equal(xml.includes('<Data ss:Type="Number">2275000</Data>'), true);
});



