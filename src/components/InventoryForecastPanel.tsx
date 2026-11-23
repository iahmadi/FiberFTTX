import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  MinusCircle,
  TrendingDown,
  Users,
} from 'lucide-react';
import {
  computeSpoolConsumptionForecasts,
  type ReorderUrgency,
} from '../lib/fiberLogic';
import { isoToJalaliYmd, toPersianDigits } from '../lib/jalali';
import type { SpoolConsumptionHistoryItem, SpoolItem } from '../types/erp';

interface InventoryForecastPanelProps {
  spools: SpoolItem[];
  consumptionHistory: SpoolConsumptionHistoryItem[];
}

function UrgencyStatus({ urgency }: { urgency: ReorderUrgency }) {
  if (urgency === 'immediate') {
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-red-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>سفارش فوری</span>
      </span>
    );
  }
  if (urgency === 'soon') {
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-amber-700">
        <Clock className="h-4 w-4 shrink-0" />
        <span>خرید در آستانه زمان</span>
      </span>
    );
  }
  if (urgency === 'planned') {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-teal-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>وضعیت پایدار</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
      <MinusCircle className="h-4 w-4 shrink-0" />
      <span>بدون مصرف اخیر</span>
    </span>
  );
}

const RATE_SOURCE_LABELS = {
  spool_history: 'تاریخچه مستقیم قرقره',
  contractor_avg: 'میانگین ماهانه پیمانکار',
  company_avg: 'میانگین ماهانه ناوگان',
  depletion_delta: 'کسری ثبت‌شده قرقره',
  none: 'ثبت‌نشده',
} as const;

