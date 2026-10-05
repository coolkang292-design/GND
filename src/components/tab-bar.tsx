"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * 하단 탭 — Performance Social (2026-10-05).
 *
 * 예전(2026-08-07)엔 탭마다 `public/ui-icons/tab-*.webp` 두 장(기본·선택)을 썼는데,
 * 두 그림이 사실상 같아서 비활성에 `opacity-50`을 걸어 상태를 보였다. 이제 **SVG 한 벌을
 * `currentColor`로** 그린다 — 선택은 라임, 기본은 회색. 색이 상태를 말하므로 흐림은 뗐다.
 *
 * 지침(어플 UI 이미지/Performance-Social-2026-10-05/CLAUDE-적용지침.md §하단 메뉴):
 *  - 아이콘 24px · 터치 영역 44px 이상 · 라벨 11px · 선택 라벨도 라임
 *  - 확대·발광·이모지 혼용 금지 — 다섯 아이콘이 같은 시각 크기
 *  - 탭은 5개 유지. 가운데 `+` 같은 별도 기능을 붙이지 않는다
 *  - safe-area-inset-bottom
 *
 * ⚠️ 탭바는 `fixed`가 아니라 **흐름 안**(`flex-none`)에 있다. 그래서 스크롤 영역(`main`)이
 *    탭바 위에서 끝나고, 마지막 카드가 탭바 뒤에 가리지 않는다. 떠 있는 독처럼 보이게
 *    둥글린 것은 겉모습뿐이다 — `fixed`로 바꾸면 모든 화면에 아래 여백을 따로 줘야 한다.
 */
const TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/home", icon: "home", label: "홈" },
  { href: "/feed", icon: "feed", label: "피드" },
  { href: "/record", icon: "record", label: "기록" },
  { href: "/challenge", icon: "trophy", label: "챌린지" },
  { href: "/profile", icon: "person", label: "내 정보" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <div
      className="flex-none px-3 pt-1.5"
      style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      <nav className="grid grid-cols-5 rounded-[22px] border border-line bg-surface/95 shadow-card">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              {/* 아이콘은 aria-hidden — 아래 라벨이 같은 이름을 말한다 */}
              <Icon name={tab.icon} size={24} />
              <span className="text-[11px] font-bold leading-none">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
