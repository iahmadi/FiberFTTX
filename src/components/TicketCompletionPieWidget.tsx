import { useState } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  Last30DaysCompletionSummary,
  TicketCompletionStatItem,
  TicketTypeKey,
} from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';

const TYPE_COLORS: Record<TicketTypeKey, string> = {
  internet_install: '#0f766e',
  internet_fault: '#d97706',
  ffat_install: '#0284c7',
  ffat_fault: '#dc2626',
  voip_install: '#6366f1',
};

interface TicketCompletionPieWidgetProps {
  summary: Last30DaysCompletionSummary;
}

type PieMetricMode = 'completed' | 'rate';

export function TicketCompletionPieWidget({ summary }: TicketCompletionPieWidgetProps) {
  const [metricMode, setMetricMode] = useState<PieMetricMode>('completed');

  const chartItems = summary.byType
    .map((item) => ({
      ...item,
      color: TYPE_COLORS[item.type],
      value: metricMode === 'completed' ? item.completedCount : item.completionRatePct,
    }))
    .filter((item) => item.value > 0);

  const hasChartData = chartItems.length > 0;

  return (
    <div
      data-testid="ticket-completion-pie-widget"
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 shrink-0 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">
              نمودار توزیع تیکت‌های تکمیل‌شده (۳۰ روز اخیر)
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            انجام‌شده:{' '}
            <strong className="font-bold tabular-nums text-slate-900">
              {toPersianDigits(summary.overallCompleted)} تیکت
            </strong>{' '}
            از {toPersianDigits(summary.overallTotal)} (نرخ اتمام:{' '}
            {toPersianDigits(summary.overallCompletionRatePct)}٪)
          </p>
        </div>

        <div
          role="group"
          aria-label="حالت نمایش نمودار دایره‌ای"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs"
        >
          <button
            type="button"
            onClick={() => setMetricMode('completed')}
            className={`min-h-[32px] rounded-md px-2.5 font-semibold transition-colors ${
              metricMode === 'completed'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            تعداد تکمیل‌شده
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('rate')}
            className={`min-h-[32px] rounded-md px-2.5 font-semibold transition-colors ${
              metricMode === 'rate'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            نرخ اتمام (٪)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-12">
        <div className="relative h-60 w-full md:col-span-5" dir="ltr">
          {hasChartData ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartItems}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={84}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {chartItems.map((entry) => (
                      <Cell key={entry.type} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const row = item?.payload as TicketCompletionStatItem | undefined;
                      if (!row) return [toPersianDigits(Number(value ?? 0)), ''];
                      if (metricMode === 'completed') {
                        return [
                          `${toPersianDigits(row.completedCount)} تیکت (${toPersianDigits(
                            row.completionRatePct,
                          )}٪ نرخ اتمام)`,
                          row.label,
                        ];
                      }
                      return [
                        `${toPersianDigits(row.completionRatePct)}٪ (${toPersianDigits(
                          row.completedCount,
                        )} از ${toPersianDigits(row.totalCount)})`,
                        row.label,
                      ];
                    }}
                    contentStyle={{
                      direction: 'rtl',
                      fontFamily: 'Vazirmatn, sans-serif',
                      fontSize: '12px',
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-extrabold tabular-nums text-slate-900">
                  {metricMode === 'completed'
                    ? toPersianDigits(summary.overallCompleted)
                    : `${toPersianDigits(summary.overallCompletionRatePct)}٪`}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {metricMode === 'completed' ? 'تیکت انجام‌شده' : 'نرخ اتمام کل'}
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs text-slate-500">
              در ۳۰ روز اخیر تیکت تکمیل‌شده‌ای برای رسم نمودار ثبت نشده است.
            </div>
          )}
        </div>

        <div className="space-y-2 md:col-span-7">
          {summary.byType.map((item) => {
            const color = TYPE_COLORS[item.type];
            return (
              <div
                key={item.type}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3 w-3 shrink-0 rounded-xs"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-semibold text-slate-800">{item.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span className="text-slate-500">
                    {toPersianDigits(item.completedCount)} / {toPersianDigits(item.totalCount)}
                  </span>
                  <span className="w-12 text-left font-bold text-slate-900">
                    {metricMode === 'completed'
                      ? `${toPersianDigits(item.completedCount)} عدد`
                      : `${toPersianDigits(item.completionRatePct)}٪`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
