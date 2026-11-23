import { formatDateToJalali, toPersianDigits } from '../lib/jalali';

interface DailyMetricPoint {
  day: string;
  count: number;
  meters: number;
}

export function OfflineServiceBarChart({ data }: { data: DailyMetricPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        هنوز عملیات ثبت‌شده‌ای برای نمایش نمودار وجود ندارد.
      </div>
    );
  }

  const maxMeters = Math.max(...data.map((d) => d.meters), 10);

  return (
    <div className="space-y-3">
      <div className="flex h-44 items-end gap-3 border-b border-slate-200 px-2 pt-4 pb-1">
        {data.map((item) => {
          const pct = Math.max(8, Math.round((item.meters / maxMeters) * 100));
          return (
            <div key={item.day} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-600 tabular-nums">
                {toPersianDigits(item.meters)}م
              </span>
              <div className="flex h-28 w-full max-w-12 items-end justify-center rounded-t bg-slate-100">
                <div
                  style={{ height: `${pct}%` }}
                  className="w-full rounded-t bg-teal-600 transition-all duration-200"
                  title={`${formatDateToJalali(item.day)}: ${item.meters} متر (${item.count} عملیات)`}
                />
              </div>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {formatDateToJalali(item.day).slice(5)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>متراژ کابل‌کشی روزانه (مجموع داخلی و بیرونی)</span>
        <span className="tabular-nums">
          مجموع دوره: {toPersianDigits(data.reduce((s, d) => s + d.meters, 0))} متر
        </span>
      </div>
    </div>
  );
}

export function OfflineCableBreakdown({
  outMeters,
  inMeters,
}: {
  outMeters: number;
  inMeters: number;
}) {
  const total = outMeters + inMeters;
  const outPct = total > 0 ? Math.round((outMeters / total) * 100) : 0;
  const inPct = total > 0 ? 100 - outPct : 0;

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {total > 0 && (
          <>
            <div style={{ width: `${outPct}%` }} className="bg-teal-600" />
            <div style={{ width: `${inPct}%` }} className="bg-slate-700" />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-slate-500">کابل بیرونی (Outdoor)</div>
          <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
            {toPersianDigits(outMeters)} متر
          </div>
          <div className="mt-0.5 text-teal-700 tabular-nums">{toPersianDigits(outPct)}٪ کل مصرف</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="text-slate-500">کابل داخلی (Indoor)</div>
          <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
            {toPersianDigits(inMeters)} متر
          </div>
          <div className="mt-0.5 text-slate-600 tabular-nums">{toPersianDigits(inPct)}٪ کل مصرف</div>
        </div>
      </div>
    </div>
  );
}
