/**
 * **시간이 기록되는 종목**의 세트 시계 — 시작하면 세고, 마치면 그 값이 기록된다.
 *
 * 사장님 지시 (2026-08-28):
 * 1. *"기존 운동화면에서 시작 하면 운동시간이 카운팅되고 마침 하면 그 시간이
 *    기록이 되게"* — 매달리기·플랭크 같은 시간형 맨몸
 * 2. *"트레드밀이나 유산소 운동등 시간이 기록되는 운동에 모두 적용"*
 *
 * ## 대상은 "`시간` 칸이 있는 종목" 하나로 정해진다
 *
 * 유형을 나열하지 않는다. `amountFields()`가 `durationSec`를 주면 시계가 붙고,
 * 안 주면 안 붙는다. 웨이트(무게×횟수)와 횟수형 맨몸에는 시간 칸이 없어서
 * 저절로 빠진다 — 여기에 유형 분기를 다시 적으면 두 곳이 갈라진다.
 *
 * ## 왜 새 필드 `durationSec`인가
 *
 * DB는 **처음부터 초**다(`workout_sets.duration_seconds int`, 0004). 손실은
 * 클라이언트의 `LocalSet.durationMin`(분) 한 겹에서만 났다:
 *
 * - 매달리기 37초 → 스테퍼가 `step: 1`분이라 **입력 자체가 불가능**했다
 * - 러닝 32분 40초 → `32`분까지만 넣을 수 있어 40초가 사라졌다
 *
 * 이제 측정값은 초로 잡아 그대로 저장한다. **마이그레이션은 없다** — 이미
 * 저장된 기록은 전부 `분 × 60`이라 초로 읽으면 그대로 맞다.
 *
 * ⚠️ **`durationMin`을 지우지 마라.** 달력 계획·루틴·공식 프로그램 JSON이 그
 * 키를 쓰고 서버 RPC가 `?&`로 **존재를 검사**한다(0066·0069·0070·0073).
 * 계획 포맷을 초로 옮기는 것은 별도 작업이고, 그 사이는 `durationSecondsOf()`가
 * 잇는다.
 */

/**
 * 시간형 맨몸의 기본 목표 — 초.
 *
 * 예전엔 `RECOMMENDED_MINUTES = 1`이라 매달리기 기본값이 **1분**이었다. 웬만한
 * 사람이 못 버티는 시간이라 첫 화면부터 실패로 시작했다.
 *
 * ⚠️ **여기가 유일한 정의다.** `recommended-sets.ts`(추천 흐름)와 `workout.ts`의
 * `defaultSets()`(검색으로 담는 경로)가 둘 다 이 값을 쓴다 — 각자 숫자를 들고
 * 있으면 담는 경로에 따라 기본값이 달라진다.
 */
export const DEFAULT_HOLD_SECONDS = 30;

/** 세트 시계의 두 상태. `stopped`를 따로 두지 않는다 — 멈추면 값이 곧 기록이다 */
export type SetTimerPhase = "idle" | "running";

/**
 * 시작 시각으로부터 지금까지 흐른 초.
 *
 * ⚠️ **틱을 세지 않고 시각을 뺀다.** 브라우저는 백그라운드에서 타이머를 늦춘다 —
 * 이 저장소는 그 값을 이미 치렀다(`use-rest-countdown.ts` 주석: *"90초 휴식이
 * 5분이 됐다"*). 폰을 주머니에 넣고 뛰어도 초는 실제 시간대로 흐른다.
 *
 * ⚠️ **무동작 정지(`pausedSeconds`)를 빼지 않는다.** 세션 경과 시간
 * (`activeElapsedSeconds`)과 다른 점이고, 일부러 다르다. 매달리거나 뛰는 동안
 * 화면을 안 만지는 것이 **정상**이라 5분 무동작 정지가 걸리는데, 그걸 빼면
 * 진짜 30분 뛴 러닝이 5분으로 기록된다.
 */
export function setTimerSeconds(input: {
  startedAtMs: number | null;
  nowMs: number;
}): number {
  if (input.startedAtMs === null) return 0;
  return Math.max(0, Math.floor((input.nowMs - input.startedAtMs) / 1_000));
}

/**
 * 어디서 온 세트든 시간(초)은 **여기로만** 읽는다.
 *
 * 달력 계획·루틴·공식 프로그램은 아직 분(`durationMin`)으로 담긴다
 * (`parsePlanExercises`가 화이트리스트라 `durationSec`를 버린다). 이 함수가
 * 그 경계를 잇는다.
 *
 * ⚠️ 폴백을 빼지 마라. 빼면 계획으로 담아 온 `30분 러닝`이 운동 화면에서
 * `0초`로 뜬다.
 */
