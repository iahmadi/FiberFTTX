import { AlertTriangle, ArrowLeft, Eye, X } from 'lucide-react';
import { ALL_TICKET_TYPE_LABELS, type CriticalSlaTransitionAlert } from '../lib/fiberLogic';
import { formatIsoToJalaliDisplay, toPersianDigits } from '../lib/jalali';

interface CriticalSlaToastProps {
  alerts: CriticalSlaTransitionAlert[];
  onDismiss: (eventKey: string) => void;
  onInspectTicket: (ticketId: number) => void;
}

export function CriticalSlaToast({
  alerts,
  onDismiss,
  onInspectTicket,
}: CriticalSlaToastProps) {
  if (alerts.length === 0) return null;

  return (
    <div
      data-testid="critical-sla-toast-container"
      aria-live="assertive"
      className="no-print fixed top-20 left-4 z-[55] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2.5"
    >
      {alerts.map((alert) => {
        const isCompleted = alert.newStatus === 'completed';
        const isFailed = alert.newStatus === 'failed';
        const containerTone = isFailed
          ? 'border-red-300 bg-red-50 text-red-950'
          : isCompleted
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : 'border-amber-400 bg-white text-slate-900';

        const iconTone = isFailed
          ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-800';

        return (
          <div
            key={alert.eventKey}
            data-testid="critical-sla-toast"
            data-ticket-id={alert.ticketId}
            role="alert"
            className={`rounded-xl border p-4 shadow-xl ${containerTone}`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconTone}`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-amber-900">
                    هشدار تغییر وضعیت تیکت بحرانی SLA
                  </span>
                  <button
                    type="button"
                    onClick={() => onDismiss(alert.eventKey)}
                    aria-label="بستن اعلان بحرانی SLA"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-1 text-sm font-bold text-slate-900">
                  تیکت #{toPersianDigits(alert.ticketId)} — {alert.customerName}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {ALL_TICKET_TYPE_LABELS[alert.ticketType]} · مجری فنی:{' '}
                  <strong className="font-semibold text-slate-800">{alert.installerName}</strong>
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-xs">
                  <span className="font-semibold text-slate-700">
                    {alert.previousStatusLabel}
                  </span>
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <span className="font-bold text-teal-800">{alert.newStatusLabel}</span>
                  <span className="mr-auto font-semibold tabular-nums text-amber-800">
                    تاخیر ارجاع: {alert.elapsedLabel}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] tabular-nums text-slate-500">
                    زمان تغییر: {formatIsoToJalaliDisplay(alert.changedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onInspectTicket(alert.ticketId);
                      onDismiss(alert.eventKey);
                    }}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    مشاهده تیکت
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
