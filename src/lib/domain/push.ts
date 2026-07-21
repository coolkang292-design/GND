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
  rank_change: "/challenge",
  challenge_started: "/challenge",
  challenge_ended: "/challenge",
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
