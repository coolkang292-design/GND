import type { ExerciseType } from "@/lib/types";

import { durationSecondsOf, formatDurationAmount } from "./set-timer";

/** 판정 입력 — 종목 하나의 완료 실적 (설계 2026-07-21) */
export type ComparableExercise = {
  name: string;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  sets: Array<{
    weightKg: number;
    reps: number;
    distanceKm: number;
    durationMin: number;
    durationSec?: number;
    isCompleted: boolean;
  }>;
};

function completedSets(exercise: ComparableExercise) {
  return exercise.sets.filter((set) => set.isCompleted);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 한글 마지막 글자에 받침이 있으면 "을", 아니면 "를". 비한글은 "를". */
function objectParticle(name: string): string {
  const last = name.trim().at(-1);
  if (!last) return "를";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/**
 * 종목 하나를 유형에 맞는 지표 하나로 환산한다. 완료 세트만 센다.
 * 유산소는 거리를 쓰되, 거리 기록이 없으면 시간을 쓴다.
 */
export function exerciseMetric(exercise: ComparableExercise): number {
  const sets = completedSets(exercise);
  if (exercise.exerciseType === "weight") {
    return sum(sets.map((set) => set.weightKg * set.reps));
  }
  /*
    ⚠️ **초로 잰다** (2026-08-28). `durationMin`으로 재던 시절엔 매달리기가
    30초에서 45초로 늘어도 둘 다 `0분`이라 **기록 갱신이 영영 안 잡혔다**.
  */
  if (exercise.exerciseType === "bodyweight") {
    return exercise.measure === "time"
      ? sum(sets.map(durationSecondsOf))
      : sum(sets.map((set) => set.reps));
  }
  const distance = sum(sets.map((set) => set.distanceKm));
  return distance > 0 ? distance : sum(sets.map(durationSecondsOf));
}

/**
 * 종목 하나가 직전보다 나아졌으면 사람 말 문구, 아니면 null.
 * 판정은 지표로 하고, 문구는 실제로 변한 항목으로 쓴다.
 */
export function exerciseImprovementNote(
  previous: ComparableExercise,
  current: ComparableExercise,
): string | null {
  const before = exerciseMetric(previous);
  const after = exerciseMetric(current);
  if (before <= 0 || after <= before) return null;

  const name = current.name;
  const particle = objectParticle(name);

  if (current.exerciseType === "weight") {
    const prevSets = completedSets(previous);
    const currSets = completedSets(current);

    const setDelta = currSets.length - prevSets.length;
    if (setDelta > 0) return `${name}${particle} ${setDelta}세트 더 하셨어요`;

    const prevTopWeight = Math.max(...prevSets.map((set) => set.weightKg), 0);
    const currTopWeight = Math.max(...currSets.map((set) => set.weightKg), 0);
    const weightDelta = currTopWeight - prevTopWeight;
    if (weightDelta > 0) {
      return `${name}${particle} ${trimNumber(weightDelta)}kg 더 무겁게 드셨어요`;
    }

    const repsDelta =
      sum(currSets.map((set) => set.reps)) - sum(prevSets.map((set) => set.reps));
    if (repsDelta > 0) return `${name}${particle} ${repsDelta}회 더 하셨어요`;

    return `${name} 볼륨이 ${trimNumber(after - before)}kg 늘었어요`;
  }

  if (current.exerciseType === "bodyweight") {
    // 지표가 초라서 문구도 초다 — `formatDurationAmount`가 60초를 넘으면
    // `1분 30초`로 읽어 준다.
    return current.measure === "time"
      ? `${name}${particle} ${formatDurationAmount(after - before)} 더 버텼어요`
      : `${name}${particle} ${trimNumber(after - before)}회 더 하셨어요`;
  }

  const usesDistance = sum(completedSets(current).map((set) => set.distanceKm)) > 0;
  return usesDistance
    ? `${name}${particle} ${trimNumber(after - before)}km 더 뛰었어요`
    // 거리를 안 적은 유산소는 지표가 **초**다 (2026-08-28) — `분`이라고 쓰면
    // 60초 더 뛴 것이 `60분 더 뛰었어요`가 된다.
    : `${name}${particle} ${formatDurationAmount(after - before)} 더 뛰었어요`;
}

/** 개선된 종목 하나 — 문구와 개선율(비율) */
export type ExerciseImprovement = {
  note: string;
  ratio: number;
};

/** record_note 컬럼과 RPC가 허용하는 최대 길이 (0021) */
const NOTE_MAX_LENGTH = 80;

/**
 * 개선된 종목들을 알림 1건짜리 문구로 묶는다. 대표는 개선율이 가장 큰
 * 종목이고, 동률이면 먼저 온 종목을 쓴다. 나머지는 "외 N종목 갱신".
 */
export function recordBeatenSummary(
  improvements: ExerciseImprovement[],
): string | null {
  if (improvements.length === 0) return null;

  let top = improvements[0];
  for (const improvement of improvements) {
    if (improvement.ratio > top.ratio) top = improvement;
  }

  const others = improvements.length - 1;
  const summary =
    others > 0 ? `${top.note} 외 ${others}종목 갱신` : top.note;

  return summary.length > NOTE_MAX_LENGTH
    ? summary.slice(0, NOTE_MAX_LENGTH)
    : summary;
}
