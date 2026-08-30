"use client";

import { Avatar } from "@/components/avatar";
import { useState } from "react";
import { CaptionPicker } from "@/components/feed/caption-picker";
import { CommentThread } from "@/components/feed/comment-thread";
import { LikersSheet } from "@/components/feed/likers-sheet";
import { ReactionBar } from "@/components/feed/reaction-bar";
import { PhotoStamp } from "@/components/photo-stamp";
import { SetBreakdown } from "@/components/workout/set-breakdown";
import { normalizeCaption } from "@/lib/domain/session-caption";
import {
  totalCommentCount,
  type SessionThread,
} from "@/lib/domain/session-comments";
import type { FeedItem } from "@/lib/social";
import { timeAgo } from "@/lib/time-ago";

/** 종목 요약 — 최대 3개 + "외 n종" */
function exerciseSummary(names: string[]): string {
  if (names.length === 0) return "운동 완료";
  const head = names.slice(0, 3).join(" · ");
  return names.length > 3 ? `${head} 외 ${names.length - 3}종` : head;
}

type Props = {
  item: FeedItem;
  userId: string;
  /** 닉네임·아바타 탭 — 호출부가 프로필 시트를 연다 */
  onProfileClick: () => void;
  /**
   * 카드가 스스로 바꾼 것(캡션·댓글)을 목록에 되돌린다 (2026-08-30).
   *
   * 없으면 카드는 **읽기 전용**이 된다 — 캡션 칩과 댓글 입력이 사라진다.
   * 호출부가 상태를 안 갖고 있는데 편집을 열어 두면, 사용자가 남긴 것이
   * 다음 렌더에 조용히 사라진다.
   */
  onItemChange?: (next: FeedItem) => void;
  /** 알림에서 들어온 게시물 — 댓글을 펼친 채로 연다 */
  openComments?: boolean;
};

/**
 * 요약 블록 자체가 상세 토글이다 (2026-08-04).
 *
 * 사진 카드와 일반 카드가 **같은 블록을 쓰므로** 여기 한 번만 붙이면 두 변형
 * 모두에서 펼칠 수 있다. 세트는 `getCrewFeed`가 이미 받아 온 것이라 새 질의가 없다.
 */
function WorkoutSummary({ item, stats }: { item: FeedItem; stats: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 pt-3 pb-2">
      <button
        type="button"
        aria-label={`${item.nickname} 운동 상세`}
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="w-full text-left"
      >
        <span className="block text-sm font-bold">
          {exerciseSummary(item.exerciseNames)}
        </span>
        <span className="mt-0.5 block text-xs font-bold text-muted">
          {stats.length > 0 && <>{stats.join(" · ")} · </>}
          <span className="text-accent">
            {expanded ? "접기 ▲" : "상세 ▼"}
          </span>
        </span>
      </button>
      {item.tabataMinutes && (
        <p className="mt-1.5 mr-1 inline-block rounded-full bg-accent-weak px-2.5 py-1 text-[11px] font-extrabold text-accent">
          🔥 전신 인터벌 {item.tabataMinutes}분
        </p>
      )}
      {item.recordNote && (
        <p className="mt-1.5 inline-block rounded-full bg-accent-weak px-2.5 py-1 text-[11px] font-extrabold text-accent">
          🏅 기록 갱신 · {item.recordNote}
        </p>
      )}
      {expanded && (
        <div className="mt-2.5">
          <SetBreakdown exercises={item.breakdown} />
        </div>
      )}
    </div>
  );
}

/**
 * 캡션 — 게시물에 붙은 **주인의 말** (2026-08-30).
 *
 * `workout_sessions.title`을 그린다. 0004부터 있던 컬럼이고 피드가 이미
 * 조회하고 있었는데 **렌더하는 곳이 한 군데도 없었다.**
 *
 * ⚠️ 댓글과 다른 것이다. 댓글은 대화(`cheers`), 캡션은 게시물의 말이다.
 *    캡션이 없으면 게시물이 순수 운동 데이터라 **답할 거리가 없어 댓글도 안 달린다.**
 *
 * 본인 게시물이면 비어 있어도 칩을 내준다 — 옛 게시물에도 나중에 붙일 수 있어야
 * 한다(`LatePhotoButton`과 같은 사상).
 */
function Caption({
  item,
  isMine,
  onItemChange,
}: {
  item: FeedItem;
  isMine: boolean;
  onItemChange?: (next: FeedItem) => void;
}) {
  const caption = normalizeCaption(item.title);
  const editable = isMine && onItemChange !== undefined;

  if (!caption && !editable) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pb-2">
      {caption && (
        <p className="text-[13.5px] leading-snug break-words">
          <span className="font-extrabold">{item.nickname}</span> {caption}
        </p>
      )}
      {editable && (
        <CaptionPicker
          sessionId={item.sessionId}
          caption={item.title}
          onSaved={(next) => onItemChange!({ ...item, title: next })}
        />
      )}
    </div>
  );
}

