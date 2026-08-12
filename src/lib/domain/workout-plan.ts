import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";

export type PlanSet = {
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
};

export type ExercisePrescription = {
  repsMin: number;
  repsMax: number;
  targetRir: 1 | 2 | 3;
  restSeconds: 60 | 75 | 90 | 120 | 150;
  loadStepKg: 1 | 2.5 | 5;
};

export type PlanExercise = {
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: PlanSet[];
};

export type DraftPlanSet = PlanSet & { key: string; done: boolean };
export type DraftPlanExercise = Omit<PlanExercise, "sets"> & {
  key: string;
  sets: DraftPlanSet[];
};

type LocalExerciseInput = Omit<PlanExercise, "sets"> & {
  key: string;
  sets: Array<PlanSet & { key: string; done: boolean }>;
};

const BODY_PARTS = new Set<BodyPart>([
  "가슴",
  "등",
  "하체",
  "어깨",
  "팔",
  "코어",
  "유산소",
]);
const EXERCISE_TYPES = new Set<ExerciseType>([
  "weight",
  "bodyweight",
  "cardio",
]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, date] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === date
  );
}

export function isPlanDateAllowed(dateKey: string, todayKey: string): boolean {
  return (
    isValidDateKey(dateKey) &&
    isValidDateKey(todayKey) &&
    dateKey >= todayKey
  );
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  if (!isValidDateKey(dateKey)) throw new Error("invalid_date_key");
  const [year, month, date] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** DB JSON은 신뢰하지 않고 화면에서 사용할 수 있는 최소 구조만 복원한다. */
export function parsePlanExercises(value: unknown): PlanExercise[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return [];

  const parsed: PlanExercise[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.name !== "string" ||
      row.name.trim().length === 0 ||
      row.name.length > 40 ||
      !BODY_PARTS.has(row.bodyPart as BodyPart) ||
      !EXERCISE_TYPES.has(row.exerciseType as ExerciseType) ||
      ![null, "reps", "time"].includes(row.measure as null | string) ||
      typeof row.isCustom !== "boolean" ||
      !Array.isArray(row.sets) ||
      row.sets.length === 0 ||
      row.sets.length > 30
    ) {
      return [];
    }

    const sets: PlanSet[] = [];
    for (const itemSet of row.sets) {
      if (!itemSet || typeof itemSet !== "object") return [];
      const set = itemSet as Record<string, unknown>;
      if (
        !nonNegativeNumber(set.weightKg) ||
        !nonNegativeNumber(set.reps) ||
        !nonNegativeNumber(set.distanceKm) ||
        !nonNegativeNumber(set.durationMin)
      ) {
        return [];
      }
      sets.push({
        weightKg: set.weightKg,
        reps: set.reps,
        distanceKm: set.distanceKm,
        durationMin: set.durationMin,
      });
    }

    parsed.push({
      name: row.name.trim(),
      bodyPart: row.bodyPart as BodyPart,
      exerciseType: row.exerciseType as ExerciseType,
      measure: row.measure as "reps" | "time" | null,
      isCustom: row.isCustom,
      sets,
    });
  }
  return parsed;
}

/** 카탈로그 다중 선택 → 새 계획 운동 (0값 세트 1개 — 기록 탭 "운동 추가"와 동일 기본값) */
export function newPlanExercises(catalog: CatalogExercise[]): PlanExercise[] {
  return catalog.map((item) => ({
    name: item.name,
    bodyPart: item.body_part,
    exerciseType: item.exercise_type,
    measure: item.measure,
    isCustom: item.is_custom,
    sets: [{ weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0 }],
  }));
}

export function toPlanExercises(exercises: LocalExerciseInput[]): PlanExercise[] {
  return parsePlanExercises(
    exercises.map((exercise) => ({
      name: exercise.name,
      bodyPart: exercise.bodyPart,
      exerciseType: exercise.exerciseType,
      measure: exercise.measure,
      isCustom: exercise.isCustom,
      sets: exercise.sets.map((set) => ({
        weightKg: set.weightKg,
        reps: set.reps,
        distanceKm: set.distanceKm,
        durationMin: set.durationMin,
      })),
    })),
  );
}

export function toDraftExercises(
  exercises: PlanExercise[],
  makeKey: () => string,
): DraftPlanExercise[] {
  return exercises.map((exercise) => ({
    ...exercise,
    key: makeKey(),
    sets: exercise.sets.map((set) => ({
      ...set,
      key: makeKey(),
      done: false,
    })),
  }));
}
