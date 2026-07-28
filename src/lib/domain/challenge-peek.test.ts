import { describe, expect, it } from "vitest";
import { peekRows, type PeekRow } from "./challenge-peek";

const list: PeekRow[] = [
  { userId: "a", rank: 1, overall: 91.4 },
  { userId: "me", rank: 2, overall: 78.2 },
  { userId: "b", rank: 3, overall: 40 },
];

describe("peekRows", () => {
  it("고른 사람이 없으면 내 것만 보여준다", () => {
    expect(peekRows(list, "me", null).map((r) => r.userId)).toEqual(["me"]);
  });

  it("고른 사람이 있으면 내 것과 그 사람만 — 순위 순서로", () => {
    expect(peekRows(list, "me", "b").map((r) => r.userId)).toEqual(["me", "b"]);
    expect(peekRows(list, "me", "a").map((r) => r.userId)).toEqual(["a", "me"]);
  });

  it("고른 사람이 순위표에 없으면 조용히 빠진다 — 빈 줄을 그리지 않는다", () => {
    expect(peekRows(list, "me", "없는사람").map((r) => r.userId)).toEqual([
      "me",
    ]);
  });

  it("내가 순위표에 없어도 고른 사람은 보여준다", () => {
    expect(peekRows(list, "nobody", "a").map((r) => r.userId)).toEqual(["a"]);
  });

  it("나를 고른 값이 들어와도 중복으로 그리지 않는다", () => {
    expect(peekRows(list, "me", "me").map((r) => r.userId)).toEqual(["me"]);
  });
});

describe("peekRows — 원본 보존", () => {
  it("입력 배열을 뒤섞지 않는다", () => {
    const input: PeekRow[] = [
      { userId: "b", rank: 3, overall: 40 },
      { userId: "me", rank: 2, overall: 78.2 },
    ];
    peekRows(input, "me", "b");
    expect(input.map((r) => r.userId)).toEqual(["b", "me"]);
  });
});
