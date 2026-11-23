import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print fixed bottom-4 left-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2.5"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isWarningOrError = toast.type === 'error' || toast.type === 'warning';
        const palette =
          toast.type === 'error'
            ? 'border-red-300 bg-red-600 text-white'
            : toast.type === 'warning'
              ? 'border-red-200 bg-red-50 text-red-900'
              : toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-white text-slate-900';

        const Icon =
          toast.type === 'error' || toast.type === 'warning'
            ? AlertTriangle
            : toast.type === 'success'
              ? CheckCircle2
              : Info;

        return (
          <div
            key={toast.id}
            data-toast-type={toast.type}
            role={isWarningOrError ? 'alert' : 'status'}
            className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-lg ${palette}`}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-5">{toast.title}</p>
              {toast.description && (
                <p className="mt-1 text-xs leading-5 opacity-90">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="بستن اعلان"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-80 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
