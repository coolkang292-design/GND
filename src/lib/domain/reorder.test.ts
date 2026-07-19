import { describe, expect, it } from "vitest";

import { moveItem } from "./reorder";

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];

  it("moves an item forward", () => {
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns the same array when from equals to", () => {
    expect(moveItem(list, 2, 2)).toBe(list);
  });

  it.each([
    [-1, 2],
    [4, 0],
    [0, -1],
    [0, 4],
  ])("returns the same array for out-of-range move (%i → %i)", (from, to) => {
    expect(moveItem(list, from, to)).toBe(list);
  });

  it("returns the same empty array untouched", () => {
    const empty: string[] = [];
    expect(moveItem(empty, 0, 0)).toBe(empty);
  });

  it("does not mutate the original array", () => {
    const original = ["a", "b", "c"];
    moveItem(original, 0, 2);
    expect(original).toEqual(["a", "b", "c"]);
  });
});
