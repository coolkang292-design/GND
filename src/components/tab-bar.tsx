"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 하단 탭 (2026-08-07 사용자 제공 시안으로 이모지 → 이미지).
 *
 * ⚠️ `slug`에서 **두 개**의 파일 이름이 나온다 — `tab-<slug>.webp`(비활성,
 * 테두리)와 `tab-<slug>-active.webp`(채움). 시안이 두 상태를 따로 그려 준
 * 것을 그대로 쓴다. 색만 바꾸는 것과 다르다: 활성 탭은 **속이 찬 그림**이라
 * 색을 못 보는 사람도 지금 어느 탭인지 알 수 있다.
 *
 * 자산은 `scripts/slice-ui-icons.py`가 만든다.
 */
const TABS = [
  { href: "/home", slug: "home", label: "홈" },
  { href: "/feed", slug: "feed", label: "피드" },
  { href: "/record", slug: "record", label: "기록" },
  { href: "/challenge", slug: "challenge", label: "챌린지" },
  { href: "/profile", slug: "profile", label: "내 정보" },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex-none grid grid-cols-5 border-t border-line bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-1.5 ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            {/* ⚠️ `alt=""` — 바로 아래 `tab.label`이 같은 이름을 글자로 말한다.
                alt를 채우면 스크린리더가 "홈 홈"으로 두 번 읽는다. 지금 탭인지는
                `aria-current`가 알려 준다(이미지가 아니라). */}
            <Image
              src={`/ui-icons/tab-${tab.slug}${active ? "-active" : ""}.webp`}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="text-[10.5px] font-bold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
