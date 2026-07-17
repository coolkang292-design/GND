"use client";

import { useState } from "react";
import { toggleReaction, type ReactionType } from "@/lib/social";

const REACTION_EMOJI: Record<ReactionType, string> = {
  fire: "🔥",
  clap: "👏",
  like: "❤️",
};
const REACTION_ORDER: ReactionType[] = ["fire", "clap", "like"];

type Props = {
  sessionId: string;
  userId: string;
  counts: Record<ReactionType, number>;
  myReactions: Set<ReactionType>;
};

/** 이모지 반응 바 — 낙관적 토글, 실패 시 롤백 (§9) */
export function ReactionBar({ sessionId, userId, counts, myReactions }: Props) {
  const [local, setLocal] = useState(() => ({
    counts: { ...counts },
    mine: new Set(myReactions),
  }));

  async function toggle(type: ReactionType) {
    const wasOn = local.mine.has(type);
    const next = {
      counts: {
        ...local.counts,
        [type]: Math.max(0, local.counts[type] + (wasOn ? -1 : 1)),
      },
      mine: new Set(local.mine),
    };
    if (wasOn) next.mine.delete(type);
    else next.mine.add(type);
    setLocal(next); // 낙관적 반영

    try {
      await toggleReaction(sessionId, userId, type, !wasOn);
    } catch {
      setLocal(local); // 롤백
    }
  }

  return (
    <div className="flex gap-1.5">
      {REACTION_ORDER.map((type) => {
        const on = local.mine.has(type);
        return (
          <button
            key={type}
            onClick={() => void toggle(type)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
              on
                ? "border-accent bg-accent-weak text-accent"
                : "border-line bg-surface-2 text-muted"
            }`}
            aria-pressed={on}
          >
            <span>{REACTION_EMOJI[type]}</span>
            {local.counts[type] > 0 && <span>{local.counts[type]}</span>}
          </button>
        );
      })}
    </div>
  );
}
