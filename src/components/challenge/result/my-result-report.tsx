"use client";

import { Icon } from "@/components/ui/icon";
import type { RankedParticipant } from "@/lib/domain/goal-score";
import {
  cheerCopy,
  topPercent,
  type BestRecords as Records,
  type DailyBar,
  type PeriodRewards,
} from "@/lib/domain/challenge-report";
import { BestRecords } from "./best-records";
import { DailyActivityChart } from "./daily-activity-chart";
import { GoalRing } from "./goal-ring";
import { LevelHex, XpBar } from "./level-card";
import { ResultHeader } from "./result-header";
import { ScoreTrendChart } from "./score-trend-chart";

export type MyGoalResult = {
  key: string;
  label: string;
  actual: number;
  target: number;
  unit: string;
  rate: number;
};

export type MyReport = {
  ranked: RankedParticipant;
  total: number;
  goals: MyGoalResult[];
  bars: DailyBar[];
  records: Records;
  trend: { label: string; overall: number }[];
};

const card = "rounded-card border border-line bg-surface p-4 shadow-card";

/**
 * 화면 B — 시안 「나의 챌린지 결과」 (2026-10-07).
 * 순서: 머리 → 히어로(순위·종합점수·상위 %·말풍선·레벨) → 목표 달성률 → 일별 활동 → 주요 기록 →
 * 나의 성장 → 다음 챌린지. 캐릭터 그림 자리는 비운다(사용자 지시: 이미지는 제외).
 */
export function MyResultReport({
  me,
  rewards,
  onBack,
  onShare,
  onCreate,
}: {
  me: MyReport;
  rewards: PeriodRewards | null;
  onBack: () => void;
  onShare: () => void;
  onCreate: () => void;
}) {
  const done = me.goals.filter((g) => g.rate >= 1).length;
  const [l1, l2] = cheerCopy(me.ranked.rank);
  return (
    <div className="flex flex-col gap-3 pb-10">
      <ResultHeader title="나의 챌린지 결과" onBack={onBack} onShare={onShare} />

      <section className={`${card} border-line-strong`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={`font-mono text-[44px] font-black italic leading-none ${
                me.ranked.rank === 1 ? "text-gold" : "text-text"
              }`}
            >
              {me.ranked.rank}
              <span className="text-[26px]">위</span>
            </p>
            <p className="mt-3 text-[12px] text-muted">종합 점수</p>
            <p className="font-mono text-[34px] font-black leading-tight">
              {me.ranked.overall.toFixed(1)}
              <span className="ml-0.5 text-[16px]">점</span>
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-gold/60 bg-gold-weak px-3 py-1 text-[12.5px] font-extrabold text-gold">
              <Icon name="crown" size={14} filled />
              상위 {topPercent(me.ranked.rank, me.total)}%
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-3">
            <p className="rounded-[14px] rounded-br-sm border border-line-strong bg-surface-2 px-3 py-2 text-right text-[13px] font-extrabold leading-snug">
              {l1}
              <br />
              {l2}
            </p>
            {rewards && (
              <div className="flex w-[150px] flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <LevelHex level={rewards.levelAtEnd} size={34} />
                  <span className="truncate text-[12.5px] font-extrabold text-accent">
                    {rewards.stageNameAtEnd}
                  </span>
                </div>
                <XpBar r={rewards} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-extrabold">목표 달성률</h3>
          <span className="flex items-center gap-1 text-[11.5px] text-muted">
            목표 {me.goals.length}개 중 {done}개 달성!
            <Icon name="thumbsup" size={14} className="text-gold" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {me.goals.map((g) => (
            <div
              key={g.key}
              data-testid="goal-ring"
              className="relative flex flex-col items-center gap-1 pt-1 text-center"
            >
              {g.rate >= 1 && (
                <span className="absolute -top-2 text-gold">
                  <Icon name="crown" size={15} filled label="목표 달성" />
                </span>
              )}
              <GoalRing rate={g.rate} size={78} />
              <p className="text-[12.5px] font-bold">{g.label}</p>
              <p className="font-mono text-[11px] text-muted">
                {Math.round(g.actual * 10) / 10} / {g.target.toLocaleString()}
                {g.unit}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold">일별 활동</h3>
          <div className="flex gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-faint" />
              계획
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-accent" />
              실제
            </span>
          </div>
        </div>
        <DailyActivityChart bars={me.bars} />
      </section>

      <section className={card}>
        <h3 className="mb-2.5 text-[15px] font-extrabold">주요 기록</h3>
        <BestRecords records={me.records} />
      </section>

      <section className={card}>
        <h3 className="mb-1 text-[15px] font-extrabold">나의 성장</h3>
        <ScoreTrendChart points={me.trend} />
      </section>

      <p className="flex items-center justify-center gap-1 text-center text-[13.5px] font-extrabold text-gold">
        다음 챌린지에서 더 높은 산을 함께 가요!
        <Icon name="arrow" size={15} />
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="flex h-[52px] items-center justify-center gap-1 rounded-[14px] bg-accent text-[15px] font-extrabold text-accent-ink active:bg-accent-press"
      >
        다음 챌린지 신청하기
        <Icon name="chevron" size={17} strokeWidth={2.4} />
      </button>
    </div>
  );
}
