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

/**
 * 지난 날짜의 계획인가 — 수정·삭제·이동이 모두 잠긴다 (사용자 지시 2026-10-07, 0116).
 *
 * 놓친 계획을 지우거나 미래로 옮기면 월간 완료율이 올라간다. 그래서 지난 계획은
 * 기록으로 남긴다. 오늘 계획은 그날이 끝날 때까지 고칠 수 있다.
 *
 * `!isPlanDateAllowed`와 다르다: 그쪽은 형식이 틀린 날짜도 false를 주므로
 * 뒤집으면 "형식 오류 = 지난 날짜"가 된다. 이쪽은 둘 다 올바른 날짜일 때만 참이다.
 * DB 트리거 `guard_past_workout_plan`이 같은 규칙의 최종 방어선이다.
 */
export function isPastPlanDate(dateKey: string, todayKey: string): boolean {
  return isValidDateKey(dateKey) && isValidDateKey(todayKey) && dateKey < todayKey;
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
      /*
        프로그램 운동은 반복을 처방 **하한**으로 미리 채운다 (2026-08-12).

        계획의 세트는 전부 `reps: 0`이라, 목표가 `8~10회`라고 적혀 있어도
        세트마다 숫자를 새로 넣어야 했다.

        ⚠️ 상한이 아니라 하한이다. 상한으로 채우면 못 채운 사람이 숫자를
           **내려야** 하고, 안 고치면 안 한 횟수가 기록된다. 하한은
           "최소한 이만큼"이라 더 한 사람만 올리면 된다.
        ⚠️ 계획에 이미 값이 있으면 덮지 않는다. 무게는 여기서 채우지 않는다 —
           그건 지난 기록이 정한다(`initialProgramLoad`).
      */
      reps:
        exercise.prescription && set.reps === 0
          ? exercise.prescription.repsMin
          : set.reps,
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

// ── 운동 탭 ↔ 오늘 계획 동기화 (사용자 결정 2026-10-05) ─────────────────────
//
// 신고: "달력에서 운동을 추가하면 운동 탭에서 안 보이고, 운동 탭에서 추가한 운동이
// 달력에서 안 보인다." 원인은 둘이 **다른 곳에 저장**돼 있던 것이다 — 운동 탭 목록은
// 이 폰의 localStorage(draft)에만, 달력은 DB의 `workout_plans`만 읽었다. 운동 탭은
// 계획을 화면을 열 때 한 번 **복사**해 올 뿐이라, 그 뒤로는 서로 몰랐다.
//
// 결정: 운동 탭 목록 = **오늘 계획 한 줄**. 운동 탭에서 담으면 그 계획에 쓰고
// (push), 운동 탭으로 돌아올 때 달력이 고친 것을 읽는다(pull).
//
// ⚠️ 두 판정 모두 **운동 중에는 아무것도 하지 않는다.** 진행 중인 세트 위에 계획을
//    덮으면 기록이 날아가고, 세트마다 계획을 고치면 계획이 기록이 된다.

/** 계획 한 줄에서 동기화가 보는 것만 — 도메인은 DB 타입을 모른다 */
export type SyncPlan = {
  id: string;
  planDate: string;
  updatedAt: string;
  tabataMinutes: number | null;
  exercises: PlanExercise[];
};

/**
 * 운동 탭 목록과 **마지막으로 맞춘** 계획의 표식.
 *
 * `updatedAt`은 "그 뒤에 누가 계획을 고쳤나"(pull), `json`은 "그 뒤에 내가 목록을
 * 고쳤나"(push)를 가른다. 둘 다 없으면(옛 draft) 목록을 믿고 한 번 써 올린다 —
 * 이 기능 전에 운동 탭에서 고친 것을 계획으로 덮으면 사용자 손으로 만든 것이 사라진다.
 */
export type PlanSyncMark = { planId: string; updatedAt: string; json: string };

type SyncDraft = {
  exercises: LocalExerciseInput[];
  scheduledPlanId: string | null;
  startedAtMs: number | null;
  tabataMinutes: number | null;
  suggestedForDayKey: string | null;
  program: unknown;
};

export function planExercisesKey(exercises: PlanExercise[]): string {
  return JSON.stringify(exercises);
}

export type PlanPush =
  | { kind: "none" }
  | { kind: "create"; exercises: PlanExercise[] }
  | { kind: "update"; planId: string; exercises: PlanExercise[] }
  | { kind: "delete"; planId: string };

/**
 * 운동 탭 목록을 계획에 **써야 하는가**.
 *
 * - 운동 중·인터벌이면 쓰지 않는다 (위 머리 주석)
 * - **기계가 담아 준 제안**(`suggestedForDayKey`)은 쓰지 않는다. 사용자가 고른 게
 *   아니다 — 앱을 열 때마다 달력에 계획이 생기게 된다. 한 종목이라도 손대면
 *   그 칸이 비워지므로 그때부터 쓴다.
 * - 묶인 계획이 없고 목록이 있으면 오늘 계획을 **만든다**
 * - 목록을 다 비우면 계획을 **지운다** — 운동 탭에서 다 뺐는데 달력에 남으면 그게
 *   바로 신고된 어긋남이다. 단 **프로그램 회차는 지우지 않는다.** 지우면 18회
 *   진행표에서 그 회차가 사라지고 되살릴 길이 없다.
 * - 목록이 있는데 계획 모양으로 못 바꾸면(값이 깨짐) 손대지 않는다 — 고장 난 값으로
 *   멀쩡한 계획을 덮지 않는다.
 */
export function decidePlanPush(
  draft: SyncDraft,
  mark: PlanSyncMark | null,
): PlanPush {
  if (draft.startedAtMs !== null || draft.tabataMinutes) return { kind: "none" };
  if (draft.suggestedForDayKey !== null) return { kind: "none" };
  const planId = draft.scheduledPlanId;
  const exercises = toPlanExercises(draft.exercises);
  if (!planId) {
    return exercises.length > 0 ? { kind: "create", exercises } : { kind: "none" };
  }
  if (draft.exercises.length === 0) {
    return draft.program ? { kind: "none" } : { kind: "delete", planId };
  }
  if (exercises.length === 0) return { kind: "none" };
  if (mark?.planId === planId && mark.json === planExercisesKey(exercises)) {
    return { kind: "none" };
  }
  return { kind: "update", planId, exercises };
}

export type PlanPull<P extends SyncPlan> =
  | { kind: "none" }
  /** 달력(또는 다른 기기)이 묶인 계획을 고쳤다 — 목록을 계획으로 바꾼다 */
  | { kind: "adopt"; plan: P }
  /**
   * 묶인 계획이 오늘 것이 아니게 됐다 — 목록을 비운다.
   * `deleted` 달력에서 지움 · `moved` 다른 날로 옮김 · `stale` 날이 바뀜(어제 계획).
   * `next`는 비운 뒤 대신 담을 오늘 계획(있으면).
   */
  | { kind: "clear"; reason: "deleted" | "moved" | "stale"; next: P | null }
  /** 빈 목록인데 오늘 계획이 있다 — 담는다 (예전 자동 담기와 같은 규칙) */
  | { kind: "load"; plan: P };

function todayCandidate<P extends SyncPlan>(todayPlans: P[]): P | undefined {
  // 인터벌이 아닌 것을 먼저 — 인터벌은 담지 않고 시작 버튼으로 연다
  return todayPlans.find((plan) => !plan.tabataMinutes) ?? todayPlans[0];
}

/**
 * 운동 탭을 열거나 **달력에서 돌아올 때** 계획을 읽어 목록을 어떻게 할지.
 *
 * `bound`는 `scheduledPlanId`로 찾은 계획이다(날짜와 무관하게 id로 찾는다 —
 * 옮겨진 것과 지워진 것을 가르려면). 못 찾았으면 null.
 */
export function decidePlanPull<P extends SyncPlan>(input: {
  draft: SyncDraft;
  todayKey: string;
  todayPlans: P[];
  bound: P | null;
  mark: PlanSyncMark | null;
}): PlanPull<P> {
  const { draft, todayKey, todayPlans, bound, mark } = input;
  if (draft.startedAtMs !== null || draft.tabataMinutes) return { kind: "none" };

  if (draft.scheduledPlanId) {
    if (!bound || bound.planDate !== todayKey) {
      const next = todayCandidate(
        todayPlans.filter((plan) => plan.id !== draft.scheduledPlanId),
      );
      return {
        kind: "clear",
        reason: !bound ? "deleted" : bound.planDate > todayKey ? "moved" : "stale",
        next:
          next &&
          shouldAutoLoadTodayPlan({
            plan: next,
            todayKey,
            draftExerciseCount: 0,
            draftScheduledPlanId: null,
            active: false,
          })
            ? next
            : null,
      };
    }
    if (mark?.planId === bound.id && mark.updatedAt !== bound.updatedAt) {
      return { kind: "adopt", plan: bound };
    }
    return { kind: "none" };
  }

  const plan = todayCandidate(todayPlans);
  return shouldAutoLoadTodayPlan({
    plan,
    todayKey,
    draftExerciseCount: draft.exercises.length,
    draftScheduledPlanId: null,
    active: false,
  })
    ? { kind: "load", plan: plan! }
    : { kind: "none" };
}
