"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SessionPhoto } from "@/lib/domain/workout-photos";

/**
 * 운동 게시물의 사진 자리 — 1장이면 예전 그대로, 2~5장이면 4:3 캐러셀 (0103).
 *
 * ⚠️⚠️ **4/3이다. 4/5로 바꾸지 마라.** `feed-item.tsx`가 이미 한 번 겪었다 —
 * 계획서는 인스타를 따라 4/5를 적었고 실제로 바꿔 봤는데 사용자가 화면을 보고
 * 되돌렸다(*"이전게 더 나은거 같은데 너무 길쭉함"*, 2026-08-31). 인스타는 사진이
 * 주인공이지만 GND 카드는 사진 **아래**에 종목·세트·캡션·액션 줄이 붙는다.
 * **사진이 여러 장이라고 카드가 길어지지 않는다** — 장수와 높이는 무관하다.
 *
 * ⚠️ **사진마다 게시물이 생기는 게 아니다.** 좋아요·댓글·캡션·운동 데이터는 전부
 * 바깥 카드의 같은 `sessionId`에 붙는다. 이 컴포넌트는 사진만 넘긴다.
 *
 * **왜 스크롤 스냅인가** — 제스처 라이브러리를 안 쓴다. `snap-x snap-mandatory`는
 * 브라우저의 네이티브 관성 스크롤을 그대로 쓰므로 폰에서 손맛이 가장 자연스럽고,
 * **스크롤은 click을 쏘지 않아서** 넘기는 동작이 탭으로 새지 않는다(그 위에
 * 손가락 이동량 가드를 한 겹 더 뒀다 — 아래 `onTouch*` 참조).
 */
