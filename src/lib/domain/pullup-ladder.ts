/**
 * 풀업 사다리 — 파벨 차졸린 러시안 파이터 풀업 루틴의 횟수 계산
 * (사장님 제공 이미지, 2026-09-03 · 프로그램화 2026-09-04).
 *
 * ⚠️⚠️ **출처 원문. 바꾸지 마라 — 바꾸는 순간 앱이 다른 것을 처방한다.**
 *
 *   "파벨 차졸린의 러시안 파이터 풀업 루틴은 실패 지점까지 근육을 쥐어짜는
 *    대신, 지치지 않는 선에서 자주 수행해 신경계를 적응시키는 방식입니다.
 *    최대 5개가 가능한 사람 기준으로 하루 5세트를 나누어 5, 4, 3, 2, 1회로
 *    시작합니다. 매일 뒤쪽 세트부터 1회씩 늘려 나가는 것이 핵심으로, 둘째
 *    날은 5, 4, 3, 2, 2회, 셋째 날은 5, 4, 3, 3, 2회 방식으로 차근차근 개수를
 *    올려 나갑니다. 이렇게 5일간 훈련한 후 6일 차에는 반드시 하루 쉬어주는
 *    5일 훈련 1일 휴식 루틴을 4주 동안 유지합니다. 한 달 프로그램을 마친 뒤
 *    2~3일간 충분히 휴식하고 다시 최대 개수를 측정하면 수행 능력이 눈에 띄게
 *    향상됩니다."
 *
 * 원문에서 이 파일이 가져오는 것은 셋이다.
 *   ① 하루 **5세트** (`LADDER_RUNGS`)
 *   ② 시작 사다리는 **최대 개수부터 1씩 내려간다** (5·4·3·2·1)
 *   ③ 매일 **뒤쪽 세트부터 1회씩** 올린다
 *
 * 나머지(며칠에 나눠 할지, 언제 쉴지)는 프로그램 일정이 정한다 —
 * `official-programs.ts`의 `PULLUP_LADDER_PROGRAM` 주석 참조.
 *
 * 이 파일은 **순수 계산만** 한다. DB도 카탈로그도 모른다.
 * 같은 사다리를 한 번만 담는 「추천 루틴」은 `preset-routines.ts`에 따로 있다.
 */

/** 하루 세트 수. 원문이 "하루 5세트를 나누어"라고 직접 정한 값이다. */
export const LADDER_RUNGS = 5;

/** 연속 훈련일 — 원문 "5일간 훈련한 후" */
export const LADDER_TRAIN_DAYS = 5;

/** 그 뒤 휴식일 — 원문 "6일 차에는 반드시 하루 쉬어주는" */
export const LADDER_REST_DAYS = 1;

/** 한 주기 = 훈련 5일 + 휴식 1일 */
export const LADDER_CYCLE_DAYS = LADDER_TRAIN_DAYS + LADDER_REST_DAYS;

/**
 * 프로그램 회차 수 = **24**.
 *
 * 원문의 "4주"를 훈련일로 세면 24다.
 *   1~5 훈련 · 6 휴식 / 7~11 · 12 휴식 / 13~17 · 18 휴식 / 19~23 · 24 휴식 /
 *   25~28 훈련  →  5+5+5+5+4 = 24회, 28일 = **정확히 4주**
 *
 * ⚠️ 처음에 18로 잡았다가 사장님 지적으로 고쳤다(2026-09-04). 18은 원문에서
 *    온 숫자가 아니라 **등록 RPC가 `p_plans` 길이를 18로 못 박고 있어서**
 *    거기 맞춘 숫자였다. 제약이 프로그램을 줄이고 있었던 것이라, 제약을
 *    고쳤다(0101).
 *
 * ⚠️ 이 숫자를 바꾸려면 DB 세 곳을 같이 고쳐야 한다 — RPC의 회차 수 검사,
 *    `program_week` 컬럼 check(1~8), `reschedule_program_plans`의 이동 개수
 *    상한. 앱만 고치면 등록이 통째로 거절된다.
 */
export const LADDER_SESSIONS = 24;

/** 전체 기간 (일). 마지막 회차가 서는 날까지 — 28일 = 4주 */
export const LADDER_SPAN_DAYS =
  Math.floor((LADDER_SESSIONS - 1) / LADDER_TRAIN_DAYS) * LADDER_CYCLE_DAYS +
  ((LADDER_SESSIONS - 1) % LADDER_TRAIN_DAYS) +
  1;

