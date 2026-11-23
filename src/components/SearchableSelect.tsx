import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  label: string;
  options: SelectOption[];
  value: string | number | null | '';
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  required?: boolean;
}

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'انتخاب یا جستجو کنید...',
  disabled = false,
  emptyText = 'موردی یافت نشد',
  required = false,
}: SearchableSelectProps) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(
    () => options.find((opt) => String(opt.value) === String(value ?? '')),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ? o.sublabel.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="mr-1 text-red-600">*</span>}
      </label>

      <div className="relative">
        <button
          id={inputId}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className={`flex h-10 w-full items-center justify-between rounded-lg border px-3 text-right text-sm transition-colors ${
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : open
                ? 'border-teal-600 bg-white text-slate-900 ring-2 ring-teal-600/15'
                : 'border-slate-300 bg-white text-slate-900 hover:border-slate-400'
          }`}
        >
          <span className={`truncate ${selectedOption ? 'text-slate-900' : 'text-slate-400'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {selectedOption && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`پاک کردن ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </span>
        </button>

        {open && (
          <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجو در فهرست..."
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
            </div>

            <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-slate-500">{emptyText}</li>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = String(opt.value) === String(value ?? '');
                  return (
                    <li key={String(opt.value)} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(String(opt.value));
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-right text-sm transition-colors ${
                          isSelected
                            ? 'bg-teal-50 font-medium text-teal-800'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="mr-2 shrink-0 text-xs text-slate-400 tabular-nums">
                            {opt.sublabel}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
