/**
 * 기록 탭(운동 서브탭)의 카드 노출 규칙 (사용자 지시 2026-11-06 — "최대한 심플하게").
 *
 * 운동 **전**에는 퀘스트 카드(계획이 없으면 버튼 3개, 있으면 계획한 운동 목록)만 보인다.
 * 오늘 상태 카드와 누적 성과 카드는 **운동을 마친 뒤에만** 보인다. 예전에는 계획이
 * 없는 날에도 이 카드들이 먼저 떠서 첫 화면이 길었다.
 *
 * ⚠️ 두 카드가 **같은 문**을 쓴다. 따로 판정하면 한쪽만 남는다.
 * ⚠️ `hasStatus`가 거짓(조회 전·실패)이면 안 그린다 — 0으로 채운 막대는 "이번 주에 아무것도
 *    안 했다"는 거짓말이 된다.
 */
export function shouldShowTodayCards(input: {
  workoutActive: boolean;
  subTab: "workout" | "calendar";
  hasStatus: boolean;
  didWorkoutToday: boolean;
}): boolean {
  return (
    !input.workoutActive &&
    input.subTab === "workout" &&
    input.hasStatus &&
    input.didWorkoutToday
  );
}
