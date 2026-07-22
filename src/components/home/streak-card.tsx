"use client";

import {
  currentStreak,
  daysSinceLastWorkout,
  streakStage,
  workoutDayKeys,
} from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  EXPIRED_MESSAGES,
  pickByDay,
  STAGE_MESSAGES,
  TODAY_DONE_MESSAGES,
} from "@/lib/domain/streak-messages";

function weekdayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return "일월화수목금토"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 🔥 스트릭 카드 + 소멸 경고 배너 (목업 streakcard·warn) */
export function StreakCard({ completedAts }: { completedAts: Date[] }) {
  const tz = DEFAULT_TIMEZONE;
  const now = new Date();
  const keys = workoutDayKeys(completedAts, tz);
  const todayKey = dayKey(now, tz);
  const streak = currentStreak(keys, todayKey);
  const stage = streakStage(keys, todayKey);
  const keySet = new Set(keys);

  // 최근 7일(오늘 포함) 요일 점
  const dots = Array.from({ length: 7 }, (_, i) => {
    const k = dayKey(new Date(now.getTime() - (6 - i) * 86_400_000), tz);
    return { key: k, done: keySet.has(k) };
  });

  // 카드 부제는 **사실 상태**, 아래 경고 배너는 **재촉 카피**로 나눈다.
  // 예전엔 둘 다 STAGE_MESSAGES를 계산해 같은 문장이 두 번 보였다(2026-07-23).
  const gap = daysSinceLastWorkout(keys, todayKey);
  const sub =
    stage === "none"
      ? "운동을 시작하면 불꽃이 켜져요"
      : stage === "today_done"
        ? pickByDay(TODAY_DONE_MESSAGES, todayKey)
        : stage === "expired"
          ? pickByDay(EXPIRED_MESSAGES, todayKey)
          : gap === 1
            ? `어제 운동했어요 · 오늘 하면 ${streak + 1}일째`
            : `${gap}일째 쉬는 중 · 오늘 하면 ${streak + 1}일째`;

  const warning =
    streak > 0 && STAGE_MESSAGES[stage]
      ? pickByDay(STAGE_MESSAGES[stage], todayKey)(streak)
      : undefined;

  return (
    <>
      <section className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <span className="text-3xl">{streak > 0 ? "🔥" : "🪵"}</span>
        <div className="flex-1">
          <p className="text-[15px] font-extrabold">
            {streak > 0 ? `스트릭 ${streak}일 유지 중` : "스트릭 없음"}
          </p>
          <p className="mt-0.5 text-xs text-muted">{sub}</p>
          <div className="mt-2 flex gap-1.5">
            {dots.map((d) => (
              <span key={d.key} className="flex flex-col items-center gap-0.5">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    d.done ? "bg-accent" : "border border-line bg-surface-2"
                  }`}
                />
                <span className="text-[10px] text-faint">
                  {weekdayLabel(d.key)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>
      {warning && (
        <p className="rounded-card-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400">
          ⚠️ {warning}
        </p>
      )}
    </>
  );
}
