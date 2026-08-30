"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import {
  CHEER_TALLY_EMOJI,
  COMMENT_MAX_LENGTH,
  threadPreview,
  type SessionThread,
  type ThreadComment,
} from "@/lib/domain/session-comments";
import {
  deleteMyComment,
  editMyComment,
  getSessionThread,
  postSessionComment,
  SocialError,
} from "@/lib/social";
import { timeAgo } from "@/lib/time-ago";

export type People = Map<string, { nickname: string; avatarUrl: string | null }>;

function commentErrorMessage(e: unknown): string {
  if (e instanceof SocialError) {
    if (e.code === "comment_cooldown") return "조금 천천히 남겨 주세요";
    if (e.code === "comment_too_long")
      return `${COMMENT_MAX_LENGTH}자까지 쓸 수 있어요`;
    if (e.code === "comment_empty") return "내용을 적어 주세요";
    if (e.code === "session_not_found") return "지금은 볼 수 없는 운동이에요";
    if (e.code === "not_author") return "내가 쓴 댓글만 고칠 수 있어요";
    if (e.code === "comment_not_found") return "이미 지워진 댓글이에요";
  }
  return "댓글을 남기지 못했어요";
}

/** 말 없는 이모지 응원 — 스레드 머리에 한 줄로 접는다 */
function CheerTallyLine({ thread }: { thread: SessionThread }) {
  if (thread.cheerTotal === 0) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-faint">
      {thread.cheerTally.map((t) => (
        <span key={t.type}>
          {CHEER_TALLY_EMOJI[t.type] ?? "👏"}
          {t.count}
        </span>
      ))}
      <span>· 운동 중 응원 {thread.cheerTotal}</span>
    </p>
  );
}

