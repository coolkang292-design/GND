"use client";

import { Avatar } from "@/components/avatar";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaptionPicker } from "@/components/feed/caption-picker";
import {
  CommentThread,
  type CommentAuthor,
} from "@/components/feed/comment-thread";
import { LikersSheet } from "@/components/feed/likers-sheet";
import { ReactionBar } from "@/components/feed/reaction-bar";
import { ImageLightbox } from "@/components/image-lightbox";
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
  /**
   * 댓글 작성자를 탭했다 (2026-08-31).
   *
   * ⚠️ 게시물 주인(`onProfileClick`)과 **다른 사람**일 수 있다. 0084가 세션
   *    주인의 크루까지 이름을 주기 때문이고, 그 사람은 내 크루가 아닐 수 있다.
   *    프로필 시트가 not_crew일 때 "크루 신청"으로 무너지므로 그대로 넘긴다.
   */
  onAuthorTap?: (author: CommentAuthor) => void;
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

      {/*
        이 운동 따라하기 (2026-08-31).

        ⚠️ **❤️ 💬 액션 줄에 두지 마라.** 그 줄은 "사람과 소통하는" 버튼만 남기려고
           공유·북마크까지 일부러 뺀 자리다(`reaction-bar.tsx` 주석). 따라하기는
           **운동을 실행하는** 버튼이라 성격이 다르다 — 종목·세트 옆이 제자리다.

        ⚠️ URL에 운동 JSON을 싣지 않는다. **session id 하나만** 넘기고 기록 화면이
           조회한다. 실어 보내면 RLS를 우회한 두 번째 진실이 생긴다.

        ⚠️ 누르는 순간 운동이 시작되지 않는다. 기록 화면 draft에 담기고,
           사용자가 무게를 확인한 뒤 기존 `운동 시작`을 누른다 — 친구가 든 무게가
           나에게 맞으리라는 보장이 없다.
      */}
      <Link
        href={`/record?copy=${item.sessionId}`}
        className="mt-2.5 flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-card-sm border border-accent/50 bg-accent-weak text-[12.5px] font-extrabold text-accent"
      >
        <span>🏋️</span> 이 운동 따라하기
      </Link>
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
  likeTrigger,
  onAuthorTap,
}: {
  item: FeedItem;
  userId: string;
  onItemChange?: (next: FeedItem) => void;
  openComments?: boolean;
  /** 사진 더블탭이 올려 보내는 신호 (Phase D) */
  likeTrigger?: number;
  /** 댓글 작성자를 탭했다 (2026-08-31) */
  onAuthorTap?: (author: CommentAuthor) => void;
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
          likeTrigger={likeTrigger}
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
          onAuthorTap={onAuthorTap}
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
  onAuthorTap,
}: Props) {
  // Phase D — 사진 상호작용. 사진이 없는 기록에서는 전부 놀고 있다.
  const [lightbox, setLightbox] = useState(false);
  const [burst, setBurst] = useState(false);
  const [likeTrigger, setLikeTrigger] = useState(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 카드가 화면에서 사라진 뒤 타이머가 살아 있으면 언마운트된 컴포넌트에
  // setState가 걸린다. 피드는 스크롤로 계속 바뀌는 목록이라 실제로 일어난다.
  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  const stats: string[] = [];
  if (item.durationMinutes > 0) stats.push(`${item.durationMinutes}분`);
  if (item.volume.weightVolumeKg > 0)
    stats.push(`${Math.round(item.volume.weightVolumeKg).toLocaleString()}kg`);
  if (item.volume.bodyweightReps > 0)
    stats.push(`${item.volume.bodyweightReps}회`);
  if (item.volume.cardioDistanceMeters > 0)
    stats.push(`${(item.volume.cardioDistanceMeters / 1000).toFixed(1)}km`);

  /**
   * 사진 탭 (Phase D).
   *
   * ⚠️ 한 번 탭과 두 번 탭이 같은 자리에 있다. 터치에서 더블탭은 click을 **두 번**
   *    쏘므로, 첫 click을 곧바로 처리하면 라이트박스가 열린 뒤에 좋아요가 붙는다.
   *    그래서 첫 click을 잠깐 재워 두고, 그 사이에 두 번째가 오면 취소한다.
   */
  function handlePhotoTap() {
    if (tapTimer.current) return;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      setLightbox(true);
    }, 260);
  }

  function handlePhotoDoubleTap() {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
    setLikeTrigger((n) => n + 1);
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
  }

  if (item.photoUrl) {
    return (
      <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {/* Phase D: 4/3 → 4/5. 세로 화면에서 사진이 크게 보이고, 스크롤 한 번에
            게시물 하나가 온다 — 인스타가 세로를 기본으로 두는 이유다. */}
        <div className="relative aspect-[4/5] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photoUrl}
            alt={`${item.nickname}님의 운동 인증`}
            className="h-full w-full object-cover"
            loading="lazy"
          />

          {/* 사진 탭 판. 한 번 = 크게 보기, 두 번 = 좋아요.
              ⚠️ 아래 PhotoStamp·프로필 오버레이보다 **먼저** 그린다 — 그래야
                 그 둘이 위에 남아 자기 탭을 그대로 받는다. */}
          <button
            type="button"
            aria-label={`${item.nickname}님의 인증사진 크게 보기 (두 번 탭하면 좋아요)`}
            onClick={handlePhotoTap}
            onDoubleClick={handlePhotoDoubleTap}
            className="absolute inset-0 h-full w-full"
          />

          {/* 더블탭 하트. 위에 떠서 잠깐 커졌다 사라진다. 눌린 것이 눈에 보이지
              않으면 사용자는 한 번 더 두드린다. */}
          {burst && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[88px] drop-shadow-lg"
              style={{ animation: "gnd-heart-burst 700ms ease-out forwards" }}
            >
              ❤️
            </span>
          )}

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
          likeTrigger={likeTrigger}
          onAuthorTap={onAuthorTap}
        />

        {/* Phase D: 라이트박스는 **이미 만들어져 있었고** 아무도 안 부르고 있었다.
            사진을 크게 볼 곳이 없으면 인증사진을 올릴 이유가 반쯤 사라진다. */}
        {lightbox && (
          <ImageLightbox
            src={item.photoUrl}
            alt={`${item.nickname}님의 운동 인증`}
            onClose={() => setLightbox(false)}
          />
        )}
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
        onAuthorTap={onAuthorTap}
      />
    </article>
  );
}
