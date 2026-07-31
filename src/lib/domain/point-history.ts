/**
 * 포인트 내역 표시 로직.
 *
 * XP와 포인트는 **서로 다른 장부**다(`xp_transactions` · `point_transactions`).
 * 화면도 따로 보여준다 — 합치면 운동 한 번이 XP 한 줄·포인트 한 줄로 두 번
 * 뜨는데, 그게 중복으로 읽힌다.
 */

const REASON_LABEL: Record<string, string> = {
  workout_completed: "운동 완료",
  badge_earned: "배지 획득",
  cheer_sent: "응원 보내기",
  item_purchase: "아이템 구매",
  admin_adjustment: "관리자 조정",
  refund: "환불",
};

/**
 * 사유 코드 → 우리말.
 *
 * 모르는 값은 원문을 그대로 돌려준다. 사유는 DB의 CHECK 제약으로 늘어나는데
 * (0041이 `cheer_sent`를 더했다) 라벨을 깜빡해도 화면이 빈칸이 되면 안 된다.
 */
export function pointReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

/**
 * 금액 표시. 방향은 `amount`가 아니라 `transaction_type`이 정한다.
 *
 * `point_transactions.amount`는 사용(spend)일 때도 **양수로 저장된다**(0031).
 * 부호를 amount에서 읽으려 하면 아이템 구매가 `+500 P`로 보인다.
 */
export function pointAmountText(
  amount: number,
  transactionType: string,
): string {
  const sign = transactionType === "spend" ? "−" : "+";
  return `${sign}${amount.toLocaleString()} P`;
}
