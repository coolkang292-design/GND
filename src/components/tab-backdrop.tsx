"use client";

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
 * ⚠️ 부모 `main`이 `relative isolate`여야 `-z-10`이 내용 뒤·배경 위에 깔린다.
 */
const BACKDROPS: Record<string, string> = {
  "/home": "/program-assets/lower-v2.webp",
  "/feed": "/program-assets/shoulder.webp",
  "/record": "/program-assets/interval.webp",
  "/challenge": "/program-assets/lean-v2.webp",
  "/profile": "/program-assets/chest.webp",
};

export function TabBackdrop() {
  const pathname = usePathname();
  const src = BACKDROPS[pathname];
  if (!src) return null;
  return (
    <div
      aria-hidden
      data-testid="tab-backdrop"
      data-src={src}
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden"
    >
      <Image
        src={src}
        alt=""
        fill
        priority={false}
        sizes="(max-width: 480px) 100vw, 480px"
        className="object-cover object-[50%_25%] opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/0 via-bg/40 to-bg" />
    </div>
  );
}
