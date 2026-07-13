"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "@/lib/dashboard-question-class-schedule";

function millisecondsUntilNextLocalDay(now: Date): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(1, nextDay.getTime() - now.getTime());
}

export function useLocalDateKey(): string {
  const [dateKey, setDateKey] = useState(() => localDateKey());

  useEffect(() => {
    let timerId: number;
    const scheduleNextDay = () => {
      timerId = window.setTimeout(() => {
        setDateKey(localDateKey());
        scheduleNextDay();
      }, millisecondsUntilNextLocalDay(new Date()));
    };

    scheduleNextDay();
    return () => window.clearTimeout(timerId);
  }, []);

  return dateKey;
}
