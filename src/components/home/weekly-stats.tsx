"use client";

import Link from "next/link";
import { UiIcon } from "@/components/ui-icon";
import { currentStreak, workoutDayKeys } from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import { weekWorkoutDays } from "@/lib/domain/viewing-pass";

const TILE =
  "rounded-card-sm border border-line bg-surface px-2 py-3 text-center";

function Stat({ v, k }: { v: React.ReactNode; k: React.ReactNode }) {
  return (
    <div className={TILE}>
      <p className="text-lg font-extrabold">{v}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted">
        {k}
      </p>
    </div>
  );
}

/**
 * 눌러서 목표를 정하러 가는 칸 (사용자 지시 2026-08-08 —
 * *"이번주 목표 칸에 목표가 없으면 눌러서 목표세팅하게 해줘"*).
 *
 * ⚠️ 같은 자리에 그냥 글자만 두면 **누를 수 있다는 걸 알 수 없다.** 그래서 라벨을
 * 강조색으로 두고 `›`를 붙인다 — 칸 크기(375px에서 폭 ~111px)는 그대로다.
 * 여기에 `목표 정하기` 같은 말을 라벨에 더 붙이면 두 줄로 접힌다. 실측이다.
 */
function StatLink({ v, k }: { v: React.ReactNode; k: React.ReactNode }) {
  return (
    <Link href="/challenge" className={`${TILE} block`}>
      <p className="text-lg font-extrabold">{v}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-accent">
        {k}
      </p>
    </Link>
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
      {/* ⚠️ 목표가 없을 때 **이 칸이 눌린다** — 사용자 지시 2026-08-08:
          *"이번주 목표 칸에 목표가 없으면 눌러서 목표세팅하게 해줘"*.
          평소(`5 / 5`)에 목표가 보이는 자리가 여기라, 없을 때 정하러 가는 문도
          같은 자리에 있어야 찾는다. 옆 칸으로 미루지 마라. */}
      {hasGoal ? (
        <Stat
          v={
            <>
              {days.length}
              <span className="text-sm text-muted"> / {weeklyGoal}</span>
            </>
          }
          k="이번 주 운동"
        />
      ) : (
        // 분모가 없으면 붙이지 않는다. `3일`이 그 자체로 읽힌다.
        <StatLink v={`${days.length}일`} k="목표 정하기 ›" />
      )}
      {/* ⚠️ 여기는 링크가 아니다. 누를 곳이 나란히 둘이면 어느 쪽을 눌러야
          하는지가 흐려진다 — 유도는 왼쪽 칸 하나로 충분하다. `0%`로 채우지도
          않는다. 목표를 안 정했을 뿐인데 실패한 것처럼 읽힌다. */}
      <Stat
        v={hasGoal ? `${rate}%` : <span className="text-muted">—</span>}
        k="목표 달성률"
      />
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
