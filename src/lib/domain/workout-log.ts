/**
 * 운동 일지 텍스트 포매터 — AI 코치에게 붙여넣기 위한 공유용 (2026-07-18 스펙).
 * 완료(done) 세트만 포함한다 — 볼륨 집계 원칙(§10)과 동일.
 */

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

function setLine(ex: LogExercise, s: LogSet, n: number): string {
  if (ex.exerciseType === "weight") {
    return `${n}세트: ${s.weightKg}kg ${s.reps}회`;
  }
  if (ex.exerciseType === "bodyweight") {
    return ex.measure === "time"
      ? `${n}세트: ${s.durationMin}분`
      : `${n}세트: ${s.reps}회`;
  }
  // cardio: 0인 항목은 생략, 둘 다 0이면 0분
  const parts: string[] = [];
  if (s.distanceKm > 0) parts.push(`${s.distanceKm}km`);
  if (s.durationMin > 0) parts.push(`${s.durationMin}분`);
  if (parts.length === 0) parts.push("0분");
  return `${n}세트: ${parts.join(" ")}`;
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
