/**
 * 예상 점수용 운동시간 추정 — 웨이트·맨몸 시간까지 (이슈 #33 TASK-06, 2026-11-28).
 *
 * 예전(`plan-minutes.ts`)에는 계획에서 **확실히 아는 시간**(인터벌 코스·유산소 입력값)만 넣고
 * 웨이트·맨몸은 "시간 점수 별도"로 뺐다. 그래서 웨이트 위주 계획의 예상 점수가 늘 실제보다 낮았다.
 *
 * 웨이트 시간은 이 순서로 정한다 (앞의 것이 있으면 그것을 쓴다):
 * 1. `same-routine` 최근 **같은 종목 구성**으로 끝낸 운동의 실제 웨이트 시간 (세트 수가 다르면 비율로 맞춘다)
 * 2. `similar` 최근 운동들의 **세트당 실제 시간**(중앙값) × 이번 세트 수
 * 3. `default` 세트당 (운동 40초 + 휴식 설정) × 이번 세트 수
 *
 * 지난 운동의 총시간에서 유산소·인터벌 시간을 **빼고** 웨이트 몫만 쓴다 — 이번 계획의 유산소·인터벌은
 * 따로 더하므로, 빼지 않으면 같은 시간이 두 번 들어간다.
 *
 * ⚠️ 새 점수 산식이 아니다. 여기서 나온 분(分)을 기존 계산기(`forecastWorkout`)에 `durationMinutes`로
 *    넘길 뿐이다. 실제 점수는 운동을 마친 뒤 서버가 잰 시간으로 정해진다.
 */
import { estimatePlanMinutes } from "./plan-minutes";
import { normalizedExerciseName } from "./workout-import";
import { isIntervalBlockIndex } from "./tabata";

export type StrengthBasis = "same-routine" | "similar" | "default";

/** 세트 하나의 운동 시간 가정(초) — 휴식은 따로 더한다 */
export const WORK_SECONDS_PER_SET = 40;
/** 세트당 시간이 이 범위를 벗어나는 지난 기록은 믿지 않는다 (앱을 켜 둔 채 잊은 운동 등) */
const MIN_MINUTES_PER_SET = 0.75;
const MAX_MINUTES_PER_SET = 8;
/** 세트당 시간을 볼 최근 운동 수 */
const RECENT_SESSIONS = 10;

type SetLike = { durationSeconds: number | null; isCompleted?: boolean };
type ExerciseLike = {
  exerciseType: "weight" | "bodyweight" | "cardio";
  exerciseName: string;
  sets: readonly SetLike[];
};

/** 지난 운동 한 번 — `PeriodSessionRow`와 같은 모양(필요한 칸만) */
export type HistorySession = {
  completedAt: string;
  durationMinutes?: number | null;
  tabataMinutes?: number | null;
  exercises: readonly ExerciseLike[];
};

export type StrengthEstimate = {
  minutes: number;
  basis: StrengthBasis;
  sets: number;
};

export type WorkoutMinutesEstimate = {
  /** 점수에 넣을 전체 예상 시간(분) = 인터벌 + 유산소 + 웨이트 추정 */
  totalMinutes: number;
  intervalMinutes: number;
  cardioMinutes: number;
  /** 웨이트·맨몸 추정. 웨이트·맨몸이 없으면 null */
  strength: StrengthEstimate | null;
};

const nonNegative = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 웨이트·맨몸 세트 수와 종목 이름 (인터벌 블록·유산소 제외) */
function strengthPart(
  exercises: readonly ExerciseLike[],
  tabataMinutes: number | null | undefined,
  intervalStartIndex?: number | null,
): { names: string[]; sets: number } {
  const names: string[] = [];
  let sets = 0;
  exercises.forEach((exercise, index) => {
    if (isIntervalBlockIndex(tabataMinutes, index, intervalStartIndex)) return;
    if (exercise.exerciseType === "cardio") return;
    // 완료 표시가 있는 기록이면 끝낸 세트만, 계획이면(표시 없음) 전부 센다
    const counted = exercise.sets.filter((set) => set.isCompleted !== false).length;
    if (counted === 0) return;
    names.push(normalizedExerciseName(exercise.exerciseName));
    sets += counted;
  });
  return { names: [...new Set(names)].sort(), sets };
}

