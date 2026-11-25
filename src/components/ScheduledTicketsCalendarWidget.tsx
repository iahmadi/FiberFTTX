import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { ALL_TICKET_TYPE_LABELS, groupScheduledTicketsByJalaliDay } from '../lib/fiberLogic';
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAYS_SHORT,
  getJalaliMonthStartWeekday,
  getTodayJalali,
  jalaliMonthLength,
  toPersianDigits,
} from '../lib/jalali';
import type { TicketItem } from '../types/erp';

interface ScheduledTicketsCalendarWidgetProps {
  tickets: TicketItem[];
  onOpenTicket?: (ticketId: number) => void;
}

export function ScheduledTicketsCalendarWidget({
  tickets,
  onOpenTicket,
}: ScheduledTicketsCalendarWidgetProps) {
  const today = getTodayJalali();
  const [viewYear, setViewYear] = useState(today.jy);
  const [viewMonth, setViewMonth] = useState(today.jm);
  const [onlyInstalls, setOnlyInstalls] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(today.jd);

  const daysInMonth = jalaliMonthLength(viewYear, viewMonth);
  const startWeekday = getJalaliMonthStartWeekday(viewYear, viewMonth);

  const groupedByDay = useMemo(
    () => groupScheduledTicketsByJalaliDay(tickets, viewYear, viewMonth, onlyInstalls),
    [tickets, viewYear, viewMonth, onlyInstalls],
  );

  const shiftMonth = (delta: number) => {
    let nextM = viewMonth + delta;
    let nextY = viewYear;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    } else if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    setViewYear(nextY);
    setViewMonth(nextM);
    setSelectedDay(1);
  };

  const selectedTickets = groupedByDay[selectedDay] || [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-teal-700" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">تقویم زمان‌بندی نصب‌های آتی</h3>
            <p className="text-xs text-slate-500">مشاهده برنامه روزانه تیکت‌های ارجاع‌شده</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={onlyInstalls}
            onChange={(e) => setOnlyInstalls(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-700"
          />
          <span>فقط نصب‌ها</span>
        </label>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="ماه قبل"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-slate-900">
          {JALALI_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="ماه بعد"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">
        {JALALI_WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startWeekday }).map((_, idx) => (
          <div key={`empty-${idx}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const day = idx + 1;
          const dayTickets = groupedByDay[day] || [];
          const isSelected = selectedDay === day;
          const isToday =
            today.jy === viewYear && today.jm === viewMonth && today.jd === day;

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`flex min-h-[46px] flex-col items-center justify-between rounded-lg border p-1 text-xs transition-colors ${
                isSelected
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : isToday
                    ? 'border-teal-500 bg-teal-50 text-teal-900'
                    : 'border-slate-100 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold tabular-nums">{toPersianDigits(day)}</span>
              {dayTickets.length > 0 && (
                <span
                  className={`rounded px-1 text-[10px] font-bold tabular-nums ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-900'
                  }`}
                >
                  {toPersianDigits(dayTickets.length)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="mb-2 text-xs font-bold text-slate-700">
          برنامه روز {toPersianDigits(selectedDay)} {JALALI_MONTH_NAMES[viewMonth - 1]}:
        </div>
        {selectedTickets.length === 0 ? (
          <p className="text-xs text-slate-500">تیکت زمان‌بندی‌شده‌ای در این روز ثبت نشده است.</p>
        ) : (
          <div className="space-y-2">
            {selectedTickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTicket?.(t.id)}
                className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-right hover:border-teal-500 hover:bg-teal-50/40"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    #{toPersianDigits(t.id)} — {t.customer_name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-teal-800">
                    {ALL_TICKET_TYPE_LABELS[t.type]}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{t.address}</span>
                  </div>
                </div>
                {t.scheduled_time && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
                    <Clock className="h-3 w-3" />
                    {toPersianDigits(t.scheduled_time)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
