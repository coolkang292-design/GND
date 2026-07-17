/** 상대 시각 표기 — 피드·알림·홈 미리보기 공용 */
export function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

/** 경과 시간 표기 — 진행 중 카드용 ("n분째") */
export function minutesSince(date: Date): number {
  return Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
}
