/**
 * 챌린지 성과 열람 — 순위표에서 실제로 그릴 줄을 고른다.
 *
 * 5일 연속 달성으로 열리는 2시간 창에서 전원 순위를 통째로 보여주던 것을
 * "내 성과 + 내가 고른 한 명"으로 좁혔다(2026-07-28). 고른 사람은 그 창 동안
 * 바꿀 수 없다 — 자유롭게 바꿀 수 있으면 사실상 전원 열람과 같아진다.
 */

export type PeekRow = {
  userId: string;
  rank: number;
  overall: number;
};

/**
 * 그릴 줄 = 나 + 고른 한 명. 순위 오름차순으로 돌려준다.
 *
 * 고른 사람이 순위표에 없을 수 있다(목표를 지웠거나 챌린지가 바뀐 경우).
 * 그때는 빈 줄을 그리는 대신 조용히 뺀다 — 화면에 "●●●● 0점"이 뜨면
 * 데이터가 깨진 것처럼 보인다.
 */
export function peekRows<T extends PeekRow>(
  list: T[],
  myUserId: string,
  targetId: string | null,
): T[] {
  const wanted = new Set<string>([myUserId]);
  if (targetId) wanted.add(targetId);
  return list
    .filter((r) => wanted.has(r.userId))
    .slice()
    .sort((a, b) => a.rank - b.rank);
}
