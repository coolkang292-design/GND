import type { ExerciseType } from "@/lib/types";

import { durationSecondsOf, formatDurationAmount } from "./set-timer";

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
  /** 시간 기록의 진실 (2026-08-28). 없으면 `durationMin * 60`으로 읽는다 */
  durationSec?: number;
};

export function formatSetAmount(set: SetAmount): string {
  if (set.exerciseType === "weight") {
    return `${set.weightKg}kg ${set.reps}회`;
  }
  /*
    ⚠️ **시간은 초로 읽는다** (2026-08-28). 예전엔 `${set.durationMin}분`이라
    매달리기 37초가 `0분`으로 찍혔다. `formatDurationAmount`는 분이 딱 떨어지면
    초를 안 붙이므로 **옛 기록의 표기(`30분`)는 그대로다**.
  */
  const seconds = durationSecondsOf(set);

  if (set.exerciseType === "bodyweight") {
    return set.measure === "time"
      ? formatDurationAmount(seconds)
      : `${set.reps}회`;
  }

  // 유산소: 0인 항목은 생략한다. 둘 다 0이면 빈 문자열 대신 "0분".
  const parts: string[] = [];
  if (set.distanceKm > 0) parts.push(`${set.distanceKm}km`);
  if (seconds > 0) parts.push(formatDurationAmount(seconds));
  if (parts.length === 0) parts.push("0분");
  return parts.join(" ");
}
