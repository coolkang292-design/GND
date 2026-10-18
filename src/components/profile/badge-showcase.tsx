"use client";

import Image from "next/image";
import type { BadgeShelfItem } from "@/lib/domain/badges";
import {
  PROFILE_METRIC_LABEL, featuredBadgeCondition, selectFeaturedBadges,
} from "@/lib/domain/profile-achievements";
import { badgeImageSrc } from "@/lib/domain/badge-art";

/** 카테고리별 최고 획득 배지 6개. 배지 전체 시트는 기존 기능을 사용한다. */
export function BadgeShowcase({
  shelf, onOpenAll,
}: {
  shelf: BadgeShelfItem[];
  onOpenAll: () => void;
}) {
  const featured = selectFeaturedBadges(shelf);

  return (
    <section aria-labelledby="featured-badges-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="featured-badges-heading" className="text-[18px] font-extrabold">
          대표 배지
        </h2>
        <button
          type="button" onClick={onOpenAll}
          className="tap-44 flex shrink-0 items-center rounded-full border border-accent/50 bg-accent/10 px-4 text-[12px] font-extrabold text-accent"
        >
          전체 배지 ›
        </button>
      </div>
      <p className="mt-0.5 mb-3 text-[11.5px] text-muted">
        6개 항목에서 최고 달성 배지만 표시
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {featured.map(({ metricKey, badge }) => (
          <li key={metricKey} className="min-w-0">
            <button
              type="button"
              onClick={onOpenAll}
              aria-label={PROFILE_METRIC_LABEL[metricKey] + ": " + (badge?.name ?? "미획득") + " · 전체 배지 보기"}
              className="flex min-h-[112px] w-full items-center gap-2 rounded-card border border-line bg-surface p-2.5 text-left shadow-card"
            >
              {badge ? (
                <span className="relative shrink-0">
                  <Image
                    src={badgeImageSrc(badge.key)}
                    alt=""
                    width={48}
                    height={48}
                    sizes="48px"
                    unoptimized
                  />
                  {badge.count > 1 && (
                    <span className="absolute -bottom-1 -right-1 rounded-full border border-gold/40 bg-bg px-1 text-[9px] font-bold text-gold">
                      ×{badge.count}
                    </span>
                  )}
                </span>
              ) : (
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line text-[20px] text-faint">
                  ?
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] text-muted">
                  {PROFILE_METRIC_LABEL[metricKey]}
                </span>
                <span className="mt-1 block break-keep text-[12.5px] font-extrabold leading-snug">
                  {badge?.name ?? "미획득"}
                </span>
                <span className="mt-1.5 block break-keep text-[10.5px] leading-snug text-faint">
                  {badge ? featuredBadgeCondition(badge) : "첫 달성을 기다려요"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
