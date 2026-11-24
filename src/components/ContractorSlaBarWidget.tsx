import { useState } from 'react';
import { Clock } from 'lucide-react';
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
import {
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  type ContractorSlaRow,
  type ContractorSlaSummary,
  type TicketTypeKey,
} from '../lib/fiberLogic';
import { toPersianDigits } from '../lib/jalali';

const TYPE_COLORS: Record<TicketTypeKey, string> = {
  internet_install: '#0f766e',
  internet_fault: '#d97706',
  ffat_install: '#0284c7',
  ffat_fault: '#dc2626',
  voip_install: '#6366f1',
};

interface ContractorSlaBarWidgetProps {
  summary: ContractorSlaSummary;
}

export function ContractorSlaBarWidget({ summary }: ContractorSlaBarWidgetProps) {
  const [selectedType, setSelectedType] = useState<'all' | TicketTypeKey>('all');

  const activeTypes: TicketTypeKey[] =
    selectedType === 'all'
      ? summary.activeTicketTypes.length > 0
        ? summary.activeTicketTypes
        : TICKET_TYPES
      : [selectedType];

  const chartData =
    selectedType === 'all'
      ? summary.contractors
      : summary.contractors.filter((row) => row[selectedType] !== null);

  const hasData = summary.contractors.length > 0 && chartData.length > 0;

  return (
    <div
      data-testid="contractor-sla-bar-widget"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">
              میانگین زمان صرف‌شده (SLA) پیمانکاران برتر (۳۰ روز اخیر)
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            میانگین ساعت ارجاع تا تکمیل به تفکیک نوع تیکت — تحلیل{' '}
            <strong className="font-bold tabular-nums text-slate-800">
              {toPersianDigits(summary.totalCompletedAnalyzed)} سرویس تکمیل‌شده
            </strong>
          </p>
        </div>

        <select
          aria-label="فیلتر نوع تیکت نمودار SLA پیمانکاران"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as 'all' | TicketTypeKey)}
          className="min-h-[36px] shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none"
        >
          <option value="all">همه انواع ۵گانه</option>
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TICKET_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {hasData ? (
        <div className="h-64 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 6, right: 20, left: 10, bottom: 6 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#475569' }}
                tickFormatter={(v) => `${toPersianDigits(v)} س`}
              />
              <YAxis
                type="category"
                dataKey="installerName"
                width={125}
                tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 600 }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                formatter={(value, name, item) => {
                  const row = item?.payload as ContractorSlaRow | undefined;
                  const dataKey = item?.dataKey as TicketTypeKey | undefined;
                  const count = row && dataKey ? row.typeCounts[dataKey] : 0;
                  const numVal = Number(value ?? 0);
                  const durText =
                    numVal === 0 ? 'کمتر از ۶ دقیقه' : `${toPersianDigits(numVal)} ساعت`;
                  const countText = count > 0 ? ` (${toPersianDigits(count)} تیکت)` : '';
                  return [`${durText}${countText}`, String(name ?? '')];
                }}
                labelFormatter={(label) => `پیمانکار: ${String(label ?? '')}`}
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
                  fontSize: '11px',
                  paddingTop: '8px',
                }}
              />
              {activeTypes.map((typeKey) => (
                <Bar
                  key={typeKey}
                  dataKey={typeKey}
                  name={TICKET_TYPE_LABELS[typeKey]}
                  fill={TYPE_COLORS[typeKey]}
                  barSize={activeTypes.length === 1 ? 22 : 14}
                  minPointSize={8}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-xs text-slate-500">
          در ۳۰ روز اخیر هیچ سرویس تکمیل‌شده‌ای برای محاسبه میانگین SLA این فیلتر ثبت نشده است.
        </div>
      )}
    </div>
  );
}
