import type { ExerciseType } from "@/lib/types";

/**
 * 세트 하나의 **수량 표기** — 지난 기록 상세(④)·계획 상세(⑥)·공유 텍스트가 공유한다.
 *
 * "n세트:" 같은 접두사는 붙이지 않는다. 화면은 세트 번호를 자기 자리에 따로
 * 그리고(`ExerciseCard`와 같은 배치), 공유 텍스트는 앞에 접두사를 붙여 쓴다.
 * 표기 규칙이 두 벌이 되면 화면과 공유 텍스트의 수치가 갈라진다.
 */
export type SetAmount = {
  exerciseType: ExerciseType;
  measure: "reps" | "time" | null;
  weightKg: number;
  reps: number;
  distanceKm: number;
  durationMin: number;
};

export function formatSetAmount(set: SetAmount): string {
  if (set.exerciseType === "weight") {
    return `${set.weightKg}kg ${set.reps}회`;
  }
  if (set.exerciseType === "bodyweight") {
    return set.measure === "time" ? `${set.durationMin}분` : `${set.reps}회`;
  }

  // 유산소: 0인 항목은 생략한다. 둘 다 0이면 빈 문자열 대신 "0분".
  const parts: string[] = [];
  if (set.distanceKm > 0) parts.push(`${set.distanceKm}km`);
  if (set.durationMin > 0) parts.push(`${set.durationMin}분`);
  if (parts.length === 0) parts.push("0분");
  return parts.join(" ");
}
