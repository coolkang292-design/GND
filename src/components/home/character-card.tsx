"use client";

import Image from "next/image";
import Link from "next/link";
import { MAX_DAILY_WORKOUT_XP_NOW } from "@/lib/domain/xp";
import type { ProgressSummary } from "@/lib/progression";

/** 홈 하단 "나의 캐릭터" 카드 — 현재 단계·레벨·구간 진행바·오늘 XP 상태. */
export function CharacterCard({ summary }: { summary: ProgressSummary }) {
  const pct = Math.min(100, Math.round(summary.levelProgressPercent));
  return (
    <Link
      href="/profile"
      className="block rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-center gap-3">
        <Image
          src={summary.characterPath}
          alt={`${summary.stageName} 캐릭터`}
          width={64}
          height={85}
          className="flex-none rounded-card-sm object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold text-accent">
            Lv.{summary.currentLevel}
          </p>
          <p className="text-xs text-muted">{summary.stageName} 단계</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {summary.nextLevelRequiredXp === null
              ? "최고 레벨 달성"
              : `다음 레벨까지 ${summary.xpToNextLevel} XP`}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-accent">
            {summary.hasReceivedTodayWorkoutXp
              ? "오늘의 운동 XP 획득 완료"
              : `오늘 운동하면 최대 ${MAX_DAILY_WORKOUT_XP_NOW} XP`}
          </p>
        </div>
        <span className="flex-none text-xs font-bold text-accent">성장 보기 ›</span>
      </div>
    </Link>
  );
}
