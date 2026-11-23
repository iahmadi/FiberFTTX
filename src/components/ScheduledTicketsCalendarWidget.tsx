import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Settings2,
  User,
  Wrench,
} from 'lucide-react';
import type { TicketItem } from '../types/erp';
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_FULL,
  JALALI_WEEKDAY_SHORT,
  formatJalaliYmd,
  getJalaliMonthLength,
  getJalaliWeekdayIndex,
  getTodayJalali,
  isoToJalaliYmd,
  toPersianDigits,
} from '../lib/jalali';
import {
  getTicketScheduleIsoDate,
  getUpcomingScheduledTickets,
  groupScheduledTicketsByJalaliDay,
} from '../lib/fiberLogic';

interface ScheduledTicketsCalendarWidgetProps {
  tickets: TicketItem[];
  canExecute: boolean;
  onStartTicketService: (ticket: TicketItem) => void;
  onPreviewTicket: (ticket: TicketItem) => void;
}

export function ScheduledTicketsCalendarWidget({
  tickets,
  canExecute,
  onStartTicketService,
  onPreviewTicket,
}: ScheduledTicketsCalendarWidgetProps) {
  const todayJalali = useMemo(() => getTodayJalali(), []);
  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const [viewYear, setViewYear] = useState(todayJalali.jy);
  const [viewMonth, setViewMonth] = useState(todayJalali.jm);
  const [selectedDay, setSelectedDay] = useState(todayJalali.jd);
  const [onlyInstallations, setOnlyInstallations] = useState(true);

  const daysInMonth = getJalaliMonthLength(viewYear, viewMonth);
  const startOffset = getJalaliWeekdayIndex(viewYear, viewMonth, 1);

  const groupedByDay = useMemo(
    () => groupScheduledTicketsByJalaliDay(tickets, viewYear, viewMonth, onlyInstallations),
    [tickets, viewYear, viewMonth, onlyInstallations],
  );

  const selectedDayTickets = groupedByDay[selectedDay] || [];

  const upcomingTickets = useMemo(
    () => getUpcomingScheduledTickets(tickets, todayIso, onlyInstallations, 5),
    [tickets, todayIso, onlyInstallations],
  );

  const selectedWeekdayName = useMemo(() => {
    const idx = getJalaliWeekdayIndex(viewYear, viewMonth, Math.min(selectedDay, daysInMonth));
    return JALALI_WEEKDAY_FULL[idx] || '';
  }, [viewYear, viewMonth, selectedDay, daysInMonth]);

  const monthScheduledCount = useMemo(
    () => Object.values(groupedByDay).reduce((sum, list) => sum + list.length, 0),
    [groupedByDay],
  );

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
    setSelectedDay(1);
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
    setSelectedDay(1);
  };

  const handleJumpToday = () => {
    setViewYear(todayJalali.jy);
    setViewMonth(todayJalali.jm);
    setSelectedDay(todayJalali.jd);
  };

  const handleJumpToTicketDate = (ticket: TicketItem) => {
    const iso = getTicketScheduleIsoDate(ticket);
    if (!iso) return;
    const jStr = isoToJalaliYmd(iso, false);
    const parts = jStr.split('/').map(Number);
    if (parts.length === 3) {
      setViewYear(parts[0]);
      setViewMonth(parts[1]);
      setSelectedDay(parts[2]);
    }
  };

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white"
      data-testid="dashboard-schedule-calendar"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <CalendarDays className="h-4 w-4 text-teal-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              تقویم زمان‌بندی نصب‌های آتی و برنامه روزانه پیمانکاران
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {toPersianDigits(monthScheduledCount)} تیکت زمان‌بندی‌شده در{' '}
              {JALALI_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setOnlyInstallations(true)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                onlyInstallations ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              نصب‌های آتی
            </button>
            <button
              type="button"
              onClick={() => setOnlyInstallations(false)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                !onlyInstallations ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              همه تیکت‌ها
            </button>
          </div>

          <button
            type="button"
            onClick={handleJumpToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
          >
            امروز ({formatJalaliYmd(todayJalali.jy, todayJalali.jm, todayJalali.jd, true)})
          </button>
        </div>
      </div>

      {/* 2-Column Split: Jalali Calendar Grid + Daily Agenda */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-x-reverse lg:divide-y-0">
        {/* Monthly Jalali Grid */}
        <div className="p-5 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="ماه قبل تقویم"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
              <span>ماه قبل</span>
            </button>
            <div className="text-sm font-bold text-slate-900 tabular-nums">
              {JALALI_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="ماه بعد تقویم"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              <span>ماه بعد</span>
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500">
            {JALALI_WEEKDAY_SHORT.map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="h-14 rounded-lg bg-slate-50/40" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const dayItems = groupedByDay[day] || [];
              const isSelected = selectedDay === day;
              const isToday =
                todayJalali.jy === viewYear &&
                todayJalali.jm === viewMonth &&
                todayJalali.jd === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  aria-label={`روز ${toPersianDigits(day)} ${JALALI_MONTH_NAMES[viewMonth - 1]} (${toPersianDigits(dayItems.length)} برنامه)`}
                  className={`flex h-14 flex-col items-center justify-between rounded-lg border p-1.5 text-xs transition-colors tabular-nums ${
                    isSelected
                      ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                      : isToday
                        ? 'border-teal-500 bg-teal-50/60 text-teal-900 hover:bg-teal-50'
                        : dayItems.length > 0
                          ? 'border-slate-200 bg-slate-50/80 text-slate-900 hover:border-teal-400 hover:bg-white'
                          : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-semibold">{toPersianDigits(day)}</span>
                  {dayItems.length > 0 ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      {toPersianDigits(dayItems.length)} مورد
                    </span>
                  ) : (
                    <span className="h-3" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily Agenda Panel */}
        <div className="flex flex-col justify-between p-5 lg:col-span-6" data-testid="daily-schedule-agenda">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 tabular-nums">
                  برنامه کاری روز {selectedWeekdayName}{' '}
                  {formatJalaliYmd(viewYear, viewMonth, Math.min(selectedDay, daysInMonth), true)}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  {selectedDayTickets.length > 0
                    ? `${toPersianDigits(selectedDayTickets.length)} عملیات زمان‌بندی‌شده برای این روز`
                    : 'تیکت زمان‌بندی‌شده‌ای برای این روز ثبت نشده است'}
                </p>
              </div>
            </div>

            {selectedDayTickets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-500">
                در این روز برنامه‌ای ثبت نشده است. برای مشاهده برنامه، روی روزهای دارای نشان در تقویم کلیک کنید.
              </div>
            ) : (
              <div className="space-y-2.5">
                {selectedDayTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:bg-white"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-slate-900 tabular-nums">
                            #{toPersianDigits(ticket.id)} — {ticket.customer_name}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              ticket.type === 'install'
                                ? 'bg-teal-100 text-teal-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ticket.type === 'install' ? 'نصب جدید' : 'رفع خرابی'}
                          </span>
                          {ticket.scheduled_time && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 tabular-nums">
                              <Clock className="h-3 w-3 text-teal-600" />
                              {toPersianDigits(ticket.scheduled_time)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-slate-600">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="line-clamp-1">{ticket.address}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <User className="h-3 w-3 shrink-0 text-slate-400" />
                          <span>مجری: {ticket.installer_name || 'در انتظار ارجاع'}</span>
                        </div>
                      </div>

                      {canExecute && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onPreviewTicket(ticket)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Settings2 className="h-3 w-3" />
                            <span>جزئیات</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onStartTicketService(ticket)}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
                          >
                            <Wrench className="h-3 w-3" />
                            <span>ثبت اجرا</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Installations Quick Strip */}
          {upcomingTickets.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 text-[11px] font-semibold text-slate-500">
                نصب‌ها و برنامه‌های پیش‌رو (کلیک جهت پرش به روز):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {upcomingTickets.map((t) => {
                  const iso = getTicketScheduleIsoDate(t) || '';
                  const jalaliLabel = isoToJalaliYmd(iso, true);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleJumpToTicketDate(t)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:border-teal-500 hover:bg-teal-50 tabular-nums"
                    >
                      <span className="font-semibold text-teal-700">{jalaliLabel}</span>
                      <span>·</span>
                      <span className="max-w-[140px] truncate">{t.customer_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
