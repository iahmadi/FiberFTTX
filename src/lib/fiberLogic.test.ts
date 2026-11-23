import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTemplatePriceSnapshot,
  computeLast30DaysCompletionByType,
  computeLedgerBalance,
  computeSpoolConsumptionForecasts,
  evaluatePromotionForTicket,
  evaluateRbacPolicy,
  evaluateTicketSla,
  generateFFatCode,
  getTicketTypeFieldVisibility,
  isSpoolLowStock,
  validateModemSerial,
  validateSpoolConsumption,
  validateVanModemConsumption,
  type PromotionRule,
  type SpoolRecord,
  type TariffTemplateRulesJson,
  type VanStockRecord,
} from './fiberLogic.ts';

const sampleTemplateRules: TariffTemplateRulesJson = {
  internet_install: { calc_type: 'hybrid', base_price: 1000000, meter_limit: 120, extra_meter_price: 25000 },
  internet_fault: { calc_type: 'fixed', base_price: 450000, meter_limit: 0, extra_meter_price: 0 },
  ffat_install: { calc_type: 'per_meter', base_price: 300000, meter_limit: 0, extra_meter_price: 20000 },
  ffat_fault: { calc_type: 'fixed', base_price: 600000, meter_limit: 0, extra_meter_price: 0 },
  voip_install: { calc_type: 'fixed', base_price: 750000, meter_limit: 0, extra_meter_price: 0 },
};

test('5-type ticketing dynamic field visibility hides/shows VoIP & PPPoE properly', () => {
  const inet = getTicketTypeFieldVisibility('internet_install');
  assert.equal(inet.showPppoeVlan, true);
  assert.equal(inet.showVoip, true);
  assert.equal(inet.requiresModem, true);

  const voip = getTicketTypeFieldVisibility('voip_install');
  assert.equal(voip.showPppoeVlan, false);
  assert.equal(voip.showVoip, true);

  const ffat = getTicketTypeFieldVisibility('ffat_install');
  assert.equal(ffat.showPppoeVlan, false);
  assert.equal(ffat.showVoip, false);
  assert.equal(ffat.requiresModem, false);
});

test('F-FAT dynamic code generation formats and rejects invalid input', () => {
  assert.equal(generateFFatCode(14, 'a2'), 'FAT14-A2');
  assert.throws(() => generateFFatCode(0, 'A1'));
  assert.throws(() => generateFFatCode(14, '@@!'));
});

test('Modem serial regex and prefix validation enforces brand rules', () => {
  const huawei = { name: 'Huawei', serial_prefix: '48575443', serial_pattern: '^48575443[A-F0-9]{8}$' };
  assert.equal(validateModemSerial('48575443A1B2C3D4', huawei).valid, true);
  assert.equal(validateModemSerial('99999999A1B2C3D4', huawei).valid, false);
  assert.equal(validateModemSerial('48575443ZZZ', huawei).valid, false);
});

test('Spool atomic validation checks ownership, cable type, and remaining meters', () => {
  const spool: SpoolRecord = {
    id: 1,
    spool_code: 'IN-12',
    cable_type: 'indoor',
    initial_length: 1000,
    current_length: 90,
    assigned_installer_id: 5,
  };
  assert.equal(validateSpoolConsumption(spool, 'indoor', 80, 5, false).ok, true);
  assert.equal(validateSpoolConsumption(spool, 'indoor', 110, 5, false).ok, false);
  assert.equal(validateSpoolConsumption(spool, 'outdoor', 20, 5, false).ok, false);
  assert.equal(validateSpoolConsumption(spool, 'indoor', 20, 9, false).ok, false);
  assert.equal(validateSpoolConsumption(spool, 'indoor', 20, 9, true).ok, true);
  assert.equal(isSpoolLowStock(spool, 10), true); // 90/1000 = 9% < 10%
});

