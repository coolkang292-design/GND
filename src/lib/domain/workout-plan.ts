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
  restSeconds: number;
  loadStepKg: 1 | 2.5 | 5;
};

export type PlanExercise = {
  name: string;
  bodyPart: BodyPart;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  isCustom: boolean;
  sets: PlanSet[];
  prescription?: ExercisePrescription;
};

/**
 * 예정표 세트를 기록용 임시 세트로 바꾼 모양.
 *
 * `effortFeedback`은 계획에는 없고 **하는 동안 생긴다**(0067). 여기서 null을
 * 명시하지 않으면 `LocalSet`과 모양이 갈려 예정표를 불러올 수 없다.
 */
export type DraftPlanSet = PlanSet & {
  key: string;
  done: boolean;
  effortFeedback: null;
};
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

function parseExercisePrescription(
  value: unknown,
): ExercisePrescription | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    !Number.isInteger(row.repsMin) ||
    !Number.isInteger(row.repsMax) ||
    typeof row.repsMin !== "number" ||
    typeof row.repsMax !== "number" ||
    row.repsMin < 1 ||
    row.repsMax > 100 ||
    row.repsMin > row.repsMax ||
    ![1, 2, 3].includes(row.targetRir as number) ||
    !Number.isInteger(row.restSeconds) ||
    typeof row.restSeconds !== "number" ||
    row.restSeconds < 60 ||
    row.restSeconds > 300 ||
    ![1, 2.5, 5].includes(row.loadStepKg as number)
  ) {
    return null;
  }
  return {
    repsMin: row.repsMin,
    repsMax: row.repsMax,
    targetRir: row.targetRir as 1 | 2 | 3,
    restSeconds: row.restSeconds,
    loadStepKg: row.loadStepKg as 1 | 2.5 | 5,
  };
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

    let prescription: ExercisePrescription | undefined;
    if (row.prescription !== undefined) {
      const parsedPrescription = parseExercisePrescription(row.prescription);
      if (!parsedPrescription) return [];
      prescription = parsedPrescription;
    }

    parsed.push({
      name: row.name.trim(),
      bodyPart: row.bodyPart as BodyPart,
      exerciseType: row.exerciseType as ExerciseType,
      measure: row.measure as "reps" | "time" | null,
      isCustom: row.isCustom,
      sets,
      ...(prescription ? { prescription } : {}),
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
      ...(exercise.prescription
        ? { prescription: { ...exercise.prescription } }
        : {}),
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
    ...(exercise.prescription
      ? { prescription: { ...exercise.prescription } }
      : {}),
    key: makeKey(),
    sets: exercise.sets.map((set) => ({
      ...set,
      key: makeKey(),
      done: false,
      effortFeedback: null,
    })),
  }));
}

/**
 * 기록 화면을 열 때 오늘 계획을 **미리 담을지** 판정한다 (사용자 지시 2026-08-12).
 *
 * 왜 필요한가: 계획을 짜 두고도 달력까지 들어가야 오늘 할 운동이 보였다.
 * 이미 정해 둔 것을 다시 찾아가게 하는 단계다.
 *
 * ⚠️ **사용자가 만든 상태를 절대 덮지 않는다.**
 * - 담아 둔 종목이 있으면 그대로 둔다
 * - 이미 예정표를 불러온 적이 있으면(`scheduledPlanId`) 다시 담지 않는다.
 *   불러온 뒤 종목을 지운 사람에게 화면을 열 때마다 되살려 주면 싸우게 된다
 * - 운동 중에는 손대지 않는다
 * - 전신 인터벌 계획은 시트로 열어야 음원·코스가 붙으므로 여기서 담지 않는다
 */
export function shouldAutoLoadTodayPlan(input: {
  plan: { planDate: string; tabataMinutes: number | null } | undefined;
  todayKey: string;
  draftExerciseCount: number;
  draftScheduledPlanId: string | null;
  active: boolean;
}): boolean {
  const { plan, todayKey, draftExerciseCount, draftScheduledPlanId, active } =
    input;
  if (!plan || plan.planDate !== todayKey) return false;
  if (plan.tabataMinutes) return false;
  if (active) return false;
  return draftExerciseCount === 0 && draftScheduledPlanId === null;
}
