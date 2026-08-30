/**
 * 진행 중 챌린지에서 목표를 **올리는 것만** 허용하는 규칙 (0090).
 *
 * 결정: 사용자 2026-08-31. 잘못 넣은 목표를 4주 내내 안고 가는 것은 막되,
 * **막판에 목표를 낮춰 100%를 만드는 길**은 열지 않는다. 랭킹이 달성률로
 * 서는데 분모를 사용자가 내릴 수 있으면 순위가 의미를 잃는다.
 *
 * ⚠️ 진짜 관문은 DB에 있다(0090의 `enforce_goal_raise_only` 트리거). 여기 규칙은
 *    **같은 판정을 미리 화면에서 해 주는 것뿐**이다. 서버가 거절할 것을 눌러 보고
 *    알게 하지 않으려는 것이지, 이것이 안전장치는 아니다.
 */

export type GoalRaiseProblem =
  | "not_a_number"
  | "not_positive"
  | "lowered"
  | "unchanged"
  | "too_large";

/**
 * 한 번에 올릴 수 있는 상한 — 지금 목표의 10배.
 *
 * 왜 상한이 있나: 상향은 되돌릴 수 없다(내리는 길이 없다). 0을 하나 더 붙인
 * 오타가 그대로 굳으면 남은 기간 내내 달성률 5%짜리 목표를 안고 간다.
 * 서버는 이걸 막지 않는다 — 규칙상 올리는 것은 전부 정당하기 때문이다.
 * 그래서 **오타를 걸러 주는 것은 화면의 몫**이다.
 */
export const MAX_RAISE_MULTIPLE = 10;

export function validateGoalRaise(input: {
  current: number;
  next: number;
}): GoalRaiseProblem | null {
  const { current, next } = input;
  if (!Number.isFinite(next)) return "not_a_number";
  if (next <= 0) return "not_positive";
  if (next < current) return "lowered";
  if (next === current) return "unchanged";
  if (current > 0 && next > current * MAX_RAISE_MULTIPLE) return "too_large";
  return null;
}

const MESSAGE: Record<GoalRaiseProblem, string> = {
  not_a_number: "숫자를 입력해 주세요",
  not_positive: "0보다 큰 값이어야 해요",
  // 왜 안 되는지까지 말한다. "안 돼요"만 하면 버그로 읽힌다.
  lowered: "시작한 뒤에는 목표를 낮출 수 없어요 — 올리는 것만 가능해요",
  unchanged: "지금 목표와 같아요",
  too_large: `한 번에 ${MAX_RAISE_MULTIPLE}배까지만 올릴 수 있어요`,
};

export function goalRaiseMessage(problem: GoalRaiseProblem): string {
  return MESSAGE[problem];
}

/** 서버가 던진 코드 → 사람 문구. 0090의 raise exception 이름과 짝이다. */
export function goalRaiseServerMessage(message: string): string {
  if (message.includes("goal_lowered"))
    return "시작한 뒤에는 목표를 낮출 수 없어요";
  if (message.includes("goal_planned_days_lowered"))
    return "주당 운동 일수는 줄일 수 없어요";
  if (message.includes("goal_type_locked"))
    return "시작한 뒤에는 목표 종류를 바꿀 수 없어요";
  if (message.includes("goal_qualifier_locked"))
    return "시작한 뒤에는 목표 조건을 바꿀 수 없어요";
  if (message.includes("goal_locked"))
    return "이 목표는 지금 고칠 수 없어요";
  return "목표를 바꾸지 못했어요";
}