test('Van stock modem validation allows customer modem without stock & blocks mismatched company modem', () => {
  const vanModem: VanStockRecord = {
    id: 2,
    user_id: 5,
    item_id: 10,
    item_type: 'modem',
    serial_number: '48575443AABBCCDD',
    quantity: 1,
  };
  assert.equal(validateVanModemConsumption(undefined, 'customer', 'ZTEG11223344', 5, false).ok, true);
  assert.equal(validateVanModemConsumption(undefined, 'company', '48575443AABBCCDD', 5, false).ok, false);
  assert.equal(validateVanModemConsumption(vanModem, 'company', '4857544300000000', 5, false).ok, false);
  assert.equal(validateVanModemConsumption(vanModem, 'company', '48575443AABBCCDD', 5, false).ok, true);
});

test('Dynamic tariff template snapshot + promotion carry-over and ledger math', () => {
  const promo: PromotionRule = {
    id: 1,
    name: 'کمپین ۳۰ نصب پاییز',
    target_type: 'installs',
    target_value: 3,
    reward_amount: 500000,
    reset_cycle: 'monthly',
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    carry_over: true,
  };

  const priorEvents = [
    { ticket_id: 1, type: 'internet_install' as const, completed_at: '2026-11-20T10:00:00Z' },
    { ticket_id: 2, type: 'voip_install' as const, completed_at: '2026-11-21T12:00:00Z' },
  ];
  const promoEval = evaluatePromotionForTicket(
    promo,
    priorEvents,
    'internet_install',
    '2026-11-23T09:00:00Z',
  );
  assert.equal(promoEval.cycleCountAfterThis, 3);
  assert.equal(promoEval.bonusEarned, 500000);

  const snap = calculateTemplatePriceSnapshot({
    templateName: 'تعرفه ترکیبی پیمانکار',
    rulesJson: sampleTemplateRules,
    ticketType: 'internet_install',
    outMeter: 100,
    inMeter: 40, // total 140m -> 20m excess over 120m * 25,000 = 500,000
    promotionName: promo.name,
    promotionBonus: promoEval.bonusEarned,
    computedAt: '2026-11-23T09:00:00Z',
  });

  assert.equal(snap.total_meter, 140);
  assert.equal(snap.billable_extra_meter, 20);
  assert.equal(snap.extra_meter_fee, 500000);
  assert.equal(snap.total_earned, 2000000); // 1M base + 500k extra + 500k bonus

  const ledger = computeLedgerBalance([
    { amount: snap.total_earned, type: 'credit' },
    { amount: 750000, type: 'debit' },
  ]);
  assert.equal(ledger.balance, 1250000);
});

