"use client";

import { UiIcon } from "@/components/ui-icon";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";

function Stat({ v, k }: { v: React.ReactNode; k: React.ReactNode }) {
  return (
    <div className="rounded-card-sm border border-line bg-surface px-2 py-3 text-center">
      <p className="text-lg font-extrabold">{v}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted">
        {k}
      </p>
    </div>
  );
}

/** 주간 stat 3칸 — 이번 주 운동일 / 목표 달성률 / 스트릭 (목업 stat3) */
export function WeeklyStats({
  completedAts,
  weeklyGoal,
}: {
  completedAts: Date[];
  weeklyGoal: number;
}) {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const { days } = weekWorkoutDays(completedAts, now, tz);
  const streak = currentStreak(
    workoutDayKeys(completedAts, tz),
    dayKey(now, tz),
  );
  const rate =
    weeklyGoal > 0
      ? Math.min(100, Math.round((days.length / weeklyGoal) * 100))
      : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat
        v={
          <>
            {days.length}
            <span className="text-sm text-muted"> / {weeklyGoal}</span>
          </>
        }
        k="이번 주 운동"
      />
      <Stat v={`${rate}%`} k="목표 달성률" />
      {/* 옛 표기는 `🔥`였다 (2026-08-07 2차 시안으로 교체) */}
      <Stat
        v={`${streak}일`}
        k={
          <>
            <UiIcon name="streak-on" size={13} /> 스트릭
          </>
        }
      />
    </div>
  );
}
