/**
 * 운동 일지 텍스트 포매터 — AI 코치에게 붙여넣기 위한 공유용 (2026-07-18 스펙).
 * 완료(done) 세트만 포함한다 — 볼륨 집계 원칙(§10)과 동일.
 */

import { formatSetAmount } from "./set-display";

export type LogSet = {
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
  done: boolean;
};

export type LogExercise = {
  name: string;
  exerciseType: "weight" | "bodyweight" | "cardio";
  measure: "reps" | "time" | null;
  sets: LogSet[];
};

/**
 * 수량 표기는 `formatSetAmount` 하나만 쓴다 (2026-08-04).
 *
 * 전에는 이 함수가 유형별 형식을 직접 갖고 있었다. 지난 기록 상세·계획 상세가
 * 같은 표기를 화면에 그려야 하는데, 규칙이 두 벌이 되면 공유 텍스트의 수치와
 * 화면의 수치가 갈라진다.
 */
function setLine(ex: LogExercise, s: LogSet, n: number): string {
  return `${n}세트: ${formatSetAmount({
    exerciseType: ex.exerciseType,
    measure: ex.measure,
    weightKg: s.weightKg,
    reps: s.reps,
    distanceKm: s.distanceKm,
    durationMin: s.durationMin,
  })}`;
}

/** dayKey(YYYY-MM-DD) 기준 하루치 일지. 완료 세트 없는 종목은 생략. */
export function formatWorkoutLog(
  dayKey: string,
  exercises: LogExercise[],
): string {
  const blocks = exercises
    .map((ex) => {
      const done = ex.sets.filter((s) => s.done);
      if (done.length === 0) return null;
      const lines = done.map((s, i) => setLine(ex, s, i + 1));
      return `${ex.name}\n${lines.join("\n")}`;
    })
    .filter((b): b is string => b !== null);

  const title = `${dayKey} 운동 일지`;
  return blocks.length > 0 ? `${title}\n\n${blocks.join("\n\n")}` : title;
}
