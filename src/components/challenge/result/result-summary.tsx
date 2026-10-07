"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { PeriodRewards, WeekAchievement } from "@/lib/domain/challenge-report";
import { LevelCard } from "./level-card";
import { ResultHeader } from "./result-header";
import { RewardsRow } from "./rewards-row";
import { StatCard, type StatCardData } from "./stat-card";
import { WeeklyHeatmap } from "./weekly-heatmap";

const card = "rounded-card border border-line bg-surface p-4 shadow-card";

/**
 * 화면 A — 시안 「챌린지 종료!」 (2026-10-07).
 * 순서: 머리 → 시상대 → 레벨 카드(>) → 2×2 카드 → 주간 달성 히트맵 → 획득한 보상 → 결과 공유하기.
 */
export function ResultSummary(props: {
  challengeName: string;
  periodDays: number;
  /** 기존 RankingPodium + 4위 이하 줄 — 부르는 쪽이 만든다 */
  podium: ReactNode;
  /** 목표를 안 건 사람은 null — 내 칸들을 숨긴다 */
  mine: { stats: StatCardData[]; weeks: WeekAchievement[] } | null;
  /** 장부 조회 전·실패면 null — 레벨·보상 칸만 숨는다 */
  rewards: PeriodRewards | null;
  shareNote: string | null;
  onBack: () => void;
  onShare: () => void;
  onOpenReport: () => void;
}) {
  const { mine, rewards } = props;
  return (
    <div className="flex flex-col gap-3 pb-10">
      <ResultHeader
        title={props.challengeName}
        quiet
        onBack={props.onBack}
        onShare={mine ? props.onShare : undefined}
      />
      <section className="-mt-1 text-center">
        <h2 className="text-[32px] font-black leading-tight">
          챌린지 <span className="text-accent">종료!</span>
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1 text-[13.5px] text-muted">
          {props.periodDays}일간, 정말 수고했어요!
          <Icon name="flame" size={15} filled className="text-gold" />
        </p>
      </section>

      <section className="rounded-card border border-line-strong bg-surface px-2 pb-3 pt-2 shadow-card">
        {props.podium}
      </section>

      {mine &&
        (rewards ? (
          <LevelCard r={rewards} onOpen={props.onOpenReport} />
        ) : (
          <button
            type="button"
            onClick={props.onOpenReport}
            aria-label="나의 챌린지 결과 보기"
            className={`${card} flex items-center justify-between text-[13.5px] font-extrabold`}
          >
            나의 챌린지 결과 보기
            <Icon name="chevron" size={18} className="text-muted" />
          </button>
        ))}

      {mine && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {mine.stats.map((s) => (
              <StatCard key={s.key} s={s} />
            ))}
          </div>
          <section className={card}>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold">주간 달성 히트맵</h3>
              <span className="text-[11px] text-muted">꾸준함이 만든 결과예요!</span>
            </div>
            <WeeklyHeatmap weeks={mine.weeks} />
          </section>
        </>
      )}

      {mine && rewards && (
        <section className={card}>
          <h3 className="mb-2.5 text-[15px] font-extrabold">획득한 보상</h3>
          <RewardsRow r={rewards} />
        </section>
      )}

      {mine && (
        <>
          <button
            type="button"
            onClick={props.onShare}
            className="flex h-[52px] items-center justify-center gap-1.5 rounded-[14px] bg-accent text-[15px] font-extrabold text-accent-ink active:bg-accent-press"
          >
            <Icon name="share" size={18} strokeWidth={2.2} />
            결과 공유하기
          </button>
          {props.shareNote && (
            <p role="status" className="text-center text-[12px] font-bold text-accent">
              {props.shareNote}
            </p>
          )}
        </>
      )}
    </div>
  );
}
