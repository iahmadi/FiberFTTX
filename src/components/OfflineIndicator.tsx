import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { toPersianDigits } from '../lib/jalali';

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
}

export function OfflineIndicator({
  isOnline,
  pendingCount,
  isSyncing,
  onSyncNow,
}: OfflineIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        data-testid="network-status-badge"
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
          isOnline
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
      >
        {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        <span>{isOnline ? 'متصل به شبکه' : 'حالت آفلاین'}</span>
      </div>

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={onSyncNow}
          disabled={!isOnline || isSyncing}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-200 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="tabular-nums">
            {toPersianDigits(pendingCount)} مورد در صف همگام‌سازی
          </span>
        </button>
      )}
    </div>
  );
}
