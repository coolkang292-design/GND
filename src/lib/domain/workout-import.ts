import type { LocalExercise, LocalSet } from "@/lib/workout";

export type ImportMergeResult = {
  exercises: LocalExercise[];
  added: LocalExercise[];
  skippedCount: number;
};

/** 지난 기록 조회 결과에서 완료 여부·순서 판정에 필요한 최소 형태 */
export type RecordedSetRow = {
  set_number: number;
  is_completed: boolean;
};

/**
 * 실제로 **완료 체크한 세트만** 세트 번호 순으로 (2026-08-01).
 *
 * 완료 세션이라도 체크하지 않은 세트가 남아 있다 — 계획만 하고 하지 않은 세트다.
 * 예전에는 이것까지 복사해서 '이전 기록 불러오기'가 기록이 아니라 계획을
 * 불러오는 것처럼 보였다.
 */
export function completedSetsInOrder<T extends RecordedSetRow>(
  rows: readonly T[],
): T[] {
  return rows
    .filter((row) => row.is_completed)
    .sort((a, b) => a.set_number - b.set_number);
}

/**
 * 완료 세트가 하나라도 있는 종목만. 완료 세트가 없는 종목은 그날 하지 않은
 * 운동이므로 목록에서 통째로 뺀다.
 */
export function withCompletedSetsOnly<T extends RecordedSetRow, E>(
  exercises: readonly { exercise: E; sets: readonly T[] }[],
): { exercise: E; sets: T[] }[] {
  return exercises
    .map((item) => ({
      exercise: item.exercise,
      sets: completedSetsInOrder(item.sets),
    }))
    .filter((item) => item.sets.length > 0);
}

export function replaceWithLastRecordedSets(
  exercise: LocalExercise,
  recordedSets: LocalSet[],
): LocalExercise {
  return {
    ...exercise,
    sets: recordedSets.map((set) => ({ ...set, done: false })),
  };
}

export function applyLastRecordedSetsToExercises({
  active,
  exercises,
  targetKey,
  recordedSets,
}: {
  active: boolean;
  exercises: LocalExercise[];
  targetKey: string;
  recordedSets: LocalSet[];
}): { exercises: LocalExercise[]; loaded: LocalExercise | null } {
  if (active) return { exercises, loaded: null };

  const target = exercises.find((exercise) => exercise.key === targetKey);
  if (!target) return { exercises, loaded: null };

  const loaded = replaceWithLastRecordedSets(target, recordedSets);
  return {
    exercises: exercises.map((exercise) =>
      exercise.key === targetKey ? loaded : exercise,
    ),
    loaded,
  };
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase("ko-KR");
}

/** 기존 준비 목록을 유지하면서 이름이 겹치지 않는 지난 운동만 뒤에 붙인다. */
export function mergeImportedExercises(
  current: LocalExercise[],
  imported: LocalExercise[],
): ImportMergeResult {
  const knownNames = new Set(current.map((item) => normalizedName(item.name)));
  const added: LocalExercise[] = [];

  for (const item of imported) {
    const name = normalizedName(item.name);
    if (!name || knownNames.has(name)) continue;
    knownNames.add(name);
    added.push(item);
  }

  return {
    exercises: [...current, ...added],
    added,
    skippedCount: imported.length - added.length,
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function lastSet(exercise: LocalExercise): LocalSet | undefined {
  return exercise.sets.at(-1);
}

/** 불러온 기록의 첫 번째 측정 가능한 종목으로 무리하지 않는 한 단계 제안을 만든다. */
export function buildEffortMessage(exercises: LocalExercise[]): string {
  for (const exercise of exercises) {
    const set = lastSet(exercise);
    if (!set) continue;

    if (exercise.exerciseType === "weight" && set.weightKg > 0 && set.reps > 0) {
      return `${exercise.name} 마지막 세트가 ${formatNumber(set.weightKg)}kg × ${set.reps}회였어요. 컨디션 괜찮으면 이번에는 1회만 더 들어봐요.`;
    }

    if (
      exercise.exerciseType === "bodyweight" &&
      exercise.measure === "reps" &&
      set.reps > 0
    ) {
      return `${exercise.name} 마지막 세트에서 ${set.reps}회 했어요. 컨디션 괜찮으면 오늘은 1회만 더 도전해봐요.`;
    }

    if (
      exercise.exerciseType === "bodyweight" &&
      exercise.measure === "time" &&
      set.durationMin > 0
    ) {
      return `${exercise.name}를 지난번에는 ${formatNumber(set.durationMin)}분 했어요. 컨디션 괜찮으면 오늘은 1분만 더 버텨봐요.`;
    }

    if (exercise.exerciseType === "cardio" && set.distanceKm > 0) {
      return `${exercise.name}을 지난번에는 ${formatNumber(set.distanceKm)}km 했어요. 컨디션 괜찮으면 오늘은 0.1km만 더 가봐요.`;
    }

    if (exercise.exerciseType === "cardio" && set.durationMin > 0) {
      return `${exercise.name}을 지난번에는 ${formatNumber(set.durationMin)}분 했어요. 컨디션 괜찮으면 오늘은 1분만 더 해봐요.`;
    }
  }

  return "지난번 루틴을 불러왔어요. 컨디션 괜찮으면 오늘은 마지막 세트에서 1회만 더 도전해봐요.";
}
