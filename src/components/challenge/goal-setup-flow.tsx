"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  BottomSheet,
  PrimaryButton,
  SheetHeader,
} from "@/components/challenge/bottom-sheet";
import { NumberField } from "@/components/challenge/number-field";
import { UiIcon } from "@/components/ui-icon";
import { recordFunnelEvent } from "@/lib/analytics-events";
import type { GoalDraft } from "@/lib/challenge";
import { formatMonthDay, inclusiveDays } from "@/lib/domain/challenge-time";
import {
  DETAIL_CATEGORIES,
  DETAIL_METRICS,
  MAX_DETAIL_GOALS,
  MAX_WEEKLY_DAYS,
  MIN_WEEKLY_DAYS,
  WEEK_LABELS,
  WEEKLY_DAY_CHOICES,
  buildGoalDrafts,
  detailCategoryOf,
  detailDefaults,
  detailGoalText,
  isDaysMetric,
  perSessionHint,
  splitGoalsForEdit,
  weekPreview,
  type BuildGoalDraftsResult,
  type DetailCategoryKey,
  type DetailGoalInput,
  type DetailGoalType,
} from "@/lib/domain/challenge-simple-goal";
import type { UserGoal } from "@/lib/types";

type Step = "basic" | "category" | "metric" | "review";

const TITLE_ID = "goal-setup-title";

/**
 * 시안의 배경 사진 (2026-09-18 사용자 제공 — `이미지 꾸미기/`, 저장소에 원본은 안 넣는다).
 *
 * ⚠️ **글자를 사진에 굽지 마라.** 시안은 손글씨가 이미지에 박혀 있지만, 그러면
 *    문구를 못 고치고 화면 낭독에서 사라진다. 사진은 배경, 글자는 DOM이다.
 * ⚠️ 사진이 밝아서 그 위 글자가 묻힌다 — **어두운 그라데이션을 빼지 마라.**
 * ⚠️ `align`은 장식이 아니다. 사진마다 **주제가 있는 쪽이 다르다** —
 *    `review`는 사람이 왼쪽이라 글자가 오른쪽이어야 얼굴을 안 가린다.
 *    사진을 바꾸면 이 값도 같이 보라.
 */
const HEROES = {
  basic: { src: "/challenge/goal-hero-basic.webp", align: "left" },
  weight: { src: "/challenge/goal-hero-weight.webp", align: "left" },
  cardio: { src: "/challenge/goal-hero-cardio.webp", align: "left" },
  bodyweight: { src: "/challenge/goal-hero-basic.webp", align: "left" },
  interval: { src: "/challenge/goal-hero-basic.webp", align: "left" },
  review: { src: "/challenge/goal-hero-review.webp", align: "right" },
} as const satisfies Record<string, { src: string; align: "left" | "right" }>;

type HeroKey = keyof typeof HEROES;

function GoalHero({
  hero,
  line1,
  line2,
}: {
  hero: HeroKey;
  line1: string;
  line2: string;
}) {
  const { src, align } = HEROES[hero];
  const right = align === "right";
  return (
    <div className="relative mb-3 aspect-[2.6/1] w-full overflow-hidden rounded-card">
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 480px) 100vw, 480px"
        className="object-cover"
      />
      {/* ⚠️ 이 두 겹을 빼지 마라. 사진이 밝은 쪽(하늘·해)에 글자가 오면 흰 글자가
          묻힌다 — 2026-09-18 화면 확인에서 ④가 실제로 그랬다. 그라데이션 한 겹으로는
          모자라서 글자에 그림자를 같이 준다. */}
      <div
        className={`absolute inset-0 bg-gradient-to-${right ? "l" : "r"} from-black/80 via-black/45 to-black/10`}
      />
      <p
        className={`absolute inset-y-0 flex flex-col justify-center font-serif text-[13px] italic leading-[1.5] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.95)] ${
          right ? "right-3.5 text-right" : "left-3.5"
        }`}
      >
        <span>{line1}</span>
        <span>{line2}</span>
      </p>
    </div>
  );
}

/**
 * 분류별 아이콘 — `public/ui-icons`에 **이미 있는 것**만 쓴다.
 *
 * 시안은 덤벨·러너·워커 선 아이콘이지만 우리 세트(2026-08-07 사용자 제공 시트)에는
 * 그 세 개가 없다. 새로 그리면 이 세트의 금색 입체 스타일과 따로 논다 —
 * 새 시트를 받으면 여기 이름만 바꾸면 된다.
 */
const CATEGORY_ICON: Record<DetailCategoryKey, string> = {
  weight: "part-arms",
  cardio: "situ-cardio",
  bodyweight: "situ-beginner",
  interval: "hub-tabata",
};

/** 시안 ③ — 분류마다 사진과 문구가 다르다 */
const CATEGORY_HERO_LINES: Record<DetailCategoryKey, [string, string]> = {
  weight: ["꾸준함이", "변화를 만듭니다"],
  cardio: ["한 걸음이", "멀리 데려갑니다"],
  bodyweight: ["내 몸 하나로", "충분합니다"],
  interval: ["짧고 굵게,", "오늘도 한 번"],
};

/**
 * 참여 완료 축하 (시안 ⑤).
 *
 * ⚠️ 조각 위치를 `Math.random()`으로 뿌리지 마라. 리렌더마다 튀고, 서버·클라이언트
 *    마크업이 달라져 hydration 경고가 난다. 고정 배열이면 둘 다 없다.
 * ⚠️ `aria-hidden` — 낭독할 것은 아래 "참여 완료!" 한 줄이지 조각이 아니다.
 */
