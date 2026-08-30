/**
 * 반응 세 종류 → 하트 하나 (2026-08-30 사용자 결정).
 *
 * 화면에는 **하트와 댓글만** 남기기로 했다. 그런데 DB에는 이미 세 종류가 쌓여
 * 있다 — 적용 시점 운영 데이터로 `fire` 12 · `clap` 3 · `like` 1.
 *
 * ⚠️⚠️ **`like`만 세면 안 된다.** 그러면 12개 세션에서 남이 눌러 준 🔥이 화면에서
 * 통째로 사라진다 — 누른 사람 입장에서는 자기 반응이 없어진 것이다. 마이그레이션으로
 * 옛 행을 `like`로 갈아엎는 방법도 있지만, 되돌릴 수 없고 **접기만 바꾸면 되는
 * 일에 운영 데이터를 고칠 이유가 없다.**
 *
 * 그래서 세 종류를 합산한다. 옛 🔥·👏가 자연스럽게 좋아요로 이어진다.
 *
 * 순수 함수다. 조회하지 않는다.
 */

import type { ReactionType } from "@/lib/social";

/** DB `reactions.reaction_type`의 CHECK 목록 (0011) */
export const REACTION_TYPES: ReactionType[] = ["fire", "clap", "like"];

export type ReactionCounts = Record<ReactionType, number>;

export type FoldedReaction = {
  /** 세 종류 합계 — 하트 옆 숫자 */
  total: number;
  /** 내가 **아무 종류든** 눌렀는가 — 하트가 켜진 상태 */
  liked: boolean;
};

export function foldReactions(
  counts: ReactionCounts,
  mine: ReadonlySet<ReactionType>,
): FoldedReaction {
  let total = 0;
  for (const type of REACTION_TYPES) total += counts[type] ?? 0;
  return { total, liked: mine.size > 0 };
}

/**
 * 하트를 **끌 때** 지워야 할 종류.
 *
 * ⚠️ `like`만 지우면 예전에 🔥를 눌렀던 사람이 하트를 꺼도 개수가 안 줄어
 * **꺼지지 않는 하트**가 된다. 내가 누른 것은 전부 걷는다.
 */
export function typesToClear(
  mine: ReadonlySet<ReactionType>,
): ReactionType[] {
  return REACTION_TYPES.filter((type) => mine.has(type));
}
