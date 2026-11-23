import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { formatIsoToJalaliDisplay } from '../lib/jalali';
import type { ActivityLogItem } from '../types/erp';

interface UserActivityLogTableProps {
  logs: ActivityLogItem[];
}

export function UserActivityLogTable({ logs }: UserActivityLogTableProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.username.toLowerCase().includes(q) ||
        l.user_full_name.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q)),
    );
  }, [logs, query]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-teal-700" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              گزارش ممیزی و فعالیت کاربران (Activity Log)
            </h3>
            <p className="text-xs text-slate-500">
              ثبت تمام عملیات حیاتی تایید تیکت، تغییرات انبار قرقره و تراکنش‌های مالی با مهر زمانی
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در کاربر یا عملیات..."
            className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white pr-9 pl-3 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2.5 font-bold">کاربر</th>
              <th className="px-3 py-2.5 font-bold">نوع عملیات</th>
              <th className="px-3 py-2.5 font-bold">شرح رویداد</th>
              <th className="px-3 py-2.5 font-bold">جزئیات</th>
              <th className="px-3 py-2.5 font-bold">مهر زمانی (شمسی)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  موردی برای نمایش وجود ندارد.
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900">{log.user_full_name}</div>
                    <div dir="ltr" className="text-[11px] text-slate-500">
                      @{log.username}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-teal-800">{log.action_type}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{log.summary}</td>
                  <td className="px-3 py-2.5 text-slate-500">{log.details || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">
                    {formatIsoToJalaliDisplay(log.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
