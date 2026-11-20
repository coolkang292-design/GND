"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { pushPayloadFor } from "@/lib/domain/push";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  subscribeNotifications,
  type NotificationRow,
} from "@/lib/social";
import { NotificationItem } from "@/components/notification-item";
import { Icon } from "@/components/ui/icon";

/** 🔔 + 미읽음 뱃지 + 알림함 바텀시트 (§9 알림함 — durable 저장 원천) */
export function NotificationBell() {
  const { userId, loading, configured } = useAuth();
  const router = useRouter();
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
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-text"
      >
        {/* 이모지 🔔 → SVG 벨 (2026-10-05 기획안 17-A). 이름은 위 aria-label이 말한다 */}
        <Icon name="bell" size={24} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-ink">
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
                  <NotificationItem
                    key={n.id}
                    n={n}
                    onOpen={() => {
                      setOpen(false);
                      // ⚠️ `reference_id`를 넘겨야 **그 게시물**로 간다 (0082).
                      //    빼면 피드 최상단으로 떨어져서, 누가 무엇에 댓글을
                      //    달았는지 사용자가 찾을 수 없다.
                      router.push(
                        pushPayloadFor({
                          type: n.type,
                          title: n.title,
                          body: n.body,
                          referenceId: n.reference_id,
                        }).url,
                      );
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