/** 액션 줄 + 캡션 + 댓글 — 사진 카드와 요약 카드가 **같은 것을 쓴다** */
function CardFooter({
  item,
  userId,
  onItemChange,
  openComments,
}: {
  item: FeedItem;
  userId: string;
  onItemChange?: (next: FeedItem) => void;
  openComments?: boolean;
}) {
  const [showComments, setShowComments] = useState(openComments ?? false);
  const [showLikers, setShowLikers] = useState(false);
  // 답글까지 센다 — 스레드에 5줄이 있는데 💬 2로 뜨면 안 맞는다
  const commentCount = totalCommentCount(item.thread);

  return (
    <>
      <Caption
        item={item}
        isMine={item.userId === userId}
        onItemChange={onItemChange}
      />

      {/* 인스타식 액션 줄 — 민무늬 아이콘 둘(❤️ 💬).
          🔥·👏 버튼과 공유(➤)·북마크(🔖)는 없다
          (사용자 결정 2026-08-30, 근거는 `reaction-bar.tsx` 주석). */}
      <div className="flex items-center gap-3.5 px-4 py-2.5">
        <ReactionBar
          sessionId={item.sessionId}
          userId={userId}
          counts={item.reactions}
          myReactions={item.myReactions}
        />
        <button
          type="button"
          onClick={() => setShowComments((open) => !open)}
          aria-expanded={showComments}
          aria-label={`댓글 ${commentCount}개`}
          className="flex items-center gap-1 py-1.5 text-[15px] leading-none"
        >
          <span className={showComments ? "" : "opacity-40 grayscale"}>💬</span>
          {commentCount > 0 && (
            <span
              className={`text-[12.5px] font-bold ${
                showComments ? "text-accent" : "text-muted"
              }`}
            >
              {commentCount}
            </span>
          )}
        </button>
      </div>

      {/* 좋아요 명단 — 새 조회가 없다. 피드가 이미 들고 있는 것을 펼칠 뿐이다 */}
      {item.likers.length > 0 && (
        <button
          type="button"
          onClick={() => setShowLikers(true)}
          className="-mt-1 px-4 pb-2 text-left text-[12px] font-bold text-muted"
        >
          좋아요 {item.likers.length}개 모두 보기
        </button>
      )}

      {showComments && onItemChange && (
        <CommentThread
          sessionId={item.sessionId}
          viewerId={userId}
          thread={item.thread}
          people={item.people}
          onThreadChange={(thread: SessionThread) =>
            onItemChange({ ...item, thread })
          }
        />
      )}

      {showLikers && (
        <LikersSheet
          likers={item.likers}
          people={item.people}
          viewerId={userId}
          onClose={() => setShowLikers(false)}
        />
      )}
    </>
  );
}

/** 사진 기록은 몰입형 카드, 일반 기록은 빠르게 읽는 요약 카드로 표시한다. */
export function FeedItemCard({
  item,
  userId,
  onProfileClick,
  onItemChange,
  openComments,
}: Props) {
  const stats: string[] = [];
  if (item.durationMinutes > 0) stats.push(`${item.durationMinutes}분`);
  if (item.volume.weightVolumeKg > 0)
    stats.push(`${Math.round(item.volume.weightVolumeKg).toLocaleString()}kg`);
  if (item.volume.bodyweightReps > 0)
    stats.push(`${item.volume.bodyweightReps}회`);
  if (item.volume.cardioDistanceMeters > 0)
    stats.push(`${(item.volume.cardioDistanceMeters / 1000).toFixed(1)}km`);

  if (item.photoUrl) {
    return (
      <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="relative aspect-[4/3] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photoUrl}
            alt={`${item.nickname}님의 운동 인증`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <PhotoStamp
            completedAt={item.completedAt}
            durationMinutes={item.durationMinutes}
            position="top"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent px-3.5 pt-10 pb-3 text-white">
            <button
              type="button"
              onClick={onProfileClick}
              aria-label={`${item.nickname} 프로필 보기`}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <Avatar
                src={item.avatarUrl}
                className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-white/20 text-base backdrop-blur"
              />
              <p className="truncate text-sm font-extrabold">
                {item.nickname}
                {item.userId === userId && (
                  <span className="ml-1 opacity-75">(나)</span>
                )}
                {item.streak > 0 && (
                  <span className="ml-1.5 text-xs">🔥{item.streak}</span>
                )}
              </p>
            </button>
            <p className="flex-none text-right text-xs font-bold text-white/85">
              {timeAgo(item.completedAt)} 운동 완료
            </p>
          </div>
        </div>

        <WorkoutSummary item={item} stats={stats} />
        <CardFooter
          item={item}
          userId={userId}
          onItemChange={onItemChange}
          openComments={openComments}
        />
      </article>
    );
  }

  return (
    <article className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <button
          type="button"
          onClick={onProfileClick}
          aria-label={`${item.nickname} 프로필 보기`}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <Avatar
            src={item.avatarUrl}
            className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-2 text-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">
              {item.nickname}
              {item.userId === userId && (
                <span className="ml-1 text-faint">(나)</span>
              )}
              {item.streak > 0 && (
                <span className="ml-1.5 text-xs font-bold text-accent">
                  🔥{item.streak}
                </span>
              )}
            </p>
            <p className="text-xs text-muted">
              {timeAgo(item.completedAt)} 운동 완료
            </p>
          </div>
        </button>
      </div>

      <WorkoutSummary item={item} stats={stats} />
      <CardFooter
        item={item}
        userId={userId}
        onItemChange={onItemChange}
        openComments={openComments}
      />
    </article>
  );
}
