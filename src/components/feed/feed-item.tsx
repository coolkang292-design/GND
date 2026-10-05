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
import { PhotoCarousel } from "@/components/feed/photo-carousel";
import { PhotoStamp } from "@/components/photo-stamp";
import { SetBreakdown } from "@/components/workout/set-breakdown";
import { Icon } from "@/components/ui/icon";
import { exerciseSetSummary, feedStatCells } from "@/lib/domain/feed-card";
import { normalizeCaption } from "@/lib/domain/session-caption";
import {
  totalCommentCount,
  type SessionThread,
} from "@/lib/domain/session-comments";
import type { FeedItem } from "@/lib/social";
import { timeAgo } from "@/lib/time-ago";

/** `지훈님, 서연님 외 3명이 응원했어요` — 이름은 피드가 들고 있는 `people`에서만 꺼낸다 */
function likersSentence(item: FeedItem): string {
  const names = item.likers
    .map((id) => item.people.get(id)?.nickname)
    .filter((n): n is string => Boolean(n))
    .slice(0, 2);
  if (names.length === 0) return `${item.likers.length}명이 응원했어요`;
  const rest = item.likers.length - names.length;
  const head = names.map((n) => `${n}님`).join(", ");
  return rest > 0 ? `${head} 외 ${rest}명이 응원했어요` : `${head}이 응원했어요`;
}

/** 접힌 목록에 보이는 운동 수 — 나머지는 `+N종 더 보기` (시안은 3줄) */
const VISIBLE_EXERCISES = 3;

