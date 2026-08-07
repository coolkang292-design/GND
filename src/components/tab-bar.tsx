"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 하단 탭 (2026-08-07 사용자 제공 시안으로 이모지 → 이미지).
 *
 * ⚠️ `slug`에서 **두 개**의 파일 이름이 나온다 — `tab-<slug>.webp`와
 * `tab-<slug>-active.webp`. 시안이 두 상태를 따로 그려 준 것을 그대로 쓴다.
 *
 * ⚠️ **그런데 지금 두 자산은 사실상 같은 그림이다.** 시트를 세 판 받는 동안
 * "비활성은 속이 빈 외곽선, 활성은 채움"이 한 번도 안 나왔다 — 매번 둘 다
 * 채워져서 왔고, 실측 평균휘도 차이가 −0.026~−0.006으로 **눈에 안 보인다**
 * (`docs/ui-icon-asset-guide.md` 시트 D 참조).
 *
 * 그래서 지금 상태를 말해 주는 것은 **자산이 아니라 아래 둘**이다:
 *   ① 라벨 글자색 `text-accent` / `text-muted`
 *   ② 비활성 아이콘의 `opacity-50`
 * 흐린 것과 또렷한 것이 나란히 있어야 어느 쪽이 지금인지 읽힌다. 자산만으로는
 * 다섯 개가 전부 같은 밝기라 **선택된 탭이 없어 보인다.**
 *
 * ⚠️ 시안이 진짜로 속 빈 판을 주면 `opacity-50`을 떼도 된다. 그 전에는 떼지
 * 마라 — 떼는 순간 상태 표시가 글자색 하나로 줄어든다.
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
              className={`h-7 w-7 ${active ? "" : "opacity-50"}`}
            />
            <span className="text-[10.5px] font-bold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
