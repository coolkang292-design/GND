"use client";

import Link from "next/link";
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

/**
 * 주간 stat 3칸 — 이번 주 운동일 / 목표 달성률 / 스트릭 (목업 stat3)
 *
 * ⚠️⚠️ **`weeklyGoal`은 `null`일 수 있다. 기본값을 붙이지 마라.**
 *
 * 2026-08-08 사용자 결정 — *"주간 운동표는 챌린지에서 세팅하는 걸로 하자."*
 * 그 전까지 이 칸은 `profiles.weekly_goal`(항상 3)을 분모로 썼는데, 같은 날
 * 프로필 편집에서 스테퍼를 빼면서 **아무도 못 바꾸는 숫자로 달성률을 매기는**
 * 상태가 됐다. 이제 분모는 진행 중 챌린지의 `planned_days`에서 오고, 챌린지가
 * 없으면 **분모가 없다.**
 *
 * `?? 3`이나 `?? 5`를 붙이는 순간 그 문제가 그대로 돌아온다.
 */
export function WeeklyStats({
  completedAts,
  weeklyGoal,
}: {
  completedAts: Date[];
  /** 진행 중 챌린지에서 정한 주 운동일. 챌린지가 없으면 `null` */
  weeklyGoal: number | null;
}) {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const { days } = weekWorkoutDays(completedAts, now, tz);
  const streak = currentStreak(
    workoutDayKeys(completedAts, tz),
    dayKey(now, tz),
  );
  const hasGoal = weeklyGoal !== null && weeklyGoal > 0;
  const rate = hasGoal
    ? Math.min(100, Math.round((days.length / weeklyGoal) * 100))
    : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat
        v={
          hasGoal ? (
            <>
              {days.length}
              <span className="text-sm text-muted"> / {weeklyGoal}</span>
            </>
          ) : (
            // 분모가 없으면 붙이지 않는다. `3일`이 그 자체로 읽힌다.
            `${days.length}일`
          )
        }
        k="이번 주 운동"
      />
      {hasGoal ? (
        <Stat v={`${rate}%`} k="목표 달성률" />
      ) : (
        // 빈 칸으로 두면 "왜 여긴 아무것도 없지"가 된다. 목표를 정하는 자리로
        // 데려간다 — 이제 그 자리는 챌린지 하나뿐이다.
        <Link
          href="/challenge"
          className="rounded-card-sm border border-line bg-surface px-2 py-3 text-center"
        >
          <p className="text-lg font-extrabold text-muted">—</p>
          <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-accent">
            목표 정하기 ›
          </p>
        </Link>
      )}
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