/** 닉네임 옆 연속일 — 이모지 🔥 대신 패키지 불꽃 (기획안 17-A) */
function StreakMark({ streak }: { streak: number }) {
  return (
    <span className="ml-0.5 inline-flex flex-none items-center gap-0.5 text-[12px] font-extrabold text-warn">
      {/* eslint-disable-next-line @next/next/no-img-element -- 16px 장식, 변환 서버를 거칠 이유가 없다 */}
      <img src="/gnd/decorations/flame-32.webp" alt="" width={14} height={14} className="h-3.5 w-3.5" />
      <span aria-label={`연속 ${streak}일`}>{streak}</span>
    </span>
  );
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
function WorkoutSummary({
  item,
  isMine,
}: {
  item: FeedItem;
  /** 내 기록이면 따라하기를 안 그린다 (2026-08-31 사용자 지시) */
  isMine: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLButtonElement>(null);
  const cells = feedStatCells(item);
  const rows = item.breakdown;
  const hidden = Math.max(0, rows.length - VISIBLE_EXERCISES);

  return (
    <div className="px-3.5 pt-3 pb-1">
      {/*
        숫자 줄 — 시안의 `52 MIN 운동 시간 · 18 SETS 전체 세트 · 6,840 KG 전체 볼륨`
        (2026-10-05 Performance Social). 0인 칸은 만들지 않는다(`feedStatCells`).
      */}
      {cells.length > 0 && (
        <div
          className="grid divide-x divide-line rounded-card-sm border border-line bg-surface-2/60 py-2.5"
          style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
        >
          {cells.map((c) => (
            <div key={c.key} className="flex min-w-0 items-center justify-center gap-2 px-1.5">
              <Icon name={c.icon} size={20} className="flex-none text-accent" />
              <div className="min-w-0 leading-none">
                <p className="flex items-baseline gap-1 whitespace-nowrap">
                  <strong className="text-[19px] font-black tracking-tight">{c.value}</strong>
                  <span className="text-[10.5px] font-extrabold">{c.unit}</span>
                </p>
                <p className="mt-1 truncate text-[10.5px] text-muted">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 인터벌·기록 갱신 줄 (2026-10-05 사용자 지시 "색상 팔레트에 맞게").
          금색·라임 테두리 알약을 걷고 숫자 줄·운동 목록과 **같은 상자 톤**(어두운 바탕 +
          얇은 회색 테두리 + 흰 글자)으로 맞췄다. 색은 아이콘 하나에만 — 라임. */}
      {(item.tabataMinutes || item.recordNote) && (
        <div className="mt-2 flex flex-col gap-1.5">
          {item.tabataMinutes && (
            <p className="flex items-center gap-2 rounded-card-sm border border-line bg-surface-2/60 px-3 py-2 text-[12.5px]">
              <Icon name="interval" size={16} className="flex-none text-accent" />
              <span className="font-extrabold">전신 인터벌 {item.tabataMinutes}분</span>
            </p>
          )}
          {item.recordNote && (
            <p className="flex items-start gap-2 rounded-card-sm border border-line bg-surface-2/60 px-3 py-2 text-[12.5px] leading-snug">
              <Icon name="pr" size={16} className="mt-px flex-none text-accent" />
              <span className="min-w-0">
                <span className="font-extrabold">기록 갱신</span>
                <span className="text-muted"> · {item.recordNote}</span>
              </span>
            </p>
          )}
        </div>
      )}

      {/*
        운동 목록 — 시안의 `1 벤치프레스 … 4세트 × 100kg ›` (2026-10-05).

        ⚠️ **목록 전체가 하나의 상세 토글이다** (2026-08-04 규약 유지). 사진 카드와 일반
           카드가 같은 블록을 쓰고, 세트는 `getCrewFeed`가 이미 받은 것이라 새 질의가 없다.
        ⚠️ 이름과 접근 이름 `… 운동 상세`를 바꾸지 마라 — 테스트와 화면 낭독이 그 이름으로 찾는다.
      */}
      <button
        ref={listRef}
        type="button"
        aria-label={`${item.nickname} 운동 상세`}
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="mt-2 block w-full overflow-hidden rounded-card-sm border border-line bg-surface-2/60 text-left"
      >
        {rows.length === 0 ? (
          <span className="flex items-center justify-between px-3 py-2.5 text-[13px] font-bold">
            {item.exerciseNames.length > 0 ? item.exerciseNames.join(" · ") : "운동 완료"}
            <Icon name="chevron" size={16} className={`text-faint transition-transform ${expanded ? "rotate-90" : ""}`} />
          </span>
        ) : (
          <ol className="divide-y divide-line">
            {(expanded ? rows : rows.slice(0, VISIBLE_EXERCISES)).map((ex, i) => (
              <li key={`${ex.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px] bg-surface-3 text-[11px] font-extrabold text-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{ex.name}</span>
                <span className="flex-none text-[12.5px] text-muted">{exerciseSetSummary(ex)}</span>
                <Icon
                  name="chevron"
                  size={15}
                  className={`flex-none text-faint transition-transform ${expanded ? "rotate-90" : ""}`}
                />
              </li>
            ))}
            {!expanded && hidden > 0 && (
              <li className="px-3 py-2 text-center text-[12px] font-bold text-accent">
                +{hidden}종 더 보기
              </li>
            )}
            {/* 펼친 뒤에는 접는 길이 보여야 한다 (2026-10-05 사용자 지적 "펼친 다음에 접기가 없네") */}
            {expanded && (
              <li className="flex items-center justify-center gap-1 px-3 py-2 text-[12px] font-bold text-muted">
                접기
                <Icon name="chevron" size={13} className="-rotate-90" />
              </li>
            )}
          </ol>
        )}
      </button>

      {/*
        이 운동 따라하기 (2026-08-31) — 규칙은 그대로다.
        ⚠️ 액션 줄(하트·댓글)에 두지 않는다 — 그 줄은 사람과 소통하는 버튼만.
        ⚠️ **상세를 펼쳐야 보인다**, **내 기록에는 안 그린다**, URL엔 session id 하나만.
        ⚠️ 누르는 순간 운동이 시작되지 않는다 — 기록 화면 draft에 담길 뿐이다.
      */}
      {expanded && (
        <div className="mt-2.5">
          <SetBreakdown exercises={item.breakdown} />
          {/* 세트 상세가 길면 위 목록의 `접기`가 화면 밖에 있다 — 끝에서도 접을 수 있게 */}
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              // 아래에서 접으면 내용이 줄며 화면이 다른 카드로 튄다 — 이 목록으로 되돌린다
              requestAnimationFrame(() =>
                listRef.current?.scrollIntoView?.({ block: "nearest" }),
              );
            }}
            className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1 rounded-card-sm border border-line text-[12.5px] font-bold text-muted"
          >
            세트 상세 접기
            <Icon name="chevron" size={13} className="-rotate-90" />
          </button>
          {!isMine && (
            <Link
              href={`/record?copy=${item.sessionId}`}
              className="mt-2.5 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-card-sm border border-accent/50 bg-black/30 text-[12.5px] font-extrabold text-accent"
            >
              <Icon name="repeat" size={15} />이 운동 따라하기
            </Link>
          )}
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
  const editable = isMine && onItemChange !== undefined;

  /* 2026-10-05: 캡션 **글자**는 카드가 직접 그린다 — 사진 카드는 사진 위 시안의
     `오늘도 한계를 넘었다.` 자리, 일반 카드는 머리 아래 제목 자리(`CaptionText`).
     여기는 **편집 칩**만 남는다. 같은 문장을 두 번 그리지 않는다. */
  if (!editable) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pb-2">
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

/**
 * 캡션 글자 — 시안의 사진 위 문구/일반 카드 제목 자리 (2026-10-05).
 * ⚠️ 시안의 큰 제목 `PUSH DAY ✓`는 만들지 않는다 — 피드 데이터에 운동 이름이 없다
 *    (사용자 결정 2026-10-05 "캡션만 표시"). 캡션이 없으면 아무것도 그리지 않는다.
 */
function CaptionText({ item, onPhoto }: { item: FeedItem; onPhoto?: boolean }) {
  const caption = normalizeCaption(item.title);
  if (!caption) return null;
  return onPhoto ? (
    /* 인증 도장(날짜·시각·WORKOUT COMPLETED 세 줄, 약 64px) 위에 놓는다 */
    <p className="pointer-events-none absolute inset-x-0 bottom-[78px] line-clamp-2 px-3.5 text-[19px] font-black leading-tight break-words text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
      {caption}
    </p>
  ) : (
    <p className="px-3.5 pt-2 text-[16px] font-extrabold leading-snug break-words">{caption}</p>
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
      <div className="flex items-center gap-5 px-4 py-2">
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
          className={`flex items-center gap-1.5 py-1.5 leading-none ${
            showComments ? "text-accent" : "text-muted"
          }`}
        >
          <Icon name="comment" size={22} />
          {commentCount > 0 && (
            <span className="text-[13px] font-bold">{commentCount}</span>
          )}
        </button>
      </div>

      {/* 좋아요 명단 — 새 조회가 없다. 피드가 이미 들고 있는 것을 펼칠 뿐이다 */}
      {/* 시안의 `지훈님, 서연님 외 30명이 응원했어요 ›` (2026-10-05).
          ⚠️ 새 조회가 없다 — `likers`·`people`은 피드가 이미 들고 있다. 누르면 같은 명단 시트. */}
      {item.likers.length > 0 && (
        <button
          type="button"
          onClick={() => setShowLikers(true)}
          aria-label={`좋아요 ${item.likers.length}개 모두 보기`}
          className="mx-3.5 mb-2.5 flex w-[calc(100%-1.75rem)] items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1.5 pr-3 pl-1.5 text-left"
        >
          <span className="flex flex-none -space-x-2">
            {item.likers.slice(0, 3).map((id) => (
              <Avatar
                key={id}
                src={item.people.get(id)?.avatarUrl ?? null}
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-surface-3 text-[11px]"
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
            {likersSentence(item)}
          </span>
          <Icon name="chevron" size={14} className="flex-none text-faint" />
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
          /* ⚠️ 명단을 먼저 닫는다. 안 닫으면 같은 z-50에 프로필 시트가 겹쳐
             올라와 두 장이 포개진 채로 보인다. */
          onAuthorTap={(author) => {
            setShowLikers(false);
            onAuthorTap?.(author);
          }}
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
  /**
   * 라이트박스로 연 사진의 index — `null`이면 닫힘 (0103).
   *
   * ⚠️ 예전에는 `boolean`이었다(사진이 한 장뿐이라 어느 것인지 물을 필요가
   *    없었다). 캐러셀에서는 **지금 보고 있는 장**을 열어야 하므로 index 를 든다.
   */
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);
  const [likeTrigger, setLikeTrigger] = useState(0);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 카드가 화면에서 사라진 뒤 타이머가 살아 있으면 언마운트된 컴포넌트에
  // setState가 걸린다. 피드는 스크롤로 계속 바뀌는 목록이라 실제로 일어난다.
  // (탭 판정 타이머는 0103에서 `PhotoCarousel`로 옮겼다 — 거기서 정리한다.)
  useEffect(
    () => () => {
      if (burstTimer.current) clearTimeout(burstTimer.current);
    },
    [],
  );


  /**
   * 사진 탭 (Phase D → 0103).
   *
   * ⚠️⚠️ **여기서 지연을 걸지 마라.** 한 번 탭과 두 번 탭을 가르는 260ms 지연은
   * `PhotoCarousel`이 갖고 있다(탭 판과 스와이프 가드가 거기 있으므로 한 곳에
   * 모은다). 여기서 한 번 더 재우면 **지연이 두 겹(520ms)**이 되어 라이트박스가
   * 눈에 띄게 굼떠진다 — 2026-09-10에 실제로 그렇게 만들었다가 테스트가 잡았다.
   */
  function handlePhotoTap(index: number) {
    // ⚠️ **지금 보고 있는 장**을 연다. 늘 0번을 열면 3번째 사진을 탭했는데
    //    첫 장이 커지는 꼴이 된다 (계획 §13).
    setLightboxAt(index);
  }

  function handlePhotoDoubleTap() {
    setLikeTrigger((n) => n + 1);
    setBurst(true);
    burstTimer.current = setTimeout(() => setBurst(false), 700);
  }

  /**
   * 사진이 있으면 몰입형 카드 (0103부터 최대 5장).
   *
   * ⚠️ **사진마다 게시물이 생기는 게 아니다.** 아래 `WorkoutSummary`·`CardFooter`가
   *    그리는 운동 데이터·캡션·좋아요·댓글은 전부 같은 `item.sessionId`에 붙는다.
   */
  const photos = item.photos;
  const openPhoto = lightboxAt === null ? null : photos[lightboxAt];
  if (photos.length > 0) {
    return (
      <article className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
        {/* ⚠️ **4/3이다. 4/5로 바꾸지 마라.**
            계획서(Phase D)는 인스타를 따라 4/5를 적었고 실제로 그렇게 바꿔 봤는데,
            사용자가 화면을 보고 되돌렸다 — *"이전게 더 나은거 같은데 너무 길쭉함"*
            (2026-08-31). 인스타는 사진이 주인공이라 세로가 길어도 되지만, GND의
            카드는 사진 아래에 종목·세트·캡션·액션 줄이 붙는다. 사진이 길어지면
            그것들이 접힘선 밖으로 밀린다.
            ⚠️ **사진이 여러 장이라고 카드가 길어지지 않는다** — 비율은 `PhotoCarousel`
               안에 있고 장수와 무관하다. */}
        <PhotoCarousel
          photos={photos}
          alt={`${item.nickname}님의 인증사진`}
          onTap={handlePhotoTap}
          onDoubleTap={handlePhotoDoubleTap}
        >
          {/* 더블탭 하트. 위에 떠서 잠깐 커졌다 사라진다. 눌린 것이 눈에 보이지
              않으면 사용자는 한 번 더 두드린다. */}
          {burst && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[88px] drop-shadow-lg"
              style={{ animation: "gnd-heart-burst 700ms ease-out forwards" }}
            >
              <Icon name="heart" size={88} filled className="text-accent" />
            </span>
          )}

          {/* 2026-10-05 Performance Social — 시안대로 **사람이 위, 인증 도장이 아래**.
              (예전엔 도장이 위, 사람이 아래였다.) 인증 도장은 지우지 않는다 — 언제 찍은
              운동인지 말해 주는 증거다. */}
          <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-3.5 pt-3 pb-8 text-white">
            <button
              type="button"
              onClick={onProfileClick}
              aria-label={`${item.nickname} 프로필 보기`}
              className="flex min-w-0 items-center gap-2.5 text-left"
            >
              <Avatar
                src={item.avatarUrl}
                className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border-2 border-white/25 bg-white/15 text-lg"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1 truncate text-[15px] font-extrabold">
                  {item.nickname}
                  {item.userId === userId && <span className="opacity-75">(나)</span>}
                  {item.streak > 0 && <StreakMark streak={item.streak} />}
                </span>
                <span className="block text-[12px] text-white/75">
                  {timeAgo(item.completedAt)} 운동 완료
                </span>
              </span>
            </button>
          </div>
          <PhotoStamp
            completedAt={item.completedAt}
            durationMinutes={item.durationMinutes}
            position="bottom"
          />
          <CaptionText item={item} onPhoto />
        </PhotoCarousel>

        <WorkoutSummary item={item} isMine={item.userId === userId} />
        <CardFooter
          item={item}
          userId={userId}
          onItemChange={onItemChange}
          openComments={openComments}
          likeTrigger={likeTrigger}
          onAuthorTap={onAuthorTap}
        />

        {/* Phase D: 라이트박스는 **이미 만들어져 있었고** 아무도 안 부르고 있었다.
            사진을 크게 볼 곳이 없으면 인증사진을 올릴 이유가 반쯤 사라진다.
            ⓘ 0103: 여러 장이면 **탭한 그 장**이 열린다. 라이트박스 안에서 좌우로
              넘기는 것은 이번 범위가 아니다 — 피드 캐러셀이 우선이다 (계획 §13). */}
        {openPhoto && (
          <ImageLightbox
            src={openPhoto.url}
            alt={
              photos.length > 1
                ? `${item.nickname}님의 운동 인증 (${(lightboxAt ?? 0) + 1}/${photos.length})`
                : `${item.nickname}님의 운동 인증`
            }
            onClose={() => setLightboxAt(null)}
          />
        )}
      </article>
    );
  }

  return (
    <article className="rounded-card border border-line-strong bg-surface shadow-card">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5">
        <button
          type="button"
          onClick={onProfileClick}
          aria-label={`${item.nickname} 프로필 보기`}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <Avatar
            src={item.avatarUrl}
            className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border-2 border-line-strong bg-surface-2 text-lg"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-[15px] font-extrabold">
              {item.nickname}
              {item.userId === userId && <span className="text-faint">(나)</span>}
              {item.streak > 0 && <StreakMark streak={item.streak} />}
            </p>
            <p className="text-[12px] text-muted">
              {timeAgo(item.completedAt)} 운동 완료
            </p>
          </div>
        </button>
      </div>

      <CaptionText item={item} />
      <WorkoutSummary item={item} isMine={item.userId === userId} />
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
