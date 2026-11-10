"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { GOAL_TYPE_META, goalLabel } from "@/lib/challenge";
import type { RankedEntry } from "@/lib/domain/challenge-ranking";
import { buildTieBreakExplanation } from "@/lib/domain/goal-score-v2";
import type { UserGoal } from "@/lib/types";

const pt = (n: number) => `${n.toFixed(2)}점`;
const pct = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** 소수 둘째 자리까지, 뒤의 0은 뗀다 */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * v2 결과 설명 — "내 점수는 이렇게 만들어졌어요" + 목표별 점수 + (동점일 때만) 승부 이유.
 *
 * ⚠️ 여기서 점수를 계산하지 않는다. 모든 숫자·문구는 `rankForChallenge`가 만든 `v2.breakdown`과
 *    `buildTieBreakExplanation`에서 온다. 화면이 따로 계산하면 순위와 설명이 갈린다.
 */
export function ScoreExplanation({
  me,
  all,
  myGoals,
  nameOf,
  plannedDays,
}: {
  me: RankedEntry;
  all: readonly RankedEntry[];
  myGoals: readonly UserGoal[];
  nameOf: (userId: string) => string;
  /** 계획한 운동일 수 — 참여 점수 설명용 */
  plannedDays: number;
}) {
  const [open, setOpen] = useState(false);
  const v2 = me.v2;
  if (!v2) return null;
  const b = v2.breakdown;
  const tie = buildTieBreakExplanation(
    v2,
    all.flatMap((r) => (r.v2 ? [r.v2] : [])),
    nameOf,
  );
  const hasAuto = b.goals.some((g) => g.auto);
  const labelOf = (type: string) => {
    const g = myGoals.find((x) => x.goal_type === type);
    return g ? goalLabel(g.goal_type, g.qualifier) : type;
  };

  return (
    <div className="flex flex-col gap-3">
      <section data-testid="score-explanation" className="rounded-card border border-line bg-surface px-4 py-4 shadow-card">
        <h3 className="text-[15px] font-extrabold">내 점수는 이렇게 만들어졌어요</h3>
        <dl className="mt-3 flex flex-col gap-3">
          <div>
            <dt className="flex justify-between text-[13.5px] font-extrabold">
              <span>목표 달성</span>
              <span className="font-mono" data-testid="pts-achievement">+{pt(b.achievementPoints)}</span>
            </dt>
            <dd className="text-[12px] text-muted">
              설정한 평가 항목의 평균 달성률은 {num(b.achievementRate)}%예요.
            </dd>
          </div>
          <div>
            <dt className="flex justify-between text-[13.5px] font-extrabold">
              <span>운동 참여</span>
              <span className="font-mono" data-testid="pts-participation">+{pt(b.participationPoints)}</span>
            </dt>
            <dd className="text-[12px] text-muted">
              계획한 {plannedDays}일 중 {Math.round((b.participationRate / 100) * plannedDays)}일 운동했어요.
            </dd>
          </div>
          <div>
            <dt className="flex justify-between text-[13.5px] font-extrabold">
              <span>목표 완료 보너스</span>
              <span className="font-mono" data-testid="pts-bonus">+{pt(b.completionBonus)}</span>
            </dt>
            <dd className="text-[12px] text-muted">
              {b.completedGoalCount > 0
                ? `100% 완료한 목표가 ${b.completedGoalCount}개예요.`
                : "100% 완료한 목표가 아직 없어요."}
            </dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] font-bold" data-testid="base-sum">
          세 점수를 더해 기본 점수 {pt(v2.baseScore)}을 받았어요.
          {v2.tieBonusUnits > 0 && ` 동점 가산 +${(v2.tieBonusUnits / 1_000_000).toFixed(6)}점이 더해져 최종 ${v2.finalScore.toFixed(6)}점이에요.`}
        </p>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-[12px] border border-accent/60 text-[13.5px] font-extrabold text-accent"
        >
          내 목표별 점수 확인하기
          <Icon name="chevron" size={15} className={open ? "rotate-90" : ""} />
        </button>

        {open && (
          <ul data-testid="goal-breakdown" className="mt-3 flex flex-col gap-3">
            {b.goals.map((g) => {
              const unit = GOAL_TYPE_META[g.type]?.unit ?? "";
              return (
                <li key={g.type} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
                  <p className="text-[13px] font-extrabold">
                    {g.auto ? "유산소 주간 횟수" : labelOf(g.type)}
                    {g.auto && (
                      <span className="ml-1.5 text-[10.5px] font-bold text-muted">추가 평가 항목</span>
                    )}
                  </p>
                  {g.auto && (
                    <p className="text-[11px] text-muted">유산소 목표에 포함된 추가 평가 항목이에요. 설정 목표 수에는 세지 않아요.</p>
                  )}
                  <p className="mt-1 text-[12px] text-muted">
                    목표 {num(g.target)}
                    {unit} · 달성 {num(g.actual)}
                    {unit} · 달성률 {pct(g.rate)}
                  </p>
                  <p className="text-[12px] font-bold">점수 기여 {pt(g.points)}{g.completed ? " · 100% 달성" : ""}</p>
                </li>
              );
            })}
            <li className="px-1 text-[11.5px] text-muted">
              설정한 목표는 {b.configuredGoalCount}개예요
              {hasAuto ? " (추가 평가 항목은 빼고 센 값이에요)" : ""}. 기본 점수가 같을 때 목표를 더 많이 설정한 쪽이 유리해요.
            </li>
          </ul>
        )}
      </section>

      {tie && (
        <section data-testid="tie-break-card" className="rounded-card border border-gold/50 bg-surface px-4 py-4 shadow-card">
          <h3 className="text-[15px] font-extrabold">{tie.title}</h3>
          <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
            {tie.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
