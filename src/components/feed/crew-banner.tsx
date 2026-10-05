"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";

/**
 * 피드 하단 고정 배너 — `함께하는 크루가 더 강하게 만듭니다.` (2026-10-05 Performance Social).
 *
 * 사용자 지시(2026-10-05): *"맨 하단에 고정돼서 스크롤에 영향 없이 고정되게 하고, 클릭하면
 * 챌린지 생성으로 바로"*.
 *
 * ⚠️ **`fixed`가 아니다.** `(tabs)/layout.tsx`에서 스크롤 영역(`main`)과 탭바 **사이**에
 *    흐름으로 놓인다. 그래서 `main`이 이 배너 위에서 끝나 마지막 게시물이 가려지지 않고,
 *    탭바 높이(safe-area 포함)를 손으로 계산할 일도 없다. `fixed`로 바꾸면 피드 마지막
 *    카드가 배너 뒤로 숨는다.
 * ⚠️ 층(z-index)을 주지 않는다 — 운동 고르기 시트 등 `fixed` 창(z-20~50)이 그대로 덮는다
 *    (layout 주석의 아이폰 사고 참조).
 * ⚠️ 새 기능이 아니다. 챌린지 목록의 `+ 만들기`와 같은 창을 `/challenge?create=1`로 연다.
 * ⚠️ 사진은 패키지 크루 사진(가상 인물) — 참가자 사진으로 쓰지 않는다. 장식이라 `alt=""`.
 */
export function CrewBanner() {
  const pathname = usePathname();
  // 피드 첫 화면에서만. 정확히 일치해야 한다(`/feed/...` 하위 화면 없음)
  if (pathname !== "/feed") return null;

  return (
    <div className="flex-none px-3 pt-1.5">
      <Link
        href="/challenge?create=1"
        className="relative flex min-h-[56px] items-center gap-3 overflow-hidden rounded-[18px] border border-line-strong bg-surface px-3.5 py-2"
      >
        <Image
          src="/gnd/photos/crew-860.webp"
          alt=""
          fill
          sizes="430px"
          className="object-cover object-right opacity-60"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface via-surface/90 to-surface/20" />
        <Icon name="users" size={26} className="relative flex-none text-accent" />
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-extrabold">
            함께하는 크루가 더 강하게 만듭니다.
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted">
            크루와 챌린지를 만들고 함께 기록을 이어가세요.
          </span>
        </span>
        <Icon name="chevron" size={18} className="relative flex-none text-text" />
      </Link>
    </div>
  );
}
