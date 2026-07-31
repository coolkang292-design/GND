/**
 * 콕 찌르기 화면 판정 재료.
 *
 * 콕은 **양쪽 조건**이 다 맞아야 눌린다 (0028, 현행 0039).
 *   - 내가 오늘 운동을 마쳤어야 한다
 *   - 상대가 오늘 운동을 안 했어야 한다
 *
 * 그래서 "오늘 운동한 사람" 조회에는 크루뿐 아니라 **나도** 들어가야 한다.
 */

/**
 * 오늘 운동 여부를 조회할 id 목록 — 나 + 크루.
 *
 * 0039부터 `getCrewProfiles`가 **본인을 뺀** 목록을 돌려준다. 그걸 그대로
 * 조회에 넘기면 내 운동 기록이 결과에 없어서, 오늘 운동을 마쳐도
 * `workedOut.has(userId)`가 false가 되고 콕 버튼이 영원히 흐릿하다.
 * 2026-07-31에 실제로 그 상태였다.
 */
export function todaysWorkoutLookupIds(
  myUserId: string | null | undefined,
  crewIds: string[],
): string[] {
  if (!myUserId) return [...crewIds];
  // 크루 목록에 내가 섞여 들어와도 한 번만 넣는다.
  return [myUserId, ...crewIds.filter((id) => id !== myUserId)];
}
