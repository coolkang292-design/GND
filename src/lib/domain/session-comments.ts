/**
 * 게시물 스레드 접기 — `cheers` 행을 화면이 그릴 모양으로 바꾼다 (0082).
 *
 * **왜 응원과 댓글이 한 테이블인가.** `cheers`는 처음부터
 * `(session_id, sender_id, receiver_id, message, created_at)`이었다. 구조적으로
 * 이미 댓글이고, 막고 있던 것은 `send_cheer` RPC가 건 정책(active·3회·30자)뿐이라
 * 0082는 테이블을 만들지 않고 정책만 다른 RPC를 하나 더 놓았다.
 *
 * **왜 한 스레드에 섞어 그리나.** 운동 중에 받은 "💪 힘내"는 그 운동에 대한
 * 말이 맞다. 응원함과 댓글함으로 나누면 사용자에게는 **같은 운동에 대한 대화가
 * 두 군데로 쪼개져** 보인다. 대신 표시 규칙을 나눈다 —
 *   · 말이 있는 행(`message`)은 **댓글 줄**로 선다 (응원으로 온 말이든 댓글이든)
 *   · 말이 없는 이모지 응원은 스레드 맨 위에 **한 줄로 접는다** (`🔥3 💪1`)
 *
 * 순수 함수다. 조회하지 않는다.
 */

export type SessionCheerType =
  | "fire"
  | "power"
  | "clap"
  | "finish"
  | "custom"
  | "comment"; // 0082 — 완료된 운동에 단 댓글

/** `cheers` 한 행 (카멜케이스로 옮긴 것) */
export type SessionCheerRow = {
  id: string;
  sessionId: string;
  senderId: string;
  cheerType: SessionCheerType;
  message: string | null;
  createdAt: Date;
  /** 대댓글이면 부모 댓글 id (0084). 최상위면 null */
  parentId: string | null;
  /** 고친 적이 있으면 그 시각 (0084) */
  editedAt: Date | null;
};

export type ThreadComment = {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  /**
   * 운동 **중** 응원으로 남긴 말인가.
   *
   * 같은 줄에 서지만 표식이 다르다 — 응원은 그 순간에만 보낼 수 있었던 말이라
   * 📣를 달아 준다. `cheerType`이 `comment`가 아니면 참이다.
   */
  fromCheer: boolean;
  /** 부모 댓글 id — 접기가 끝나면 최상위는 null이다 */
  parentId: string | null;
  /**
   * 고친 적이 있는가 (0084).
   *
   * ⚠️ 화면에 "(수정됨)"을 반드시 달아라. 답글이 달린 뒤에 몸통이 조용히 바뀌면
   *    읽는 사람은 답글이 엉뚱한 소리를 하는 것으로 본다.
   */
  editedAt: Date | null;
  /**
   * 이 댓글에 달린 답글 (0084) — 오래된 것 → 최신.
   *
   * ⚠️ **2단계로 고정이다.** 답글의 답글은 서버가 같은 부모로 눕힌다
   *    (`post_session_comment`의 `coalesce(parent_id, id)`). 그래서 여기
   *    `replies` 안의 항목은 언제나 빈 `replies`를 갖는다 — 재귀로 그리지 마라.
   */
  replies: ThreadComment[];
};

/** 말 없는 이모지 응원 집계 — 스레드 머리에 한 줄로 선다 */
export type CheerTally = { type: SessionCheerType; count: number };

export type SessionThread = {
  /** 오래된 것 → 최신 (읽는 순서) */
  comments: ThreadComment[];
  /** 말 없는 응원만. 말이 있으면 `comments`로 갔다 */
  cheerTally: CheerTally[];
  cheerTotal: number;
};

export const EMPTY_SESSION_THREAD: SessionThread = {
  comments: [],
  cheerTally: [],
  cheerTotal: 0,
};

/** 머리줄 이모지. `custom`·`comment`는 말이 있으므로 여기 오지 않는다 */
export const CHEER_TALLY_EMOJI: Record<string, string> = {
  fire: "🔥",
  power: "💪",
  clap: "👏",
  finish: "🏁",
  custom: "✍️",
  comment: "💬",
};

/** 머리줄 순서 — 집계 결과가 매번 같은 차례로 서게 한다 */
const TALLY_ORDER: SessionCheerType[] = ["fire", "power", "clap", "finish"];

export function foldSessionThread(rows: SessionCheerRow[]): SessionThread {
  const tally = new Map<SessionCheerType, number>();
  const byId = new Map<string, ThreadComment>();
  const order: ThreadComment[] = [];

  for (const row of rows) {
    const body = (row.message ?? "").trim();
    if (body.length > 0) {
      const comment: ThreadComment = {
        id: row.id,
        senderId: row.senderId,
        body,
        createdAt: row.createdAt,
        fromCheer: row.cheerType !== "comment",
        replies: [],
        parentId: row.parentId,
        editedAt: row.editedAt,
      };
      byId.set(comment.id, comment);
      order.push(comment);
      continue;
    }
    // 말이 없는 행은 이모지 응원이다. 댓글은 빈 몸통을 서버가 막으므로
    // (`comment_empty`) 여기 올 일이 없지만, 와도 조용히 집계로 흘린다.
    tally.set(row.cheerType, (tally.get(row.cheerType) ?? 0) + 1);
  }

  // 답글을 부모 밑으로 옮긴다 (0084).
  //
  // ⚠️ **부모를 못 찾은 답글은 버리지 않고 최상위로 올린다.** 부모가 이 페이지
  //    상한(THREAD_FETCH_CAP)에 잘려 안 왔을 수 있는데, 버리면 **사용자가 쓴 말이
  //    화면에서 사라진다.** 자리를 잃는 것보다 평평하게라도 보이는 편이 낫다.
  const comments: ThreadComment[] = [];
  for (const comment of order) {
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
    if (parent && parent.id !== comment.id) parent.replies.push(comment);
    else comments.push(comment);
  }

  const byTime = (a: ThreadComment, b: ThreadComment) =>
    a.createdAt.getTime() - b.createdAt.getTime();
  comments.sort(byTime);
  for (const c of comments) c.replies.sort(byTime);

  const cheerTally: CheerTally[] = [];
  let cheerTotal = 0;
  for (const type of TALLY_ORDER) {
    const count = tally.get(type);
    if (count) {
      cheerTally.push({ type, count });
      cheerTotal += count;
    }
  }
  // 순서표에 없는 종류(나중에 늘어난 것)도 잃지 않는다
  for (const [type, count] of tally) {
    if (TALLY_ORDER.includes(type)) continue;
    cheerTally.push({ type, count });
    cheerTotal += count;
  }

  return { comments, cheerTally, cheerTotal };
}

/** 답글까지 포함한 전체 댓글 수 — 액션 줄의 💬 옆 숫자 */
export function totalCommentCount(thread: SessionThread): number {
  return thread.comments.reduce((n, c) => n + 1 + c.replies.length, 0);
}

/**
 * 카드에 접어 보여줄 미리보기 — **최신 `limit`개를 읽는 순서로** 돌려준다.
 *
 * ⚠️ 앞에서 자르지 않는다(`slice(0, limit)`). 인스타처럼 최신 댓글이 보여야
 * 하는데 앞을 자르면 **가장 오래된 것**이 남는다.
 */
export function threadPreview(
  thread: SessionThread,
  limit = 2,
): ThreadComment[] {
  if (limit <= 0) return [];
  return thread.comments.slice(-limit);
}

/** `cheers.message`의 CHECK가 200자다 (0082에서 30 → 200) */
export const COMMENT_MAX_LENGTH = 200;
