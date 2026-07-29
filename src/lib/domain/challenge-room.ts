/**
 * 챌린지 방 순수 계산 (설계 2026-07-29 §5.3·§6.2).
 *
 * 여기 있는 함수는 0043이 화면·RPC에서 쓴다. 0042 단계에서는 아무도 부르지
 * 않지만, 규칙을 먼저 테스트로 굳혀 두면 전환 단계에서 화면과 서버가 서로
 * 다른 계산을 하는 일이 없다.
 */

import type { GoalType } from "./goal-score";

export type ChallengeStatus = "setup" | "active" | "ended" | "cancelled";

export type ChallengeLike = {
  id: string;
  status: ChallengeStatus;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  createdAt: string; // ISO
};

/**
 * 홈에 보여줄 대표 챌린지 하나.
 *
 * 종료일이 가장 임박한 active → 없으면 시작일이 가장 가까운 setup.
 * 동률이면 먼저 만들어진 것 — 규칙이 없으면 조회할 때마다 대표가 바뀌어
 * 열람권(challenge_peek_picks) 대상이 흔들린다.
 */
export function pickPrimaryChallenge<T extends ChallengeLike>(
  list: T[],
): T | null {
  const pickBy = (status: ChallengeStatus, key: "endDate" | "startDate") => {
    const candidates = list.filter((c) => c.status === status);
    if (candidates.length === 0) return null;
    // 원본을 건드리지 않으려고 복사 후 정렬한다 (Array.sort는 제자리 정렬).
    return [...candidates].sort(
      (a, b) =>
        a[key].localeCompare(b[key]) || a.createdAt.localeCompare(b.createdAt),
    )[0];
  };
  return pickBy("active", "endDate") ?? pickBy("setup", "startDate");
}

/** 하한선 기준 구간 (일). 설계 §5.3 — "최근 4주". */
export const FLOOR_BASELINE_DAYS = 28;

/**
 * KPI 유형별 올림 단위. 앱이 실제로 저장·표시하는 최소 단위를 그대로 쓴다
 * (target_value는 numeric(10,1), 입력 UI는 round1). 새 단위를 만들지 않는다.
 *
 * volume은 레거시 표시 전용이라 신규 설정 대상이 아니므로 하한을 걸지 않는다.
 */
const FLOOR_STEP: Record<GoalType, number> = {
  weight_reps: 1,
  weight_days: 1,
  bodyweight_reps: 1,
  bodyweight_days: 1,
  tabata_count: 1,
  cardio_distance: 0.1,
  cardio_time: 0.1,
  bodyweight_time: 0.1,
  volume: 0, // 하한 없음
};

/**
 * 목표 하한선 — 직전 28일 실적을 챌린지 기간에 맞춰 환산한 값.
 *
 * 항상 올림한다. 내림하면 하한이 실적보다 낮아져 장치가 무력해진다.
 * 실적이 없으면 0을 돌려주므로 호출부에서 "통과"로 다뤄진다 — 실적 없는
 * 유형을 어떻게 다룰지는 완료 목표 보너스 쪽에서 정한다(설계 D13).
 */
export function goalFloor(
  type: GoalType,
  baselineActual: number,
  periodDays: number,
): number {
  const step = FLOOR_STEP[type];
  if (step <= 0 || periodDays <= 0 || baselineActual <= 0) return 0;
  const raw = (baselineActual * periodDays) / FLOOR_BASELINE_DAYS;
  // 0.1 단위 올림에서 부동소수 오차로 한 칸 더 올라가는 것을 막는다
  // (예: 31.725 / 0.1이 317.2499...로 계산되는 경우).
  const units = Math.ceil(Number((raw / step).toFixed(6)));
  return Number((units * step).toFixed(1));
}

/**
 * *_days 유형의 과거 실적 — "하루 N종목 이상 한 날" 수.
 *
 * weight_days·bodyweight_days는 qualifier에 따라 **같은 과거 데이터의 실적이
 * 달라진다**. 2026-07-30 실측에서 이게 실제로 문제가 됐다: 최근 웨이트가 하루
 * 최대 3부위였던 사용자가 목표를 qualifier=4로 세워서 19일 목표가 영구히
 * 0일이 됐고, 화면은 아무 경고도 하지 않았다.
 *
 * 그래서 goalFloor에 넘길 baselineActual은 **사용자가 지금 고른 qualifier로**
 * 다시 센 값이어야 한다. qualifier를 무시하고 센 값을 넘기면 하한선이
 * *_days에서 무의미해진다.
 *
 * 기본값 1은 actualForGoal(`challenge.ts`)의 `qualifier ?? 1`과 같다.
 */
export function daysMeetingQualifier(
  countByDay: Record<string, number>,
  qualifier: number | null | undefined,
): number {
  const min = qualifier ?? 1;
  return Object.values(countByDay).filter((n) => n >= min).length;
}
