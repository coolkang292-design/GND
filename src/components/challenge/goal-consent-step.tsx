"use client";

import { GOAL_TYPE_META, goalLabel, type GoalDraft } from "@/lib/challenge";
import {
  CONSENT_LABEL,
  TIE_BREAKERS,
  TIE_FINAL,
  addGoalAdvice,
  mustKnow,
  scoreCards,
  scoreFormula,
} from "@/lib/domain/challenge-rules-copy";
import { formatMonthDay } from "@/lib/domain/challenge-time";

/**
 * 참여 전 **최종 확인** (사용자 지시 2026-11-11).
 *
 * 목표를 다 정하면 ① 내가 정한 목표를 다시 보여 주고 ② 점수 계산 ③ 목표를 더하면 생기는 일
 * ④ 동점일 때 ⑤ 꼭 알아둘 약속을 쉬운 말로 설명한 뒤, **동의해야만** 참여가 끝난다.
 *
 * ⚠️ 이 화면은 2026-09-18에 "목표 설정 화면에서 계산·동의를 뺀다"는 결정으로 한 번 없어졌다.
 *    이번에 **마지막 단계로만** 되살렸다 — 목표를 고르는 앞 단계에는 계산 용어를 다시 쓰지 않는다
 *    (`goal-setup-flow.test.tsx`의 부정 단언이 앞 단계를 계속 지킨다).
 * ⚠️ 문구는 `challenge-rules-copy.ts` 한 곳이다. 여기서 숫자를 손으로 적지 마라.
 */
export function GoalConsentStep({
  goals,
  startDate,
  endDate,
  photoRequired,
  agreed,
  onAgreedChange,
}: {
  goals: readonly GoalDraft[];
  startDate: string;
  endDate: string;
  photoRequired: boolean;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
}) {
  const advice = addGoalAdvice();
  return (
    <div className="flex flex-col gap-4" data-testid="goal-consent-step">
      {/* ① 내가 정한 목표 */}
      <section aria-labelledby="consent-my-goals">
        <h3 id="consent-my-goals" className="text-[13px] font-extrabold">
          내가 정한 목표
        </h3>
        <p className="mt-0.5 text-[11.5px] text-muted">
          {formatMonthDay(startDate)} ~ {formatMonthDay(endDate)} 동안 채울 양이에요
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {goals.map((g) => (
            <li
              key={g.type}
              className="flex items-center justify-between gap-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
            >
              <span className="min-w-0 truncate text-[13px] font-bold">
                {goalLabel(g.type, g.qualifier)}
              </span>
              <span className="flex-none font-mono text-[13px] font-extrabold">
                {g.target.toLocaleString("ko-KR")}
                {GOAL_TYPE_META[g.type].unit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ② 점수 계산 */}
      <section aria-labelledby="consent-score">
        <h3 id="consent-score" className="text-[13px] font-extrabold">
          점수는 이렇게 계산돼요
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {scoreCards().map((c) => (
            <li
              key={c.title}
              className="rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
            >
              <p className="text-[12.5px] font-extrabold">{c.title}</p>
              <p className="mt-0.5 text-[12px] leading-5 text-muted">{c.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 rounded-card-sm bg-accent/10 px-3 py-2 text-center text-[12px] font-bold text-accent">
          {scoreFormula()}
        </p>
      </section>

      {/* ③ 목표를 더 추가하면 */}
      <section aria-labelledby="consent-add">
        <h3 id="consent-add" className="text-[13px] font-extrabold">
          목표를 더 추가하면?
        </h3>
        <div className="mt-2 flex flex-col gap-1.5 text-[12px] leading-5">
          <p className="rounded-card-sm border border-line bg-surface-2 px-3 py-2.5">
            <span className="font-extrabold text-accent">좋은 점 </span>
            {advice.good}
          </p>
          <p className="rounded-card-sm border border-line bg-surface-2 px-3 py-2.5">
            <span className="font-extrabold text-warn">조심할 점 </span>
            {advice.careful}
          </p>
        </div>
      </section>

      {/* ④ 동점이면 */}
      <section aria-labelledby="consent-tie">
        <h3 id="consent-tie" className="text-[13px] font-extrabold">
          점수가 같으면?
        </h3>
        <ol className="mt-2 flex flex-col gap-1 text-[12px] leading-5">
          {TIE_BREAKERS.map((t, i) => (
            <li key={t} className="flex gap-2">
              <span className="flex-none font-extrabold text-accent">{i + 1}.</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-[12px] text-muted">{TIE_FINAL}</p>
      </section>

      {/* ⑤ 꼭 알아둘 약속 */}
      <section aria-labelledby="consent-know">
        <h3 id="consent-know" className="text-[13px] font-extrabold">
          꼭 알아두세요
        </h3>
        <ul className="mt-2 flex flex-col gap-1 text-[12px] leading-5">
          {mustKnow({ photoRequired, startDate }).map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="flex-none text-accent">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 최종 동의 — 체크해야 참여 버튼이 켜진다 */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-card border border-accent/50 bg-accent/10 px-3.5 py-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none accent-[var(--accent,#c8ff3d)]"
        />
        <span className="text-[13px] font-extrabold leading-5">{CONSENT_LABEL}</span>
      </label>
    </div>
  );
}
