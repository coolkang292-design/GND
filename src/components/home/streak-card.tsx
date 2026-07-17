"use client";

import {
  currentStreak,
  streakStage,
  workoutDayKeys,
  type StreakStage,
} from "@/lib/domain/streak";
import { DEFAULT_TIMEZONE, dayKey } from "@/lib/domain/time";

const STAGE_MESSAGES: Partial<Record<StreakStage, string>> = {
  d4: "어제는 쉬었어요 — 불꽃은 아직 살아있어요 (소멸 D-4)",
  d3: "이틀째 휴식 중 — 오늘 한 번 어때요? (소멸 D-3)",
  d2: "불꽃이 흔들려요 — 사흘째 미운동이에요 (소멸 D-2)",
  d1: "오늘 안 하면 내일 불꽃이 꺼져요! (소멸 D-1)",
};

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

  const sub =
    stage === "none"
      ? "운동을 시작하면 불꽃이 켜져요"
      : stage === "today_done"
        ? "오늘 완료! 🔥"
        : stage === "expired"
          ? "불꽃이 꺼졌어요 — 오늘 다시 시작!"
          : (STAGE_MESSAGES[stage] ?? "");

  const warning = streak > 0 ? STAGE_MESSAGES[stage] : undefined;

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
