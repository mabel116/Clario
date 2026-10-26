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
  const parts = dateStr.split('-');
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
}: DatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerView, setPickerView] = useState<'calendar' | 'months' | 'years'>('calendar');
  const [effectivePlacement, setEffectivePlacement] = useState<'bottom' | 'top'>(
    placement === 'top' ? 'top' : 'bottom'
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    if (value) {
      const parts = value.split('-');
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
    } else {
      // Auto-detect placement if auto or inside tight view
      if (placement === 'auto' && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 340 && rect.top > 340) {
          setEffectivePlacement('top');
        } else {
          setEffectivePlacement('bottom');
        }
      } else {
        setEffectivePlacement(placement === 'top' ? 'top' : 'bottom');
      }
    }
  }, [parsed, isOpen, placement]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday-first
    const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Prev month trailing days
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

    // Current month days
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

    // Next month leading days (fill up to 35 or 42 cells)
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
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    selectDate(todayStr);
  };

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      <button
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
        <div
          data-popover="true"
          className={cn(
            'absolute left-0 right-0 z-40 w-full min-w-[260px] rounded-2xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] p-3.5 space-y-3 shadow-xl',
            effectivePlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          )}
        >
          {/* Top Month/Year Bar with Quick-Jump Popover Selectors */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPickerView(pickerView === 'months' ? 'calendar' : 'months')}
                className={cn(
                  'px-2 py-1 rounded-lg text-[13px] font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors flex items-center gap-1',
                  pickerView === 'months' && 'bg-gray-100 dark:bg-[#222226]'
                )}
              >
                {MONTH_NAMES[viewMonth]}
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
              <button
                type="button"
                onClick={() => setPickerView(pickerView === 'years' ? 'calendar' : 'years')}
                className={cn(
                  'px-2 py-1 rounded-lg text-[13px] font-semibold text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[#222226] transition-colors flex items-center gap-1',
                  pickerView === 'years' && 'bg-gray-100 dark:bg-[#222226]'
                )}
              >
                {viewYear}
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
            </div>

            {/* Prev / Next Month Arrow Steppers */}
            <div className="flex items-center gap-1 pr-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous"
                className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] text-gray-600 dark:text-zinc-400 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next"
                className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#222226] text-gray-600 dark:text-zinc-400 transition-colors"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Month Selector Grid */}
          {pickerView === 'months' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {SHORT_MONTH_NAMES.map((m, idx) => {
                const isSelected = idx === viewMonth;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setViewMonth(idx);
                      setPickerView('calendar');
                    }}
                    className={cn(
                      'h-8 rounded-lg text-[12px] font-medium transition-colors flex items-center justify-center',
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226]'
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          {/* Year Selector Grid */}
          {pickerView === 'years' && (
            <div className="grid grid-cols-3 gap-1.5 max-h-[190px] overflow-y-auto pr-0.5 py-1">
              {YEARS.map((y) => {
                const isSelected = y === viewYear;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setViewYear(y);
                      setPickerView('calendar');
                    }}
                    className={cn(
                      'h-8 rounded-lg text-[12px] font-medium transition-colors flex items-center justify-center',
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226]'
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {/* Calendar View */}
          {pickerView === 'calendar' && (
            <>
              {/* Weekday Header Grid */}
              <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400 dark:text-zinc-500">
                <span>Mo</span>
                <span>Tu</span>
                <span>We</span>
                <span>Th</span>
                <span>Fr</span>
                <span>Sa</span>
                <span>Su</span>
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell, idx) => {
                  if (cell.isSelected) {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectDate(cell.dateStr)}
                        className="bg-blue-600 text-white font-semibold rounded-lg h-8 w-8 mx-auto flex items-center justify-center text-[12px] tabular-nums"
                      >
                        {cell.dayNumber}
                      </button>
                    );
                  }

                  if (cell.isToday) {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectDate(cell.dateStr)}
                        className="border border-blue-600/40 text-blue-600 dark:text-blue-400 font-medium rounded-lg h-8 w-8 mx-auto flex items-center justify-center text-[12px] tabular-nums hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      >
                        {cell.dayNumber}
                      </button>
                    );
                  }

                  if (!cell.isCurrentMonth) {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectDate(cell.dateStr)}
                        className="text-gray-300 dark:text-zinc-600 h-8 w-8 mx-auto flex items-center justify-center text-[12px] tabular-nums hover:bg-gray-50 dark:hover:bg-[#222226]/50 rounded-lg"
                      >
                        {cell.dayNumber}
                      </button>
                    );
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectDate(cell.dateStr)}
                      className="text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#222226] rounded-lg h-8 w-8 mx-auto flex items-center justify-center text-[12px] font-medium tabular-nums transition-colors"
                    >
                      {cell.dayNumber}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Bottom Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-[#27272a]">
            <button
              type="button"
              onClick={() => {
                handleSelectToday();
                setPickerView('calendar');
              }}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Today
            </button>
            {pickerView !== 'calendar' && (
              <button
                type="button"
                onClick={() => setPickerView('calendar')}
                className="text-[12px] font-medium text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Calendar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
