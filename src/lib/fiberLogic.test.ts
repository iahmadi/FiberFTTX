import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTemplatePriceSnapshot,
  computeContractorSlaAveragesLast30Days,
  computeCurrentMonthSpoolConsumptionByContractor,
  computeLast30DaysCompletionByType,
  computeLedgerBalance,
  computeSpoolConsumptionForecasts,
  detectCriticalSlaStatusTransitions,
  evaluatePromotionForTicket,
  evaluateRbacPolicy,
  evaluateTicketSla,
  filterTicketsAdvanced,
  findRecentCriticalSlaTransitions,
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

test('filterTicketsAdvanced filters by customer name, assigned date range, and SLA status', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const tickets = [
    {
      id: 1,
      type: 'internet_install' as const,
      customer_name: 'کلینیک تخصصی بهار',
      address: 'تهران، گاندی',
      status: 'pending' as const,
      assigned_at: '2026-11-22T10:00:00Z', // local/UTC date 2026-11-22 -> breached (>4h)
    },
    {
      id: 2,
      type: 'voip_install' as const,
      customer_name: 'شرکت پارس‌نور',
      address: 'تهران، ونک',
      status: 'pending' as const,
      assigned_at: '2026-11-23T10:30:00Z', // 1.5h -> on_track
    },
    {
      id: 3,
      type: 'internet_fault' as const,
      customer_name: 'امیرحسین رضایی',
      address: 'تهران، جردن',
      status: 'pending' as const,
      assigned_at: null, // unassigned
    },
  ];

  const byCustomer = filterTicketsAdvanced(tickets, { customerQuery: 'بهار' }, now);
  assert.equal(byCustomer.length, 1);
  assert.equal(byCustomer[0].id, 1);

  const bySlaBreached = filterTicketsAdvanced(tickets, { slaStatusFilter: 'breached' }, now);
  assert.deepEqual(
    bySlaBreached.map((t) => t.id),
    [1],
  );

  const bySlaOnTrack = filterTicketsAdvanced(tickets, { slaStatusFilter: 'on_track' }, now);
  assert.deepEqual(
    bySlaOnTrack.map((t) => t.id),
    [2],
  );

  const bySlaUnassigned = filterTicketsAdvanced(tickets, { slaStatusFilter: 'unassigned' }, now);
  assert.deepEqual(
    bySlaUnassigned.map((t) => t.id),
    [3],
  );

  const byDateRange = filterTicketsAdvanced(
    tickets,
    { assignedFromIso: '2026-11-23', assignedToIso: '2026-11-23' },
    now,
  );
  assert.deepEqual(
    byDateRange.map((t) => t.id),
    [2],
  );
});

test('computeContractorSlaAveragesLast30Days aggregates top contractors by ticket type', () => {
  const ref = new Date('2026-11-23T12:00:00Z');
  const summary = computeContractorSlaAveragesLast30Days(
    [
      {
        id: 10,
        type: 'internet_install',
        status: 'completed',
        assigned_installer: 5,
        installer_name: 'حسین کریمی',
        assigned_at: '2026-11-20T08:00:00Z',
        completed_at: '2026-11-20T12:00:00Z', // 4h
      },
      {
        id: 11,
        type: 'internet_install',
        status: 'completed',
        assigned_installer: 5,
        installer_name: 'حسین کریمی',
        assigned_at: '2026-11-21T08:00:00Z',
        completed_at: '2026-11-21T14:00:00Z', // 6h -> avg 5h
      },
      {
        id: 12,
        type: 'voip_install',
        status: 'completed',
        assigned_installer: 6,
        installer_name: 'رضا قاسمی',
        assigned_at: '2026-11-22T08:00:00Z',
        completed_at: '2026-11-22T10:30:00Z', // 2.5h
      },
      {
        id: 13,
        type: 'internet_install',
        status: 'completed',
        assigned_installer: 6,
        installer_name: 'رضا قاسمی',
        assigned_at: '2026-09-01T08:00:00Z', // >30 days old -> excluded
        completed_at: '2026-09-01T12:00:00Z',
      },
    ],
    ref,
  );

  assert.equal(summary.totalCompletedAnalyzed, 3);
  assert.equal(summary.contractors.length, 2);
  assert.equal(summary.contractors[0].installerName, 'حسین کریمی');
  assert.equal(summary.contractors[0].internet_install, 5);
  assert.equal(summary.contractors[0].completedCount, 2);
  assert.equal(summary.contractors[1].installerName, 'رضا قاسمی');
  assert.equal(summary.contractors[1].voip_install, 2.5);
});

