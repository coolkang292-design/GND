"use client";

import { useEffect } from "react";
import { Avatar } from "@/components/avatar";
import type { CommentAuthor, People } from "@/components/feed/comment-thread";

/**
 * 좋아요 누른 사람 명단 (0084, 사용자 요청 2026-08-30).
 *
 * ⚠️ **새 조회를 하지 않는다.** `likers`는 `fetchReactions`가 이미 `user_id`별로
 *    모아 두던 것을 버리지 않고 꺼낸 것이고, 이름은 `get_session_actor_profiles`가
 *    피드 로드 때 이미 실어 온 것이다.
 *
 * ⚠️ 이름을 눌러 프로필을 연다 (2026-08-31). 댓글 작성자는 눌리는데 여기만 안
 *    눌려서 사용자가 잡았다 — 같은 "이 사람 누구지?"인데 한쪽만 되면 고장으로
 *    읽힌다. `CommentAuthor`·`onAuthorTap`을 그대로 쓴다(같은 것을 두 벌로 만들면
 *    언젠가 한쪽만 고쳐진다).
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
  onAuthorTap,
}: {
  likers: string[];
  people: People;
  viewerId: string;
  onClose: () => void;
  /**
   * 이름을 탭했다 (2026-08-31).
   *
   * ⚠️ 없거나 이름을 모르는 사람은 **버튼으로 만들지 않는다.** 눌리는데 아무
   *    일도 안 일어나는 자리는 "고장난 앱"으로 읽힌다 — 댓글 쪽과 같은 규칙이다.
   */
  onAuthorTap?: (author: CommentAuthor) => void;
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
              // 나 자신이거나 이름을 모르면 누를 곳이 없다 — 열 프로필이 없다.
              const tappable = Boolean(onAuthorTap && who && id !== viewerId);
              const inner = (
                <>
                  <Avatar
                    src={who?.avatarUrl ?? null}
                    className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-base"
                  />
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-bold">
                    {who?.nickname ?? "크루원"}
                    {id === viewerId && (
                      <span className="ml-1 text-faint">(나)</span>
                    )}
                  </span>
                </>
              );
              const rowClass =
                "flex w-full items-center gap-2.5 border-b border-line py-2.5 last:border-b-0";
              return tappable ? (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    onAuthorTap!({
                      userId: id,
                      nickname: who!.nickname,
                      avatarUrl: who!.avatarUrl,
                    })
                  }
                  aria-label={`${who!.nickname} 프로필 보기`}
                  className={rowClass}
                >
                  {inner}
                </button>
              ) : (
                <div key={id} className={rowClass}>
                  {inner}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
