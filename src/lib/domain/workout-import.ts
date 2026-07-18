import type { LocalExercise, LocalSet } from "@/lib/workout";

export type ImportMergeResult = {
  exercises: LocalExercise[];
  added: LocalExercise[];
  skippedCount: number;
};

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
