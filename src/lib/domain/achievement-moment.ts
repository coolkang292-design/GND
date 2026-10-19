import { dayKey, weekRange } from "./time";

/**
 * One truthful win at workout completion, computed from already loaded sessions.
 * Do not invent personal progress when history is unavailable.
 * Week starts Monday in the user's record-screen timezone.
 */
export function achievementMomentLine(input: {
  previousCompletedAts: Date[] | null;
  completedAt: Date;
  timeZone: string;
}): string | null {
  const { previousCompletedAts, completedAt, timeZone } = input;
  if (previousCompletedAts === null || !Number.isFinite(completedAt.getTime())) return null;
  const current = weekRange(completedAt, timeZone);
  const previousStart = weekRange(new Date(current.start.getTime() - 1), timeZone).start;
  const completeDays = [...previousCompletedAts.filter((date) => Number.isFinite(date.getTime())), completedAt];
  const daysBetween = (start: Date, end: Date) =>
    new Set(
      completeDays
        .filter((date) => date >= start && date < end)
        .map((date) => dayKey(date, timeZone)),
    ).size;
  const thisWeekDays = daysBetween(current.start, current.end);
  const lastWeekDays = daysBetween(previousStart, current.start);
  if (thisWeekDays === 0) return null;
  if (thisWeekDays > lastWeekDays && lastWeekDays > 0) {
    return `지난주보다 ${thisWeekDays - lastWeekDays}일 더 운동했어요.`;
  }
  if (previousCompletedAts.length === 0) return "첫 운동을 해냈어요. 여기서 시작이에요.";
  return `이번 주 ${thisWeekDays}일째, 오늘도 해냈어요.`;
}

/**
 * The feed only lists group-visible completed sessions; private sessions must not deep-link.
 * `from=complete` tells the feed to title the pinned card "방금 끝낸 내 운동" instead of the
 * notification label (`feed/page.tsx`).
 */
export function completedWorkoutFeedPath(
  sessionId: string,
  visibility: string | null | undefined,
): string | null {
  return visibility === "group"
    ? `/feed?session=${encodeURIComponent(sessionId)}&from=complete`
    : null;
}
