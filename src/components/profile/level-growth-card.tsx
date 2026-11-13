"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { computeEvolutionGrowthScore, type GrowthRecord } from "@/lib/domain/level-growth";
import { getStageGrowthGoal } from "@/lib/domain/evolution-gate";
import {
  EMPTY_GROWTH_COPY,
  CARDIO_CONDITION_COPY,
  JUMP_COPY,
  UNMATCHED_COPY,
  fmtGrowthPct,
  growthLine,
} from "@/lib/domain/level-growth-copy";
import { getMyStageGrowth, type StageGrowthResult } from "@/lib/level-growth";

/** 항상 보이는 성장 기록 수 */
const TOP_VISIBLE = 3;

function GrowthRow({ g }: { g: GrowthRecord }) {
  return (
    <li className="rounded-2xl border border-line bg-surface-2/50 p-3" data-testid="growth-record">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{g.exerciseKey}</p>
        <span className="flex-none text-[13px] font-black tabular-nums text-accent">
          {fmtGrowthPct(g.growthPct)}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-muted">{growthLine(g)}</p>
    </li>
  );
}

function titleOf(result: { stageIndex: number; stageName: string }): string {
  return `내 성장 · ${result.stageIndex}단계 ${result.stageName}`;
}

/** 표시 전용 (데이터는 부모가 준다) */
export function LevelGrowthView({
  result,
  defaultOpen = false,
}: {
  result: StageGrowthResult;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (result.state === "no_baseline") {
    return (
      <section aria-label="내 성장" className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">{titleOf(result)}</h2>
        <p className="mt-2 text-[18px] font-black text-muted" data-testid="growth-preparing">
          측정 준비 중
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          다음 진화 이후부터, 그 시점까지의 종목별 최고 기록과 비교해 성장한 운동을 알려 드려요.
        </p>
      </section>
    );
  }

  const s = result.summary;
  const goal = getStageGrowthGoal(result.stageIndex, s.previousStageExerciseCount);
  const score = goal.mode === "growth_preview" ? computeEvolutionGrowthScore(s, goal.requiredCount) : null;
  const top = s.growths.slice(0, TOP_VISIBLE);
  const rest = s.growths.slice(TOP_VISIBLE);
  const hasMore = rest.length > 0 || s.unmatched.length > 0;

  return (
    <section aria-label="내 성장" className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
      <h2 className="text-[15px] font-extrabold">{titleOf(result)}</h2>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        기준: {result.stageIndex}단계에 들어올 때까지의 종목별 최고 기록
      </p>

      {goal.mode === "xp_only" && (
        <p className="mt-3 text-[12px] font-bold text-accent">시동러까지는 경험치만으로 진화해요.</p>
      )}
      {goal.mode === "growth_preview" && score && (
        <div className="mt-3 rounded-2xl border border-accent/30 bg-accent-weak/30 p-3" data-testid="growth-goal-preview">
          <p className="text-[11px] font-bold text-muted">성장 목표 미리보기 · 상위 {goal.requiredCount}종목 기준</p>
          <p className="mt-1 text-[18px] font-black text-accent" data-testid="growth-average">
            진화 평가 평균 {fmtGrowthPct(score.averagePct)}
          </p>
          <p className="mt-1 text-[12px] font-bold">
            성장 종목 {score.filledCount} / {goal.requiredCount} · 평균 목표 {fmtGrowthPct(goal.averageTargetPct)}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[11.5px]">
            {score.selected.map(g => <li key={g.exerciseKey} className="flex justify-between gap-2">
              <span>{g.exerciseKey}</span><span>{fmtGrowthPct(g.growthPct)}</span>
            </li>)}
            {Array.from({ length: goal.requiredCount - score.filledCount }, (_, i) => (
              <li key={`empty-${i}`} className="flex justify-between gap-2 text-muted" data-testid="growth-empty-slot">
                <span>아직 성장 기록이 없는 자리</span><span>0.0%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            부족한 자리는 0%로 계산해요. 종목 수와 평균 목표를 모두 채워야 해요. 현재 진화는 경험치 기준이에요.
          </p>
        </div>
      )}

      {s.growths.length > 0 ? (
        <p className="mt-3 text-[18px] font-black text-accent" data-testid="growth-headline">
          성장한 운동 {s.growths.length}종목
        </p>
      ) : (
        <p className="mt-3 text-[12.5px] leading-snug text-muted" data-testid="growth-empty">
          {EMPTY_GROWTH_COPY}
        </p>
      )}

      {top.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {top.map((g) => (
            <GrowthRow key={`${g.exerciseKey}::${g.kind}`} g={g} />
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="growth-toggle"
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong text-[13px] font-extrabold"
        >
          <Icon name="level" size={16} />
          {open ? "성장 기록 접기" : "성장 기록 모두 보기"}
        </button>
      )}

      {open && hasMore && (
        <div className="mt-3 flex flex-col gap-2">
          {rest.length > 0 && (
            <ul className="flex flex-col gap-2">
              {rest.map((g) => (
                <GrowthRow key={`${g.exerciseKey}::${g.kind}`} g={g} />
              ))}
            </ul>
          )}
          {s.unmatched.length > 0 && (
            <div data-testid="growth-unmatched-section">
              <p className="text-[11px] font-bold text-muted">이번 단계에서 비교하지 않는 운동</p>
              <ul className="mt-1 flex flex-col gap-2">
                {s.unmatched.map((u) => (
                  <li
                    key={`${u.exerciseKey}::${u.kind}`}
                    className="rounded-2xl border border-line bg-surface-2/50 p-3"
                    data-testid="growth-unmatched"
                  >
                    <p className="text-[13px] font-extrabold">{u.exerciseKey}</p>
                    <p className="mt-1 text-[11.5px] leading-snug text-muted">
                      {u.reason === "jump" ? JUMP_COPY : u.reason === "cardio_condition" ? CARDIO_CONDITION_COPY : UNMATCHED_COPY}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** 성장 허브용 — 본인 기록을 읽어 현재 단계의 성장을 그린다 */
export function LevelGrowthCard({ userId, level, currentStage }: { userId: string; level: number; currentStage?: number }) {
  // 결과·실패에 어느 (userId, level) 것인지 키를 붙인다. 키가 현재와 다르면 옛 값이므로 무시한다 —
  // effect 안에서 setState로 초기화하지 않아도 사용자·레벨이 바뀔 때 옛 결과/실패가 남지 않는다.
  const key = `${userId}:${level}:${currentStage ?? "xp"}`;
  const [state, setState] = useState<
    { key: string; result: StageGrowthResult } | { key: string; failed: true } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getMyStageGrowth({ userId, level, ...(currentStage === undefined ? {} : { currentStage }) })
      .then((result) => {
        if (!cancelled) setState({ key, result });
      })
      .catch(() => {
        if (!cancelled) setState({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, level, currentStage, key]);

  const current = state && state.key === key ? state : null;

  if (current && "failed" in current) {
    return (
      <section aria-label="내 성장" className="rounded-card border border-line bg-surface p-4 shadow-card">
        <h2 className="text-[15px] font-extrabold">내 성장</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          내 성장을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. 운동 기록은 그대로 안전해요.
        </p>
      </section>
    );
  }
  if (!current) {
    return (
      <section
        aria-busy="true"
        aria-label="내 성장"
        className="h-36 animate-pulse rounded-card border border-line bg-surface shadow-card"
      />
    );
  }
  return <LevelGrowthView result={current.result} />;
}
