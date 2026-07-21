"use client";

import { useEffect, useState } from "react";
import {
  badgeShelf,
  earnedBadgeCount,
  type BadgeShelfItem,
  type EarnedBadge,
} from "@/lib/domain/badges";
import { getMyBadges } from "@/lib/badges";

function earnedLabel(earnedAt: Date): string {
  return `${earnedAt.getFullYear()}년 ${earnedAt.getMonth() + 1}월 ${earnedAt.getDate()}일 획득`;
}

/** 달력 화면 배지 진열대 — 미획득은 잠금 표시 (설계 2026-07-21) */
export function BadgeShelf() {
  const [earned, setEarned] = useState<EarnedBadge[] | null>(null);
  const [selected, setSelected] = useState<BadgeShelfItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyBadges()
      .then((list) => {
        if (!cancelled) setEarned(list);
      })
      .catch(() => {
        // 배지 조회 실패가 달력 본체를 막아서는 안 된다 — 영역만 숨긴다.
        if (!cancelled) setEarned(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (earned === null) return null;

  const shelf = badgeShelf(earned);

  return (
    <>
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h3 className="text-base font-extrabold">배지</h3>
          <p className="text-[11px] text-muted">
            {earnedBadgeCount(earned)} / {shelf.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {shelf.map((badge) => (
            <button
              key={badge.key}
              type="button"
              onClick={() => setSelected(badge)}
              aria-label={`${badge.name}${badge.earnedAt ? " 획득" : " 미획득"}`}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
                badge.earnedAt
                  ? "border-accent bg-accent-weak text-accent"
                  : "border-line bg-surface-2 text-faint opacity-60"
              }`}
            >
              <span className="text-sm">{badge.earnedAt ? badge.emoji : "🔒"}</span>
              {badge.name}
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] border-t border-line bg-surface p-4 pb-8 shadow-card">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <p className="text-center text-3xl">
              {selected.earnedAt ? selected.emoji : "🔒"}
            </p>
            <h3 className="mt-2 text-center text-base font-extrabold">
              {selected.name}
            </h3>
            <p className="mt-1 text-center text-sm text-muted">
              {selected.description}
            </p>
            <p className="mt-2 text-center text-xs text-faint">
              {selected.earnedAt
                ? earnedLabel(selected.earnedAt)
                : "아직 획득하지 못했어요"}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-card border border-line bg-surface-2 py-3 text-sm font-bold"
            >
              닫기
            </button>
          </div>
        </>
      )}
    </>
  );
}
