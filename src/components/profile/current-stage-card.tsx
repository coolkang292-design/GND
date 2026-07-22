"use client";

import Image from "next/image";
import { STAGE_DESCRIPTIONS } from "@/lib/domain/progression";
import type { ProgressSummary } from "@/lib/progression";

/** 현재 단계 — 캐릭터·레벨·상태 설명·구간 진행바·다음 레벨까지 남은 XP. */
export function CurrentStageCard({
  summary,
  onGuideClick,
}: {
  summary: ProgressSummary;
  onGuideClick: () => void;
}) {
  const pct = Math.min(100, Math.round(summary.levelProgressPercent));
  const stage = STAGE_DESCRIPTIONS[summary.currentStage];
  const maxed = summary.nextLevelRequiredXp === null;

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-extrabold">현재 단계</h2>
        <button
          type="button"
          onClick={onGuideClick}
          className="flex-none text-[11px] font-bold text-accent"
        >
          7단계 안내 ›
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3.5">
        <Image
          src={summary.characterPath}
          alt={`${summary.stageName} 캐릭터`}
          width={96}
          height={128}
          sizes="96px"
          priority
          className="flex-none rounded-card-sm object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-extrabold text-accent">
            {summary.stageName} Lv.{summary.currentLevel}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {stage.desc}
          </p>
          <p className="mt-1.5 text-[11px] text-faint">
            누적 {summary.totalXp.toLocaleString()} XP
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between text-[11px]">
        <span className="font-bold text-muted">
          {maxed ? "최고 레벨" : `Lv.${summary.currentLevel + 1}까지`}
        </span>
        <span className="font-extrabold text-accent">{pct}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="현재 레벨 구간 진행률"
        />
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted">
        {maxed
          ? "35레벨을 모두 달성했어요. 최고 단계예요 🏆"
          : `다음 레벨까지 ${summary.xpToNextLevel.toLocaleString()} XP`}
      </p>
    </section>
  );
}
