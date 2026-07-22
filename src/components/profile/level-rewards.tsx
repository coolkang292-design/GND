"use client";

import { useState } from "react";
import { getStageGroups } from "@/lib/domain/progression";
import type { LevelReward } from "@/lib/progression";

/**
 * 레벨 혜택 — 해금/잠금 표시.
 *
 * 修正2: `reward_status='coming_soon'`은 아직 동작하지 않는 기능이다.
 * 레벨을 달성했더라도 **"해금"이 아니라 "준비 중"**으로만 표시해
 * 쓸 수 있는 기능처럼 오해하게 만들지 않는다.
 */
export function LevelRewards({
  rewards,
  unlocks,
  currentLevel,
  currentStage,
}: {
  rewards: LevelReward[];
  unlocks: Set<string>;
  currentLevel: number;
  currentStage: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const stage = getStageGroups()[currentStage - 1];

  const visible = rewards
    .filter((r) => r.rewardKey && r.rewardLabel && r.rewardStatus !== "data_only")
    .filter(
      (r) =>
        showAll || (r.level >= stage.startLevel && r.level <= stage.endLevel),
    );

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold">레벨 혜택</h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="flex-none text-[11px] font-bold text-accent"
        >
          {showAll ? "현재 단계만" : "전체 보기"}
        </button>
      </div>
      {!showAll && (
        <p className="mt-0.5 text-[11px] text-muted">
          {stage.stageName} 단계 (Lv.{stage.startLevel}~{stage.endLevel})
        </p>
      )}

      <ul className="mt-2.5 flex flex-col">
        {visible.map((r) => {
          const pending = r.rewardStatus === "coming_soon";
          const reached =
            unlocks.has(r.rewardKey as string) || currentLevel >= r.level;
          return (
            <li
              key={r.level}
              className="flex items-center gap-2.5 border-t border-line py-2.5 first:border-t-0 first:pt-0"
            >
              <span
                aria-hidden
                className={`flex-none text-sm ${reached && !pending ? "" : "opacity-60"}`}
              >
                {pending ? "🛠" : reached ? "✅" : "🔒"}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[12.5px] font-bold ${
                    reached && !pending ? "text-text" : "text-muted"
                  }`}
                >
                  {r.rewardLabel}
                </p>
                <p className="text-[10.5px] text-faint">Lv.{r.level}</p>
              </div>
              <span
                className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  pending
                    ? "bg-surface-2 text-faint"
                    : reached
                      ? "bg-good-weak text-good"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {pending ? "준비 중" : reached ? "해금됨" : `Lv.${r.level} 달성 시`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[10.5px] text-faint">
        &quot;준비 중&quot; 혜택은 아직 만드는 중이라 레벨을 올려도 바로 쓸 수
        없어요. 운동 기록·피드·통계 같은 핵심 기능은 Lv.1부터 전부 열려 있어요.
      </p>
    </section>
  );
}
