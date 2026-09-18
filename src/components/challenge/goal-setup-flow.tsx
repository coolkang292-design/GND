"use client";

import { useEffect, useState } from "react";
import {
  BottomSheet,
  PrimaryButton,
  SheetHeader,
} from "@/components/challenge/bottom-sheet";
import { NumberField } from "@/components/challenge/number-field";
import { recordFunnelEvent } from "@/lib/analytics-events";
import type { GoalDraft } from "@/lib/challenge";
import { formatMonthDay, inclusiveDays } from "@/lib/domain/challenge-time";
import {
  DETAIL_CATEGORIES,
  DETAIL_METRICS,
  MAX_DETAIL_GOALS,
  MAX_WEEKLY_DAYS,
  MIN_WEEKLY_DAYS,
  WEEKLY_DAY_CHOICES,
  buildGoalDrafts,
  detailCategoryOf,
  detailDefaults,
  detailGoalText,
  isDaysMetric,
  perSessionHint,
  splitGoalsForEdit,
  type BuildGoalDraftsResult,
  type DetailCategoryKey,
  type DetailGoalInput,
  type DetailGoalType,
} from "@/lib/domain/challenge-simple-goal";
import type { UserGoal } from "@/lib/types";

type Step = "basic" | "category" | "metric" | "review";

const TITLE_ID = "goal-setup-title";

function reasonMessage(
  reason: Extract<BuildGoalDraftsResult, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "weekly_out_of_range":
      return "주 1회부터 7회까지 고를 수 있어요";
    case "too_many_details":
      return `세부 목표는 ${MAX_DETAIL_GOALS}개까지 넣을 수 있어요`;
    case "duplicate_metric":
      return "같은 세부 목표가 두 번 들어 있어요";
    case "non_positive_target":
      return "세부 목표 숫자는 0보다 커야 해요";
  }
}

/**
 * 챌린지 목표 설정 (2026-09-18 목표 단순화).
 *
 * 기본은 **주 N회 운동** 하나다. 이것만 골라도 완전한 참가자다(`workout_days`, 0108).
 * 거리·운동량·횟수는 `+ 세부 목표 추가`를 눌렀을 때만 연다.
 *
 * ⛔ 이 화면에 **KPI·종합점수·80%·20%·계산식·동의**를 다시 쓰지 마라. 계산은
 *    그대로 돌고 있고(`goal-score.ts`), 화면에서만 뺐다. `goal-setup-flow.test.tsx`가
 *    부정 단언으로 막는다.
 *
 * ⚠️ **"시작 전까지 바꿀 수 있어요"를 "언제든지"로 바꾸지 마라.** 시작한 뒤에는
 *    목표를 **올리기만** 할 수 있다(0090 트리거). 시안의 "언제든지 다시 변경할 수
 *    있어요"는 사실이 아니다.
 *
 * ⚠️ 사진 인증 한 줄은 지우지 마라. 사진 필수 챌린지에서 사진 없는 운동은
 *    세지 않는다(`get_challenge_period_sessions`). 단순화한다고 이걸 지우면
 *    "주 3회 했는데 0회"가 된다.
 */
