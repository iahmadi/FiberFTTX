import { useEffect, useState } from 'react';
import { ArrowLeft, Cable, CheckCircle2, ClipboardList, Clock, Package, Wallet } from 'lucide-react';
import type { AuthUser, TicketItem } from '../types/erp';
import { apiFetch } from '../utils/api';
import { formatDateTimeToJalali, formatToman, toPersianDigits } from '../lib/jalali';
import { OfflineCableBreakdown } from '../components/OfflineCharts';
import {
  MonthlyStatsRecharts,
  type MonthlyDailyMetric,
  type MonthlySpoolStat,
} from '../components/MonthlyStatsRecharts';

interface DashboardResponse {
  stats: {
    totalTickets: number;
    pendingTickets: number;
    assignedTickets: number;
    completedTickets: number;
    outMetersUsed: number;
    inMetersUsed: number;
    remainingSpoolMeters: number;
    spoolCount: number;
    myBalance: {
      totalCredit: number;
      totalDebit: number;
      balance: number;
    };
  };
  inboxTickets: TicketItem[];
  dailyMetrics: MonthlyDailyMetric[];
  monthlySpoolStats: MonthlySpoolStat[];
}

interface DashboardPageProps {
  user: AuthUser;
  onStartTicketService: (ticket: TicketItem) => void;
  onGoToTickets: () => void;
}

export function DashboardPage({
  user,
  onStartTicketService,
  onGoToTickets,
}: DashboardPageProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canExecute = user.isSuperAdmin || user.permissions.includes('can_execute_service');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<DashboardResponse>('/api/dashboard')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'خطا در بارگذاری داشبورد');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'امکان دریافت اطلاعات داشبورد وجود ندارد.'}
      </div>
    );
  }

  const { stats, inboxTickets, dailyMetrics, monthlySpoolStats } = data;

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>تیکت‌های در جریان</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {toPersianDigits(stats.assignedTickets + stats.pendingTickets)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {toPersianDigits(stats.assignedTickets)} ارجاع‌شده · {toPersianDigits(stats.pendingTickets)} در انتظار ارجاع
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>عملیات تکمیل‌شده</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {toPersianDigits(stats.completedTickets)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            مجموع متراژ ثبت‌شده: {toPersianDigits(stats.outMetersUsed + stats.inMetersUsed)} متر
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>موجودی قرقره‌ها</span>
            <Package className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {toPersianDigits(stats.remainingSpoolMeters)} متر
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            در قالب {toPersianDigits(stats.spoolCount)} حلقه قرقره فعال
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>مانده حساب مالی من</span>
            <Wallet className="h-4 w-4 text-slate-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatToman(stats.myBalance.balance)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            کارکرد: {formatToman(stats.myBalance.totalCredit, false)} · پرداختی: {formatToman(stats.myBalance.totalDebit, false)}
          </div>
        </div>
      </div>

      {/* Recharts Row (Monthly Completed Tickets & Spool Consumption Side-by-Side) */}
      <MonthlyStatsRecharts
        dailyMetrics={dailyMetrics}
        spoolStats={monthlySpoolStats || []}
      />

      {/* Cable Breakdown Strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">تفکیک کل کابل مصرفی ثبت‌شده</h2>
          <Cable className="h-4 w-4 text-slate-400" />
        </div>
        <OfflineCableBreakdown
          outMeters={stats.outMetersUsed}
          inMeters={stats.inMetersUsed}
        />
      </div>

      {/* Installer Inbox (Active Assigned Tickets) */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-900">کارتابل تیکت‌های فعال</h2>
          </div>
          <button
            type="button"
            onClick={onGoToTickets}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
          >
            <span>مشاهده همه تیکت‌ها</span>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {inboxTickets.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            هیچ تیکت باز یا ارجاع‌شده‌ای در کارتابل شما وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">شماره</th>
                  <th className="px-4 py-3">مشترک</th>
                  <th className="px-4 py-3">نوع سرویس</th>
                  <th className="px-4 py-3">آدرس</th>
                  <th className="px-4 py-3">نصاب مسئول</th>
                  <th className="px-4 py-3">زمان ثبت</th>
                  <th className="px-4 py-3">وضعیت</th>
                  {canExecute && <th className="px-4 py-3">اقدام</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inboxTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900 tabular-nums">
                      #{toPersianDigits(ticket.id)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{ticket.customer_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {ticket.type === 'install' ? 'نصب جدید' : 'رفع خرابی'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-600" title={ticket.address}>
                      {ticket.address}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {ticket.installer_name || 'تعیین‌نشده'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                      {formatDateTimeToJalali(ticket.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          ticket.status === 'assigned'
                            ? 'font-medium text-amber-700'
                            : 'font-medium text-slate-600'
                        }
                      >
                        {ticket.status === 'assigned' ? 'ارجاع‌شده' : 'در انتظار ارجاع'}
                      </span>
                    </td>
                    {canExecute && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onStartTicketService(ticket)}
                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 whitespace-nowrap"
                        >
                          ثبت فرم اجرا
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
