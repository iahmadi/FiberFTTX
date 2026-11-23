import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  JALALI_MONTH_NAMES,
  formatDateToJalali,
  getTodayJalali,
  toPersianDigits,
} from '../lib/jalali';

export interface MonthlyDailyMetric {
  day: string;
  count: number;
  outMeters: number;
  inMeters: number;
  meters: number;
}

export interface MonthlySpoolStat {
  id: number;
  spool_code: string;
  cable_type: 'indoor' | 'outdoor';
  initial_length: number;
  current_length: number;
  usedMetersThisMonth: number;
}

interface MonthlyStatsRechartsProps {
  dailyMetrics: MonthlyDailyMetric[];
  spoolStats: MonthlySpoolStat[];
}

export function MonthlyStatsRecharts({
  dailyMetrics,
  spoolStats,
}: MonthlyStatsRechartsProps) {
  const today = getTodayJalali();
  const currentMonthTitle = `${JALALI_MONTH_NAMES[today.jm - 1]} ${toPersianDigits(today.jy)}`;

  const dailyChartData = useMemo(
    () =>
      dailyMetrics.map((d) => ({
        label: formatDateToJalali(d.day, true).slice(5),
        fullDate: formatDateToJalali(d.day, true),
        completedCount: Number(d.count) || 0,
        outMeters: Number(d.outMeters) || 0,
        inMeters: Number(d.inMeters) || 0,
        totalMeters: Number(d.meters) || 0,
      })),
    [dailyMetrics],
  );

  const spoolChartData = useMemo(
    () =>
      spoolStats.slice(0, 8).map((s) => ({
        spoolCode: s.spool_code,
        typeLabel: s.cable_type === 'outdoor' ? 'بیرونی' : 'داخلی',
        usedMeters: Number(s.usedMetersThisMonth) || 0,
        remainingMeters: Number(s.current_length) || 0,
      })),
    [spoolStats],
  );

  const totalCompletedMonth = dailyChartData.reduce((s, d) => s + d.completedCount, 0);
  const totalMetersMonth = dailyChartData.reduce((s, d) => s + d.totalMeters, 0);
  const totalSpoolsUsedMonth = spoolChartData.reduce((s, item) => s + item.usedMeters, 0);
  const activeSpoolCount = spoolStats.length;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* Chart 1: Completed Tickets & Daily Cable Consumption (Current Month) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              آمار تیکت‌های تکمیل‌شده ({currentMonthTitle})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {toPersianDigits(totalCompletedMonth)} تیکت تکمیل‌شده · {toPersianDigits(totalMetersMonth)} متر کابل‌کشی در ماه جاری
            </p>
          </div>
          <span className="text-xs font-medium text-teal-700 tabular-nums">
            نمودار ترکیبی روزانه
          </span>
        </div>

        {dailyChartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
            هنوز عملیات تکمیل‌شده‌ای در ماه جاری ثبت نشده است.
          </div>
        ) : (
          <div className="h-64 w-full" dir="ltr" data-testid="recharts-monthly-daily">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyChartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#475569' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  yAxisId="meters"
                  orientation="left"
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(v) => toPersianDigits(v)}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  yAxisId="tickets"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#0f172a' }}
                  tickFormatter={(v) => toPersianDigits(v)}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as (typeof dailyChartData)[number];
                    return (
                      <div
                        dir="rtl"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
                      >
                        <div className="mb-1 font-semibold text-slate-900 tabular-nums">
                          تاریخ: {row.fullDate}
                        </div>
                        <div className="text-slate-700 tabular-nums">
                          تیکت‌های تکمیل‌شده: <span className="font-bold">{toPersianDigits(row.completedCount)}</span>
                        </div>
                        <div className="text-teal-700 tabular-nums">
                          کابل بیرونی: <span className="font-semibold">{toPersianDigits(row.outMeters)} متر</span>
                        </div>
                        <div className="text-slate-600 tabular-nums">
                          کابل داخلی: <span className="font-semibold">{toPersianDigits(row.inMeters)} متر</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
                  formatter={(value) => {
                    if (value === 'outMeters') return 'کابل بیرونی (متر)';
                    if (value === 'inMeters') return 'کابل داخلی (متر)';
                    if (value === 'completedCount') return 'تیکت تکمیل‌شده (تعداد)';
                    return value;
                  }}
                />
                <Bar
                  yAxisId="meters"
                  dataKey="outMeters"
                  stackId="cable"
                  fill="#0d9488"
                  radius={[0, 0, 0, 0]}
                  barSize={24}
                />
                <Bar
                  yAxisId="meters"
                  dataKey="inMeters"
                  stackId="cable"
                  fill="#475569"
                  radius={[4, 4, 0, 0]}
                  barSize={24}
                />
                <Line
                  yAxisId="tickets"
                  type="monotone"
                  dataKey="completedCount"
                  stroke="#d97706"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#d97706', strokeWidth: 2, stroke: '#ffffff' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Chart 2: Cable Spools Consumption Status (Current Month) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              وضعیت مصرف قرقره‌های کابل ({currentMonthTitle})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {toPersianDigits(totalSpoolsUsedMonth)} متر مصرف ثبت‌شده در {toPersianDigits(activeSpoolCount)} قرقره فعال
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            مصرف ماه جاری در برابر مانده
          </span>
        </div>

        {spoolChartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
            قرقره‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="h-64 w-full" dir="ltr" data-testid="recharts-monthly-spools">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spoolChartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="spoolCode"
                  tick={{ fontSize: 11, fill: '#475569' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#475569' }}
                  tickFormatter={(v) => toPersianDigits(v)}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as (typeof spoolChartData)[number];
                    return (
                      <div
                        dir="rtl"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
                      >
                        <div className="mb-1 font-mono font-semibold text-slate-900">
                          {row.spoolCode} ({row.typeLabel})
                        </div>
                        <div className="text-teal-700 tabular-nums">
                          مصرف ماه جاری: <span className="font-semibold">{toPersianDigits(row.usedMeters)} متر</span>
                        </div>
                        <div className="text-slate-600 tabular-nums">
                          مانده فعلی قرقره: <span className="font-semibold">{toPersianDigits(row.remainingMeters)} متر</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
                  formatter={(value) => {
                    if (value === 'usedMeters') return 'مصرف ماه جاری (متر)';
                    if (value === 'remainingMeters') return 'موجودی باقیمانده (متر)';
                    return value;
                  }}
                />
                <Bar dataKey="usedMeters" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="remainingMeters" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
