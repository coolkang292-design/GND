import { dayKey, weekStart } from "@/lib/domain/time";

export type WeekStampDay = {
  dateKey: string;
  weekday: string;
  dayOfMonth: number;
  completed: boolean;
  isNewStamp: boolean;
};
export type WeekStampSnapshot = {
  days: WeekStampDay[];
  newStamp: boolean;
  workoutDaysThisWeek: number;
};
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

/**
 * Use a FRESH post-completion read. The initial record-page data is stale.
 * CalendarView also uses profile.timezone and a completed-session derived stamp.
 * Advancing calendar dates in UTC avoids timezone DST drift.
 */
export function workoutWeekStampSnapshot({
  completedAt, completedSessions, timeZone,
}: {
  completedAt: Date;
  completedSessions: readonly Date[] | null;
  timeZone: string;
}): WeekStampSnapshot | null {
  if (!completedSessions || !Number.isFinite(completedAt.getTime()) ||
    !completedSessions.every(date => Number.isFinite(date.getTime()))) return null;

  const today = dayKey(completedAt, timeZone);
  const keys = completedSessions.map(date => dayKey(date, timeZone));
  const sameDayCount = keys.filter(key => key === today).length;
  if (sameDayCount === 0) return null; // Do not invent completion on failed/old read.

  const monday = dayKey(weekStart(completedAt, timeZone), timeZone);
  const [year, month, day] = monday.split("-").map(Number);
  const mondayUTC = Date.UTC(year, month - 1, day);
  const hasWorkout = new Set(keys);
  const newStamp = sameDayCount === 1;
  const days = WEEKDAYS.map((weekday, i) => {
    const dateKey = new Date(mondayUTC + i * 86_400_000).toISOString().slice(0, 10);
    return {
      weekday, dateKey,
      dayOfMonth: Number(dateKey.slice(8, 10)),
      completed: hasWorkout.has(dateKey),
      isNewStamp: newStamp && dateKey === today,
    };
  });
  return { days, newStamp, workoutDaysThisWeek: days.filter(d => d.completed).length };
}
