"use client";

import { Icon } from "@/components/ui/icon";
import { notificationProgressKind, stripLeadingEmoji } from "@/lib/domain/progress-event";
import type { NotificationRow } from "@/lib/social";
import { timeAgo } from "@/lib/time-ago";

export const TYPE_ICON: Record<NotificationRow["type"], string> = {
  workout_started: "🏋️",
  cheer_received: "📣",
  poke: "👉",
  reaction_received: "💬",
  rank_change: "📈",
  record_viewed: "👀",
  morning_briefing: "☀️",
  challenge_started: "🚀",
  challenge_ended: "🏁",
  // 아래 셋은 타입 유니온에 빠져 있어 아이콘이 undefined로 렌더되던 것들이다
  record_beaten: "🏅",
  badge_earned: "🎖️",
  level_up: "⬆️",
  app_update: "🆕",
  // 0038 — 이 Record가 exhaustive라 알림 유형을 늘리면 여기가 먼저 깨진다.
  // 클릭 시 /crew로 보내는 라우팅은 크루 화면이 생기는 Task 7에서 붙인다.
  crew_request: "🤝",
  crew_accepted: "🤝",
  challenge_invite: "🏆", // 0042 유형, 0044부터 실제로 발송된다
  // 0052 — bug_reported는 관리자 1명(bug_report_watchers)에게만 간다.
  bug_reported: "🐞",
  bug_fixed: "🔧",
  challenge_peek_unlocked: "🎟️", // 0054 — 열람창 2시간 시작
  challenge_starting_soon: "⏰", // 0077 — 내일 시작해요
  challenge_dropped: "💤", // 0077 — 목표가 없어 이번 회차에서 빠졌어요
  workout_suggestion: "🎯", // 0078 — 계획 없는 날 운동 제안 (2026-11-06: 오늘의 퀘스트)
  comment_received: "💬", // 0082 — 게시물에 댓글
  challenge_cancelled: "💤", // 0088 — 방장이 취소
  challenge_joined: "🙌", // 0088 — 공개 모집에 새 참가자
  rank_drop: "📉", // 0140 — 챌린지 순위가 내려갔어요
};

/**
 * 알림함 한 줄 (시안 `알림함`, 2026-11-20).
 *
 * - 모든 줄: 아이콘 · 제목 · 부제 + 오른쪽에 **시간과 ›**(누르면 이동한다는 표시).
 * - 레벨업·진화 줄: 아이콘이 상자 안에 크게(진화 💪 / 레벨업 ⬆️), 제목 앞 이모지는 뗀다(아이콘이 대신한다).
 *   **안 읽은 것만** 강조 배경 — 새 소식이 눈에 띄고, 읽으면 다른 줄과 같아진다.
 *
 * ⚠️ 저장된 제목(`n.title`)은 푸시 알림에도 쓰여서 이모지가 들어 있다. 여기서는 **보여줄 때만** 뗀다.
 * ⚠️ 이동 목적지는 이 부품이 정하지 않는다(`onOpen`) — `pushPayloadFor` 한 곳이 알림함·푸시를 같이 정한다.
 */
export function NotificationItem({ n, onOpen }: { n: NotificationRow; onOpen: () => void }) {
  const kind = notificationProgressKind(n);
  const unread = n.read_at === null;
  const highlight = kind !== null && unread;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-kind={kind ?? undefined}
      data-highlight={highlight || undefined}
      data-unread={unread || undefined}
      className={`flex w-full items-center gap-3 py-3 text-left ${
        highlight
          ? "my-1 rounded-card-sm border border-accent/50 bg-accent-weak px-3"
          : "border-b border-line last:border-b-0"
      }`}
    >
      {n.type === "morning_briefing" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/icons/icon-192.png" alt="GND" className="h-7 w-7 flex-none rounded-lg" />
      ) : kind ? (
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent/15 text-[22px]">
          {kind === "evolution" ? "💪" : TYPE_ICON.level_up}
        </span>
      ) : (
        <span className="text-lg">{TYPE_ICON[n.type]}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{kind ? stripLeadingEmoji(n.title) : n.title}</p>
        {n.body && (
          <p
            className={`mt-0.5 text-xs text-muted ${
              // 순위 알림은 본문이 "나는 M위 · 이걸 하면 N위 탈환"까지 이어져 한 줄에
              // 안 들어간다 — 잘리면 핵심(탈환 제안)이 사라지므로 3줄까지 보여 준다.
              n.type === "rank_drop" ? "line-clamp-3" : "truncate"
            }`}
          >
            {n.body}
          </p>
        )}
      </div>
      <div className="flex flex-none items-center gap-1 text-faint">
        <span className="text-[11px]">{timeAgo(new Date(n.created_at))}</span>
        {unread && <span className="h-2 w-2 flex-none rounded-full bg-accent" />}
        <Icon name="chevron" size={14} />
      </div>
    </button>
  );
}
