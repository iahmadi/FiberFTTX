import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_SHORT,
  formatJalaliYmd,
  getJalaliMonthLength,
  getJalaliWeekdayIndex,
  getTodayJalali,
  toPersianDigits,
} from '../lib/jalali';

interface JalaliDatePickerProps {
  label: string;
  value: string; // YYYY/MM/DD
  onChange: (value: string) => void;
}

export function JalaliDatePicker({ label, value, onChange }: JalaliDatePickerProps) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => getTodayJalali(), []);

  const parsed = useMemo(() => {
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
    if (!m) return today;
    return { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) };
  }, [value, today]);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed.jy);
  const [viewMonth, setViewMonth] = useState(parsed.jm);

  useEffect(() => {
    setViewYear(parsed.jy);
    setViewMonth(parsed.jm);
  }, [parsed.jy, parsed.jm]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const daysInMonth = getJalaliMonthLength(viewYear, viewMonth);
  const startOffset = getJalaliWeekdayIndex(viewYear, viewMonth, 1);

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <button
        id={inputId}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 hover:border-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
      >
        <span className="tabular-nums">{toPersianDigits(value || formatJalaliYmd(today.jy, today.jm, today.jd))}</span>
        <Calendar className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="ماه قبل"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-slate-800 tabular-nums">
              {JALALI_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="ماه بعد"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
            {JALALI_WEEKDAY_SHORT.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected =
                parsed.jy === viewYear && parsed.jm === viewMonth && parsed.jd === day;
              const isToday =
                today.jy === viewYear && today.jm === viewMonth && today.jd === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(formatJalaliYmd(viewYear, viewMonth, day, false));
                    setOpen(false);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-md tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-teal-600 font-semibold text-white'
                      : isToday
                        ? 'border border-teal-600 font-medium text-teal-700 hover:bg-teal-50'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(formatJalaliYmd(today.jy, today.jm, today.jd, false));
                setViewYear(today.jy);
                setViewMonth(today.jm);
                setOpen(false);
              }}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              انتخاب امروز
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
