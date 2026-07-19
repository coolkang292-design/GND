import type { ExerciseType } from "@/lib/types";

/** 기록 갱신 판정용 유형별 완료 합계 (설계 2026-07-19) */
export type EffortTotals = {
  weightVolumeKg: number;
  bodyweightReps: number;
  bodyweightTimeMin: number;
  cardioDistanceKm: number;
  cardioTimeMin: number;
};

type EffortExercise = {
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  sets: Array<{
    weightKg: number;
    reps: number;
    distanceKm: number;
    durationMin: number;
    isCompleted: boolean;
  }>;
};

export function effortTotals(exercises: EffortExercise[]): EffortTotals {
  const totals: EffortTotals = {
    weightVolumeKg: 0,
    bodyweightReps: 0,
    bodyweightTimeMin: 0,
    cardioDistanceKm: 0,
    cardioTimeMin: 0,
  };

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.isCompleted) continue;
      if (exercise.exerciseType === "weight") {
        totals.weightVolumeKg += set.weightKg * set.reps;
      } else if (exercise.exerciseType === "bodyweight") {
        if (exercise.measure === "time") {
          totals.bodyweightTimeMin += set.durationMin;
        } else {
          totals.bodyweightReps += set.reps;
        }
      } else {
        totals.cardioDistanceKm += set.distanceKm;
        totals.cardioTimeMin += set.durationMin;
      }
    }
  }
  return totals;
}

function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// 우선순위 순서 — 첫 번째로 초과한 지표의 문구를 쓴다.
const METRICS: Array<{
  key: keyof EffortTotals;
  format: (delta: number) => string;
}> = [
  { key: "weightVolumeKg", format: (d) => `볼륨 +${trimNumber(d)}kg` },
  { key: "bodyweightReps", format: (d) => `횟수 +${trimNumber(d)}회` },
  { key: "bodyweightTimeMin", format: (d) => `맨몸 시간 +${trimNumber(d)}분` },
  { key: "cardioDistanceKm", format: (d) => `거리 +${trimNumber(d)}km` },
  { key: "cardioTimeMin", format: (d) => `유산소 +${trimNumber(d)}분` },
];

/**
 * 원본 대비 갱신 문구. 원본에 실적이 있던 지표만 비교하고(새 종목 추가는
 * 갱신 아님), 아무 지표도 넘지 못하면 null.
 */
export function recordBeatenNote(
  previous: EffortTotals,
  current: EffortTotals,
): string | null {
  for (const metric of METRICS) {
    const prev = previous[metric.key];
    if (prev <= 0) continue;
    const delta = current[metric.key] - prev;
    if (delta > 0) return metric.format(delta);
  }
  return null;
}