export function InventoryForecastPanel({
  spools,
  consumptionHistory,
}: InventoryForecastPanelProps) {
  const [lookbackDays, setLookbackDays] = useState<30 | 90>(30);
  const [leadTimeDays, setLeadTimeDays] = useState<3 | 7 | 14>(7);

  const report = useMemo(
    () =>
      computeSpoolConsumptionForecasts(
        spools.map((s) => ({
          id: s.id,
          spool_code: s.spool_code,
          cable_type: s.cable_type,
          initial_length: s.initial_length,
          current_length: s.current_length,
          assigned_installer_id: s.assigned_installer_id,
          installer_name: s.installer_name,
        })),
        consumptionHistory,
        {
          lookbackDays,
          leadTimeDays,
        },
      ),
    [spools, consumptionHistory, lookbackDays, leadTimeDays],
  );

  return (
    <div data-testid="inventory-forecast-panel" className="space-y-6">
      {/* Parameter Controls & Summary KPIs */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <TrendingDown className="h-5 w-5 text-teal-700" />
              <span>تحلیل مصرف قرقره و پیش‌بینی اتمام موجودی</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              محاسبه براساس میانگین مصرف ماهانه پیمانکاران، موجودی باقیمانده و نقطه سفارش مجدد (ذخیره احتیاطی ۱۰٪ + مصرف دوره تأمین)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span>بازه مبنای مصرف:</span>
              <select
                aria-label="بازه مبنای مصرف"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value) as 30 | 90)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
              >
                <option value={30}>۳۰ روز اخیر</option>
                <option value={90}>۹۰ روز اخیر</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <span>زمان تأمین خرید:</span>
              <select
                aria-label="زمان تأمین خرید"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(Number(e.target.value) as 3 | 7 | 14)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
              >
                <option value={3}>۳ روز</option>
                <option value={7}>۷ روز</option>
                <option value={14}>۱۴ روز</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-medium text-slate-500">
              میانگین مصرف ماهانه کابل فضای باز (به ازای هر پیمانکار)
            </div>
            <div className="mt-1.5 text-lg font-extrabold tabular-nums text-slate-900">
              {toPersianDigits(report.avgOutdoorMonthlyMeters.toLocaleString('en-US'))} متر / ماه
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-medium text-slate-500">
              میانگین مصرف ماهانه کابل داخلی (به ازای هر پیمانکار)
            </div>
            <div className="mt-1.5 text-lg font-extrabold tabular-nums text-slate-900">
              {toPersianDigits(report.avgIndoorMonthlyMeters.toLocaleString('en-US'))} متر / ماه
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-xs font-medium text-slate-500">
              قرقره‌های نیازمند اقدام خرید مجدد
            </div>
            <div className="mt-1.5 flex items-baseline gap-3 tabular-nums">
              <span className="text-lg font-extrabold text-red-700">
                {toPersianDigits(report.immediateReorderCount)} فوری
              </span>
              <span className="text-sm font-bold text-amber-700">
                / {toPersianDigits(report.soonReorderCount)} طی ۱۴ روز آینده
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contractor Monthly Consumption Breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users className="h-5 w-5 text-sky-700" />
          <span>میانگین مصرف ماهانه به تفکیک پیمانکار</span>
        </div>

        {report.contractorUsages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
            در بازه انتخاب‌شده هیچ رکورد مصرفی برای پیمانکاران ثبت نشده است.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {report.contractorUsages.map((c) => (
              <div
                key={c.installerId}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs"
              >
                <div className="font-bold text-slate-900">{c.installerName}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
                  <div>
                    <div className="text-[11px] text-slate-500">فضای باز</div>
                    <div className="mt-0.5 font-bold text-sky-800">
                      {toPersianDigits(c.outdoorMonthlyMeters)} متر
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">داخلی</div>
                    <div className="mt-0.5 font-bold text-amber-700">
                      {toPersianDigits(c.indoorMonthlyMeters)} متر
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">جمع ماهانه</div>
                    <div className="mt-0.5 font-extrabold text-slate-900">
                      {toPersianDigits(c.totalMonthlyMeters)} متر
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spool Depletion Forecast & Reorder Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
          <CalendarClock className="h-5 w-5 text-teal-700" />
          <span>جدول پیش‌بینی اتمام و پیشنهاد زمان خرید مجدد هر قرقره</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-bold">کد قرقره</th>
                <th className="px-3 py-2.5 font-bold">پیمانکار / محل</th>
                <th className="px-3 py-2.5 font-bold">موجودی فعلی</th>
                <th className="px-3 py-2.5 font-bold">نرخ مصرف تخمینی</th>
                <th className="px-3 py-2.5 font-bold">زمان تقریبی اتمام</th>
                <th className="px-3 py-2.5 font-bold">نقطه سفارش مجدد</th>
                <th className="px-3 py-2.5 font-bold">وضعیت</th>
                <th className="px-3 py-2.5 font-bold">پیشنهاد سفارش مجدد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.spoolForecasts.map((item) => {
                const depletionJalali = item.estimatedDepletionIsoDate
                  ? toPersianDigits(isoToJalaliYmd(item.estimatedDepletionIsoDate))
                  : '—';
                const reorderJalali = item.recommendedReorderIsoDate
                  ? toPersianDigits(isoToJalaliYmd(item.recommendedReorderIsoDate))
                  : '—';

                return (
                  <tr
                    key={item.spoolId}
                    className={
                      item.urgency === 'immediate'
                        ? 'bg-red-50/50'
                        : item.urgency === 'soon'
                          ? 'bg-amber-50/40'
                          : ''
                    }
                  >
                    <td className="px-3 py-2.5">
                      <div dir="ltr" className="text-right font-bold text-slate-900">
                        {item.spoolCode}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {item.cableType === 'outdoor' ? 'فضای باز' : 'داخلی'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{item.installerName}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <span
                        className={`font-bold ${
                          item.urgency === 'immediate'
                            ? 'text-red-700'
                            : item.urgency === 'soon'
                              ? 'text-amber-700'
                              : 'text-slate-900'
                        }`}
                      >
                        {toPersianDigits(item.currentLength)} متر
                      </span>
                      <span className="mr-1 text-[11px] text-slate-500">
                        از {toPersianDigits(item.initialLength)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {item.monthlyRateMeters > 0 ? (
                        <div>
                          <div className="font-bold text-slate-900">
                            {toPersianDigits(item.monthlyRateMeters)} متر / ماه
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            ({toPersianDigits(item.dailyRateMeters)} متر/روز ·{' '}
                            {RATE_SOURCE_LABELS[item.rateSource]})
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">۰ متر / ماه</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {item.estimatedDaysRemaining !== null ? (
                        <div>
                          <div className="font-bold text-slate-900">
                            حدود {toPersianDigits(item.estimatedDaysRemaining)} روز دیگر
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            تاریخ تخمینی: {depletionJalali}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">نامشخص</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <span className="font-bold text-slate-900">
                        {toPersianDigits(item.reorderPointMeters)} متر
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <UrgencyStatus urgency={item.urgency} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900">
                        {item.recommendedActionText}
                      </div>
                      {item.recommendedReorderIsoDate && (
                        <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                          تاریخ پیشنهادی سفارش: {reorderJalali}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
