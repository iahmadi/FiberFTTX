import { useMemo, useState } from 'react';
import { CalendarRange, FileSpreadsheet, RotateCcw, TrendingUp } from 'lucide-react';
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
import type { LedgerItem, MonthlyContractorEarning } from '../types/erp';
import { filterMonthlyEarningsByRange, type EarningsRangePreset } from '../lib/fiberLogic';
import {
  buildContractorEarningsExcelXml,
  buildExcelExportFilename,
  downloadExcelWorkbook,
  filterLedgerEntriesByMonths,
} from '../lib/excelExport';
import { formatToman, toPersianDigits } from '../lib/jalali';

interface ContractorMonthlyEarningsReportProps {
  monthlyEarnings: MonthlyContractorEarning[];
  ledger: LedgerItem[];
  contractorScopeLabel: string;
}

export function ContractorMonthlyEarningsReport({
  monthlyEarnings,
  ledger,
  contractorScopeLabel,
}: ContractorMonthlyEarningsReportProps) {
  const [preset, setPreset] = useState<EarningsRangePreset>('all');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');

  const sortedAll = useMemo(
    () => [...monthlyEarnings].sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    [monthlyEarnings],
  );

  const filteredMonths = useMemo(
    () => filterMonthlyEarningsByRange(sortedAll, { preset, fromMonth, toMonth }),
    [sortedAll, preset, fromMonth, toMonth],
  );

  const totalRangeEarnings = useMemo(
    () => filteredMonths.reduce((acc, m) => acc + m.totalEarnings, 0),
    [filteredMonths],
  );

  const totalRangeEntries = useMemo(
    () => filteredMonths.reduce((acc, m) => acc + m.entryCount, 0),
    [filteredMonths],
  );

  const handleSelectPreset = (nextPreset: Exclude<EarningsRangePreset, 'custom'>) => {
    setPreset(nextPreset);
    setFromMonth('');
    setToMonth('');
  };

  const handleCustomFromChange = (val: string) => {
    setFromMonth(val);
    if (val || toMonth) {
      setPreset('custom');
    } else {
      setPreset('all');
    }
  };

  const handleCustomToChange = (val: string) => {
    setToMonth(val);
    if (fromMonth || val) {
      setPreset('custom');
    } else {
      setPreset('all');
    }
  };

  const handleReset = () => {
    setPreset('all');
    setFromMonth('');
    setToMonth('');
  };

  const rangeLabel = useMemo(() => {
    if (preset === '3m') return '۳ ماه اخیر';
    if (preset === '6m') return '۶ ماه اخیر';
    if (preset === '12m') return '۱۲ ماه اخیر';
    if (preset === 'custom') {
      const fromLbl = sortedAll.find((m) => m.monthKey === fromMonth)?.monthLabel || 'ابتدا';
      const toLbl = sortedAll.find((m) => m.monthKey === toMonth)?.monthLabel || 'انتها';
      return `${fromLbl} تا ${toLbl}`;
    }
    return 'همه دوره‌ها';
  }, [preset, fromMonth, toMonth, sortedAll]);

  const handleExportExcel = () => {
    const activeMonthKeys = filteredMonths.map((m) => m.monthKey);
    const scopedLedger =
      preset === 'all' ? ledger : filterLedgerEntriesByMonths(ledger, activeMonthKeys);

    const xml = buildContractorEarningsExcelXml({
      monthlyEarnings: filteredMonths,
      ledgerEntries: scopedLedger,
      rangeLabel,
      contractorScopeLabel,
    });
    downloadExcelWorkbook(buildExcelExportFilename('contractor-monthly-earnings'), xml);
  };

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5"
      data-testid="contractor-earnings-report"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              گزارش مالی مجموع درآمد ماهانه پیمانکاران
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            مجموع درآمد در بازه انتخابی:{' '}
            <span className="font-semibold text-slate-900" data-testid="earnings-range-total">
              {formatToman(totalRangeEarnings)}
            </span>{' '}
            ({toPersianDigits(totalRangeEntries)} کارکرد در {toPersianDigits(filteredMonths.length)} ماه)
          </p>
        </div>

        {/* Time Range Filter Controls */}
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="financial-range-filter"
        >
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['all', 'همه دوره‌ها'],
                ['3m', '۳ ماه اخیر'],
                ['6m', '۶ ماه اخیر'],
                ['12m', '۱۲ ماه اخیر'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectPreset(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  preset === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
            <CalendarRange className="h-3.5 w-3.5 text-slate-500" />
            <label htmlFor="earn-from-month" className="text-[11px] text-slate-600">
              از ماه:
            </label>
            <select
              id="earn-from-month"
              aria-label="فیلتر از ماه"
              value={fromMonth}
              onChange={(e) => handleCustomFromChange(e.target.value)}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="">ابتدا</option>
              {sortedAll.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel}
                </option>
              ))}
            </select>

            <label htmlFor="earn-to-month" className="mr-1 text-[11px] text-slate-600">
              تا ماه:
            </label>
            <select
              id="earn-to-month"
              aria-label="فیلتر تا ماه"
              value={toMonth}
              onChange={(e) => handleCustomToChange(e.target.value)}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
            >
              <option value="">انتها</option>
              {sortedAll.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel}
                </option>
              ))}
            </select>
          </div>

          {preset !== 'all' && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="h-3 w-3" />
              <span>بازنشانی</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            data-testid="btn-export-excel"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>خروجی Excel</span>
          </button>
        </div>
      </div>

      {filteredMonths.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
          در بازه زمانی انتخاب‌شده درآمد بستانکاری ثبت نشده است.
        </div>
      ) : (
        <div className="h-72 w-full" dir="ltr" data-testid="recharts-financial-monthly">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredMonths} margin={{ top: 10, right: 16, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 12, fill: '#334155' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                width={90}
                tick={{ fontSize: 11, fill: '#475569' }}
                tickFormatter={(v: number) => toPersianDigits(Math.round(v).toLocaleString('en-US'))}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0]?.payload as MonthlyContractorEarning;
                  return (
                    <div
                      dir="rtl"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
                    >
                      <div className="mb-1 font-semibold text-slate-900">{row.monthLabel}</div>
                      <div className="text-teal-700 tabular-nums">
                        مجموع درآمد پیمانکاران:{' '}
                        <span className="font-bold">{formatToman(row.totalEarnings)}</span>
                      </div>
                      <div className="text-slate-500 tabular-nums">
                        تعداد کارکردهای ثبت‌شده: {toPersianDigits(row.entryCount)} مورد
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
                formatter={() => 'مجموع درآمد ماهانه پیمانکاران (تومان)'}
              />
              <Bar
                dataKey="totalEarnings"
                fill="#0d9488"
                radius={[4, 4, 0, 0]}
                barSize={44}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
