"use client";

import { UiIcon } from "@/components/ui-icon";
import {
  currentStreak,
  daysSinceLastWorkout,
  streakStage,
  workoutDayKeys,
} from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";
import {
  pickByDay,
  STAGE_MESSAGES,
  streakHeadline,
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
  // 2026-08-19: 기록 화면 오늘 카드가 같은 말을 해야 해서 도메인으로 옮겼다.
  const sub = streakHeadline({ stage, streak, gap, todayKey });

  const warning =
    streak > 0 && STAGE_MESSAGES[stage]
      ? pickByDay(STAGE_MESSAGES[stage], todayKey)(streak)
      : undefined;

  return (
    <>
      <section className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        {/* ⚠️ 2026-08-07에 이모지(`🔥`/`🪵`) → 시안 → 이모지 → **시안**으로 두 번
            오갔다. 1차 시안이 44px에서 뭉개져 되돌렸고, 획을 굵게 다시 받은
            2차가 검사를 통과해서 다시 넣었다(`docs/ui-icon-asset-guide.md`).
            되돌릴 일이 있으면 `🔥`/`🪵`가 옛 표기다.

            ⚠️ 꺼진 쪽이 **장작이 아니라 같은 불꽃의 빈 판**이다. 장작은 "아직
            불이 안 붙었다"는 뜻을 화면에서 스스로 설명하지 못했다.
            옆 `스트릭 N일 유지 중` / `스트릭 없음`이 같은 말을 글자로 하므로
            `alt=""`가 맞다. */}
        <UiIcon name={streak > 0 ? "streak-on" : "streak-off"} size={44} />
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
