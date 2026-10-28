'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const YEARS = Array.from({ length: 16 }, (_, i) => 2020 + i);

export function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return '';
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = clean.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
      return `${day} ${SHORT_MONTH_NAMES[monthIdx]}, ${year}`;
    }
  }
  return dateStr;
}

export interface DatePickerPopoverProps {
  value: string; // 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  id?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  placeholder?: string;
  placement?: 'bottom' | 'top' | 'auto';
  inModal?: boolean;
}

export function DatePickerPopover({
  value,
  onChange,
  id,
  disabled = false,
  hasError = false,
  className,
  placeholder = 'Select date',
  placement = 'bottom',
  inModal = false,
}: DatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerView, setPickerView] = useState<'calendar' | 'months' | 'years'>('calendar');

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    if (value) {
      const clean = value.includes('T') ? value.split('T')[0] : value;
      const parts = clean.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return { year: y, month: m, day: d };
        }
      }
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, [value]);

  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);

  useEffect(() => {
    if (!isOpen) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
      setPickerView('calendar');
    }
  }, [isOpen, parsed]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (pickerView === 'years') {
      setViewYear((y) => Math.max(2020, y - 1));
      return;
    }
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerView === 'years') {
      setViewYear((y) => Math.min(2035, y + 1));
      return;
    }
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
    const days = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    for (let d = 1; d <= daysInCurrent; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [viewYear, viewMonth, value]);

  const selectDate = (dateStr: string) => {
    onChange(dateStr);
    if (!inModal) {
      setIsOpen(false);
    }
  };

  const calendarBody = (
    <>
      {/* Top Header Row */}
      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-gray-100 dark:border-[#27272a]">
        {/* Left: Month and Year Quick Selectors */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setPickerView(pickerView === 'months' ? 'calendar' : 'months')}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#222226] text-[13px] font-semibold text-gray-900 dark:text-white transition-colors cursor-pointer"
          >
            <span>{MONTH_NAMES[viewMonth]}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setPickerView(pickerView === 'years' ? 'calendar' : 'years')}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-gray-100 dark:hover:bg-[#222226] text-[13px] font-semibold text-gray-900 dark:text-white transition-colors cursor-pointer"
          >
            <span>{viewYear}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
          </button>
        </div>

        {/* Right: Previous / Next Month Arrows */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] flex items-center justify-center text-gray-600 dark:text-zinc-400 transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] flex items-center justify-center text-gray-600 dark:text-zinc-400 transition-colors cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {pickerView === 'months' && (
        <div className="grid grid-cols-3 gap-1.5 pt-2 animate-in fade-in duration-100">
          {MONTH_NAMES.map((m, idx) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setViewMonth(idx);
                setPickerView('calendar');
              }}
              className={cn(
                'h-9 rounded-lg text-[12px] font-medium transition-colors cursor-pointer',
                idx === viewMonth
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226]'
              )}
            >
              {SHORT_MONTH_NAMES[idx]}
            </button>
          ))}
        </div>
      )}

      {pickerView === 'years' && (
        <div className="grid grid-cols-4 gap-1.5 pt-2 max-h-48 overflow-y-auto animate-in fade-in duration-100">
          {YEARS.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => {
                setViewYear(yr);
                setPickerView('calendar');
              }}
              className={cn(
                'h-9 rounded-lg text-[12px] font-medium transition-colors cursor-pointer',
                yr === viewYear
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226]'
              )}
            >
              {yr}
            </button>
          ))}
        </div>
      )}

      {pickerView === 'calendar' && (
        <>
          <div className="space-y-1 pt-2">
            <div className="grid grid-cols-7 text-center">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span
                  key={d}
                  className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 py-1"
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => (
                <button
                  key={day.dateStr + idx}
                  type="button"
                  onClick={() => selectDate(day.dateStr)}
                  className={cn(
                    'h-8 w-full rounded-lg text-[12px] font-medium flex items-center justify-center transition-colors cursor-pointer',
                    day.isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : day.isToday
                      ? 'border border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                      : day.isCurrentMonth
                      ? 'text-gray-900 dark:text-zinc-100 hover:bg-gray-100 dark:hover:bg-[#222226]'
                      : 'text-gray-300 dark:text-zinc-600 hover:bg-gray-50 dark:hover:bg-[#18181b]'
                  )}
                >
                  {day.dayNumber}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={cn(
          'h-10 w-full px-3.5 rounded-xl bg-[#F9FAFB] dark:bg-[#121215] border flex items-center justify-between gap-2 text-left transition-colors overflow-hidden',
          'focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20',
          disabled && 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-[#121215]',
          isOpen
            ? 'border-gray-300 dark:border-zinc-700 bg-[#F9FAFB] dark:bg-[#121215]'
            : hasError
            ? 'border-rose-400 dark:border-rose-500/50'
            : 'border-gray-200/80 dark:border-[#27272a]'
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          <Calendar
            className="h-4 w-4 text-gray-400 dark:text-zinc-500 shrink-0"
            strokeWidth={2}
          />
          {value ? (
            <span className="text-[13px] font-medium text-gray-900 dark:text-white tabular-nums truncate min-w-0">
              {formatDateDisplay(value)}
            </span>
          ) : (
            <span className="text-[13px] font-normal text-gray-400 dark:text-zinc-500 truncate min-w-0">
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        inModal ? (
          <div
            ref={popoverRef}
            data-popover="true"
            className="max-sm:static max-sm:w-full max-sm:mt-2 sm:absolute sm:top-full sm:left-0 sm:mt-1.5 sm:w-[280px] sm:z-50 sm:shadow-xl rounded-2xl border border-gray-200 dark:border-[#27272a] bg-[#F9FAFB] dark:bg-[#121215] sm:bg-white sm:dark:bg-[#18181b] p-3 select-none transition-all duration-200"
          >
            {calendarBody}
          </div>
        ) : (
          <div
            ref={popoverRef}
            data-popover="true"
            className="absolute top-full left-0 mt-1.5 z-20 w-[280px] sm:w-[300px] rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-none p-3 select-none"
          >
            {calendarBody}
          </div>
        )
      )}
    </div>
  );
}
