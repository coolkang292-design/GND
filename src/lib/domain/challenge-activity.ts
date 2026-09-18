/**
 * 챌린지 활동 카드 도메인 순수 함수 (2026-09-18).
 *
 * 이 모듈은 I/O를 하지 않는다. 조회는 `lib/challenge.ts`의 `getChallengeActivity`가
 * 하고, 여기서는 **받은 목록을 몇 개 보여주고 누가 가장 많이 했는지**만 정한다.
 * 목록은 서버가 이미 최신순으로 준다(`get_challenge_activity`, 0107) — 여기서
 * 다시 정렬하지 않는다.
 *
 * ⚠️ 홈 크루 보드(`friend-board.ts`)는 순위를 **안** 매긴다. 여기는 매긴다.
 *    선은 "크루 성장은 홈에서 항상, 챌린지 경쟁은 챌린지 탭에서 규칙대로"다
 *    (2026-08-07 설계 G5). 잠긴 것은 **목표 점수**뿐이고, 활동 횟수는 이 카드
 *    목록에서 이미 셀 수 있는 정보의 합계다 (사용자 결정 2026-09-18, A안).
 */

/**
 * 접었을 때 보이는 활동 수. '더 보기'가 이 수를 넘을 때만 뜬다.
 *
 * 5는 2026-09-18 사용자 지정값이다. `challenge-activity.test.ts`가 5를 직접
 * 단언한다 — 상수 이름으로 단언하면 값이 바뀌어도 늘 통과한다.
 */
export const ACTIVITY_PREVIEW_COUNT = 5;

/**
 * 서버가 주는 최대 행 수. `get_challenge_activity`의 `limit 200`과 짝이다.
 *
 * ⚠️ 여기에 닿으면 TOP 3는 **최근 200개 안에서** 센 값이다. 조용히 틀리지 않게
 *    화면이 그 사실을 말한다(`friend-board.ts`의 `truncated`와 같은 원칙).
 *    서버 상한을 바꾸면 이 값도 같이 바꿔라.
 */
export const ACTIVITY_ROW_LIMIT = 200;

/** TOP 몇 위까지 보여주나. 공동 등수가 있으면 사람 수는 이보다 많을 수 있다. */
export const ACTIVITY_LEADER_MAX_RANK = 3;

/** 순위 계산에 필요한 만큼만 — DB 행 전체 모양에 묶이지 않는다 */
export interface ActivityRow {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  status: "active" | "completed";
  is_mine: boolean;
}

export interface ActivityLeader {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  isMine: boolean;
  /** 챌린지 기간의 **공개한 완료** 운동 횟수 */
  count: number;
  /** 1부터. 횟수가 같으면 같은 등수(공동) — 1·1·3 */
  rank: number;
}

export function visibleActivity<T>(items: T[], expanded: boolean): T[] {
  return expanded ? items : items.slice(0, ACTIVITY_PREVIEW_COUNT);
}

/** '더 보기'를 렌더할지 — 누를 게 없는데 버튼만 있는 상태를 만들지 않는다 */
export function canExpandActivity(items: unknown[]): boolean {
  return items.length > ACTIVITY_PREVIEW_COUNT;
}

export function isActivityTruncated(items: unknown[]): boolean {
  return items.length >= ACTIVITY_ROW_LIMIT;
}

/**
 * 활동이 많은 참가자 — 공동 등수를 포함해 `maxRank`위 이내 전원.
 *
 * ⚠️ **완료한 운동만 센다.** 목록에는 '운동 중' 행도 있지만, 그걸 세면 진행 중인
 *    운동이 취소될 때 순위가 흔들린다.
 * ⚠️ 운동일이 아니라 **횟수**다. 펼친 목록에서 그 사람 줄을 세면 같은 숫자가
 *    나와야 한다 — 사용자가 눈으로 대조할 수 있는 유일한 기준이다.
 *    (챌린지 점수의 참여율은 운동일 기준이라 다르다. 섞지 마라.)
 * ⚠️ 동점의 표시 순서는 닉네임순이다. 등수는 같고, 순서가 매번 같게만 한다.
 */
export function activityLeaders(
  rows: ActivityRow[],
  maxRank: number = ACTIVITY_LEADER_MAX_RANK,
): ActivityLeader[] {
  if (maxRank <= 0) return [];

  const byUser = new Map<string, Omit<ActivityLeader, "rank">>();
  for (const r of rows) {
    if (r.status !== "completed") continue;
    const prev = byUser.get(r.user_id);
    if (prev) {
      prev.count += 1;
    } else {
      byUser.set(r.user_id, {
        userId: r.user_id,
        nickname: r.nickname,
        avatarUrl: r.avatar_url,
        isMine: r.is_mine,
        count: 1,
      });
    }
  }

  const sorted = [...byUser.values()].sort(
    (a, b) =>
      b.count - a.count ||
      // 닉네임 없는 사람은 뒤로. 그다음 userId로 순서를 고정한다.
      (a.nickname ?? "￿").localeCompare(b.nickname ?? "￿", "ko") ||
      a.userId.localeCompare(b.userId),
  );

  const leaders: ActivityLeader[] = [];
  for (let i = 0; i < sorted.length; i++) {
    // 바로 앞과 횟수가 같으면 같은 등수(공동), 아니면 위치+1 — rankParticipants와 같은 규칙
    const rank =
      i > 0 && sorted[i - 1].count === sorted[i].count
        ? leaders[i - 1].rank
        : i + 1;
    if (rank > maxRank) break;
    leaders.push({ ...sorted[i], rank });
  }
  return leaders;
}
