"use client";

import { useEffect } from "react";
import { Avatar } from "@/components/avatar";
import type { People } from "@/components/feed/comment-thread";

/**
 * 좋아요 누른 사람 명단 (0084, 사용자 요청 2026-08-30).
 *
 * ⚠️ **새 조회를 하지 않는다.** `likers`는 `fetchReactions`가 이미 `user_id`별로
 *    모아 두던 것을 버리지 않고 꺼낸 것이고, 이름은 `get_session_actor_profiles`가
 *    피드 로드 때 이미 실어 온 것이다.
 *
 * ⚠️ 이름이 없는 사람은 "크루원"으로 뜬다 — 정상이다. 좋아요 읽기 정책
 *    (`reactions_select_visible`)이 **글 주인의 크루 전원**에게 열려 있어서,
 *    나와 크루가 아닌 사람이 명단에 들어올 수 있다. 0084의 RPC가 그 사람들의
 *    닉네임·아바타만 열어 주지만, 그 사이 크루가 끊기면 다시 이름이 사라진다.
 */
export function LikersSheet({
  likers,
  people,
  viewerId,
  onClose,
}: {
  likers: string[];
  people: People;
  viewerId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="likers-title"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70dvh] flex-col rounded-t-[22px] border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card"
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-line" />
        <h3 id="likers-title" className="mb-2.5 text-base font-extrabold">
          좋아요 {likers.length}
        </h3>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {likers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              아직 좋아요가 없어요
            </p>
          ) : (
            likers.map((id) => {
              const who = people.get(id);
              return (
                <div
                  key={id}
                  className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0"
                >
                  <Avatar
                    src={who?.avatarUrl ?? null}
                    className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-base"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">
                    {who?.nickname ?? "크루원"}
                    {id === viewerId && (
                      <span className="ml-1 text-faint">(나)</span>
                    )}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
