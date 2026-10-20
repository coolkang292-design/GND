"use client";

import { useEffect, useState } from "react";
import { getMyProfile } from "@/lib/crew";
import { getCompletedSessionMinutes } from "@/lib/workout";
import { resolveTimeZone } from "@/lib/domain/time";
import {
  workoutWeekStampSnapshot, type WeekStampSnapshot,
} from "@/lib/domain/workout-week-stamps";
import { WorkoutCompleteStamp } from "./workout-complete-stamp";
import { getMyStampColors } from "@/lib/stamps";
import type { StampVariant } from "@/lib/domain/workout-stamps";

/** Static weekly record after the large stamp has landed in the workout overlay.
 * No new animation, claim or duplicate reward on the results page. */
export function WorkoutWeekStampCelebration({
  userId, sessionId, completedAtMs,
}: { userId: string; sessionId: string; completedAtMs: number }) {
  const [snapshot, setSnapshot] = useState<WeekStampSnapshot | null>(null);
  const [colors, setColors] = useState<Record<string, StampVariant>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [sessions, profile] = await Promise.all([
        getCompletedSessionMinutes(userId), getMyProfile(userId),
      ]);
      const snapshot = workoutWeekStampSnapshot({
        completedAt: new Date(completedAtMs),
        completedSessions: sessions.map(s => s.completedAt),
        timeZone: profile?.timezone || resolveTimeZone(),
      });
      const colors: Record<string, StampVariant> = await getMyStampColors(userId).catch(() => ({}));
      if (cancelled) return;
      setSnapshot(snapshot);
      setColors(colors);
    })().catch(() => { /* Reward UI cannot undo a saved workout. */ });
    return () => { cancelled = true; };
  }, [userId, sessionId, completedAtMs]);

  if (!snapshot) return null;
  const ariaDays = snapshot.days.map(
    d => `${d.weekday}요일 ${d.dayOfMonth}일 ${d.completed ? "완료" : "기록 없음"}`,
  ).join(", ");
  return (
    <section
      data-testid="week-stamp-celebration"
      aria-label="이번 주 운동 완료 도장"
      className="rounded-card border border-line bg-surface px-3 py-3.5 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="text-[14px] font-extrabold">이번 주 운동 달력</h2>
        <span className="text-[12px] font-bold text-accent">{snapshot.workoutDaysThisWeek}일 완료</span>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label={ariaDays}>
        {snapshot.days.map(d => (
          <li key={d.dateKey} className="min-w-0 text-center">
            <span className="mb-1 block text-[11px] font-bold text-muted">{d.weekday}</span>
            <div
              aria-label={`${d.dateKey} ${d.completed ? "운동 완료" : "운동 기록 없음"}`}
              className="relative aspect-square rounded-[10px] border border-line bg-surface-2/70"
            >
              <span className="absolute left-1 top-1 font-mono text-[10px] text-muted">{d.dayOfMonth}</span>
              {d.completed && (
                <span className="absolute inset-x-[12%] bottom-[2px] h-[72%]">
                  <WorkoutCompleteStamp seed={d.dateKey} variant={colors[d.dateKey] ?? "basic"} className="h-full w-full" />
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
