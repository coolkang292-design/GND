"use client";

import { useEffect } from "react";
import Image, { getImageProps } from "next/image";
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
 * ⚠️ 부모 `main`이 `relative isolate`여야 `-z-10`이 내용 뒤·배경 위에 깔린다.
 */
const BACKDROPS: Record<string, string> = {
  "/home": "/program-assets/lower-v2.webp",
  "/feed": "/program-assets/shoulder.webp",
  "/record": "/program-assets/interval.webp",
  "/challenge": "/program-assets/lean-v2.webp",
  "/profile": "/program-assets/chest.webp",
};

const SIZES = "(max-width: 480px) 100vw, 480px";

/** 앱을 연 뒤 한 번만 미리 받는다 — 탭을 오갈 때마다 다시 걸 일이 아니다 */
let warmed = false;

/**
 * 나머지 탭의 사진을 미리 받아 둔다 (2026-10-05 사용자 신고 "피드 탭으로 옮길 때 로딩이 생긴다").
 *
 * 탭을 옮기면 사진 주소가 바뀌고, 그때서야 받기 시작해서 위쪽이 0.1~1초 비었다가
 * 사진이 들어왔다(프로덕션 실측 — 변환 캐시 MISS면 0.7~1초). 화면에 깔리는 `<img>`와
 * **같은 srcset·sizes**로 받아야 브라우저가 같은 크기를 골라 캐시가 맞는다 —
 * 그래서 주소를 손으로 만들지 않고 `getImageProps`에서 받는다.
 */
function warmOtherBackdrops(current: string) {
  for (const src of Object.values(BACKDROPS)) {
    if (src === current) continue;
    const { props } = getImageProps({ src, alt: "", fill: true, sizes: SIZES });
    const img = new window.Image();
    img.decoding = "async";
    // sizes를 srcset보다 먼저 — 순서가 바뀌면 기본값(100vw)으로 고를 수 있다
    img.sizes = props.sizes ?? SIZES;
    if (props.srcSet) img.srcset = props.srcSet;
    img.src = props.src;
  }
}

export function TabBackdrop() {
  const pathname = usePathname();
  const src = BACKDROPS[pathname];

  useEffect(() => {
    if (warmed || !src) return;
    // ⚠️ 표식은 **실제로 받을 때** 세운다. 여기서 세우면 StrictMode가 이펙트를
    //    한 번 치우고 다시 돌릴 때 두 번째가 그냥 돌아가 아무것도 안 받는다.
    const run = () => {
      if (warmed) return;
      warmed = true;
      warmOtherBackdrops(src);
    };
    // 지금 화면의 사진·데이터가 먼저다 — 한가해진 뒤에 받는다
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1200);
    return () => window.clearTimeout(id);
  }, [src]);

  if (!src) return null;
  return (
    <div
      aria-hidden
      data-testid="tab-backdrop"
      data-src={src}
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden"
    >
      {/*
        화면 맨 위에 깔리는 사진이라 지연 로딩(lazy)이면 안 된다 — 배치가 끝난 뒤에야
        받기 시작해서 그만큼 늦게 뜬다(2026-10-05).
      */}
      <Image
        src={src}
        alt=""
        fill
        loading="eager"
        fetchPriority="high"
        sizes={SIZES}
        className="object-cover object-[50%_25%] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/40 to-bg" />
    </div>
  );
}
