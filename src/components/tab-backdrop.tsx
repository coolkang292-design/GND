"use client";

import { useEffect } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

/**
 * 탭 첫 화면의 배경 사진 (2026-10-05 사용자 지시 — 하단 탭 다섯 화면 모두, 운동 선택
 * 시안처럼 위쪽에 사진이 보이고 카드가 반투명해 사진이 은은히 비치게).
 *
 * 화면 위쪽에 깔고 아래로 갈수록 앱 배경색(bg)으로 사라진다. 이 컴포넌트가 있는 화면에서만
 * 카드(`bg-surface`·`bg-surface-2`)가 반투명해진다 — `globals.css`의
 * `main:has(> [data-testid="tab-backdrop"])` 규칙. 스크롤과 함께 올라간다(`main` 안의 absolute).
 *
 * ⚠️ **첫 화면만이다** — `/challenge/[id]`·`/record/programs` 같은 하위 화면에는 안 깐다.
 *    경로는 정확히 일치해야 한다.
 * ⚠️ 층(z-index)을 주지 않는다. 내용 뒤에 깔리는 것은 `(tabs)/layout.tsx`의 문서 순서
 *    (사진 → 내용 상자) 덕분이다. 예전처럼 `-z-10`을 쓰려면 부모가 층을 만들어야 하는데,
 *    그 층이 아이폰에서 운동 고르기 시트를 잘랐다(2026-10-05) — layout 주석 참조.
 * ⚠️ 부모 상자가 `main`의 안쪽 여백 안에 있어서 `-inset-x-4 -top-4`로 여백만큼 넓힌다.
 */
const BACKDROPS: Record<string, string> = {
  "/home": "/tab-backdrops/home.webp",
  "/feed": "/tab-backdrops/feed.webp",
  "/record": "/tab-backdrops/record.webp",
  "/challenge": "/tab-backdrops/challenge.webp",
  "/profile": "/tab-backdrops/profile.webp",
};

/** 앱을 연 뒤 이만큼은 미리 받지 않는다 — 첫 화면·첫 이동이 먼저다 */
const WARM_DELAY_MS = 2500;

/** 앱을 연 뒤 한 번만 미리 받는다 — 탭을 오갈 때마다 다시 걸 일이 아니다 */
let warmed = false;

/**
 * 나머지 탭의 사진을 미리 받아 둔다 (2026-10-05 사용자 신고 "피드 탭으로 옮길 때 로딩이 생긴다").
 *
 * 탭을 옮기면 사진 주소가 바뀌고 그때서야 받기 시작해서 위쪽이 비었다가 사진이 들어왔다.
 *
 * ⚠️⚠️ **한꺼번에, 바로 받지 마라** (같은 날 두 번째 신고 "피드로 옮기는 로딩이 더 늘었다").
 *    첫 판은 앱을 열고 한가해지자마자 네 장(변환본 약 350KB)을 동시에 받았다. 폰 회선에서
 *    피드로 넘어가는 파일·데이터 요청이 그 뒤에 줄을 서서 전환이 0.9초 → 3.4초가 됐다
 *    (제한 네트워크 측정). 그래서 ① 사진을 장당 30KB 안팎의 전용 파일로 줄이고
 *    (`scripts/build-tab-backdrops.py`) ② 앱을 연 뒤 잠시 기다렸다가 ③ 낮은 우선순위로
 *    **한 장씩** 받는다.
 */
function warmOtherBackdrops(current: string) {
  const rest = Object.values(BACKDROPS).filter((src) => src !== current);
  const next = () => {
    const src = rest.shift();
    if (!src) return;
    const img = new window.Image();
    img.decoding = "async";
    img.fetchPriority = "low";
    img.onload = img.onerror = next;
    img.src = src;
  };
  next();
}

export function TabBackdrop() {
  const pathname = usePathname();
  const src = BACKDROPS[pathname];

  useEffect(() => {
    if (warmed || !src) return;
    // ⚠️ 표식은 **실제로 받을 때** 세운다. 여기서 세우면 StrictMode가 이펙트를
    //    한 번 치우고 다시 돌릴 때 두 번째가 그냥 돌아가 아무것도 안 받는다.
    let idleId: number | null = null;
    const run = () => {
      if (warmed) return;
      warmed = true;
      warmOtherBackdrops(src);
    };
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(run, { timeout: 3000 });
      } else {
        run();
      }
    }, WARM_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null) window.cancelIdleCallback(idleId);
    };
  }, [src]);

  if (!src) return null;
  return (
    <div
      aria-hidden
      data-testid="tab-backdrop"
      data-src={src}
      className="pointer-events-none absolute -inset-x-4 -top-4 h-[560px] overflow-hidden"
    >
      {/*
        화면 맨 위에 깔리는 사진이라 지연 로딩(lazy)이면 안 된다 — 배치가 끝난 뒤에야
        받기 시작해서 그만큼 늦게 뜬다(2026-10-05).
        `unoptimized` — 이미 작게 만든 전용 파일이라 변환 서버를 거칠 이유가 없다(변환
        캐시가 비면 0.7~1초가 더 걸렸다). 우선순위는 기본값이다: 장식 사진이 피드
        데이터보다 먼저 받아질 이유가 없다.
      */}
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        loading="eager"
        className="object-cover object-[50%_25%] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/40 to-bg" />
    </div>
  );
}
