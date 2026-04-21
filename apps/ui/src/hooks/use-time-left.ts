// Shared countdown hook — returns remaining time until a target date, updating every second.
// Used by cold withdrawal timelock countdown display.
import { useEffect, useState } from 'react';

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function compute(targetDate: Date): TimeLeft {
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, expired: false };
}

/**
 * Returns time remaining until `targetDate`, refreshing every second.
 * When `targetDate` is null/undefined, returns expired state immediately.
 * Cleans up the interval on unmount.
 */
export function useTimeLeft(targetDate: Date | string | null | undefined): TimeLeft {
  const [left, setLeft] = useState<TimeLeft>(() => {
    if (!targetDate) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    return compute(new Date(targetDate));
  });

  useEffect(() => {
    if (!targetDate) {
      setLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
      return;
    }

    const target = new Date(targetDate);

    // Immediate sync on mount / targetDate change
    setLeft(compute(target));

    const id = setInterval(() => {
      setLeft(compute(target));
    }, 1000);

    return () => clearInterval(id);
  }, [targetDate]);

  return left;
}