/** 지난 운동의 **웨이트 몫** 시간 — 총시간에서 유산소·인터벌을 뺀다. 알 수 없으면 null */
function strengthMinutesOf(session: HistorySession): number | null {
  const total = nonNegative(session.durationMinutes);
  if (total <= 0) return null;
  const cardio =
    session.exercises
      .filter((exercise) => exercise.exerciseType === "cardio")
      .reduce(
        (sum, exercise) =>
          sum +
          exercise.sets
            .filter((set) => set.isCompleted !== false)
            .reduce((s, set) => s + nonNegative(set.durationSeconds), 0),
        0,
      ) / 60;
  const rest = total - cardio - nonNegative(session.tabataMinutes);
  return rest > 0 ? rest : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 웨이트·맨몸 시간 추정. 웨이트·맨몸 세트가 없으면 null */
export function estimateStrengthMinutes(input: {
  exercises: readonly ExerciseLike[];
  tabataMinutes?: number | null;
  intervalStartIndex?: number | null;
  history: readonly HistorySession[];
  restSeconds: number;
}): StrengthEstimate | null {
  const planned = strengthPart(input.exercises, input.tabataMinutes, input.intervalStartIndex);
  if (planned.sets === 0) return null;
  const key = planned.names.join("|");
  const recent = [...input.history]
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .map((session) => {
      // 지난 세션의 인터벌 블록 위치는 알 수 없다(행에 없음) — 0번부터로 본다(`withoutIntervalBlock`과 같다)
      const part = strengthPart(session.exercises, session.tabataMinutes);
      const minutes = strengthMinutesOf(session);
      return { part, minutes };
    })
    .filter(
      (item): item is { part: { names: string[]; sets: number }; minutes: number } =>
        item.minutes !== null &&
        item.part.sets > 0 &&
        item.minutes / item.part.sets >= MIN_MINUTES_PER_SET &&
        item.minutes / item.part.sets <= MAX_MINUTES_PER_SET,
    );

  // 1. 같은 종목 구성
  const same = recent.find((item) => item.part.names.join("|") === key);
  if (same) {
    return {
      minutes: round1((same.minutes * planned.sets) / same.part.sets),
      basis: "same-routine",
      sets: planned.sets,
    };
  }
  // 2. 최근 운동들의 세트당 시간
  const perSet = recent.slice(0, RECENT_SESSIONS).map((item) => item.minutes / item.part.sets);
  if (perSet.length > 0) {
    return { minutes: round1(median(perSet) * planned.sets), basis: "similar", sets: planned.sets };
  }
  // 3. 세트당 (운동 + 휴식)
  const perSetDefault = (WORK_SECONDS_PER_SET + nonNegative(input.restSeconds)) / 60;
  return { minutes: round1(perSetDefault * planned.sets), basis: "default", sets: planned.sets };
}

/** 계획 하나의 예상 운동시간 — 인터벌 코스 + 유산소 입력값 + 웨이트 추정 */
export function estimateWorkoutMinutes(input: {
  exercises: readonly ExerciseLike[];
  tabataMinutes?: number | null;
  intervalStartIndex?: number | null;
  history: readonly HistorySession[];
  restSeconds: number;
}): WorkoutMinutesEstimate {
  const known = estimatePlanMinutes(input.tabataMinutes, input.exercises, input.intervalStartIndex);
  const intervalMinutes = nonNegative(input.tabataMinutes);
  const cardioMinutes = round1(Math.max(0, known.minutes - intervalMinutes));
  const strength = estimateStrengthMinutes(input);
  return {
    totalMinutes: round1(intervalMinutes + cardioMinutes + (strength?.minutes ?? 0)),
    intervalMinutes,
    cardioMinutes,
    strength,
  };
}

/** 화면 문구 — "웨이트 약 30분 · 유산소 60분 · 인터벌 4분" */
export function minutesBreakdownLabel(estimate: {
  intervalMinutes: number;
  cardioMinutes: number;
  strengthMinutes: number;
}): string | null {
  const parts: string[] = [];
  if (estimate.strengthMinutes > 0) parts.push(`웨이트 약 ${Math.round(estimate.strengthMinutes)}분`);
  if (estimate.cardioMinutes > 0) parts.push(`유산소 ${Math.round(estimate.cardioMinutes)}분`);
  if (estimate.intervalMinutes > 0) parts.push(`인터벌 ${Math.round(estimate.intervalMinutes)}분`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 추정 근거 안내 (TASK-06 "추정 근거 및 불확실성 안내") */
export function strengthBasisNotice(basis: StrengthBasis | null): string | null {
  if (basis === "same-routine") {
    return "웨이트 운동시간은 최근 같은 구성으로 운동한 기록을 기반으로 추정했어요. 실제 점수는 운동 완료 후 확정돼요.";
  }
  if (basis === "similar") {
    return "웨이트 운동시간은 최근 운동의 세트당 시간을 기반으로 추정했어요. 실제 점수는 운동 완료 후 확정돼요.";
  }
  if (basis === "default") {
    return "최근 기록이 없어 웨이트 운동시간은 세트당 운동 40초와 휴식 시간으로 어림했어요. 실제 점수는 운동 완료 후 확정돼요.";
  }
  return null;
}
