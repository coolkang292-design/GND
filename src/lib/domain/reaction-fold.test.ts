import { describe, expect, it } from "vitest";

import {
  foldReactions,
  typesToClear,
  type ReactionCounts,
} from "./reaction-fold";
import type { ReactionType } from "@/lib/social";

const counts = (over: Partial<ReactionCounts> = {}): ReactionCounts => ({
  fire: 0,
  clap: 0,
  like: 0,
  ...over,
});

const mine = (...types: ReactionType[]) => new Set<ReactionType>(types);

describe("foldReactions", () => {
  /**
   * ⚠️⚠️ 회귀 방어. 화면을 하트 하나로 줄이면서 `like`만 세면, 적용 시점 운영
   * DB에 있던 **🔥 12건 · 👏 3건이 통째로 사라진다** — 눌러 준 사람 입장에서는
   * 자기 반응이 없어진 것이다.
   */
  it("세 종류를 합산한다 — 옛 🔥·👏가 사라지면 안 된다", () => {
    expect(foldReactions(counts({ fire: 12, clap: 3, like: 1 }), mine()).total).toBe(
      16,
    );
  });

  it("아무도 안 눌렀으면 0", () => {
    expect(foldReactions(counts(), mine())).toEqual({ total: 0, liked: false });
  });

  it("내가 어떤 종류든 눌렀으면 하트가 켜진다", () => {
    expect(foldReactions(counts({ fire: 1 }), mine("fire")).liked).toBe(true);
    expect(foldReactions(counts({ clap: 1 }), mine("clap")).liked).toBe(true);
    expect(foldReactions(counts({ like: 1 }), mine("like")).liked).toBe(true);
  });

  it("남이 누른 것만 있으면 하트는 꺼진 채 숫자만 오른다", () => {
    expect(foldReactions(counts({ fire: 5 }), mine())).toEqual({
      total: 5,
      liked: false,
    });
  });
});

describe("typesToClear", () => {
  /**
   * ⚠️ 회귀 방어. `like`만 지우면 예전에 🔥를 눌렀던 사람이 하트를 꺼도 개수가
   * 안 줄어 **꺼지지 않는 하트**가 된다.
   */
  it("내가 누른 종류를 전부 돌려준다", () => {
    expect(typesToClear(mine("fire", "like"))).toEqual(["fire", "like"]);
  });

  it("옛 🔥만 눌러 뒀어도 그걸 지운다", () => {
    expect(typesToClear(mine("fire"))).toEqual(["fire"]);
  });

  it("누른 게 없으면 빈 배열", () => {
    expect(typesToClear(mine())).toEqual([]);
  });

  it("언제나 같은 차례로 돌려준다 — Set 순회 순서에 기대지 않는다", () => {
    expect(typesToClear(mine("like", "clap", "fire"))).toEqual([
      "fire",
      "clap",
      "like",
    ]);
  });
});
