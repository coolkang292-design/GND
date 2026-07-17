// 소셜 순수 도메인 로직 — I/O 없음, TDD (§16)

export type SocialEvent = {
  session_id: string;
  event_type: "workout_started" | "workout_completed" | "workout_cancelled";
  created_at: string;
};

/** 유령 세션 컷오프: 시작 후 6시간 지나면 진행 중으로 안 본다 */
const ACTIVE_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * 이벤트 목록 → 진행 중 세션 id (최근 시작 순).
 * started 이벤트가 있고, completed/cancelled 이벤트가 없고,
 * 시작이 6시간 이내인 세션만 진행 중으로 판정한다.
 */
export function activeSessionIds(
  events: SocialEvent[],
  now: Date = new Date(),
): string[] {
  const startedAt = new Map<string, number>();
  const closed = new Set<string>();

  for (const e of events) {
    if (e.event_type === "workout_started") {
      startedAt.set(e.session_id, Date.parse(e.created_at));
    } else {
      closed.add(e.session_id);
    }
  }

  return [...startedAt.entries()]
    .filter(
      ([sid, at]) => !closed.has(sid) && now.getTime() - at < ACTIVE_MAX_MS,
    )
    .sort((a, b) => b[1] - a[1])
    .map(([sid]) => sid);
}

/** 미읽음 알림 수 */
export function unreadCount(rows: { read_at: string | null }[]): number {
  return rows.filter((r) => r.read_at === null).length;
}