test('Critical SLA status transition detection alerts only on breached (>4h) transitions and recent server changes', () => {
  const ref = new Date('2026-11-24T12:00:00Z');
  const prev = [
    {
      id: 3,
      type: 'internet_install' as const,
      customer_name: 'برج مسکونی سروستان',
      status: 'pending' as const,
      installer_name: 'رضا قاسمی',
      assigned_at: '2026-11-24T05:00:00Z', // 7h old -> Critical SLA
      started_at: null,
      completed_at: null,
    },
    {
      id: 4,
      type: 'internet_fault' as const,
      customer_name: 'کافه کتاب راش',
      status: 'pending' as const,
      installer_name: 'حسین کریمی',
      assigned_at: '2026-11-24T10:30:00Z', // 1.5h old -> normal SLA
      started_at: null,
      completed_at: null,
    },
  ];
  const curr = [
    {
      ...prev[0],
      status: 'in_progress' as const,
      started_at: '2026-11-24T11:59:00Z',
    },
    {
      ...prev[1],
      status: 'in_progress' as const,
      started_at: '2026-11-24T11:59:00Z',
    },
  ];

  const diffAlerts = detectCriticalSlaStatusTransitions(prev, curr, 4, ref);
  assert.equal(diffAlerts.length, 1);
  assert.equal(diffAlerts[0].ticketId, 3);
  assert.equal(diffAlerts[0].previousStatus, 'pending');
  assert.equal(diffAlerts[0].newStatus, 'in_progress');
  assert.equal(diffAlerts[0].elapsedHours, 6);

  const recentAlerts = findRecentCriticalSlaTransitions(
    [
      ...curr,
      {
        id: 9,
        type: 'voip_install' as const,
        customer_name: 'آرشیو قدیمی',
        status: 'completed' as const,
        installer_name: 'حسین کریمی',
        assigned_at: '2026-11-20T05:00:00Z',
        started_at: '2026-11-20T12:00:00Z',
        completed_at: '2026-11-20T14:00:00Z', // >3m ago -> excluded
      },
    ],
    180_000,
    4,
    ref,
  );
  assert.equal(recentAlerts.length, 1);
  assert.equal(recentAlerts[0].ticketId, 3);
});

test('Current-month contractor spool consumption filters strictly to active Jalali month and sums shares', () => {
  // 2026-11-24 -> Jalali 1405/09/03 (آذر ۱۴۰۵)
  const ref = new Date('2026-11-24T10:00:00Z');
  const summary = computeCurrentMonthSpoolConsumptionByContractor(
    [
      {
        installer_id: 4,
        installer_name: 'رضا قاسمی',
        out_total_meter: 850,
        in_total_meter: 0,
        created_at: '2026-11-23T11:28:40Z', // 1405/09/02 -> Azar
      },
      {
        installer_id: 3,
        installer_name: 'حسین کریمی',
        out_total_meter: 120,
        in_total_meter: 30,
        created_at: '2026-11-24T08:00:00Z', // 1405/09/03 -> Azar
      },
      {
        installer_id: 3,
        installer_name: 'حسین کریمی',
        out_total_meter: 500,
        in_total_meter: 100,
        created_at: '2026-11-18T11:45:00Z', // 1405/08/27 -> Aban (previous month, excluded)
      },
    ],
    ref,
  );

  assert.equal(summary.monthKey, '1405-09');
  assert.equal(summary.totalOutdoorMeters, 970);
  assert.equal(summary.totalIndoorMeters, 30);
  assert.equal(summary.totalMeters, 1000);
  assert.equal(summary.contractors.length, 2);
  assert.equal(summary.contractors[0].installerName, 'رضا قاسمی');
  assert.equal(summary.contractors[0].totalMeters, 850);
  assert.equal(summary.contractors[0].sharePct, 85);
  assert.equal(summary.contractors[1].installerName, 'حسین کریمی');
  assert.equal(summary.contractors[1].totalMeters, 150);
  assert.equal(summary.contractors[1].sharePct, 15);
});


