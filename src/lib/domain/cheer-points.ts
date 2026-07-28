/**
 * 응원 포인트 표시 로직 (설계 2026-07-29).
 *
 * 지급 여부는 반드시 서버가 돌려준 값을 쓴다. 클라이언트가 "오늘 이 사람에게
 * 응원했었나"를 로컬로 추측하면 다른 기기·다른 탭에서 실제 0P인데 +10P로
 * 표시된다.
 */

/** 응원 1회 지급액. SQL 0041의 award_points 호출과 같아야 한다. */
export const CHEER_POINT_AMOUNT = 10;

const BASE = "응원을 보냈어요! 📣";

/** 지급액 → 토스트 문구. 0 이하면 포인트 문구를 붙이지 않는다. */
export function cheerToastMessage(pointsAwarded: number): string {
  return pointsAwarded > 0 ? `${BASE} +${pointsAwarded}P` : BASE;
}