export function durationSecondsOf(set: {
  durationSec?: number;
  durationMin: number;
}): number {
  return set.durationSec ?? Math.round(set.durationMin * 60);
}

/**
 * 기록 표기 — `37초` · `1분 30초` · `30분` · `32분 40초`.
 *
 * ⚠️ **분이 딱 떨어지면 초를 붙이지 않는다.** 지금까지 저장된 시간은 전부
 * `분 × 60`이라 나머지가 0이다 — 그래서 **옛 기록의 표기는 하나도 안 바뀐다.**
 * `30분`이 `30분 0초`로 보이기 시작하면 그건 개악이다.
 *
 * 60초 미만은 분을 붙이지 않는다. 매달리기 대부분이 여기다.
 */
export function formatDurationAmount(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}초`;
  const min = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${min}분` : `${min}분 ${rest}초`;
}

/** `mm:ss` — 돌고 있는 시계의 큰 숫자. 한 시간을 넘으면 `h:mm:ss` */
export function formatSetClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * `±` 칩 문구 — 유산소는 `+5분`, 홀드는 `+30초`로 읽혀야 한다.
 *
 * 칩의 델타는 **언제나 초**다(필드가 초니까). 60의 배수면 분으로 말한다 —
 * `+300초`라고 쓰면 사람이 5분인지 세어야 한다.
 */
export function formatStepLabel(deltaSeconds: number): string {
  const sign = deltaSeconds > 0 ? "+" : "-";
  const abs = Math.abs(deltaSeconds);
  return abs % 60 === 0 ? `${sign}${abs / 60}분` : `${sign}${abs}초`;
}

/**
 * 목표에 닿았을 때 내는 비프의 길이 — 휴식 타이머의 마지막 1초 비프와 같다.
 * 새 소리를 만들지 않는다(`rest-countdown.ts`의 `LONG_BEEP_DURATION_SECONDS`).
 */
export const GOAL_BEEP_DURATION_SECONDS = 0.35;

/**
 * 목표 시간에 닿았는가 — 닿았으면 비프 1회 (사장님 결정 2026-08-28, B안).
 *
 * ## 왜 알리기만 하고 **멈추지 않는가**
 *
 * 자동 종료는 목표를 **상한**으로 만든다. 30초를 목표로 잡고 37초를 버텨도
 * 30초까지밖에 못 담아 **기록 갱신이 죽는다.** 러닝도 `30분 계획`에 32분을
 * 뛰면 32분이 맞다. 근력에서 목표는 하한이다.
 *
 * 그래서 소리로 **알리고 계속 센다.** 매달리는 동안에는 화면을 못 보므로
 * 소리가 유일한 채널이다.
 *
 * ⚠️ **한 세트에 한 번만 운다.** `alreadyPlayed`가 그 기억이다 — 없으면 목표를
 * 넘긴 뒤 매 초 울어서 시끄러운 게 아니라 **쓸 수 없는 기능**이 된다.
 *
 * ⚠️ 목표가 0이면 울지 않는다. 유산소를 계획 없이 담으면 `durationSec`가 0이라
 * 시작하자마자 조건이 성립한다.
 */
export function goalReachedBeep(input: {
  seconds: number;
  targetSeconds: number;
  alreadyPlayed: boolean;
}): { durationSeconds: number } | null {
  if (input.alreadyPlayed) return null;
  if (input.targetSeconds <= 0) return null;
  if (input.seconds < input.targetSeconds) return null;
  return { durationSeconds: GOAL_BEEP_DURATION_SECONDS };
}

/**
 * 시계를 멈췄을 때 **세트가 곧바로 끝나는가.**
 *
 * 홀드(시간형 맨몸)는 시간 말고 적을 것이 없다 — 그래서 `마침` 한 번이
 * 시간 확정이자 세트 완료다. 유산소는 **거리가 남는다.** 뛰면서 거리를 넣을 수
 * 없으므로 멈춘 뒤에 넣어야 하고, 정지가 곧 완료면 그 기회가 사라진다.
 *
 * 판정 근거는 유형이 아니라 **남은 입력 칸의 개수**다: 시간 말고 다른 칸이
 * 있으면 정지와 완료를 나눈다.
 */
export function stopFinishesSet(fieldCount: number): boolean {
  return fieldCount <= 1;
}
