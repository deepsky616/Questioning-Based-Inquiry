"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={ko}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          "inline-flex items-center justify-center rounded-md text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground border border-input"
        ),
        button_next: cn(
          "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          "inline-flex items-center justify-center rounded-md text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground border border-input"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        day_button: cn(
          "h-8 w-8 p-0 font-normal",
          "inline-flex items-center justify-center rounded-md text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "aria-selected:opacity-100"
        ),
        selected:
          "[&>button]:bg-indigo-600 [&>button]:text-white [&>button]:hover:bg-indigo-600 [&>button]:hover:text-white",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside:
          "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
