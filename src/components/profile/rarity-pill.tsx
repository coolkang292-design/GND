import { RARITY_META } from "@/lib/domain/achievements";
import type { BadgeRarity } from "@/lib/domain/badges";

const PILL: Record<BadgeRarity, string> = {
  common: "bg-surface-2 text-faint border-line",
  rare: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  epic: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  legend: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  mythic: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

/** 희귀도 pill — 배지 우상단. */
export function RarityPill({ rarity }: { rarity: BadgeRarity }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide ${PILL[rarity]}`}
    >
      {RARITY_META[rarity].label}
    </span>
  );
}
