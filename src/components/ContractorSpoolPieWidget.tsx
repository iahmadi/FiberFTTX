import { useState } from 'react';
import { Cable } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  ContractorSpoolConsumptionRow,
  CurrentMonthSpoolConsumptionSummary,
} from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';

const CONTRACTOR_PALETTE = [
  '#0f766e', // teal-700
  '#0284c7', // sky-600
  '#d97706', // amber-600
  '#6366f1', // indigo-500
  '#dc2626', // red-600
  '#059669', // emerald-600
  '#475569', // slate-600
];

interface ContractorSpoolPieWidgetProps {
  summary: CurrentMonthSpoolConsumptionSummary;
}

type SpoolMetricMode = 'total' | 'outdoor' | 'indoor';

export function ContractorSpoolPieWidget({ summary }: ContractorSpoolPieWidgetProps) {
  const [metricMode, setMetricMode] = useState<SpoolMetricMode>('total');

  const getMetricValue = (row: ContractorSpoolConsumptionRow): number => {
    if (metricMode === 'outdoor') return row.outdoorMeters;
    if (metricMode === 'indoor') return row.indoorMeters;
    return row.totalMeters;
  };

  const activeTotalMeters =
    metricMode === 'outdoor'
      ? summary.totalOutdoorMeters
      : metricMode === 'indoor'
        ? summary.totalIndoorMeters
        : summary.totalMeters;

  const chartItems = summary.contractors
    .map((row, idx) => {
      const value = getMetricValue(row);
      const pct = activeTotalMeters > 0 ? Math.round((value / activeTotalMeters) * 100) : 0;
      return {
        ...row,
        value,
        metricSharePct: pct,
        color: CONTRACTOR_PALETTE[idx % CONTRACTOR_PALETTE.length],
      };
    })
    .filter((item) => item.value > 0);

  const hasChartData = chartItems.length > 0;

  return (
    <div
      data-testid="contractor-spool-pie-widget"
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 shrink-0 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">
              مصرف قرقره‌های کابل به تفکیک پیمانکار ({summary.monthLabel})
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            کل متراژ مصرفی ماه جاری:{' '}
            <strong className="font-bold tabular-nums text-slate-900">
              {toPersianDigits(summary.totalMeters.toLocaleString('en-US'))} متر
            </strong>{' '}
            (فضای باز: {toPersianDigits(summary.totalOutdoorMeters.toLocaleString('en-US'))} م ·
            داخلی: {toPersianDigits(summary.totalIndoorMeters.toLocaleString('en-US'))} م)
          </p>
        </div>

        <div
          role="group"
          aria-label="فیلتر نوع کابل مصرفی پیمانکاران"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs"
        >
          <button
            type="button"
            onClick={() => setMetricMode('total')}
            className={`min-h-[32px] rounded-md px-2.5 font-semibold transition-colors ${
              metricMode === 'total'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            کل متراژ
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('outdoor')}
            className={`min-h-[32px] rounded-md px-2.5 font-semibold transition-colors ${
              metricMode === 'outdoor'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            کابل فضای باز
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('indoor')}
            className={`min-h-[32px] rounded-md px-2.5 font-semibold transition-colors ${
              metricMode === 'indoor'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            کابل داخلی
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
                    nameKey="installerName"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={84}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {chartItems.map((entry) => (
                      <Cell
                        key={entry.installerId}
                        fill={entry.color}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const row = item?.payload as
                        | (ContractorSpoolConsumptionRow & { metricSharePct: number })
                        | undefined;
                      const meters = Number(value ?? 0);
                      if (!row) return [`${toPersianDigits(meters)} متر`, ''];
                      return [
                        `${toPersianDigits(meters.toLocaleString('en-US'))} متر (${toPersianDigits(
                          row.metricSharePct,
                        )}٪ سهم ماه جاری)`,
                        row.installerName,
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
                  {toPersianDigits(activeTotalMeters.toLocaleString('en-US'))}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {metricMode === 'outdoor'
                    ? 'متر فضای باز'
                    : metricMode === 'indoor'
                      ? 'متر داخلی'
                      : 'متر کل ماه جاری'}
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs text-slate-500">
              در ماه جاری مصرفی برای این نوع کابل ثبت نشده است.
            </div>
          )}
        </div>

        <div className="space-y-2 md:col-span-7">
          {summary.contractors.length > 0 ? (
            summary.contractors.map((row, idx) => {
              const color = CONTRACTOR_PALETTE[idx % CONTRACTOR_PALETTE.length];
              const value = getMetricValue(row);
              const pct =
                activeTotalMeters > 0 ? Math.round((value / activeTotalMeters) * 100) : 0;
              return (
                <div
                  key={row.installerId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-xs"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="truncate font-bold text-slate-800">
                        {row.installerName}
                      </span>
                    </div>
                    <div className="mt-0.5 pr-5 text-[11px] tabular-nums text-slate-500">
                      فضای باز: {toPersianDigits(row.outdoorMeters.toLocaleString('en-US'))} متر ·
                      داخلی: {toPersianDigits(row.indoorMeters.toLocaleString('en-US'))} متر
                    </div>
                  </div>
                  <div className="shrink-0 text-left tabular-nums">
                    <div className="font-bold text-slate-900">
                      {toPersianDigits(value.toLocaleString('en-US'))} متر
                    </div>
                    <div className="text-[11px] font-semibold text-teal-800">
                      {toPersianDigits(pct)}٪ سهم کل
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              هنوز مصرف قرقره‌ای توسط پیمانکاران در ماه جاری ثبت نشده است.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
