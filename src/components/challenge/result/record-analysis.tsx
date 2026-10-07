"use client";

import { Icon } from "@/components/ui/icon";
import type { RankedParticipant } from "@/lib/domain/goal-score";
import type {
  BestRecords as Records,
  DailyBar,
  PeriodRewards,
  WeekAchievement,
} from "@/lib/domain/challenge-report";
import { BestRecords } from "./best-records";
import { DailyActivityChart } from "./daily-activity-chart";
import { GoalRing } from "./goal-ring";
import { LevelCard } from "./level-card";
import { RewardsRow } from "./rewards-row";
import { ScoreTrendChart } from "./score-trend-chart";
import { WeeklyHeatmap } from "./weekly-heatmap";

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
  weeks: WeekAchievement[];
};

const card = "rounded-card border border-line bg-surface p-4 shadow-card";

/**
 * 종료 화면 `기록 분석` 탭 (최종 시안 2026-10-07).
 * 첫 시안의 「나의 챌린지 결과」 본문을 여기로 옮겼다 — 목표 달성률 · 일별 활동 · 주요 기록 · 나의 성장,
 * 그리고 레벨 · 주간 달성 · 획득한 보상. 순위·종합 점수 머리는 `결과 요약`이 맡는다.
 */
export function RecordAnalysis({ me, rewards }: { me: MyReport; rewards: PeriodRewards | null }) {
  const done = me.goals.filter((g) => g.rate >= 1).length;
  return (
    <div className="flex flex-col gap-3">
      {rewards && <LevelCard r={rewards} />}

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
            <div key={g.key} data-testid="goal-ring" className="relative flex flex-col items-center gap-1 pt-1 text-center">
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
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold">주간 달성</h3>
          <span className="text-[11px] text-muted">꾸준함이 만든 결과예요!</span>
        </div>
        <WeeklyHeatmap weeks={me.weeks} />
      </section>

      <section className={card}>
        <h3 className="mb-2.5 text-[15px] font-extrabold">주요 기록</h3>
        <BestRecords records={me.records} />
      </section>

      <section className={card}>
        <h3 className="mb-1 text-[15px] font-extrabold">나의 성장</h3>
        <ScoreTrendChart points={me.trend} />
      </section>

      {rewards && (
        <section className={card}>
          <h3 className="mb-2.5 text-[15px] font-extrabold">획득한 보상</h3>
          <RewardsRow r={rewards} />
        </section>
      )}
    </div>
  );
}
