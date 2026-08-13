/**
 * 챌린지 목표의 총량 ↔ 하루 기준 환산 (2026-08-14).
 *
 * ⚠️⚠️ **여기는 달성률(종합 80%) 쪽 계산이다.** 인자로 받는 `daysPerWeek`는
 * "이 종목을 주 며칠 할 것인가"이고, **참여율 분모가 아니다.** 참여율 분모는
 * `user_goals.planned_days` 하나뿐이고 `goal-score.ts`의 `plannedDaysForPeriod`가
 * 환산한다.
 *
 * 2026-08-14 이전에는 두 값이 세팅 시트 한 화면에 나란히 있었고 이름도 비슷해서
 * (`주 며칠` / `계획 운동일 (주 N일)`) 사람도 코드도 헷갈렸다. 두 값을 같은
 * 것으로 다루면 **참여율이 조용히 틀린 값을 쓰게 된다** — 화면만 봐서는 안 잡힌다.
 * 설계 `docs/superpowers/specs/2026-08-14-challenge-setup-sheet-redesign-design.md` §2·§4.2.
 */
import { plannedDaysForPeriod } from "./goal-score";

/** 소수 첫째 자리까지 */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 기간 총 목표의 표시·저장 반올림 — **`km`만 소수 첫째 자리, 나머지는 정수.**
 *
 * `171.4회`·`342.9분` 같은 목표는 사람이 읽을 수 없다. 기간을 바꿀 때마다
 * 총량을 다시 계산하게 되면서(2026-08-14 신고) 소수가 자주 나오게 됐다.
 * 거리만 `5.7km`처럼 소수가 자연스럽다.
 *
 * ⚠️ **하루 목표에는 쓰지 마라.** 거기는 `하루 41.7회`가 오히려 정보다 —
 * 정수로 뭉개면 총량과 안 맞는 것처럼 보인다.
 */
export function roundTarget(value: number, unit: string): number {
  return unit === "km" ? round1(value) : Math.round(value);
}

/** 하루 목표 × 주 N일 × 주수 → 기간 총 목표 */
export function totalFromPerDay(
  perDay: number,
  daysPerWeek: number,
  periodDays: number,
): number {
  if (perDay <= 0 || daysPerWeek <= 0 || periodDays <= 0) return 0;
  return round1((perDay * daysPerWeek * periodDays) / 7);
}

/** 기간 총 목표 ÷ (주 N일 × 주수) → 하루 목표 */
export function perDayFromTotal(
  total: number,
  daysPerWeek: number,
  periodDays: number,
): number {
  if (total <= 0 || daysPerWeek <= 0 || periodDays <= 0) return 0;
  return round1((total * 7) / (daysPerWeek * periodDays));
}

/**
 * 일수형 목표(`weight_days`·`bodyweight_days`)의 주 N일 → 기간 총 운동일.
 *
 * ⚠️ 식이 `plannedDaysForPeriod`와 **같아서 그 함수에 위임한다.** 산술을 여기에
 * 다시 적으면 한쪽만 고쳐지는 날이 온다. 뜻은 다르다(이건 달성률 목표값,
 * 저건 참여율 분모) — 그래서 이름은 따로 둔다.
 */
export function totalDaysFromPerWeek(
  daysPerWeek: number,
  periodDays: number,
): number {
  return plannedDaysForPeriod(daysPerWeek, periodDays);
}

/** 기간 총 운동일 → 주 N일 (1~7로 자른다) */
export function perWeekFromTotalDays(
  totalDays: number,
  periodDays: number,
): number {
  if (periodDays <= 0) return 1;
  return Math.min(7, Math.max(1, Math.round((totalDays * 7) / periodDays)));
}