test('Last 30 days completion rate calculates per ticket type and excludes older tickets', () => {
  const ref = new Date('2026-11-23T12:00:00Z');
  const summary = computeLast30DaysCompletionByType(
    [
      { type: 'internet_install', status: 'completed', created_at: '2026-11-10T10:00:00Z', completed_at: '2026-11-12T10:00:00Z' },
      { type: 'internet_install', status: 'pending', created_at: '2026-11-20T10:00:00Z', completed_at: null },
      { type: 'ffat_install', status: 'completed', created_at: '2026-11-18T10:00:00Z', completed_at: '2026-11-19T10:00:00Z' },
      { type: 'internet_fault', status: 'completed', created_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-02T10:00:00Z' },
    ],
    ref,
  );

  assert.equal(summary.overallTotal, 3);
  assert.equal(summary.overallCompleted, 2);
  assert.equal(summary.overallCompletionRatePct, 67);

  const inetInstall = summary.byType.find((b) => b.type === 'internet_install')!;
  assert.equal(inetInstall.completedCount, 1);
  assert.equal(inetInstall.totalCount, 2);
  assert.equal(inetInstall.completionRatePct, 50);
  assert.equal(inetInstall.shareOfCompletedPct, 50);

  const ffatInstall = summary.byType.find((b) => b.type === 'ffat_install')!;
  assert.equal(ffatInstall.completionRatePct, 100);
});

test('Spool consumption forecast calculates depletion days and reorder urgency', () => {
  const ref = new Date('2026-11-23T12:00:00Z');
  const report = computeSpoolConsumptionForecasts(
    [
      {
        id: 1,
        spool_code: 'OUT-101',
        cable_type: 'outdoor',
        initial_length: 1000,
        current_length: 300,
        assigned_installer_id: 5,
        installer_name: 'حسین کریمی',
      },
      {
        id: 2,
        spool_code: 'IN-12',
        cable_type: 'indoor',
        initial_length: 800,
        current_length: 760,
        assigned_installer_id: 5,
        installer_name: 'حسین کریمی',
      },
    ],
    [
      {
        installer_id: 5,
        installer_name: 'حسین کریمی',
        out_spool_id: 1,
        out_total_meter: 600, // 20m/day -> 300m left = 15 days; safety=100m (10d) -> reorder in 10-7=3 days ('soon')
        in_spool_id: 2,
        in_total_meter: 150, // 5m/day -> 760m left = 152 days -> 'planned'
        created_at: '2026-11-18T10:00:00Z',
      },
    ],
    { lookbackDays: 30, leadTimeDays: 7, referenceDate: ref },
  );

  assert.equal(report.avgOutdoorMonthlyMeters, 600);
  assert.equal(report.avgIndoorMonthlyMeters, 150);
  assert.equal(report.soonReorderCount, 1);

  const outForecast = report.spoolForecasts.find((s) => s.spoolCode === 'OUT-101')!;
  assert.equal(outForecast.estimatedDaysRemaining, 15);
  assert.equal(outForecast.reorderPointMeters, 240); // 100m safety + 7d*20m
  assert.equal(outForecast.daysUntilReorder, 3);
  assert.equal(outForecast.urgency, 'soon');

  const inForecast = report.spoolForecasts.find((s) => s.spoolCode === 'IN-12')!;
  assert.equal(inForecast.urgency, 'planned');
  assert.equal(inForecast.estimatedDaysRemaining, 152);
});

test('RBAC policy middleware enforces SuperAdmin bypass and tbl_permissions by role_id', () => {
  assert.equal(
    evaluateRbacPolicy(
      { id: 1, role_id: 1, role_name: 'SuperAdmin', is_active: true, permissions: [] },
      ['can_manage_tariffs', 'can_view_financials'],
    ).allowed,
    true,
  );
  assert.equal(
    evaluateRbacPolicy(
      {
        id: 2,
        role_id: 3,
        role_name: 'تکنسین نصاب',
        is_active: true,
        permissions: ['can_execute_service'],
      },
      ['can_manage_tariffs'],
    ).allowed,
    false,
  );
  assert.equal(
    evaluateRbacPolicy(
      {
        id: 3,
        role_id: 5,
        role_name: 'سرپرست مالی',
        is_active: true,
        permissions: ['can_view_financials'],
      },
      ['can_view_financials', 'can_manage_tariffs'],
    ).allowed,
    true,
  );
  assert.equal(
    evaluateRbacPolicy(
      {
        id: 3,
        role_id: 5,
        role_name: 'سرپرست مالی',
        is_active: false,
        permissions: ['can_view_financials'],
      },
      ['can_view_financials'],
    ).allowed,
    false,
  );
});

test('Ticket SLA flags pending tickets assigned more than 4 hours ago and ignores others', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const breached = evaluateTicketSla(
    { status: 'pending', assigned_at: '2026-11-23T07:30:00Z' }, // 4h 30m ago
    4,
    now,
  );
  assert.equal(breached.isBreached, true);
  assert.equal(breached.elapsedHours, 4);
  assert.equal(breached.elapsedMinutes, 30);

  const withinSla = evaluateTicketSla(
    { status: 'pending', assigned_at: '2026-11-23T09:00:00Z' }, // 3h ago
    4,
    now,
  );
  assert.equal(withinSla.isBreached, false);

  const alreadyStarted = evaluateTicketSla(
    { status: 'in_progress', assigned_at: '2026-11-22T09:00:00Z' },
    4,
    now,
  );
  assert.equal(alreadyStarted.isBreached, false);
});


