import type { BreakdownExercise } from "@/components/workout/set-breakdown";
import type { VolumeSummary } from "./volume";
import { durationSecondsOf, formatDurationAmount } from "./set-timer";

/**
 * 피드 카드의 숫자 줄과 운동 목록 표기 (2026-10-05 Performance Social 피드 시안).
 *
 * 시안: `52 MIN 운동 시간 · 18 SETS 전체 세트 · 6,840 KG 전체 볼륨` +
 * `1 벤치프레스 … 4세트 × 100kg ›`.
 *
 * ⚠️ **새 질의가 없다.** 재료는 피드가 이미 받는 `durationMinutes`·`volume`·`breakdown`이다.
 * ⚠️ **없는 값은 만들지 않는다.** 0인 칸은 빼고, 완료 세트가 없으면 그렇다고 적는다.
 * ⚠️ 볼륨·세트 수는 `summarizeVolume`(완료 세트만)이 이미 센 값을 그대로 쓴다 —
 *    여기서 다시 세면 기록 완료 화면과 피드가 다른 숫자를 말한다.
 */

export type FeedStatCell = {
  key: "time" | "sets" | "volume" | "reps" | "distance";
  icon: "clock" | "dumbbell" | "volume" | "repeat" | "shoe";
  value: string;
  unit: string;
  label: string;
};

function trimNumber(n: number): string {
  // 22.5 → "22.5", 100 → "100", 5.25 → "5.3"(거리)
  return Number.isInteger(n) ? n.toLocaleString() : (Math.round(n * 10) / 10).toString();
}

/**
 * 숫자 줄 — 최대 3칸. 0인 값은 칸을 만들지 않는다.
 * 세 번째 칸은 무게 볼륨이 있으면 kg, 없으면 맨몸 반복, 그것도 없으면 유산소 거리다.
 */
export function feedStatCells(input: {
  durationMinutes: number;
  volume: VolumeSummary;
}): FeedStatCell[] {
  const cells: FeedStatCell[] = [];
  if (input.durationMinutes > 0) {
    cells.push({
      key: "time",
      icon: "clock",
      value: input.durationMinutes.toLocaleString(),
      unit: "MIN",
      label: "운동 시간",
    });
  }
  if (input.volume.completedSetCount > 0) {
    cells.push({
      key: "sets",
      icon: "dumbbell",
      value: input.volume.completedSetCount.toLocaleString(),
      unit: "SETS",
      label: "전체 세트",
    });
  }
  if (input.volume.weightVolumeKg > 0) {
    cells.push({
      key: "volume",
      icon: "volume",
      value: Math.round(input.volume.weightVolumeKg).toLocaleString(),
      unit: "KG",
      label: "전체 볼륨",
    });
  } else if (input.volume.bodyweightReps > 0) {
    cells.push({
      key: "reps",
      icon: "repeat",
      value: input.volume.bodyweightReps.toLocaleString(),
      unit: "REPS",
      label: "전체 반복",
    });
  } else if (input.volume.cardioDistanceMeters > 0) {
    cells.push({
      key: "distance",
      icon: "shoe",
      value: trimNumber(input.volume.cardioDistanceMeters / 1000),
      unit: "KM",
      label: "전체 거리",
    });
  }
  return cells;
}

/**
 * 운동 한 줄의 오른쪽 요약 — `4세트 × 100kg`.
 *
 * - 완료한 세트만 센다(피드는 완료 기록이다. 미완료 세트는 상세를 펼치면 보인다)
 * - 무게·횟수가 세트마다 같으면 `×`, 다르면 `최고`·`총`으로 말한다 — 같지 않은 것을
 *   `×`로 적으면 거짓이 된다
 */
export function exerciseSetSummary(exercise: BreakdownExercise): string {
  const done = exercise.sets.filter((s) => s.done !== false);
  const n = done.length;
  if (n === 0) return "완료 세트 없음";

  if (exercise.exerciseType === "cardio") {
    const km = done.reduce((sum, s) => sum + s.distanceKm, 0);
    const seconds = done.reduce((sum, s) => sum + durationSecondsOf(s), 0);
    const parts: string[] = [];
    if (km > 0) parts.push(`${trimNumber(km)}km`);
    if (seconds > 0) parts.push(formatDurationAmount(seconds));
    return parts.length > 0 ? parts.join(" · ") : `${n}세트`;
  }

  if (exercise.exerciseType === "bodyweight" && exercise.measure === "time") {
    const seconds = done.reduce((sum, s) => sum + durationSecondsOf(s), 0);
    return seconds > 0 ? `${n}세트 · 총 ${formatDurationAmount(seconds)}` : `${n}세트`;
  }

  const weights = done.map((s) => s.weightKg);
  const maxWeight = Math.max(...weights);
  if (exercise.exerciseType === "weight" && maxWeight > 0) {
    return weights.every((w) => w === weights[0])
      ? `${n}세트 × ${trimNumber(maxWeight)}kg`
      : `${n}세트 · 최고 ${trimNumber(maxWeight)}kg`;
  }

  const reps = done.map((s) => s.reps);
  const total = reps.reduce((sum, r) => sum + r, 0);
  if (total === 0) return `${n}세트`;
  return reps.every((r) => r === reps[0])
    ? `${n}세트 × ${reps[0]}회`
    : `${n}세트 · 총 ${total}회`;
}
