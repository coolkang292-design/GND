import type { LocalExercise } from "@/lib/workout";
import type { CatalogExercise } from "@/lib/types";

/** 타바타 구성 운동 수 (설계 2026-07-19, 사용자 확정) */
export const TABATA_EXERCISE_COUNT = 4;

/** 내장 타바타 음원 목록 — 추가는 여기 한 줄 (권리 확인된 사용자 제작 음원만) */
export const TABATA_TRACKS = [
  {
    id: "total-body-4min",
    title: "4분 전신 타바타",
    src: "/audio/tabata-4min-total-body.mp3",
  },
] as const;

/** 선택한 운동들을 각 1세트(미완료) 임시운동으로 변환 — 종료 시 완료 처리된다 */
export function tabataDraftExercises(
  picked: CatalogExercise[],
  makeKey: () => string,
): LocalExercise[] {
  return picked.map((item) => ({
    key: makeKey(),
    name: item.name,
    bodyPart: item.body_part,
    exerciseType: item.exercise_type,
    measure: item.measure,
    isCustom: item.is_custom,
    sets: [
      {
        key: makeKey(),
        weightKg: 0,
        reps: 0,
        distanceKm: 0,
        durationMin: 0,
        done: false,
      },
    ],
  }));
}
