import { AlertTriangle, X } from 'lucide-react';

export interface ToastNotice {
  id: string;
  title: string;
  message: string;
  variant: 'danger' | 'success';
}

interface ToastContainerProps {
  toasts: ToastNotice[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-5 z-50 flex w-full max-w-md flex-col gap-2.5 px-4 sm:px-0"
      aria-live="assertive"
    >
      {toasts.map((toast) => {
        const isDanger = toast.variant === 'danger';
        return (
          <div
            key={toast.id}
            role="alert"
            data-testid={isDanger ? 'toast-warning-red' : 'toast-success'}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
              isDanger
                ? 'border-red-700 bg-red-600 text-white'
                : 'border-emerald-700 bg-emerald-600 text-white'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-white" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold leading-5">{toast.title}</div>
              <div className="mt-0.5 text-xs leading-5 text-white/95">{toast.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="بستن هشدار"
              className="shrink-0 rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
