export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

// 알림 유형별 푸시 탭 이동 목적지 (설계 §3)
const PUSH_URL_BY_TYPE: Record<string, string> = {
  reaction_received: "/feed",
  record_beaten: "/feed",
  // 배지 진열대가 기록 탭 달력에 있다 (설계 2026-07-21)
  badge_earned: "/record",
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
};

const DEFAULT_PUSH_URL = "/home";

// 저장 시점에서 이 시간이 지난 알림은 푸시하지 않는다(재전송·지연 방어).
const PUSH_FRESH_WINDOW_MS = 10 * 60 * 1000;

export function pushPayloadFor(notification: {
  type: string;
  title: string | null;
  body: string | null;
}): PushPayload {
  return {
    title: notification.title || "GND",
    body: notification.body ?? "",
    url: PUSH_URL_BY_TYPE[notification.type] ?? DEFAULT_PUSH_URL,
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
