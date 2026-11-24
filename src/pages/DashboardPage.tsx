import { AlertTriangle, Cable, CheckCircle2, ClipboardList, Clock, Wallet } from 'lucide-react';
import { ContractorSlaBarWidget } from '../components/ContractorSlaBarWidget';
import { ContractorSpoolPieWidget } from '../components/ContractorSpoolPieWidget';
import { CriticalSlaToast } from '../components/CriticalSlaToast';
import {
  MonthlyStatsRecharts,
  type MonthlyDashboardPoint,
} from '../components/MonthlyStatsRecharts';
import { ScheduledTicketsCalendarWidget } from '../components/ScheduledTicketsCalendarWidget';
import { TicketCompletionPieWidget } from '../components/TicketCompletionPieWidget';
import {
  computeContractorSlaAveragesLast30Days,
  computeCurrentMonthSpoolConsumptionByContractor,
  computeLast30DaysCompletionByType,
  type ContractorSlaSummary,
  type CriticalSlaTransitionAlert,
  type CurrentMonthSpoolConsumptionSummary,
  type Last30DaysCompletionSummary,
  type SpoolWarningItem,
} from '../lib/fiberLogic';
import { formatCurrencyToman, toPersianDigits } from '../lib/jalali';
import type { TicketItem } from '../types/erp';

export interface DashboardPayload {
  kpis: {
    pendingTickets: number;
    inProgressTickets: number;
    completedTickets: number;
    totalSpoolMeters: number;
    lowSpoolCount: number;
    balance: number;
  };
  lowSpools: SpoolWarningItem[];
  monthlySeries: MonthlyDashboardPoint[];
  completionLast30Days?: Last30DaysCompletionSummary;
  contractorSlaLast30Days?: ContractorSlaSummary;
  currentMonthSpoolConsumption?: CurrentMonthSpoolConsumptionSummary;
  recentCriticalSlaTransitions?: CriticalSlaTransitionAlert[];
  scheduledTickets: TicketItem[];
}

interface DashboardPageProps {
  data: DashboardPayload | null;
  loading: boolean;
  pendingOutboxCount: number;
  criticalSlaAlerts: CriticalSlaTransitionAlert[];
  onDismissCriticalSlaAlert: (eventKey: string) => void;
  onNavigateToTicket: (ticketId: number) => void;
  onNavigateToInventory: () => void;
}

export function DashboardPage({
  data,
  loading,
  pendingOutboxCount,
  criticalSlaAlerts,
  onDismissCriticalSlaAlert,
  onNavigateToTicket,
  onNavigateToInventory,
}: DashboardPageProps) {
  if (loading && !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        در حال بارگذاری شاخص‌های داشبورد...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        اطلاعات داشبورد در دسترس نیست.
      </div>
    );
  }

  const cards = [
    {
      label: 'تیکت‌های در انتظار ارجاع/شروع',
      value: toPersianDigits(data.kpis.pendingTickets),
      icon: ClipboardList,
      tone: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'عملیات در حال اجرا',
      value: toPersianDigits(data.kpis.inProgressTickets),
      icon: Clock,
      tone: 'text-sky-700 bg-sky-50',
    },
    {
      label: 'سرویس‌های تکمیل‌شده',
      value: toPersianDigits(data.kpis.completedTickets),
      icon: CheckCircle2,
      tone: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'موجودی کل قرقره‌ها',
      value: `${toPersianDigits(data.kpis.totalSpoolMeters.toLocaleString('en-US'))} متر`,
      icon: Cable,
      tone: 'text-teal-700 bg-teal-50',
    },
    {
      label: 'تراز مالی قابل تسویه',
      value: formatCurrencyToman(data.kpis.balance),
      icon: Wallet,
      tone: 'text-slate-800 bg-slate-100',
    },
  ];

  const completionSummary =
    data.completionLast30Days ?? computeLast30DaysCompletionByType(data.scheduledTickets);

  const contractorSlaSummary =
    data.contractorSlaLast30Days ?? computeContractorSlaAveragesLast30Days(data.scheduledTickets);

  const spoolConsumptionSummary =
    data.currentMonthSpoolConsumption ?? computeCurrentMonthSpoolConsumptionByContractor([]);

  return (
    <div className="space-y-6">
      <CriticalSlaToast
        alerts={criticalSlaAlerts}
        onDismiss={onDismissCriticalSlaAlert}
        onInspectTicket={onNavigateToTicket}
      />

      {pendingOutboxCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span>
            <strong className="font-bold tabular-nums">
              {toPersianDigits(pendingOutboxCount)} عملیات آفلاین
            </strong>{' '}
            در حافظه مرورگر (IndexedDB) ذخیره شده و پس از اتصال خودکار همگام‌سازی می‌شود.
          </span>
        </div>
      )}

      {data.lowSpools.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <strong>هشدار کسری قرقره کابل (زیر ۱۰٪): </strong>
              {data.lowSpools
                .map(
                  (s) =>
                    `${s.spool_code} (${toPersianDigits(s.current_length)} متر / ${toPersianDigits(
                      s.percentRemaining,
                    )}٪)`,
                )
                .join('، ')}
            </span>
          </div>
          <button
            type="button"
            onClick={onNavigateToInventory}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            مدیریت قرقره‌ها
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <div>
                <div className="text-xs font-medium text-slate-500">{c.label}</div>
                <div className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">
                  {c.value}
                </div>
              </div>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <MonthlyStatsRecharts data={data.monthlySeries} />
        </div>
        <div className="xl:col-span-5">
          <ScheduledTicketsCalendarWidget
            tickets={data.scheduledTickets}
            onOpenTicket={onNavigateToTicket}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <TicketCompletionPieWidget summary={completionSummary} />
        </div>
        <div className="xl:col-span-6">
          <ContractorSpoolPieWidget summary={spoolConsumptionSummary} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-12">
          <ContractorSlaBarWidget summary={contractorSlaSummary} />
        </div>
      </div>
    </div>
  );
}

