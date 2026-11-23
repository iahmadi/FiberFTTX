import { useMemo, useState } from 'react';
import { Activity, RefreshCw, Search, X } from 'lucide-react';
import type { ActivityLogItem } from '../types/erp';
import { formatDateTimeToJalali, toPersianDigits } from '../lib/jalali';
import {
  ACTIVITY_ACTION_LABELS,
  filterActivityLogs,
  getActivityCategory,
  type ActivityCategory,
} from '../lib/fiberLogic';

interface UserActivityLogTableProps {
  logs: ActivityLogItem[];
  onRefresh: () => void;
}

export function UserActivityLogTable({ logs, onRefresh }: UserActivityLogTableProps) {
  const [category, setCategory] = useState<ActivityCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = useMemo(
    () => filterActivityLogs(logs, category, searchQuery),
    [logs, category, searchQuery],
  );

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white"
      data-testid="activity-log-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-teal-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              گزارش فعالیت کاربران (Activity Log)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              ثبت خودکار عملیات حیاتی تیکت‌ها، انبار، تغییرات مالی و کاربران ({toPersianDigits(filteredLogs.length)} رکورد)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 right-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              aria-label="جستجو در گزارش فعالیت کاربران"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام کاربری، شرح عملیات یا جزئیات..."
              className="h-8 w-64 max-w-full rounded-lg border border-slate-300 pr-8 pl-7 text-xs focus:border-teal-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="پاک کردن جستجوی فعالیت"
                onClick={() => setSearchQuery('')}
                className="absolute top-1.5 left-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>به‌روزرسانی</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
        {(
          [
            ['all', 'همه رویدادها'],
            ['ticket', 'تیکت‌ها و تاییدها'],
            ['inventory', 'انبار و قرقره‌ها'],
            ['financial', 'تغییرات مالی'],
            ['rbac', 'کاربران و دسترسی‌ها'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              category === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredLogs.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">
          هیچ فعالیتی مطابق با فیلتر انتخاب‌شده یافت نشد.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
              <tr>
                <th className="px-4 py-3">نام کاربری و مجری</th>
                <th className="px-4 py-3">نوع عملیات</th>
                <th className="px-4 py-3">جزئیات عملیات</th>
                <th className="px-4 py-3">مهر زمانی (Timestamp)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const cat = getActivityCategory(log.action_type);
                const catColor =
                  cat === 'ticket'
                    ? 'text-teal-700'
                    : cat === 'inventory'
                      ? 'text-amber-700'
                      : cat === 'financial'
                        ? 'text-emerald-700'
                        : 'text-slate-700';
                return (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div dir="ltr" className="text-right font-mono font-semibold text-slate-900">
                        @{log.username}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{log.user_full_name}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      <span className={catColor}>
                        {ACTIVITY_ACTION_LABELS[log.action_type] || log.action_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 tabular-nums">
                        {toPersianDigits(log.summary)}
                      </div>
                      {log.details && (
                        <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                          {toPersianDigits(log.details)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      <div className="font-medium text-slate-700">
                        {formatDateTimeToJalali(log.created_at)}
                      </div>
                      <div dir="ltr" className="mt-0.5 text-right font-mono text-[10px] text-slate-400">
                        {log.created_at}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
