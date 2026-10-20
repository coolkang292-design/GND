import { describe, expect, it } from "vitest";
import { isStampVariant, stampCompletionLine } from "./workout-stamps";
describe("cosmetic stamp rewards", () => {
  it("shows the agreed copy", () => {
    expect(stampCompletionLine("basic")).toBe("오늘도 해냈다.");
    expect(stampCompletionLine("orange")).toBe("오늘은 느낌이 좀 좋은데?");
    expect(stampCompletionLine("gold")).toBe("오늘, 뭔가 좋은 일 생기려나?");
  });
  it("ignores untrusted stamp values", () => {
    expect(isStampVariant("gold")).toBe(true);
    expect(isStampVariant("jackpot")).toBe(false);
  });
});