/**
 * `session`번째 회차가 **시작일로부터 며칠 뒤**인가 (0부터).
 *
 * 이것이 "5일 훈련 1일 휴식"을 담는 자리다. 요일로는 6일 주기를 표현할 수
 * 없다 — 월·수·금 같은 요일 목록은 7일마다 반복되기 때문이다. 그래서 사다리는
 * 다른 프로그램과 달리 **요일이 아니라 주기**로 날짜를 잡는다.
 *
 *   1회차 +0 · 2회차 +1 · … · 5회차 +4 · (+5는 휴식) · 6회차 +6 · …
 */
export function ladderDayOffset(session: number): number {
  if (!Number.isInteger(session) || session < 1 || session > LADDER_SESSIONS) {
    throw new Error("program_invalid_day");
  }
  const index = session - 1;
  return (
    Math.floor(index / LADDER_TRAIN_DAYS) * LADDER_CYCLE_DAYS +
    (index % LADDER_TRAIN_DAYS)
  );
}

/**
 * 입력받는 최대 개수의 하한.
 *
 * ⚠️ 5는 임의가 아니다. 5·4·3·2·1이 성립하려면 최대 개수가 5는 돼야 하고,
 *    원문 자체가 "최대 5개가 가능한 사람 기준"이라고 못 박는다. 4개인 사람에게
 *    무엇을 시킬지는 원문에 **없다** — 앱이 지어내는 대신 화면에서 안내한다.
 */
export const LADDER_MAX_REPS_MIN = 5;

/**
 * 상한.
 *
 * ⚠️ 30은 취향이 아니라 **RPC 제약에서 역산한 값**이다. 처방 횟수는 1~100만
 *    통과하는데(0066) 사다리는 마지막 회차에 최대 +3까지 오른다. 30이면
 *    33회로 한참 아래다. 상한을 올리려면 `pullup-ladder.test.ts`의
 *    "100회를 넘지 않는다"를 먼저 확인하라.
 */
export const LADDER_MAX_REPS_MAX = 30;

/** 사다리를 만들 수 있는 최대 개수인가 (화면 입력 검증) */
export function isLadderMaxReps(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= LADDER_MAX_REPS_MIN &&
    value <= LADDER_MAX_REPS_MAX
  );
}

/**
 * `day`번째 회차의 세트별 목표 횟수.
 *
 * 규칙(원문 ③)을 하루씩 돌리지 않고 O(1)로 접는다. `day - 1`번 올렸을 때
 * 어디까지 올라갔는지는 5로 나눈 몫과 나머지가 그대로 말해 준다.
 *
 *   - 몫 `lifted`  : 사다리 **전체**가 몇 칸 올라갔나 (5번 올리면 한 칸)
 *   - 나머지 `tail`: 그 위에서 **뒤쪽 몇 세트**가 한 칸 더 올라가 있나
 *
 * 최대 5개 기준으로 펼치면 원문과 같다:
 *   1일차 5·4·3·2·1 → 2일차 5·4·3·2·2 → 3일차 5·4·3·3·2 → …
 *   6일차 6·5·4·3·2 (사다리 전체가 한 칸)
 *
 * ⚠️ 공식만 보면 "뒤쪽 세트부터"라는 원문 규칙이 눈에 안 보인다.
 *    `pullup-ladder.test.ts`의 "규칙을 한 걸음씩 돌린 결과와 같다"가 그 둘을
 *    잇는 다리다. 공식을 손대면 그 테스트가 먼저 깨진다.
 */
export function ladderRepsForDay(
  maxReps: number,
  day: number,
): readonly number[] {
  if (!isLadderMaxReps(maxReps)) {
    throw new Error("program_invalid_max_reps");
  }
  if (!Number.isInteger(day) || day < 1 || day > LADDER_SESSIONS) {
    throw new Error("program_invalid_day");
  }

  const steps = day - 1;
  const lifted = Math.floor(steps / LADDER_RUNGS);
  const tail = steps % LADDER_RUNGS;

  return Array.from({ length: LADDER_RUNGS }, (_, rung) => {
    const base = maxReps - rung + lifted;
    // 뒤에서 `tail`개가 한 칸 더 — 앞 세트를 넘지 않으므로 내림차순이 유지된다
    return rung >= LADDER_RUNGS - tail ? base + 1 : base;
  });
}

/** 그날 총 횟수. "하루 1회씩 늘어난다"를 확인하는 데 쓴다 */
export function ladderTotalReps(maxReps: number, day: number): number {
  return ladderRepsForDay(maxReps, day).reduce((sum, reps) => sum + reps, 0);
}

/** 사다리를 사람이 읽는 한 줄로 — "5·4·3·2·1" */
export function ladderLabel(reps: readonly number[]): string {
  return reps.join("·");
}
