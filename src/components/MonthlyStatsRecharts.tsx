import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toPersianDigits } from '../lib/jalali';

export interface MonthlyDashboardPoint {
  monthKey: string;
  monthLabel: string;
  completedTickets: number;
  outdoorMeters: number;
  indoorMeters: number;
}

interface MonthlyStatsRechartsProps {
  data: MonthlyDashboardPoint[];
}

export function MonthlyStatsRecharts({ data }: MonthlyStatsRechartsProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            آمار تیکت‌های تکمیل‌شده و مصرف قرقره کابل (۶ ماه اخیر)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            مقایسه ماهانه تعداد سرویس‌های تکمیل‌شده و متراژ کابل مصرفی فضای باز و داخلی
          </p>
        </div>
      </div>

      <div className="h-72 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: '#475569' }}
              tickFormatter={(v) => toPersianDigits(String(v))}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#475569' }}
              tickFormatter={(v) => toPersianDigits(String(v))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#475569' }}
              tickFormatter={(v) => toPersianDigits(String(v))}
            />
            <Tooltip
              formatter={(value, name) => [
                toPersianDigits(Number(value ?? 0)),
                String(name ?? ''),
              ]}
              contentStyle={{
                direction: 'rtl',
                fontFamily: 'Vazirmatn, sans-serif',
                fontSize: '12px',
                borderRadius: '8px',
                borderColor: '#cbd5e1',
              }}
            />
            <Legend
              wrapperStyle={{
                fontFamily: 'Vazirmatn, sans-serif',
                fontSize: '12px',
                paddingTop: '8px',
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="completedTickets"
              name="تیکت تکمیل‌شده"
              fill="#0f766e"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="right"
              dataKey="outdoorMeters"
              name="کابل فضای باز (متر)"
              fill="#0284c7"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="right"
              dataKey="indoorMeters"
              name="کابل داخلی (متر)"
              fill="#f59e0b"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