export function PhotoCarousel({
  photos,
  alt,
  onTap,
  onDoubleTap,
  children,
}: {
  /** `sortOrder` 오름차순. 0장이면 이 컴포넌트를 부르지 않는다 (부모가 분기) */
  photos: SessionPhoto[];
  /** 화면에 글자가 없는 자리라 반드시 채운다 — 비우면 낭독에서 통째로 사라진다 */
  alt: string;
  /** 한 번 탭 — **지금 보고 있는** 사진의 index 를 넘긴다 (라이트박스가 그 장을 연다) */
  onTap: (index: number) => void;
  /** 두 번 탭 — 좋아요 */
  onDoubleTap: () => void;
  /** 사진 위에 겹쳐 그릴 것 (PhotoStamp · 프로필 줄 · 하트) */
  children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  /** 이번 터치에서 손가락이 많이 움직였나 — 움직였으면 그 뒤 click 은 무시한다 */
  const swipedRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const many = photos.length > 1;

  function handleScroll() {
    const el = trackRef.current;
    if (!el) return;
    const width = el.clientWidth;
    // jsdom·초기 렌더처럼 폭을 못 재는 순간이 있다. 0으로 나누면 NaN 이 되어
    // 카운터가 "NaN / 3" 으로 깨진다.
    if (width <= 0) return;
    const next = Math.round(el.scrollLeft / width);
    setIndex(Math.min(Math.max(next, 0), photos.length - 1));
  }

  function goTo(next: number) {
    setIndex(next);
    const el = trackRef.current;
    // jsdom 에는 scrollTo 가 없다 — 점 클릭이 테스트에서 죽지 않게 확인하고 부른다
    el?.scrollTo?.({ left: el.clientWidth * next, behavior: "smooth" });
  }

  /**
   * 탭 판정. `feed-item.tsx`가 쓰던 260ms 지연 규약을 그대로 쓴다 — 터치에서
   * 더블탭은 click 을 **두 번** 쏘므로, 첫 click 을 잠깐 재워 두고 그 사이에
   * 두 번째가 오면 취소한다. 그래야 라이트박스가 열린 뒤에 좋아요가 붙지 않는다.
   */
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 카드가 스크롤로 사라진 뒤 타이머가 깨어나면 언마운트된 컴포넌트를 건드린다.
  // 피드는 계속 바뀌는 목록이라 실제로 일어난다 (`feed-item.tsx`가 같은 이유로
  // 갖고 있던 정리를 이 컴포넌트로 옮겨 왔다).
  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  function handleClick(slideIndex: number) {
    // ⚠️ 넘기려고 문지른 것을 탭으로 읽으면 사진을 넘길 때마다 라이트박스가
    //    열려서 캐러셀을 쓸 수가 없다 (계획 §13).
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    if (tapTimer.current) return;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      onTap(slideIndex);
    }, 260);
  }

  function handleDoubleClick() {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
    onDoubleTap();
  }

  return (
    <div className="relative aspect-[4/3] w-full">
      {many ? (
        <div
          ref={trackRef}
          data-carousel-track
          onScroll={handleScroll}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((photo, i) => (
            <div key={photo.id} className="relative h-full w-full flex-none snap-center">
              <Slide
                photo={photo}
                alt={alt}
                index={i}
                total={photos.length}
                onClick={() => handleClick(i)}
                onDoubleClick={handleDoubleClick}
                startPointRef={startPointRef}
                swipedRef={swipedRef}
              />
            </div>
          ))}
        </div>
      ) : (
        <Slide
          photo={photos[0]}
          alt={alt}
          index={0}
          total={1}
          onClick={() => handleClick(0)}
          onDoubleClick={handleDoubleClick}
          startPointRef={startPointRef}
          swipedRef={swipedRef}
        />
      )}

      {/* 우측 상단 `2 / 4`. ⚠️ PhotoStamp 가 top 을 쓰므로 오른쪽으로 붙인다 */}
      {many && (
        <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
          {index + 1} / {photos.length}
        </span>
      )}

      {/*
        좌우 넘김 버튼 (2026-09-10, 사용자 지적: *"사진 넘기는 버튼도 없음"*).

        ⚠️ **스와이프만으로는 부족하다.** 점 6px은 누를 수 있는 것처럼 안 보이고,
           **마우스에는 스와이프가 아예 없다** — PC·태블릿에서는 넘길 방법이
           없는 카드가 된다. 끝에서는 그리지 않는다(`movePhoto`가 테두리를
           감싸지 않는 것과 같은 이유 — 마지막에서 첫 장으로 튀면 놀란다).
      */}
      {many && index > 0 && (
        <button
          type="button"
          aria-label="이전 사진"
          onClick={() => goTo(index - 1)}
          className="absolute left-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-[17px] font-bold text-white backdrop-blur"
        >
          ‹
        </button>
      )}
      {many && index < photos.length - 1 && (
        <button
          type="button"
          aria-label="다음 사진"
          onClick={() => goTo(index + 1)}
          className="absolute right-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-[17px] font-bold text-white backdrop-blur"
        >
          ›
        </button>
      )}

      {/* 점. ⚠️ 프로필 줄이 bottom-0 을 차지하므로 그 **위**에 띄운다 */}
      {many && (
        <div
          role="tablist"
          aria-label="사진 넘기기"
          className="absolute inset-x-0 bottom-12 z-10 flex items-center justify-center"
        >
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1}번째 사진 보기`}
              onClick={() => goTo(i)}
              // ⚠️ 보이는 점은 6px이지만 **누르는 판은 24×32px**이다. 6px짜리
              //    터치 타깃은 폰에서 못 맞춘다(iOS HIG 최소는 44px이고, 점이
              //    다닥다닥 붙는 자리라 그만큼은 못 주되 최대한 넓힌다).
              className="flex h-8 w-6 items-center justify-center"
            >
              <span
                aria-hidden
                className={
                  i === index
                    ? "h-1.5 w-1.5 rounded-full bg-white shadow"
                    : "h-1.5 w-1.5 rounded-full bg-white/45"
                }
              />
            </button>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

/** 사진 한 장 + 그 위의 탭 판 */
function Slide({
  photo,
  alt,
  index,
  total,
  onClick,
  onDoubleClick,
  startPointRef,
  swipedRef,
}: {
  photo: SessionPhoto;
  alt: string;
  index: number;
  total: number;
  onClick: () => void;
  onDoubleClick: () => void;
  startPointRef: React.RefObject<{ x: number; y: number } | null>;
  swipedRef: React.RefObject<boolean>;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={total > 1 ? `${alt} (${index + 1}/${total})` : alt}
        className="h-full w-full object-cover"
        // ⚠️ 전부 lazy 다. 20개 카드 × 5장이면 100장인데 처음부터 다 받으면
        //    첫 피드가 눈에 띄게 느려진다. 보이는 장은 어차피 즉시 받는다.
        loading="lazy"
        draggable={false}
      />
      {/* 탭 판. ⚠️ 겹쳐 그리는 것들(PhotoStamp·프로필)보다 **먼저** 그린다 —
          그래야 그것들이 위에 남아 자기 탭을 그대로 받는다. */}
      <button
        type="button"
        aria-label={
          total > 1
            ? `${alt} ${index + 1}번째 크게 보기 (두 번 탭하면 좋아요)`
            : `${alt} 크게 보기 (두 번 탭하면 좋아요)`
        }
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onTouchStart={(e) => {
          const t = e.touches[0];
          startPointRef.current = t ? { x: t.clientX, y: t.clientY } : null;
          swipedRef.current = false;
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          const from = startPointRef.current;
          if (!t || !from) return;
          // 10px — 손가락은 탭할 때도 몇 px 흔들린다. 그보다 크면 넘기려는 뜻이다.
          if (Math.abs(t.clientX - from.x) > 10 || Math.abs(t.clientY - from.y) > 10) {
            swipedRef.current = true;
          }
        }}
        className="absolute inset-0 h-full w-full"
      />
    </>
  );
}
