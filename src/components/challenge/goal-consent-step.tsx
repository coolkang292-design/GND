"use client";

import { GOAL_TYPE_META, goalLabel, type GoalDraft } from "@/lib/challenge";
import {
  CONSENT_LABEL,
  TIE_BREAKERS,
  TIE_FINAL,
  TIE_STEPS,
  addGoalAdvice,
  bonusChips,
  mustKnow,
  scoreBarSplit,
  scoreCards,
  scoreFormula,
} from "@/lib/domain/challenge-rules-copy";
import { formatMonthDay } from "@/lib/domain/challenge-time";

/**
 * 참여 전 **최종 확인** (사용자 지시 2026-11-11) — 글이 아니라 **그림**으로 먼저 말한다.
 *
 *   내 목표   → 큰 숫자 타일
 *   점수      → 80 : 20 막대 + "+3" 보너스 칩
 *   목표 추가 → 좋은 점 / 조심할 점 두 칸
 *   동점      → ①→②→③→④ 사다리
 *   약속      → 짧은 한 줄씩
 * 긴 설명은 `자세히 보기`에 접어 둔다(사용자 지적: "텍스트가 너무 많아 보인다").
 *
 * ⚠️ 이 화면은 2026-09-18에 한 번 없어졌다. **마지막 단계로만** 되살렸고, 앞 단계에는 계산 용어를
 *    쓰지 않는다(`goal-setup-flow.test.tsx`의 부정 단언).
 * ⚠️ 숫자·순서는 `challenge-rules-copy.ts`(= `goal-score.ts` 상수) 한 곳에서 읽는다.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-2 text-[13px] font-extrabold">
        {title}
      </h3>
      {children}
    </section>
  );
}

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
  const split = scoreBarSplit();
  const bonus = bonusChips();

  return (
    <div className="flex flex-col gap-5" data-testid="goal-consent-step">
      {/* ① 내 목표 — 큰 숫자 타일 */}
      <Section id="consent-my-goals" title="내가 정한 목표">
        <p className="-mt-1 mb-2 text-[11.5px] text-muted">
          {formatMonthDay(startDate)} ~ {formatMonthDay(endDate)}
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {goals.map((g) => (
            <li
              key={g.type}
              className="flex flex-col justify-between rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
            >
              <span className="text-[11.5px] font-bold leading-4 text-muted">
                {goalLabel(g.type, g.qualifier)}
              </span>
              <span className="mt-1 font-mono text-[20px] font-extrabold leading-6">
                {g.target.toLocaleString("ko-KR")}
                <span className="ml-0.5 text-[12px] font-bold text-muted">
                  {GOAL_TYPE_META[g.type].unit}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ② 점수 — 막대 + 보너스 칩 */}
      <Section id="consent-score" title="점수는 이렇게 계산돼요">
        <div
          role="img"
          aria-label={`종합점수는 목표 달성 ${split.achievement}점, 꾸준함 ${split.participation}점, 그리고 보너스예요`}
          className="flex h-11 overflow-hidden rounded-card-sm text-[12px] font-extrabold"
        >
          <div
            className="flex flex-col items-center justify-center bg-accent text-accent-ink"
            style={{ width: `${split.achievement}%` }}
          >
            <span>목표 달성</span>
            <span className="font-mono text-[13px]">{split.achievement}</span>
          </div>
          <div
            className="flex flex-col items-center justify-center bg-surface-3 text-text"
            style={{ width: `${split.participation}%` }}
          >
            <span>꾸준함</span>
            <span className="font-mono text-[13px]">{split.participation}</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap text-[11.5px] font-bold text-muted">+ 보너스</span>
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: bonus.max }, (_, i) => (
              <span
                key={i}
                className="grid h-7 min-w-9 place-items-center rounded-full border border-accent/60 bg-accent/10 px-2 font-mono text-[12px] font-extrabold text-accent"
              >
                +{bonus.per}
              </span>
            ))}
          </span>
          <span className="whitespace-nowrap text-[11.5px] text-muted">목표 100% 채울 때마다</span>
        </div>
        <details className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-bold text-muted">
            자세히 보기
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {scoreCards().map((c) => (
              <li key={c.title}>
                <p className="text-[12px] font-extrabold">{c.title}</p>
                <p className="text-[11.5px] leading-5 text-muted">{c.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] font-bold text-accent">{scoreFormula()}</p>
        </details>
      </Section>

      {/* ③ 목표를 더하면 — 좋은 점 / 조심할 점 */}
      <Section id="consent-add" title="목표를 더 추가하면?">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-card-sm border border-accent/50 bg-accent/10 px-3 py-2.5">
            <p className="text-[12px] font-extrabold text-accent">좋은 점</p>
            <p className="mt-1 font-mono text-[18px] font-extrabold">+{bonus.per}점</p>
            <p className="text-[11.5px] leading-4 text-muted">100% 채운 목표마다</p>
          </div>
          <div className="rounded-card-sm border border-warn/50 bg-warn/10 px-3 py-2.5">
            <p className="text-[12px] font-extrabold text-warn">조심할 점</p>
            <p className="mt-1 text-[14px] font-extrabold">평균이 내려가요</p>
            <p className="text-[11.5px] leading-4 text-muted">못 채운 목표도 들어가요</p>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-muted">
          채울 수 있는 만큼만 정하세요. 보너스는 {bonus.max}개까지만 늘어요.
        </p>
        <details className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-bold text-muted">
            자세히 보기
          </summary>
          <p className="mt-2 text-[11.5px] leading-5">
            <span className="font-extrabold text-accent">좋은 점 </span>
            {advice.good}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-5">
            <span className="font-extrabold text-warn">조심할 점 </span>
            {advice.careful}
          </p>
        </details>
      </Section>

      {/* ④ 동점 — 사다리 */}
      <Section id="consent-tie" title="점수가 같으면?">
        <ol className="flex items-start justify-between gap-1">
          {TIE_STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent font-mono text-[13px] font-extrabold text-accent-ink">
                {i + 1}
              </span>
              <span className="text-[11px] font-bold leading-4">{label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-center text-[11.5px] text-muted">
          위에서부터 먼저 높은 사람이 이겨요 · {TIE_FINAL}
        </p>
        <details className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-bold text-muted">
            자세히 보기
          </summary>
          <ol className="mt-2 flex flex-col gap-1 text-[11.5px] leading-5">
            {TIE_BREAKERS.map((t, i) => (
              <li key={t} className="flex gap-2">
                <span className="flex-none font-extrabold text-accent">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </details>
      </Section>

      {/* ⑤ 약속 */}
      <Section id="consent-know" title="꼭 알아두세요">
        <ul className="flex flex-col gap-1.5 text-[12px] leading-5">
          {mustKnow({ photoRequired, startDate }).map((line) => (
            <li
              key={line}
              className="flex gap-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2"
            >
              <span aria-hidden className="flex-none text-accent">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* 최종 동의 */}
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
