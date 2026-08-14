/**
 * 챌린지 시간 관련 순수 함수.
 *
 * ⚠️ **날짜 산수를 여기 밖에서 다시 짜지 마라.** 2026-08-13에 실측했더니
 * `challenge/page.tsx`가 같은 계산을 지역 함수 `periodDays`로 한 벌 더 갖고 있었고,
 * 홈 챌린지 요약이 세 번째 구현을 만들 뻔했다. 화면마다 D-day가 하루씩 달라지는
 * 종류의 사고다.
 *
 * ⚠️ 아래 셋은 **1씩 어긋난다.** 고를 때 이 표를 보라:
 *
 * | 입력 (오늘 → 종료일) | `inclusiveDays` | `challengeDaysLeft` | `challengeDday` |
 * |---|---|---|---|
 * | 종료 당일    | 1  | 1  | **0**  |
 * | 종료 하루 전 | 2  | 2  | 1      |
 * | 종료일 지남  | 0 이하 | **0** (하한) | **음수** |
 *
 * ⚠️ 전부 `"YYYY-MM-DD"` 문자열만 받는다. `Date`를 받게 고치지 마라 — 그 순간
 * 타임존이 다시 끼어든다. "오늘이 며칠인가"는 부르는 쪽이 `dayKey`로 이미 정했다.
 */

/** `"YYYY-MM-DD"` → 그 날 자정의 UTC 밀리초. 날짜 간 뺄셈 전용이다. */
function toUtc(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * 양끝을 포함한 기간 일수. 같은 날이면 1.
 *
 * ⚠️ **하한을 걸지 않는다.** 끝이 시작보다 이르면 0 이하를 그대로 돌려준다 —
 * 자를지 말지는 부르는 쪽이 정한다(`challengeDaysLeft`는 자르고 `challengeDday`는 안 자른다).
 * 여기서 미리 자르면 두 규칙 중 하나를 표현할 수 없다.
 */
export function inclusiveDays(startKey: string, endKey: string): number {
  return Math.round((toUtc(endKey) - toUtc(startKey)) / 86_400_000) + 1;
}

/** 오늘~종료일 남은 일수(오늘 포함). 종료일이 지났으면 0. */
export function challengeDaysLeft(
  todayKey: string,
  endDateKey: string,
): number {
  return Math.max(0, inclusiveDays(todayKey, endDateKey));
}

/**
 * 화면에 적는 `D-N`. 종료 당일이 `D-0`이다.
 *
 * ⚠️ **0으로 자르지 마라.** 자르면 종료 당일과 이미 지난 챌린지가 똑같이 `D-0`으로
 * 보인다. 화면은 음수를 받아 `종료`로 갈아탄다.
 */
export function challengeDday(todayKey: string, endDateKey: string): number {
  return inclusiveDays(todayKey, endDateKey) - 1;
}

/**
 * `"2026-08-20"` → `"8월 20일"`.
 *
 * ⚠️ **`Date`를 쓰지 마라.** `new Date("2026-08-20")`은 UTC 자정으로 읽히고,
 * KST보다 뒤인 기기(미주 등)에서는 `8월 19일`로 표시된다. 이 파일의 다른
 * 함수들이 `Date`를 안 받는 것과 같은 이유다 — 문자열을 그대로 쪼갠다.
 */
export function formatMonthDay(dayKey: string): string {
  const [, month, date] = dayKey.split("-").map(Number);
  return `${month}월 ${date}일`;
}

export type ChallengeStartHint = {
  /** 안내문 — **자동 시작이 주인공이다** */
  notice: string;
  /** 수동 시작 버튼 라벨 */
  buttonLabel: string;
  /** 수동 시작 버튼을 지금 누를 수 있는가 */
  canStartNow: boolean;
};

/**
 * setup 상태 챌린지의 시작 안내 (2026-08-14).
 *
 * ⚠️⚠️ **자동 시작이 주인공이고 수동 시작은 지름길이다.** 옛 화면은 자물쇠와
 * 함께 `전원 KPI 설정 + 전원 동의 시 챌린지가 시작돼요`라고만 적었는데,
 * `autostart_due_challenges()`가 시작일에 **동의 없이** 챌린지를 연다
 * (`docs/db-current-schema.sql:415` — 목표가 없는 참가자만 `dropped`로 빼고
 * 나머지는 그대로 시작한다). 화면이 사실과 반대로 말하고 있었고, 사용자는
 * 안 막힌 문 앞에서 남을 기다렸다.
 *
 * ⚠️ 수동 경로를 **지우지 않는다.** 시작일을 앞당기고 싶을 때 쓰는 길이
 * 사라지면 기능이 준다. 이름과 자리만 조연으로 내린다.
 *
 * ⚠️ 문구 조립을 화면이 아니라 여기서 하는 이유는 `viewing-pass.ts`의
 * `challengePassCopy`와 같다 — 화면은 비동기 조회 뒤에 그려져서 글자를
 * 테스트로 잡으려면 조립이 도메인에 있어야 한다.
 */
export function challengeStartHint(input: {
  startDateKey: string;
  todayKey: string;
  allSet: boolean;
  allApproved: boolean;
  approvedCount: number;
  memberCount: number;
}): ChallengeStartHint {
  const { startDateKey, todayKey, allSet, allApproved } = input;

  // 시작일이 아직 안 왔을 때만 날짜를 적는다. 이미 도래했으면 autostart가
  // 곧 처리하므로(크론 + 탭 진입) 날짜를 말하면 지난 날을 가리키게 된다.
  const notice =
    startDateKey > todayKey
      ? `${formatMonthDay(startDateKey)}에 자동으로 시작돼요 · 그때까지 목표를 세우지 않으면 이번 챌린지에선 빠져요`
      : "시작일이 됐어요 · 곧 자동으로 시작돼요";

  const buttonLabel = !allSet
    ? "지금 바로 시작하기 (전원 목표 설정 필요)"
    : !allApproved
      ? `지금 바로 시작하기 (동의 ${input.approvedCount}/${input.memberCount})`
      : "지금 바로 시작하기";

  return { notice, buttonLabel, canStartNow: allSet && allApproved };
}