const CONFETTI = [
  { left: "8%", delay: "0ms", dur: "1500ms", w: 6, h: 10, rot: "12deg" },
  { left: "20%", delay: "160ms", dur: "1750ms", w: 5, h: 9, rot: "-20deg" },
  { left: "32%", delay: "60ms", dur: "1400ms", w: 7, h: 7, rot: "35deg" },
  { left: "45%", delay: "260ms", dur: "1650ms", w: 5, h: 11, rot: "-8deg" },
  { left: "57%", delay: "110ms", dur: "1550ms", w: 6, h: 8, rot: "24deg" },
  { left: "69%", delay: "310ms", dur: "1800ms", w: 5, h: 10, rot: "-30deg" },
  { left: "80%", delay: "40ms", dur: "1450ms", w: 7, h: 9, rot: "16deg" },
  { left: "91%", delay: "210ms", dur: "1700ms", w: 5, h: 8, rot: "-14deg" },
] as const;

function JoinedBanner({ challengeName }: { challengeName: string }) {
  return (
    <div className="relative mb-3 overflow-hidden rounded-card border border-accent/40 bg-accent/10 px-4 py-5 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {CONFETTI.map((c) => (
          <span
            key={c.left}
            className="absolute top-0 rounded-[1px] bg-accent"
            style={{
              left: c.left,
              width: c.w,
              height: c.h,
              transform: `rotate(${c.rot})`,
              animation: `gnd-confetti-fall ${c.dur} ease-in ${c.delay} forwards`,
            }}
          />
        ))}
      </div>
      <span
        aria-hidden
        className="relative mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-accent text-[22px] font-extrabold text-accent"
      >
        ✓
      </span>
      <p className="relative mt-2 text-[19px] font-extrabold text-accent">참여 완료!</p>
      <p className="relative mt-0.5 text-[12.5px] text-muted">
        좋은 선택이에요! 함께라면 더 꾸준히 할 수 있어요
      </p>
      <p className="relative mt-0.5 truncate text-[12px] font-bold text-faint">
        {challengeName}
      </p>
    </div>
  );
}

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
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {/* 옆에 이름이 있으므로 alt는 비운다 — 안 그러면 두 번 읽는다 */}
                <UiIcon name={CATEGORY_ICON[detailCategoryOf(d.type)]} size={15} />
                <span className="truncate text-[13px] font-bold">{t.title}</span>
              </span>
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

  /*
    시안 ④의 **진행 예시** 카드 (2026-09-18 사용자 결정으로 추가).

    ⚠️⚠️ **실적이 아니다.** 여기는 목표를 세우는 자리라 이번 챌린지 기록이 아직
       없다. 채워진 칸은 `weekPreview`가 `주 N회 - 1`로 고정한 **예시**다.
       ⛔ 실제 세션 수를 끌어오지 마라 — 시트가 저장 전에 네트워크를 한 번 더
         때리게 되고, 그 조회가 늦으면 카드가 빈 채로 깜빡인다.
    그래서 제목을 `진행 예시`로 두고 `aria-hidden`으로 동그라미를 읽지 않게 한다 —
    스크린 리더에는 옆의 `2 / 3 완료`와 아래 한 줄이면 충분하다.
  */
  const preview = weekPreview(weeklyDays);
  const weekPreviewCard = (
    <section className="mt-4 rounded-card border border-line bg-surface-2 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-muted">
          <UiIcon name="finish" size={14} />
          진행 예시
        </span>
        <span className="text-[12px] font-extrabold">
          {preview.done} / {preview.target} 완료
        </span>
      </div>
      <ul aria-hidden className="mt-2.5 flex items-center justify-between gap-1">
        {preview.days.map((done, i) => (
          <li key={WEEK_LABELS[i]} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-extrabold ${
                done
                  ? "bg-accent text-accent-ink"
                  : "border border-line text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="text-[10.5px] text-faint">{WEEK_LABELS[i]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-center text-[11.5px] font-bold text-accent">
        {preview.caption}
      </p>
    </section>
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
        {justJoined && <JoinedBanner challengeName={challengeName} />}

        <GoalHero hero="basic" line1="오늘의 작은 목표가" line2="더 좋은 나를 만듭니다" />

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
                <UiIcon name={CATEGORY_ICON[c.key]} size={30} className="mb-1" />
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
        <GoalHero
          hero={category}
          line1={CATEGORY_HERO_LINES[category][0]}
          line2={CATEGORY_HERO_LINES[category][1]}
        />

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
      <GoalHero hero="review" line1="좋은 오늘이" line2="더 나은 내일을 만듭니다" />

      <button
        type="button"
        onClick={() => setStep("basic")}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-surface-2 px-3.5 py-3 text-left"
      >
        <UiIcon name="goal" size={20} className="self-start" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-bold text-muted">기본 목표</span>
          <span className="block text-[20px] font-extrabold">주 {weeklyDays}회 운동</span>
        </span>
        <span className="flex-none text-muted">›</span>
      </button>

      <p className="mt-4 flex items-center gap-1.5 text-[13px] font-extrabold">
        <UiIcon name="hub-routine" size={14} />
        세부 목표
      </p>
      {details.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted">세부 목표 없이도 참여할 수 있어요</p>
      ) : (
        detailList
      )}
      {!atMax && addDetailRow}
      {weekPreviewCard}
      {infoLines}
    </BottomSheet>
  );
}
