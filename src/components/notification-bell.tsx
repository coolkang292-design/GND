"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  subscribeNotifications,
  type NotificationRow,
} from "@/lib/social";
import { timeAgo } from "@/lib/time-ago";

const TYPE_ICON: Record<NotificationRow["type"], string> = {
  workout_started: "🏋️",
  cheer_received: "📣",
  poke: "👉",
  reaction_received: "💬",
  rank_change: "📈",
  record_viewed: "👀",
  morning_briefing: "☀️",
  challenge_started: "🚀",
  challenge_ended: "🏁",
};

/** 🔔 + 미읽음 뱃지 + 알림함 바텀시트 (§9 알림함 — durable 저장 원천) */
export function NotificationBell() {
  const { userId, loading, configured } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || loading || !userId) return;
    let cancelled = false;

    getUnreadNotificationCount()
      .then((n) => {
        if (!cancelled) setUnread(n);
      })
      .catch(() => {});

    const unsubscribe = subscribeNotifications(userId, () => {
      setUnread((n) => n + 1);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [configured, loading, userId]);

  async function openSheet() {
    setOpen(true);
    setReady(false);
    try {
      const list = await getNotifications();
      setRows(list);
      await markAllNotificationsRead();
      setUnread(0);
    } catch {
      /* 목록 실패 시 빈 상태 노출 */
    } finally {
      setReady(true);
    }
  }

  if (!configured || !userId) return null;

  return (
    <>
      <button
        onClick={() => void openSheet()}
        aria-label="알림함"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-base"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 shadow-card">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <h3 className="mb-2.5 text-base font-extrabold">알림</h3>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!ready ? (
                <p className="py-8 text-center text-sm text-muted">
                  불러오는 중…
                </p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  아직 알림이 없어요
                </p>
              ) : (
                rows.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-2.5 border-b border-line py-3 last:border-b-0"
                  >
                    {n.type === "morning_briefing" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src="/icons/icon-192.png"
                        alt="GND"
                        className="mt-0.5 h-7 w-7 flex-none rounded-lg"
                      />
                    ) : (
                      <span className="mt-0.5 text-lg">{TYPE_ICON[n.type]}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-faint">
                        {timeAgo(new Date(n.created_at))}
                      </p>
                    </div>
                    {n.read_at === null && (
                      <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
