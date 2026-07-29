/**
 * 응원 포인트 표시 로직 (설계 2026-07-29).
 *
 * 지급 여부는 반드시 서버가 돌려준 값을 쓴다. 클라이언트가 "오늘 이 사람에게
 * 응원했었나"를 로컬로 추측하면 다른 기기·다른 탭에서 실제 0P인데 +10P로
 * 표시된다.
 */

const BASE = "응원을 보냈어요! 📣";

/**
 * send_cheer 응답 → 지급액.
 *
 * 0041부터 `{cheer, points_awarded}`를 돌려주지만, 그 전에는 cheers 행을 그대로
 * 돌려줬다. 앱이 마이그레이션보다 먼저 배포돼도 화면이 깨지지 않아야 하므로
 * 모양이 다르면 0으로 떨어뜨린다 — 포인트 문구만 안 나오고 응원은 정상이다.
 */
export function pointsAwardedFrom(data: unknown): number {
  const n = (data as { points_awarded?: unknown } | null)?.points_awarded;
  return typeof n === "number" && n > 0 ? n : 0;
}

/**
 * 지급액 → 토스트 문구. 0 이하면 포인트 문구를 붙이지 않는다.
 *
 * 단위 앞 공백은 앱의 다른 포인트 표시와 맞춘 것이다
 * (badge-earn-animation·badge-sheet·next-goal-card 전부 `+N P`).
 */
export function cheerToastMessage(pointsAwarded: number): string {
  return pointsAwarded > 0 ? `${BASE} +${pointsAwarded} P` : BASE;
}
