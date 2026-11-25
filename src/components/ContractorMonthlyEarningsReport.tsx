import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downloadFinancialExcelReport } from '../lib/excelExport';
import {
  aggregateMonthlyContractorEarnings,
  filterMonthlyEarningsByRange,
  type EarningsRangePreset,
} from '../lib/fiberLogic';
import { formatCurrencyToman, isoToJalaliYmd, toPersianDigits } from '../lib/jalali';
import type { LedgerEntryItem } from '../types/erp';

interface ContractorMonthlyEarningsReportProps {
  ledger: LedgerEntryItem[];
  onExported?: (filename: string) => void;
}

export function ContractorMonthlyEarningsReport({
  ledger,
  onExported,
}: ContractorMonthlyEarningsReportProps) {
  const [preset, setPreset] = useState<EarningsRangePreset>('all');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');

  const allMonths = useMemo(
    () =>
      aggregateMonthlyContractorEarnings(
        ledger.map((l) => ({
          amount: l.amount,
          type: l.type,
          created_at: l.created_at,
        })),
      ),
    [ledger],
  );

  const filteredMonths = useMemo(
    () => filterMonthlyEarningsByRange(allMonths, { preset, fromMonth, toMonth }),
    [allMonths, preset, fromMonth, toMonth],
  );

  const handleExcelDownload = () => {
    const filename = downloadFinancialExcelReport({
      monthlySummary: filteredMonths,
      ledgerRows: ledger.map((l) => ({
        id: l.id,
        user_full_name: l.user_full_name || l.customer_name || '—',
        ticket_id: l.ticket_id,
        type: l.type,
        amount: l.amount,
        description: l.description,
        jalaliDate: isoToJalaliYmd(l.created_at) || l.created_at.slice(0, 10),
      })),
    });
    if (onExported) onExported(filename);
  };

  const totalRangeEarnings = filteredMonths.reduce((acc, m) => acc + m.totalEarnings, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            گزارش درآمد ماهانه پیمانکاران (نمودار میله‌ای و خروجی اکسل)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            مجموع درآمد ثبت‌شده در بازه انتخابی:{' '}
            <strong className="tabular-nums text-teal-800">
              {formatCurrencyToman(totalRangeEarnings)}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(
              [
                { id: 'all', label: 'همه' },
                { id: '3m', label: '۳ ماه' },
                { id: '6m', label: '۶ ماه' },
                { id: '12m', label: '۱۲ ماه' },
                { id: 'custom', label: 'بازه دلخواه' },
              ] as Array<{ id: EarningsRangePreset; label: string }>
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setPreset(btn.id)}
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                  preset === btn.id
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExcelDownload}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>خروجی Excel</span>
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-700">از ماه:</span>
            <select
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
            >
              <option value="">ابتدای دوره</option>
              {allMonths.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-700">تا ماه:</span>
            <select
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-900"
            >
              <option value="">انتهای دوره</option>
              {allMonths.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {filteredMonths.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          تراکنش بستانکاری در بازه زمانی انتخاب‌شده یافت نشد.
        </div>
      ) : (
        <div className="h-72 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredMonths} margin={{ top: 10, right: 16, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#475569' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#475569' }}
                tickFormatter={(v) =>
                  toPersianDigits(Math.round(Number(v) / 1000000).toLocaleString('en-US')) + 'M'
                }
              />
              <Tooltip
                formatter={(value) => [
                  formatCurrencyToman(Number(value ?? 0)),
                  'مجموع درآمد',
                ]}
                contentStyle={{
                  direction: 'rtl',
                  fontFamily: 'Vazirmatn, sans-serif',
                  fontSize: '12px',
                  borderRadius: '8px',
                  borderColor: '#cbd5e1',
                }}
              />
              <Bar
                dataKey="totalEarnings"
                name="مجموع درآمد ماهانه"
                fill="#0f766e"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
