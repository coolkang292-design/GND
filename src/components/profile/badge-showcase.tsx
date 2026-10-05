"use client";

import Image from "next/image";
import type { BadgeShelfItem } from "@/lib/domain/badges";
import { badgeImageSrc } from "@/lib/domain/badge-art";

/** 프로필 보유 배지 — 최근 획득 6개까지. 전체는 시트에서 본다. */
export function BadgeShowcase({
  shelf,
  onOpenAll,
}: {
  shelf: BadgeShelfItem[];
  onOpenAll: () => void;
}) {
  const owned = shelf.filter((b) => b.earnedAt !== null);
  const recent = [...owned]
    .sort((a, b) => b.earnedAt!.getTime() - a.earnedAt!.getTime())
    .slice(0, 6);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-extrabold">보유 배지</h3>
        <button
          type="button"
          onClick={onOpenAll}
          className="text-[11px] font-bold text-accent"
        >
          {owned.length} / {shelf.length} · 전체 보기 ›
        </button>
      </div>

      {owned.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-muted">
          아직 획득한 배지가 없어요. 오늘 운동을 완료하면 첫 배지를 받아요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-3">
          {recent.map((b) => (
            <li key={b.key} className="relative">
              <Image
                src={badgeImageSrc(b.key)}
                alt={b.name}
                width={52}
                height={52}
                sizes="52px"
                unoptimized
              />
              {b.count > 1 && (
                <span className="absolute -right-1 -bottom-1 rounded-full border border-gold/50 bg-bg px-1.5 text-[10px] font-extrabold text-gold">
                  ×{b.count}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