export function GoalSetupFlow({
  userId,
  challengeName,
  startDate,
  endDate,
  todayKey,
  photoRequired,
  myGoals,
  prevGoals,
  justJoined = false,
  busy,
  onSubmit,
  onClose,
}: {
  userId: string;
  challengeName: string;
  startDate: string;
  endDate: string;
  todayKey: string;
  photoRequired: boolean;
  /** 이 챌린지에 이미 세운 내 목표 (편집) */
  myGoals: readonly UserGoal[];
  /** 지난 챌린지 목표 — "불러오기" 재료. 없으면 null */
  prevGoals: readonly UserGoal[] | null;
  /** 방금 참가했다 — 첫 줄에 축하를 붙인다 (시안 5번) */
  justJoined?: boolean;
  busy: boolean;
  onSubmit: (value: { goals: GoalDraft[]; plannedDays: number }) => void;
  onClose: () => void;
}) {
  const periodDays = Math.max(1, inclusiveDays(startDate, endDate));
  const [initial] = useState(() => splitGoalsForEdit(myGoals, periodDays));

  const [step, setStep] = useState<Step>(
    initial.details.length > 0 ? "review" : "basic",
  );
  const [weeklyDays, setWeeklyDays] = useState(initial.weeklyDays);
  const [custom, setCustom] = useState(
    !(WEEKLY_DAY_CHOICES as readonly number[]).includes(initial.weeklyDays),
  );
  const [details, setDetails] = useState<DetailGoalInput[]>(initial.details);
  const [category, setCategory] = useState<DetailCategoryKey | null>(null);
  /** 편집 중인 세부 목표. `index`가 null이면 새로 추가 */
  const [draft, setDraft] = useState<{
    index: number | null;
    goal: DetailGoalInput;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 퍼널 (0109) — 목표 화면을 열었다. 저장했는지는 user_goals가 안다.
  useEffect(() => {
    void recordFunnelEvent("challenge_goal_started", userId);
  }, [userId]);

  const usedTypes = new Set(details.map((d) => d.type));
  const atMax = details.length >= MAX_DETAIL_GOALS;

  function submit() {
    setNotice(null);
    const r = buildGoalDrafts({ weeklyDays, periodDays, details });
    if (!r.ok) {
      setNotice(reasonMessage(r.reason));
      return;
    }
    onSubmit({ goals: r.goals, plannedDays: r.plannedDays });
  }

  function loadPrev() {
    if (!prevGoals || prevGoals.length === 0) return;
    const s = splitGoalsForEdit(prevGoals, periodDays);
    setWeeklyDays(s.weeklyDays);
    setCustom(!(WEEKLY_DAY_CHOICES as readonly number[]).includes(s.weeklyDays));
    setDetails(s.details.slice(0, MAX_DETAIL_GOALS));
    setNotice(
      s.details.length > MAX_DETAIL_GOALS
        ? `지난 목표 중 세부 목표는 ${MAX_DETAIL_GOALS}개만 불러왔어요`
        : "지난 챌린지 목표를 불러왔어요",
    );
  }

  function startAddDetail() {
    if (atMax) return;
    setCategory(null);
    setDraft(null);
    setNotice(null);
    setStep("category");
  }

  function pickCategory(key: DetailCategoryKey) {
    setCategory(key);
  }

  function goMetric() {
    if (!category) return;
    const first = DETAIL_METRICS[category].find((m) => !usedTypes.has(m.type));
    if (!first) return;
    const d = detailDefaults(first.type);
    setDraft({ index: null, goal: { type: first.type, perWeek: d.perWeek } });
    setStep("metric");
  }

  function editDetail(index: number) {
    const goal = details[index];
    setCategory(detailCategoryOf(goal.type));
    setDraft({ index, goal: { ...goal } });
    setStep("metric");
  }

  function removeDetail(index: number) {
    setDetails((ds) => ds.filter((_, i) => i !== index));
  }

  function saveDraft() {
    if (!draft) return;
    if (!(draft.goal.perWeek > 0)) {
      setNotice("목표 숫자는 0보다 커야 해요");
      return;
    }
    setDetails((ds) =>
      draft.index === null
        ? [...ds, draft.goal]
        : ds.map((d, i) => (i === draft.index ? draft.goal : d)),
    );
    setDraft(null);
    setNotice(null);
    setStep("review");
  }

  const startLine =
    startDate > todayKey
      ? `${formatMonthDay(startDate)}에 자동으로 시작해요 · 시작하면 알려드려요`
      : "곧 자동으로 시작돼요 · 시작하면 알려드려요";

  const infoLines = (
    <div className="mt-3 flex flex-col gap-1.5 text-[12px] text-muted">
      {photoRequired && (
        <p className="rounded-card-sm bg-accent/10 px-3 py-2 font-bold text-accent">
          📷 사진을 올린 운동만 세요
        </p>
      )}
      <p className="text-center text-faint">시작 전까지 바꿀 수 있어요</p>
    </div>
  );

  const detailList = details.length > 0 && (
    <ul className="mt-2 flex flex-col gap-1.5" aria-label="세부 목표">
      {details.map((d, i) => {
        const t = detailGoalText(d);
        return (
          <li
            key={d.type}
            className="flex items-center gap-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2.5"
          >
            <button
              type="button"
              onClick={() => editDetail(i)}
              className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-left"
            >
              <span className="truncate text-[13px] font-bold">{t.title}</span>
              <span className="flex-none font-mono text-[13px] font-extrabold">
                {t.value}
              </span>
            </button>
            <button
              type="button"
              onClick={() => removeDetail(i)}
              aria-label={`${t.title} 빼기`}
              className="grid h-7 w-7 flex-none place-items-center rounded-full text-faint"
            >
              ✕
            </button>
          </li>
        );
      })}
    </ul>
  );

  const addDetailRow = (
    <button
      type="button"
      onClick={startAddDetail}
      disabled={atMax}
      className="mt-2 flex w-full items-center gap-3 rounded-card border border-line bg-surface-2 px-3.5 py-3 text-left disabled:opacity-50"
    >
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-accent text-base font-extrabold text-accent-ink">
        +
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-extrabold">세부 목표 추가</span>
        <span className="block text-[11.5px] text-muted">
          {atMax
            ? `세부 목표는 ${MAX_DETAIL_GOALS}개까지예요`
            : "운동량·거리·횟수 목표를 더할 수 있어요 · 선택"}
        </span>
      </span>
      <span className="flex-none text-muted">›</span>
    </button>
  );

  const footer = (label: string, onClick: () => void, disabled = false, sub?: string) => (
    <>
      {notice && (
        <p role="alert" className="mb-2 text-center text-[12.5px] font-bold text-warn">
          {notice}
        </p>
      )}
      <PrimaryButton onClick={onClick} disabled={disabled || busy}>
        {busy ? "저장 중…" : label}
      </PrimaryButton>
      {sub && <p className="mt-1.5 text-center text-[11.5px] text-muted">{sub}</p>}
    </>
  );

  /* ── ① 기본 목표 ─────────────────────────────────────────── */
  if (step === "basic") {
    return (
      <BottomSheet
        titleId={TITLE_ID}
        onClose={onClose}
        header={
          <SheetHeader
            titleId={TITLE_ID}
            title="목표 설정"
            onBack={details.length > 0 ? () => setStep("review") : undefined}
            onClose={onClose}
          />
        }
        footer={footer("이 목표로 시작하기", submit, false, startLine)}
      >
        {justJoined && (
          <div className="mb-3 rounded-card border border-accent/40 bg-accent/10 px-4 py-3 text-center">
            <p className="text-[17px] font-extrabold text-accent">참여 완료! 🎉</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {challengeName} · 함께라면 더 꾸준히 할 수 있어요
            </p>
          </div>
        )}

        <p className="text-[18px] leading-snug font-extrabold">
          이번 챌린지에서
          <br />주 몇 번 운동할까요?
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="주 운동 횟수">
          {WEEKLY_DAY_CHOICES.map((n) => {
            const on = !custom && weeklyDays === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setCustom(false);
                  setWeeklyDays(n);
                }}
                className={`relative h-14 rounded-card-sm border text-[16px] font-extrabold ${
                  on
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line bg-surface-2 text-text"
                }`}
              >
                주 {n}회{on && " ✓"}
                {n === 3 && (
                  <span
                    className={`absolute top-1 right-2 text-[10px] font-bold ${
                      on ? "text-accent-ink/70" : "text-accent"
                    }`}
                  >
                    추천
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            onClick={() => setCustom(true)}
            className={`h-14 rounded-card-sm border text-[15px] font-extrabold ${
              custom
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-surface-2 text-text"
            }`}
          >
            직접 설정
          </button>
        </div>

        {custom && (
          <div className="mt-2 flex items-center justify-center gap-4 rounded-card-sm border border-line bg-surface-2 py-2.5">
            <button
              type="button"
              aria-label="주 운동 횟수 줄이기"
              onClick={() => setWeeklyDays((d) => Math.max(MIN_WEEKLY_DAYS, d - 1))}
              className="h-10 w-10 rounded-full border border-line bg-surface text-lg font-bold"
            >
              –
            </button>
            <span className="w-20 text-center font-mono text-[18px] font-extrabold">
              주 {weeklyDays}회
            </span>
            <button
              type="button"
              aria-label="주 운동 횟수 늘리기"
              onClick={() => setWeeklyDays((d) => Math.min(MAX_WEEKLY_DAYS, d + 1))}
              className="h-10 w-10 rounded-full border border-line bg-surface text-lg font-bold"
            >
              +
            </button>
          </div>
        )}

        <p className="mt-2 text-center text-[11.5px] text-muted">
          웨이트·러닝·맨몸 무엇이든 운동한 날을 세요
        </p>

        <div className="mt-4">
          {detailList}
          {addDetailRow}
        </div>

        {prevGoals && prevGoals.length > 0 && myGoals.length === 0 && (
          <button
            type="button"
            onClick={loadPrev}
            className="mt-2 w-full text-center text-[12px] font-bold text-accent"
          >
            ↺ 지난 챌린지 목표 불러오기
          </button>
        )}

        {infoLines}
      </BottomSheet>
    );
  }

  /* ── ② 세부 목표 — 어떤 운동 ─────────────────────────────── */
  if (step === "category") {
    return (
      <BottomSheet
        titleId={TITLE_ID}
        onClose={onClose}
        header={
          <SheetHeader
            titleId={TITLE_ID}
            title="세부 목표 추가"
            onBack={() => setStep(details.length > 0 ? "review" : "basic")}
            onClose={onClose}
          />
        }
        footer={footer("다음", goMetric, !category)}
      >
        <p className="text-[18px] font-extrabold">어떤 운동을 목표로 할까요?</p>
        <p className="mt-0.5 text-[12.5px] text-muted">원하는 목표만 추가하면 돼요</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="운동 분류">
          {DETAIL_CATEGORIES.map((c) => {
            const allUsed = DETAIL_METRICS[c.key].every((m) => usedTypes.has(m.type));
            const on = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={allUsed}
                onClick={() => pickCategory(c.key)}
                className={`flex h-24 flex-col items-center justify-center gap-0.5 rounded-card border text-[15px] font-extrabold disabled:opacity-40 ${
                  on ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface-2"
                }`}
              >
                <span>{c.label}</span>
                {c.sub && <span className="text-[11px] font-bold text-muted">{c.sub}</span>}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    );
  }

  /* ── ③ 세부 목표 — 무엇을 기준으로, 얼마나 ─────────────────── */
  if (step === "metric" && draft && category) {
    const metrics = DETAIL_METRICS[category];
    const catLabel = DETAIL_CATEGORIES.find((c) => c.key === category)?.label ?? "";
    const g = draft.goal;
    const days = isDaysMetric(g.type);
    const def = detailDefaults(g.type);
    const setGoal = (patch: Partial<DetailGoalInput>) =>
      setDraft((d) => (d ? { ...d, goal: { ...d.goal, ...patch } } : d));
    const hint = perSessionHint(g, weeklyDays);

    return (
      <BottomSheet
        titleId={TITLE_ID}
        onClose={onClose}
        header={
          <SheetHeader
            titleId={TITLE_ID}
            title={`${catLabel} 목표`}
            onBack={() => setStep(draft.index === null ? "category" : "review")}
            onClose={onClose}
          />
        }
        footer={footer(draft.index === null ? "목표 추가하기" : "목표 바꾸기", saveDraft)}
      >
        <p className="text-[16px] font-extrabold">무엇을 기준으로 할까요?</p>
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="목표 기준">
          {metrics.map((m) => {
            const on = g.type === m.type;
            const taken = usedTypes.has(m.type) && !(draft.index !== null && details[draft.index]?.type === m.type);
            return (
              <button
                key={m.type}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={taken}
                onClick={() => {
                  const d = detailDefaults(m.type);
                  setGoal({ type: m.type as DetailGoalType, perWeek: d.perWeek, qualifier: null });
                }}
                className={`h-10 flex-1 rounded-card-sm border text-[13px] font-bold disabled:opacity-40 ${
                  on ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface-2"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-card border border-line bg-surface-2 p-3">
          <p className="text-[12px] font-bold text-muted">목표</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="목표 줄이기"
              onClick={() =>
                setGoal({
                  perWeek: days
                    ? Math.max(1, g.perWeek - 1)
                    : Math.max(0, Math.round((g.perWeek - def.step) * 10) / 10),
                })
              }
              className="h-11 w-11 flex-none rounded-full border border-line bg-surface text-lg font-bold"
            >
              –
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="flex-none text-[14px] font-bold text-muted">주</span>
              <NumberField
                value={g.perWeek}
                onValue={(v) => setGoal({ perWeek: days ? Math.min(7, Math.max(0, Math.round(v))) : v })}
                ariaLabel="주간 목표"
                className="text-center text-[16px]"
              />
              <span className="flex-none text-[14px] font-bold text-muted">
                {days ? "일" : def.unit}
              </span>
            </div>
            <button
              type="button"
              aria-label="목표 늘리기"
              onClick={() =>
                setGoal({
                  perWeek: days
                    ? Math.min(7, g.perWeek + 1)
                    : Math.round((g.perWeek + def.step) * 10) / 10,
                })
              }
              className="h-11 w-11 flex-none rounded-full border border-line bg-surface text-lg font-bold"
            >
              +
            </button>
          </div>

          {days && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-[12.5px] font-bold text-muted">하루 최소 종목 수</span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="하루 최소 종목 줄이기"
                  onClick={() => setGoal({ qualifier: Math.max(1, (g.qualifier ?? 1) - 1) })}
                  className="h-8 w-8 rounded-full border border-line bg-surface font-bold"
                >
                  –
                </button>
                <span className="w-14 text-center font-mono text-[14px] font-extrabold">
                  {g.qualifier ?? 1}종목+
                </span>
                <button
                  type="button"
                  aria-label="하루 최소 종목 늘리기"
                  onClick={() => setGoal({ qualifier: Math.min(7, (g.qualifier ?? 1) + 1) })}
                  className="h-8 w-8 rounded-full border border-line bg-surface font-bold"
                >
                  +
                </button>
              </span>
            </div>
          )}

          {hint && (
            <p className="mt-3 rounded-card-sm bg-surface px-3 py-2 text-[12.5px] font-bold">
              💡 {hint}
            </p>
          )}
        </div>
        {infoLines}
      </BottomSheet>
    );
  }

  /* ── ④ 내 목표 확인 ──────────────────────────────────────── */
  return (
    <BottomSheet
      titleId={TITLE_ID}
      onClose={onClose}
      header={<SheetHeader titleId={TITLE_ID} title="내 목표 확인" onClose={onClose} />}
      footer={footer("이 목표로 시작하기", submit, false, startLine)}
    >
      <button
        type="button"
        onClick={() => setStep("basic")}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-surface-2 px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-bold text-muted">기본 목표</span>
          <span className="block text-[20px] font-extrabold">주 {weeklyDays}회 운동</span>
        </span>
        <span className="flex-none text-muted">›</span>
      </button>

      <p className="mt-4 text-[13px] font-extrabold">세부 목표</p>
      {details.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted">세부 목표 없이도 참여할 수 있어요</p>
      ) : (
        detailList
      )}
      {!atMax && addDetailRow}
      {infoLines}
    </BottomSheet>
  );
}
