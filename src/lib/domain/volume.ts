/**
 * 볼륨 도메인 순수 함수 (§16 volume.ts).
 * 완료(is_completed) 세트만 집계하고, 유형별로 분리한다 — 단위 혼합 금지 (§10).
 */

export type ExerciseType = "weight" | "bodyweight" | "cardio";

export type VolumeSet = {
  exerciseType: ExerciseType;
  isCompleted: boolean;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
};

export type VolumeSummary = {
  weightVolumeKg: number;
  bodyweightReps: number;
  cardioDistanceMeters: number;
  cardioDurationSeconds: number;
  completedSetCount: number;
};

/** 세트 하나의 kg 볼륨 — 완료된 웨이트 세트만 중량×횟수, 그 외 0 */
export function setVolumeKg(set: VolumeSet): number {
  if (!set.isCompleted || set.exerciseType !== "weight") return 0;
  return (set.weightKg ?? 0) * (set.reps ?? 0);
}

/** 완료 세트만, 유형별 분리 집계 */
export function summarizeVolume(sets: VolumeSet[]): VolumeSummary {
  const summary: VolumeSummary = {
    weightVolumeKg: 0,
    bodyweightReps: 0,
    cardioDistanceMeters: 0,
    cardioDurationSeconds: 0,
    completedSetCount: 0,
  };
  for (const set of sets) {
    if (!set.isCompleted) continue;
    summary.completedSetCount++;
    switch (set.exerciseType) {
      case "weight":
        summary.weightVolumeKg += setVolumeKg(set);
        break;
      case "bodyweight":
        summary.bodyweightReps += set.reps ?? 0;
        break;
      case "cardio":
        summary.cardioDistanceMeters += set.distanceMeters ?? 0;
        summary.cardioDurationSeconds += set.durationSeconds ?? 0;
        break;
    }
  }
  return summary;
}
