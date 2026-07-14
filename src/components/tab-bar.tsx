"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", icon: "🏠", label: "홈" },
  { href: "/feed", icon: "📣", label: "피드" },
  { href: "/record", icon: "🏋️", label: "기록" },
  { href: "/challenge", icon: "🏆", label: "챌린지" },
  { href: "/profile", icon: "👤", label: "내 정보" },
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
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[10.5px] font-bold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
