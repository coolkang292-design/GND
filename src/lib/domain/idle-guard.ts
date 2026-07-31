import type { ExerciseType } from "@/lib/types";

/**
 * 무동작 감지 — 운동 시간 오남용 방지 (설계 2026-08-01).
 *
 * 앱만 켜 두고 운동하지 않은 시간이 운동 시간·XP로 잡히지 않게 한다.
 * 판정은 전부 **벽시계 기준**이다. 다른 앱을 쓰는 동안 브라우저가 타이머를
 * 늦춰도, 돌아온 그 자리에서 정확히 잡힌다.
 */

/** 이 시간 동안 아무 동작이 없으면 운동 시간 카운팅을 멈춘다 (사용자 확정: 5분) */
export const IDLE_LIMIT_SECONDS = 300;

/**
 * 아직 안 끝낸 유산소가 남아 있는가.
 *
 * 유산소는 뛰고 **나서** 거리·시간을 타이핑하는 구조라, 러닝 중에는 앱을 만질
 * 일이 없다. 세트가 하나도 없는 유산소 종목도 "아직 안 했다"로 본다.
 */
export function hasPendingCardio(
  exercises: readonly {
    exerciseType: ExerciseType;
    sets: readonly { done: boolean }[];
  }[],
): boolean {
  return exercises.some(
    (ex) =>
      ex.exerciseType === "cardio" &&
      (ex.sets.length === 0 || ex.sets.some((s) => !s.done)),
  );
}

/**
 * 이 세션에 무동작 감지를 적용할지.
 *
 * 유산소·타바타는 제외한다(사용자 요청). 웨이트나 맨몸이 **하나라도** 있으면
 * 적용한다 — 러닝머신 + 벤치프레스 같은 혼합 세션도 보호해야 한다.
 *
 * 단, **아직 안 끝낸 유산소가 있으면 끈다** (사용자 결정 2026-08-01). 러닝머신
 * 30분을 폰 없이 뛰면 5분 만에 정지가 걸려 실제로 뛴 25분이 운동 시간에서
 * 빠졌다. 유산소를 완료 체크하는 순간 다시 켜지므로, 유산소를 끝낸 뒤의
 * 무동작은 그대로 잡힌다.
 *
 * ⚠️ 대가: 유산소 종목을 담아 두기만 하고 완료하지 않으면 그 운동 내내 감지가
 * 꺼진다. 사용자가 이 절충을 알고 고른 것이다.
 */
export function shouldGuardIdle(input: {
  exercises: readonly {
    exerciseType: ExerciseType;
    sets: readonly { done: boolean }[];
  }[];
  isTabata: boolean;
}): boolean {
  if (input.isTabata) return false;
  if (hasPendingCardio(input.exercises)) return false;
  return input.exercises.some(
    (ex) => ex.exerciseType === "weight" || ex.exerciseType === "bodyweight",
  );
}

/**
 * 무동작 시계가 흐르기 시작하는 시각.
 *
 * 휴식 카운트다운이 도는 동안은 세지 않는다. 휴식을 10분으로 잡은 사용자에게
 * 오발동하면 안 되기 때문이다. 휴식 시작 자체가 동작(세트 완료 체크)이므로
 * "마지막 동작"과 "휴식 종료" 중 나중 것부터 센다.
 */
export function idleClockStartMs(
  lastActivityMs: number,
  lastRestEndsAtMs: number | null,
): number {
  if (lastRestEndsAtMs === null) return lastActivityMs;
  return Math.max(lastActivityMs, lastRestEndsAtMs);
}

/** 정지가 시작되는 시각 — 이 시각 이후는 운동 시간으로 인정하지 않는다 */
export function idlePauseStartMs(
  lastActivityMs: number,
  lastRestEndsAtMs: number | null,
): number {
  return (
    idleClockStartMs(lastActivityMs, lastRestEndsAtMs) +
    IDLE_LIMIT_SECONDS * 1_000
  );
}

export function isIdleTimedOut(input: {
  lastActivityMs: number;
  lastRestEndsAtMs: number | null;
  nowMs: number;
}): boolean {
  return (
    input.nowMs >=
    idlePauseStartMs(input.lastActivityMs, input.lastRestEndsAtMs)
  );
}

/**
 * 지금까지의 누적 정지 시간(초). 정지 중이면 진행 중인 구간까지 더한다.
 * 종료 시 서버로 보내는 값이자 화면 경과 시간에서 빼는 값이다.
 */
export function accumulatedPausedSeconds(input: {
  pausedSeconds: number;
  pausedAtMs: number | null;
  nowMs: number;
}): number {
  if (input.pausedAtMs === null) return input.pausedSeconds;
  return (
    input.pausedSeconds +
    Math.max(0, Math.floor((input.nowMs - input.pausedAtMs) / 1_000))
  );
}

/** 헤더에 보여줄 실제 운동 시간(초) — 정지 중에는 정지 시작 시점에 멈춰 있다 */
export function activeElapsedSeconds(input: {
  startedAtMs: number;
  nowMs: number;
  pausedSeconds: number;
  pausedAtMs: number | null;
}): number {
  const until = input.pausedAtMs ?? input.nowMs;
  return Math.max(
    0,
    Math.floor((until - input.startedAtMs) / 1_000) - input.pausedSeconds,
  );
}