function CommentLine({
  comment,
  people,
  isMine,
  onDelete,
  onEdit,
  onReply,
  /** 답글 줄은 들여쓰고 답글 버튼을 안 준다 — 2단계 고정이다 */
  isReply = false,
}: {
  comment: ThreadComment;
  people: People;
  isMine: boolean;
  onDelete: () => void;
  onEdit: (body: string) => Promise<void>;
  onReply?: () => void;
  isReply?: boolean;
}) {
  const who = people.get(comment.senderId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  async function commit() {
    const body = (editRef.current?.value ?? "").trim();
    if (body.length === 0 || body === comment.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(body);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className={`flex items-start gap-1.5 ${isReply ? "pl-8" : ""}`}>
        <input
          ref={editRef}
          defaultValue={comment.body}
          maxLength={COMMENT_MAX_LENGTH}
          aria-label="댓글 수정"
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-9 min-w-0 flex-1 rounded-card-sm border border-accent bg-bg px-3 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving}
          className="h-9 flex-none rounded-card-sm bg-accent px-3 text-[12.5px] font-extrabold text-accent-ink disabled:opacity-60"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="h-9 flex-none px-1 text-[11.5px] font-bold text-faint"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 ${isReply ? "pl-8" : ""}`}>
      <Avatar
        src={who?.avatarUrl ?? null}
        className={`mt-0.5 flex flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 ${
          isReply ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-xs"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug break-words">
          <span className="font-extrabold">{who?.nickname ?? "크루원"}</span>{" "}
          {/* 운동 중에 온 말은 그 순간에만 보낼 수 있던 것이라 표식을 남긴다 */}
          {comment.fromCheer && <span className="text-accent">📣 </span>}
          {comment.body}
          {/* ⚠️ 조용히 바꾸지 않는다. 답글이 달린 뒤에 몸통이 바뀌면
              읽는 사람에게는 답글이 엉뚱한 소리를 하는 것으로 보인다. */}
          {comment.editedAt && (
            <span className="ml-1 text-[11px] text-faint">(수정됨)</span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-2.5 text-[11px] text-faint">
          <span>{timeAgo(comment.createdAt)}</span>
          {onReply && (
            <button type="button" onClick={onReply} className="font-bold">
              답글 달기
            </button>
          )}
          {isMine && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-bold"
              >
                수정
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="font-bold underline"
              >
                삭제
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * 게시물 댓글 스레드 (0082, 대댓글 0084).
 *
 * ⚠️ **새 조회를 하지 않는다.** `thread`는 피드가 `cheers` 한 질의로 이미 접어
 *    넘겨준 것이다. 댓글을 달거나 지운 **뒤에만** 그 세션 하나를 다시 읽는다.
 *
 * ⚠️ 응원과 댓글을 한 스레드에 섞는다. 운동 중에 받은 "💪 힘내"도 그 운동에
 *    대한 말이라, 나누면 사용자에게는 **같은 운동의 대화가 두 군데로 쪼개져**
 *    보인다. 표시만 나눈다 — 말이 있으면 댓글 줄, 없으면 머리줄 집계.
 *
 * ⚠️ **답글은 2단계뿐이다.** 답글에 답글을 달면 서버가 같은 부모로 눕힌다
 *    (`post_session_comment`의 `coalesce(parent_id, id)`). 그래서 답글 줄에는
 *    "답글 달기"를 주지 않고, 재귀로 그리지도 않는다.
 */
export function CommentThread({
  sessionId,
  viewerId,
  thread,
  people,
  onThreadChange,
}: {
  sessionId: string;
  viewerId: string;
  thread: SessionThread;
  people: People;
  /** 서버에서 다시 읽은 스레드 — 부모가 카드 상태를 갱신한다 */
  onThreadChange: (next: SessionThread) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 답글을 달 부모 댓글. null이면 최상위 댓글이다 */
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = thread.comments.length;
  const shown = expanded ? thread.comments : threadPreview(thread, 2);

  async function refresh() {
    try {
      onThreadChange(await getSessionThread(sessionId));
    } catch {
      /* 갱신 실패는 화면을 막지 않는다 — 다음 로드에서 맞춰진다 */
    }
  }

  function startReply(comment: ThreadComment) {
    setReplyTo(comment);
    setExpanded(true);
    inputRef.current?.focus();
  }

  async function submit() {
    const body = (inputRef.current?.value ?? "").trim();
    if (body.length === 0) {
      setError("내용을 적어 주세요");
      return;
    }
    if (body.length > COMMENT_MAX_LENGTH) {
      setError(`${COMMENT_MAX_LENGTH}자까지 쓸 수 있어요`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postSessionComment(sessionId, body, replyTo?.id ?? null);
      if (inputRef.current) inputRef.current.value = "";
      setReplyTo(null);
      setExpanded(true);
      await refresh();
    } catch (e) {
      setError(commentErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function edit(commentId: string, body: string) {
    setError(null);
    try {
      await editMyComment(commentId, body);
      await refresh();
    } catch (e) {
      setError(commentErrorMessage(e));
    }
  }

  async function remove(commentId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteMyComment(commentId);
      await refresh();
    } catch {
      setError("삭제하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 pt-3 pb-3">
      <CheerTallyLine thread={thread} />

      {total > 2 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-[12px] font-bold text-muted"
        >
          댓글 {total}개 모두 보기
        </button>
      )}

      {shown.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          <CommentLine
            comment={c}
            people={people}
            isMine={c.senderId === viewerId}
            onDelete={() => void remove(c.id)}
            onEdit={(body) => edit(c.id, body)}
            onReply={() => startReply(c)}
          />
          {c.replies.map((reply) => (
            <CommentLine
              key={reply.id}
              comment={reply}
              people={people}
              isMine={reply.senderId === viewerId}
              onDelete={() => void remove(reply.id)}
              onEdit={(body) => edit(reply.id, body)}
              isReply
            />
          ))}
        </div>
      ))}

      {/* 답글 대상 표시 — 어디에 쓰는 중인지 안 보이면 엉뚱한 데 달린다 */}
      {replyTo && (
        <div className="flex items-center gap-2 rounded-card-sm bg-surface-2 px-2.5 py-1.5">
          <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-muted">
            {people.get(replyTo.senderId)?.nickname ?? "크루원"}님에게 답글
          </p>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="답글 취소"
            className="flex-none text-[11.5px] font-bold text-faint"
          >
            취소 ✕
          </button>
        </div>
      )}

      <div className="mt-0.5 flex gap-1.5">
        <input
          ref={inputRef}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={replyTo ? "답글 남기기…" : "댓글 남기기…"}
          aria-label={replyTo ? "답글 입력" : "댓글 입력"}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className="h-10 min-w-0 flex-1 rounded-card-sm border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="h-10 flex-none rounded-card-sm bg-accent px-3.5 text-sm font-extrabold text-accent-ink disabled:opacity-60"
        >
          {busy ? "…" : "등록"}
        </button>
      </div>

      {error && <p className="text-[11.5px] font-bold text-accent">{error}</p>}
    </div>
  );
}
