import type { ExerciseType } from "@/lib/types";

import { amountFields, timedField } from "./set-input";

/**
 * 세트 시계를 **새로고침·앱 재시작 뒤에 되살린다** (2026-09-23).
 *
 * ## 왜
 *
 * 시계는 시작 시각만 들고 있어서 화면을 꺼도 시간이 맞다(`set-timer.ts`).
 * 그런데 그 시작 시각이 **React 상태에만** 있었다. 아이폰은 화면이 꺼진 채
 * 오래 두면 페이지를 버렸다가 다시 여는데, 그러면 30분 뛴 트레드밀의 시계가
 * `▶ 시작` 전으로 돌아가 잰 시간이 통째로 사라진다.
 *
 * ## 왜 draft에 넣지 않는가
 *
 * draft 버전을 올리면 승격 코드가 는다 — `minimized`·`spreadOffer`와 같은
 * 판단이다. 별도 키에 두고 **세션 id로 대조**한다. 지난 운동의 시계가 남아
 * 있어도 세션 id가 달라서 붙을 수 없다(끝내는 경로마다 지우는 방식은 한 곳을
 * 빠뜨리는 순간 새는데, 대조는 구조적으로 못 샌다).
 *
 * ## 왜 순번이 아니라 종목 key인가
 *
 * 화면의 시계 주인은 `보고 있는 종목 순번:세트 순번:진행 중`이고, 새로고침하면
 * 순번이 0으로 돌아간다. 순번으로 저장하면 종목 순서를 바꾼 뒤 엉뚱한 종목에
 * 붙는다. 그래서 key로 찾아 **순번을 되돌려 준다** — 화면은 그 순번으로
 * 초점을 옮겨야 시계가 보인다.
 */

/**
 * 이보다 오래된 시계는 되살리지 않는다 — 6시간.
 *
 * 저장하기 전에는 앱을 다시 켜는 순간 시계가 **우연히** 지워졌다. 이제는
 * 살아남으므로 `▶`를 누르고 잊은 채 다음 날 열면 "트레드밀 18시간"이 된다.
 * `±` 칩(최대 5분)으로 그걸 30분까지 깎으려면 200번을 눌러야 한다.
 * 이 앱에서 한 세트가 6시간을 넘는 운동은 없다.
 */
export const MAX_RESTORE_SECONDS = 6 * 60 * 60;

export type SavedSetTimer = {
  sessionId: string;
  exerciseKey: string;
  setIndex: number;
  startedAtMs: number;
  /** 시작할 때 굳힌 목표 초 — 화면의 `timer.targetSec`와 같은 값 */
  targetSec: number;
};

export type RestoredSetTimer = {
  exerciseIndex: number;
  setIndex: number;
  startedAtMs: number;
  targetSec: number;
  /**
   * 되살린 순간 이미 목표를 지났는가. 지났으면 **목표 비프를 낸 것으로 친다** —
   * 화면을 켰을 뿐인데 "삐"가 나면 목표 도달로 오해한다.
   */
  goalAlreadyPassed: boolean;
};

/**
 * 화면의 시계 주인 표기. `page.tsx`의 `timerFocusKey`와 복원이 **같은 함수**를
 * 써야 한다 — 모양이 한 글자라도 갈라지면 되살린 시계가 화면에 안 붙는다.
 */
export function setTimerFocusKey(
  exerciseIndex: number,
  setIndex: number,
  active: boolean,
): string {
  return `${exerciseIndex}:${setIndex}:${active}`;
}

export function restoreSetTimer(input: {
  saved: SavedSetTimer | null;
  sessionId: string | null;
  sessionActive: boolean;
  exercises: readonly {
    key: string;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
    sets: readonly { done: boolean }[];
  }[];
  nowMs: number;
}): RestoredSetTimer | null {
  const { saved } = input;
  if (!saved) return null;
  if (!input.sessionActive || input.sessionId === null) return null;
  if (saved.sessionId !== input.sessionId) return null;

  const exerciseIndex = input.exercises.findIndex(
    (ex) => ex.key === saved.exerciseKey,
  );
  if (exerciseIndex < 0) return null;
  const exercise = input.exercises[exerciseIndex];
  if (!timedField(amountFields(exercise.exerciseType, exercise.measure))) {
    return null;
  }
  const set = exercise.sets[saved.setIndex];
  if (!set || set.done) return null;

  const elapsedMs = input.nowMs - saved.startedAtMs;
  if (elapsedMs < 0) return null;
  if (elapsedMs > MAX_RESTORE_SECONDS * 1_000) return null;

  return {
    exerciseIndex,
    setIndex: saved.setIndex,
    startedAtMs: saved.startedAtMs,
    targetSec: saved.targetSec,
    goalAlreadyPassed:
      saved.targetSec > 0 && elapsedMs >= saved.targetSec * 1_000,
  };
}

/** 저장소에서 읽은 값 검사 — 모양이 틀리면 버린다(옛 버전·손상된 값) */
export function parseSavedSetTimer(raw: unknown): SavedSetTimer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  const isCount = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n) && n >= 0;
  const isTime = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (typeof v.sessionId !== "string" || v.sessionId === "") return null;
  if (typeof v.exerciseKey !== "string" || v.exerciseKey === "") return null;
  if (!isCount(v.setIndex)) return null;
  if (!isTime(v.startedAtMs) || !isTime(v.targetSec)) return null;
  return {
    sessionId: v.sessionId,
    exerciseKey: v.exerciseKey,
    setIndex: v.setIndex,
    startedAtMs: v.startedAtMs,
    targetSec: v.targetSec,
  };
}
