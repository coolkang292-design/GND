/**
 * 통합 운동 세션의 순서 계획.
 *
 * 과거 tabata_minutes 세션은 인터벌이 0~3번이라는 계약을 유지한다.
 * 자유 순서 세션은 블록의 시작 위치를 명시하고, 기존 저장 구조에 의존하지 않는다.
 * 이 파일은 순수 계획 함수만 제공하며 운영 DB나 챌린지 점수를 변경하지 않는다.
 */
export type WorkoutBlock =
  | { kind: "exercise"; key: string }
  | { kind: "interval"; keys: readonly [string, string, string, string] };

export type OrderedWorkoutPlan = {
  blocks: readonly WorkoutBlock[];
  intervalMinutes: 4 | 8 | 16 | null;
};

export function validateOrderedWorkoutPlan(plan: OrderedWorkoutPlan): string[] {
  const errors: string[] = [];
  const intervals = plan.blocks.filter((b) => b.kind === "interval");
  if (intervals.length > 1) errors.push("인터벌은 한 세션에 한 번만 추가할 수 있어요");
  if ((plan.intervalMinutes === null) !== (intervals.length === 0)) {
    errors.push("인터벌 시간과 운동 목록이 일치하지 않아요");
  }
  const keys = plan.blocks.flatMap((block) =>
    block.kind === "interval" ? [...block.keys] : [block.key],
  );
  if (keys.some((key) => !key.trim()) || new Set(keys).size !== keys.length) {
    errors.push("운동 기록 번호가 중복되거나 비어 있어요");
  }
  return errors;
}

export function intervalBlockStart(plan: OrderedWorkoutPlan): number | null {
  if (validateOrderedWorkoutPlan(plan).length) return null;
  let offset = 0;
  for (const block of plan.blocks) {
    if (block.kind === "interval") return offset;
    offset += 1;
  }
  return null;
}

export function orderedExerciseKeys(plan: OrderedWorkoutPlan): string[] {
  if (validateOrderedWorkoutPlan(plan).length) {
    throw new Error("invalid_ordered_workout_plan");
  }
  return plan.blocks.flatMap((block) =>
    block.kind === "interval" ? [...block.keys] : [block.key],
  );
}

/** 위치가 명시된 새 기록과, 0번부터 시작하는 과거 기록을 모두 판정한다. */
export function isOrderedIntervalExercise(input: {
  tabataMinutes: number | null | undefined;
  sortOrder: number | null | undefined;
  intervalStartOrder?: number | null;
}): boolean {
  if (input.tabataMinutes == null) return false;
  if (input.sortOrder == null) return true; // 불명확한 기록은 개인 최고기록 비교에서 제외
  const start = input.intervalStartOrder ?? 0;
  return input.sortOrder >= start && input.sortOrder < start + 4;
}

export function completeOrderedInterval<T extends { key: string; sets: readonly { done: boolean }[] }>(
  exercises: readonly T[],
  intervalKeys: readonly string[],
): T[] {
  const keys = new Set(intervalKeys);
  return exercises.map((exercise) =>
    keys.has(exercise.key)
      ? { ...exercise, sets: exercise.sets.map((set) => ({ ...set, done: true })) }
      : exercise,
  );
}
