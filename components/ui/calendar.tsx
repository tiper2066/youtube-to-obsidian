'use client';

import * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import 'react-day-picker/style.css';

import { cn } from '@/lib/utils';

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('p-2', className)}
      classNames={{
        root: 'text-sm',
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        month_caption: 'flex items-center justify-center h-8 text-sm font-medium',
        nav: 'flex items-center justify-between px-1 pb-1',
        button_previous:
          'inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30',
        button_next:
          'inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-xs font-normal text-muted-foreground',
        week: 'flex w-full mt-1',
        day: 'h-9 w-9 p-0 text-center text-sm align-middle',
        day_button:
          'inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted aria-selected:bg-foreground aria-selected:text-background aria-selected:hover:bg-foreground/90 disabled:opacity-30 disabled:pointer-events-none',
        today: 'font-semibold',
        outside: 'text-muted-foreground/50',
        disabled: 'opacity-30',
        selected: '',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeftIcon className='size-4' />
          ) : (
            <ChevronRightIcon className='size-4' />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
