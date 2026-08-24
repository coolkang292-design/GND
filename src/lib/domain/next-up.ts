import { formatSetAmount } from "./set-display";
import type { ExerciseType } from "@/lib/types";

/**
 * 휴식 중에 보여줄 **다음 진행 항목** (2026-08-04, 설계 ②).
 *
 * 기준은 "아직 완료하지 않은 첫 세트"다. 방금 한 세트를 완료해 휴식이 시작된
 * 참이므로, 남은 것 중 처음이 곧 다음이다. 목록 순서가 진행 순서이므로
 * 사용자가 중간 종목을 먼저 했더라도 순서상 앞의 미완료를 먼저 가리킨다
 * — 순서를 바꾸고 싶으면 종목 순서 이동 시트를 쓰는 게 이 앱의 방식이다.
 */
export type NextUpExercise = {
  name: string;
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  sets: {
    weightKg: number;
    reps: number;
    distanceKm: number;
    durationMin: number;
    done: boolean;
  }[];
};

export type NextUp = {
  exerciseName: string;
  /**
   * `exercises` 안에서의 위치 (2026-08-24).
   *
   * 이름만으로는 그 종목을 도로 찾을 수 없다 — 같은 이름을 두 번 담을 수 있다.
   * 휴식 화면이 **다음 세트의 지난 기록**을 보여주려면 종목 객체가 필요하고,
   * 화면이 "첫 미완료 종목"을 다시 계산하면 이 함수와 규칙이 두 벌로 갈라진다.
   */
  exerciseIndex: number;
  /** 그 종목 안에서의 세트 번호 (1부터) */
  setNumber: number;
  /** "60kg 8회" 같은 표기 — 기록·계획 상세와 같은 규칙 */
  amount: string;
};

/** 남은 세트가 하나도 없으면 null — 화면이 "다 했어요"를 말할 수 있어야 한다 */
export function nextUpSet(exercises: NextUpExercise[]): NextUp | null {
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
    const exercise = exercises[exerciseIndex];
    const index = exercise.sets.findIndex((set) => !set.done);
    if (index === -1) continue;

    const set = exercise.sets[index];
    return {
      exerciseName: exercise.name,
      exerciseIndex,
      setNumber: index + 1,
      amount: formatSetAmount({
        exerciseType: exercise.exerciseType,
        measure: exercise.measure,
        weightKg: set.weightKg,
        reps: set.reps,
        distanceKm: set.distanceKm,
        durationMin: set.durationMin,
      }),
    };
  }
  return null;
}
