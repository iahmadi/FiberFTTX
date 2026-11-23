import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAYS_SHORT,
  getJalaliMonthStartWeekday,
  getTodayJalali,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  toPersianDigits,
} from '../lib/jalali';

interface JalaliDatePickerProps {
  valueIso: string;
  onChangeIso: (isoDate: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function JalaliDatePicker({
  valueIso,
  onChangeIso,
  placeholder = 'انتخاب تاریخ شمسی',
  disabled = false,
}: JalaliDatePickerProps) {
  const today = getTodayJalali();
  const initial = useMemo(() => {
    if (valueIso && /^\d{4}-\d{2}-\d{2}/.test(valueIso)) {
      const [gy, gm, gd] = valueIso.slice(0, 10).split('-').map(Number);
      return gregorianToJalali(gy, gm, gd);
    }
    return today;
  }, [valueIso, today]);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial.jy);
  const [viewMonth, setViewMonth] = useState(initial.jm);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setViewYear(initial.jy);
    setViewMonth(initial.jm);
  }, [initial.jy, initial.jm]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const daysInMonth = jalaliMonthLength(viewYear, viewMonth);
  const startWeekday = getJalaliMonthStartWeekday(viewYear, viewMonth);

  const selectedJalali = useMemo(() => {
    if (!valueIso || !/^\d{4}-\d{2}-\d{2}/.test(valueIso)) return null;
    const [gy, gm, gd] = valueIso.slice(0, 10).split('-').map(Number);
    return gregorianToJalali(gy, gm, gd);
  }, [valueIso]);

  const displayValue = selectedJalali
    ? toPersianDigits(
        `${selectedJalali.jy}/${String(selectedJalali.jm).padStart(2, '0')}/${String(
          selectedJalali.jd,
        ).padStart(2, '0')}`,
      )
    : '';

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
    setViewMonth(nextM);
    setViewYear(nextY);
  };

  const handleSelectDay = (day: number) => {
    const { gy, gm, gd } = jalaliToGregorian(viewYear, viewMonth, day);
    const iso = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
    onChangeIso(iso);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
          className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm text-slate-900 hover:border-teal-600 focus:border-teal-700 focus:outline-none disabled:bg-slate-100"
        >
          <span className="tabular-nums">
            {displayValue || <span className="text-slate-400">{placeholder}</span>}
          </span>
          <CalendarIcon className="h-4 w-4 text-slate-500" />
        </button>
        {valueIso && !disabled && (
          <button
            type="button"
            onClick={() => onChangeIso('')}
            aria-label="پاک کردن تاریخ"
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-slate-900">
              {JALALI_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {JALALI_WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected =
                selectedJalali?.jy === viewYear &&
                selectedJalali?.jm === viewMonth &&
                selectedJalali?.jd === day;
              const isToday =
                today.jy === viewYear && today.jm === viewMonth && today.jd === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 rounded-lg text-xs tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-teal-700 font-bold text-white'
                      : isToday
                        ? 'border border-teal-500 font-semibold text-teal-800 hover:bg-teal-50'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
