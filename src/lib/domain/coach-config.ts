/**
 * AI 코치 V1의 **판단 기준값** — 한 곳에만 둔다 (설계 2026-09-28 §5).
 *
 * ⚠️ 숫자를 분석 코드에 박지 마라. 기준을 바꾸면 결과가 바뀌고, 바뀐 결과는
 *    `ALGORITHM_VERSION`을 올려야 옛 판정과 구분된다. 여기서 고치고 버전을 올린다.
 */

/** 판정 규칙의 버전. 기준값·규칙을 바꾸면 올린다 — `workout_ai_feedback`에 남는다 */
export const ALGORITHM_VERSION = "progression_v1";

/** AI 지시문의 버전. 지시문을 바꾸면 올린다 */
export const PROMPT_VERSION = "workout_feedback_v1";

/** 비교에 쓰는 과거 기간 (주) */
export const HISTORY_WEEKS = 8;

/** 기간 안에서 읽는 과거 세션 최대 수 */
export const HISTORY_SESSION_LIMIT = 40;

/** 종목별 추세로 AI에 싣는 과거 회차 수 (직전 포함) */
export const TREND_SESSIONS_PER_EXERCISE = 5;

/** AI에 싣는 종목 수 상한 — 긴 운동이라도 입력을 짧게 유지한다 */
export const MAX_EXERCISES_FOR_AI = 6;

/**
 * 세트 간격(기기 완료 시각 차)이 믿을 만한 범위 — 초.
 *
 * - 하한: 세트를 하고 쉬는 데 15초도 안 걸렸다면 실제 간격이 아니라
 *   **운동 끝에 몰아서 체크**한 것이다.
 * - 상한: 15분이 넘으면 전화·방치·앱 백그라운드다.
 */
export const SET_INTERVAL_MIN_SEC = 15;
export const SET_INTERVAL_MAX_SEC = 15 * 60;

/** 같은 무게로 볼 오차 (kg) — 부동소수 오차만 흡수한다 */
export const SAME_LOAD_EPSILON_KG = 0.01;

/** 무게를 올렸을 때 반복이 이만큼까지 줄어도 "진전"으로 본다 */
export const LOAD_UP_REP_DROP_TOLERANCE = 0.2;

/** 세트 간격이 이만큼 늘면 "회복이 더 필요했을 수 있다"는 보조 신호다 */
export const INTERVAL_SLOWER_RATIO = 0.25;

/** 유산소 — 거리가 이만큼 늘면 진전 */
export const CARDIO_DISTANCE_UP_RATIO = 0.05;
/** 유산소 — 페이스(초/km)가 이만큼 빨라지면 진전 */
export const CARDIO_PACE_FASTER_RATIO = 0.03;
/** 유산소 — 페이스가 이만큼 느려지면 피로 후보 */
export const CARDIO_PACE_SLOWER_RATIO = 0.1;

/** 시간형(플랭크 등) — 총 시간이 이만큼 늘면 진전 */
export const HOLD_DURATION_UP_RATIO = 0.05;

/**
 * 목표별 반복 범위 — "목표 반복을 다 채웠나"의 기준 (명령문 §32).
 *
 * 공식 프로그램 처방(`repsMin`~`repsMax`)은 세트에 저장되지 않아 서버가 모른다.
 * 그래서 목표가 기준이 된다. 상한을 **모든 완료 세트**가 넘으면 증량 후보다.
 */
export const GOAL_REP_RANGE = {
  hypertrophy: { min: 8, max: 12 },
  strength: { min: 3, max: 6 },
  fat_loss: { min: 10, max: 15 },
  conditioning: { min: 12, max: 20 },
  general_fitness: { min: 8, max: 15 },
} as const;

/** AI 생성 재시도 상한 (처음 1회 포함). 무한 재시도 금지 */
export const MAX_FEEDBACK_ATTEMPTS = 3;

/** 생성 중(pending) 행을 "죽은 것"으로 볼 시간 — 서버 함수 제한(60초)보다 길다 */
export const PENDING_STALE_MS = 90_000;

/** AI 응답을 기다리는 최대 시간 */
export const PROVIDER_TIMEOUT_MS = 30_000;

/** AI 결과 문장 길이 상한 (모바일에서 읽히는 길이) */
export const FEEDBACK_LIMITS = {
  summary: 140,
  primaryMessage: 200,
  itemMessage: 160,
  coachMessage: 300,
  wins: 2,
  cautions: 2,
  nextActions: 2,
} as const;
