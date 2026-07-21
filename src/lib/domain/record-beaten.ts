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

/** 기록 갱신 비교 후보 (설계 2026-07-21) */
export type ComparableCandidate = {
  id: string;
  completedAt: Date;
  exerciseNames: string[];
  isTabata: boolean;
};

function sameComposition(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const name of setA) {
    if (!setB.has(name)) return false;
  }
  return true;
}

/**
 * 종목 구성이 똑같은 내 가장 최근 완료 세션. 구성이 같아야 총량 비교가
 * 공정하다(종목을 추가하면 볼륨은 당연히 늘어난다). 타바타는 세트 실적이
 * 0이라 비교 대상이 되면 판정을 무의미하게 만들므로 제외한다.
 */
export function findComparableSession(
  currentExerciseNames: string[],
  candidates: ComparableCandidate[],
): ComparableCandidate | null {
  if (currentExerciseNames.length === 0) return null;

  let best: ComparableCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.isTabata) continue;
    if (!sameComposition(currentExerciseNames, candidate.exerciseNames)) {
      continue;
    }
    // 완료 시각이 같으면 먼저 만난 후보를 쓴다 — 목록 순서에 의존하지 않도록 동작을 고정한다.
    if (
      best === null ||
      candidate.completedAt.getTime() > best.completedAt.getTime()
    ) {
      best = candidate;
    }
  }
  return best;
}
