export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

/**
 * `reference_id`가 **챌린지 id**인 유형 (0088).
 *
 * 이 유형들만 `/challenge?open=<id>`로 보낸다. 챌린지를 여러 개 가진 사람에게
 * `/challenge`만 주면 `pickPrimaryRow`가 **대표 챌린지**를 고르므로,
 * 알림이 말한 그 방이 아니라 엉뚱한 방이 열린다.
 *
 * ⚠️⚠️ **`challenge_dropped`를 여기 넣지 마라.** 운영 데이터를 세어 보니
 * 그 유형의 `reference_id`는 **챌린지 id가 아니다**(3건 중 0건만 일치).
 * 넣으면 존재하지 않는 방으로 보낸다 — `cheer_received`와 같은 함정이다.
 *
 * ⚠️ `challenge_peek_unlocked`도 뺀다. 그건 목적지가 `/home`이다(열람 카드가
 * 거기 있다) — 딥링크를 붙이면 목적지가 바뀐다.
 */
const CHALLENGE_DEEP_LINK_TYPES = new Set([
  "challenge_started",
  "challenge_ended",
  "challenge_invite",
  "challenge_starting_soon",
  "challenge_cancelled", // 0088
  "challenge_joined", // 0088
]);

/**
 * `reference_id`가 **세션 id**인 유형 (0082).
 *
 * 이 유형들만 `/feed?session=<id>`로 보낸다. 나머지는 목적지가 유형만으로
 * 정해진다.
 *
 * ⚠️⚠️ **`cheer_received`를 여기 넣지 마라.** `send_cheer`는
 * `notify(..., c.id, ...)`로 **cheers 행 id**를 넘긴다 — 세션 id가 아니다.
 * 넣으면 존재하지 않는 게시물로 보내게 된다. 세션 id를 넘기는 것은
 * `notify_reaction`(`new.session_id`) · `record_beaten`(`p_session_id`) ·
 * `post_session_comment`(`p_session_id`) 셋뿐이다.
 * (응원은 애초에 **진행 중** 세션이라 게시물이 아직 없다 — `/feed`가 맞다.)
 */
const SESSION_DEEP_LINK_TYPES = new Set([
  "comment_received", // 0082
  "reaction_received",
  "record_beaten",
]);

// 알림 유형별 푸시 탭 이동 목적지 (설계 §3)
const PUSH_URL_BY_TYPE: Record<string, string> = {
  reaction_received: "/feed",
  record_beaten: "/feed",
  // 0082 — 댓글. reference_id가 있으면 아래에서 `?session=`이 붙는다.
  comment_received: "/feed",
  // ⚠️ **2026-08-14 정정: `/record` → `/profile`.** 옛 주석은 "배지 진열대가
  //    기록 탭 달력에 있다(2026-07-21)"였는데, 그 뒤 진열대가 `GrowthHub`로
  //    들어가면서 **내 정보 탭으로 옮겨졌다.** 라우팅만 안 따라와서, 알림은
  //    "내 정보에서 확인해 보세요"라고 말하면서 기록 탭으로 보내고 있었다.
  badge_earned: "/profile",
  // 크루의 레벨업 — 성장 허브가 내 정보 탭에 있다 (0029)
  level_up: "/profile",
  rank_change: "/challenge",
  challenge_started: "/challenge",
  challenge_ended: "/challenge",
  // 배포·업데이트 소식 → 새 소식 상세 (A)
  app_update: "/whats-new",
  // 크루 요청·수락 → 크루 화면 (0038). 요청은 받은함에서 바로 수락해야 하고,
  // 수락 알림은 새 크루원을 목록에서 확인하게 된다.
  crew_request: "/crew",
  crew_accepted: "/crew",
  // 챌린지 초대 → 챌린지 탭에서 수락·거절한다 (0044)
  // ⚠ 이 Record는 Record<string, string>이라 exhaustive가 아니다. 유형을 늘려도
  //   컴파일러가 안 잡아주고 DEFAULT_PUSH_URL(/home)로 조용히 떨어진다.
  //   notification-bell.tsx의 TYPE_ICON과 달리 여기는 손으로 챙겨야 한다.
  challenge_invite: "/challenge",
  // 0052 — 새 신고는 관리자에게만 간다. 1단계에는 아직 /admin 신고 패널이 없어서
  // 알림 **본문에 신고 내용을 통째로** 싣는다(notify_bug_report_watchers). 그래서
  // 목적지가 어디든 읽는 데 지장이 없다. 2단계에서 /admin/reports로 바꾼다.
  bug_reported: "/admin",
  // 고쳐졌다는 소식은 신고자에게 간다. 무엇이 바뀌었는지는 새 소식에 적혀 있다.
  bug_fixed: "/whats-new",
  // 0054 — 5일 연속 달성으로 열린 2시간 열람창. 카드가 홈에 있다.
  // 창이 짧아서(2h) 목적지를 틀리면 도착 전에 닫힌다.
  challenge_peek_unlocked: "/home",
  // 0077 — 시작 예고·탈락 통보. 둘 다 챌린지 탭에서 할 일이 있다
  // (목표 세우기 / 다음 챌린지 찾기).
  challenge_starting_soon: "/challenge",
  challenge_dropped: "/challenge",
  // 0088 — 방장이 취소 · 공개 모집에 새 참가자. 아래에서 `?open=`이 붙는다.
  challenge_cancelled: "/challenge",
  challenge_joined: "/challenge",
  // 2026-08-16 — 계획 없는 날 제안. 기록 탭이 `?suggest`를 읽어 종목을 담고
  // 주소에서 지운다(`record/page.tsx`). 값 자체엔 의미가 없다 — 존재 플래그다.
  workout_suggestion: "/record?suggest=1",
};

const DEFAULT_PUSH_URL = "/home";

// 저장 시점에서 이 시간이 지난 알림은 푸시하지 않는다(재전송·지연 방어).
const PUSH_FRESH_WINDOW_MS = 10 * 60 * 1000;

export function pushPayloadFor(notification: {
  type: string;
  title: string | null;
  body: string | null;
  /**
   * `notifications.reference_id` (0082). 넘기면 게시물 딥링크가 붙는다.
   *
   * 선택 인자인 이유 — 안 넘기면 예전과 똑같이 유형별 고정 주소로 떨어진다.
   * 호출부(알림함·푸시 라우트)를 한 번에 다 고치지 않아도 안전하다.
   */
  referenceId?: string | null;
}): PushPayload {
  const base = PUSH_URL_BY_TYPE[notification.type] ?? DEFAULT_PUSH_URL;
  let deepLink = base;
  if (notification.referenceId) {
    if (SESSION_DEEP_LINK_TYPES.has(notification.type)) {
      deepLink = `/feed?session=${notification.referenceId}`;
    } else if (CHALLENGE_DEEP_LINK_TYPES.has(notification.type)) {
      deepLink = `/challenge?open=${notification.referenceId}`;
    }
  }

  return {
    title: notification.title || "GND",
    body: notification.body ?? "",
    url: deepLink,
  };
}

export function shouldDispatchPush(input: {
  createdAt: Date;
  pushedAt: Date | null;
  now: Date;
}): boolean {
  if (input.pushedAt !== null) return false;
  return input.now.getTime() - input.createdAt.getTime() <= PUSH_FRESH_WINDOW_MS;
}
