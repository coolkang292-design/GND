"use client";

import { useState } from "react";
import {
  foldReactions,
  typesToClear,
  type ReactionCounts,
} from "@/lib/domain/reaction-fold";
import { toggleReaction, type ReactionType } from "@/lib/social";

type Props = {
  sessionId: string;
  userId: string;
  counts: ReactionCounts;
  myReactions: Set<ReactionType>;
};

/**
 * 좋아요 — 하트 하나 (2026-08-30 사용자 결정).
 *
 * > "감정을 하트와 코멘트만 남기고 나머지 제거해달라는 의미였음"
 *
 * 전에는 🔥 👏 ❤️ 셋이 각각 테두리 알약이었다. 인스타처럼 **하트 하나 + 댓글**만
 * 남긴다(댓글 아이콘은 `feed-item.tsx`의 액션 줄에 있다).
 *
 * ⚠️⚠️ **`like` 개수만 세지 마라.** DB에는 이미 fire 12 · clap 3 · like 1이 쌓여
 * 있다(2026-08-30 기준). `like`만 그리면 **12개 세션에서 남이 눌러 준 🔥이 화면에서
 * 통째로 사라진다** — 누른 사람 입장에서는 자기 반응이 없어진 것이다.
 * 그래서 세 종류를 **합산해서** 하트 옆에 낸다. 옛 🔥·👏가 자연스럽게 좋아요로
 * 이어진다. 마이그레이션은 필요 없다 — 접기만 바꾸면 된다.
 *
 * ⚠️ 끌 때는 **내가 누른 것 전부**를 지운다. `like`만 지우면 예전에 🔥를 눌렀던
 * 사람이 하트를 꺼도 개수가 안 줄어 **꺼지지 않는 하트**가 된다.
 *
 * 켤 때는 `like`로 넣는다 — 앞으로 쌓이는 것은 한 종류다.
 *
 * ⚠️ 공유(➤)·북마크(🔖)는 넣지 않는다 (사용자 결정). 인증사진이 private 버킷 +
 * 서명 URL이고 RLS가 크루 밖 조회를 막아 **외부 공유가 구조적으로 불가능**하다.
 *
 * 낙관적 토글, 실패 시 롤백 (§9).
 */
export function ReactionBar({ sessionId, userId, counts, myReactions }: Props) {
  const [local, setLocal] = useState(() => ({
    counts: { ...counts },
    mine: new Set(myReactions),
  }));
  const [busy, setBusy] = useState(false);

  const { total, liked } = foldReactions(local.counts, local.mine);

  async function toggle() {
    if (busy) return;
    const previous = { counts: { ...local.counts }, mine: new Set(local.mine) };
    const wasOn = liked;

    // 낙관적 반영 — 끌 때는 내가 누른 종류를 전부 뺀다
    const nextCounts = { ...local.counts };
    const nextMine = new Set(local.mine);
    const clearing = typesToClear(previous.mine);
    if (wasOn) {
      for (const type of clearing) {
        nextCounts[type] = Math.max(0, nextCounts[type] - 1);
        nextMine.delete(type);
      }
    } else {
      nextCounts.like = nextCounts.like + 1;
      nextMine.add("like");
    }
    setLocal({ counts: nextCounts, mine: nextMine });

    setBusy(true);
    try {
      if (wasOn) {
        // 옛 🔥·👏도 같이 걷어야 하트가 실제로 꺼진다
        for (const type of clearing) {
          await toggleReaction(sessionId, userId, type, false);
        }
      } else {
        await toggleReaction(sessionId, userId, "like", true);
      }
    } catch {
      setLocal(previous); // 롤백
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={liked}
      aria-label={`좋아요 ${total}`}
      /* 아이콘이 작아도 손가락이 닿아야 한다 — 세로 패딩으로 높이를 만든다 */
      className="flex items-center gap-1 py-1.5 text-[15px] leading-none"
    >
      {/* 상태를 테두리가 아니라 **투명도**로 말한다 — 탭바 아이콘과 같은 수법 */}
      <span className={liked ? "" : "opacity-40 grayscale"}>❤️</span>
      {total > 0 && (
        <span
          className={`text-[12.5px] font-bold ${
            liked ? "text-accent" : "text-muted"
          }`}
        >
          {total}
        </span>
      )}
    </button>
  );
}
