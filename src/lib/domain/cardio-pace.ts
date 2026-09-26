import type { ExerciseType } from "@/lib/types";

/**
 * 러닝 페이스 — **잰 시간 ÷ 넣은 거리** (2026-09-23).
 *
 * 트레드밀은 GPS로 잴 수 없다(몸이 제자리다). 거리의 가장 정확한 출처는
 * 트레드밀 계기판이고, 시간은 세트 시계가 잰다. 둘을 나누면 된다 — 새 저장
 * 칸도, 마이그레이션도 없다. 옛 기록에도 거리만 있으면 그대로 붙는다.
 *
 * ⚠️ **`formatSetAmount`에 넣지 않는다.** 그 함수는 "다음 세트" 안내(아직 안 한
 *    계획값)와 공유 텍스트에도 쓰인다 — 거기 넣으면 계획의 페이스까지 찍힌다.
 */

/** 이보다 빠르면 오타다 — 1km 2분(시속 30km). 세계 기록도 여기 못 미친다 */
export const MIN_PACE_SECONDS = 120;
/** 이보다 느리면 오타다 — 1km 60분(시속 1km) */
export const MAX_PACE_SECONDS = 3_600;

/**
 * 1km당 초. 값이 없거나 **사람이 낼 수 없는 페이스면 `null`** 이다.
 *
 * 5.0을 50으로 치면 `0'36"/km`가 피드에 뜬다. 친구들이 보는 자리라,
 * 틀린 숫자를 보여 주느니 안 보여 준다.
 */
export function paceSecondsPerKm(input: {
  durationSec: number;
  distanceKm: number;
}): number | null {
  if (!(input.durationSec > 0) || !(input.distanceKm > 0)) return null;
  const pace = Math.round(input.durationSec / input.distanceKm);
  if (pace < MIN_PACE_SECONDS || pace > MAX_PACE_SECONDS) return null;
  return pace;
}

/** `6'17"/km` — 러너가 읽는 모양 */
export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${min}'${sec}"/km`;
}

/**
 * 1km당 시간으로 읽는 종목 — 러닝·트레드밀·걷기, 그리고 이름이 그런 직접 만든 종목.
 *
 * ⚠️ **유산소 전체가 아니다.** 사이클은 시속(km/h), 로잉은 500m당 시간을 쓴다.
 *    분/km를 붙이면 틀린 정보가 친구 피드에 나간다. 줄넘기는 거리가 없다.
 *    그 단위들은 아직 지원하지 않고, **틀리게 보여 주는 대신 숨긴다.**
 */
const PACE_NAME_PATTERN = /러닝|런닝|트레드밀|조깅|달리기|걷기|워킹|마라톤/;

export function isPaceExercise(input: {
  name: string;
  exerciseType: ExerciseType;
}): boolean {
  if (input.exerciseType !== "cardio") return false;
  return PACE_NAME_PATTERN.test(input.name);
}

/** 화면이 부르는 한 줄 — 보여 줄 것이 없으면 `null` */
export function cardioPaceLabel(input: {
  name: string;
  exerciseType: ExerciseType;
  durationSec: number;
  distanceKm: number;
}): string | null {
  if (!isPaceExercise(input)) return null;
  const pace = paceSecondsPerKm(input);
  return pace === null ? null : formatPace(pace);
}
