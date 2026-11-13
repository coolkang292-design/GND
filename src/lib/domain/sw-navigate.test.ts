import { describe, expect, it } from "vitest";
import { parseSwNavigateMessage } from "./sw-navigate";

describe("parseSwNavigateMessage", () => {
  it("앱 경로를 그대로 돌려준다", () => {
    expect(
      parseSwNavigateMessage({ type: "gnd:navigate", url: "/feed?session=abc" }),
    ).toBe("/feed?session=abc");
  });

  it.each([
    ["다른 type", { type: "x", url: "/feed" }],
    ["url 없음", { type: "gnd:navigate" }],
    ["url이 문자열 아님", { type: "gnd:navigate", url: 1 }],
    ["외부 절대 주소", { type: "gnd:navigate", url: "https://evil.com" }],
    ["프로토콜 상대", { type: "gnd:navigate", url: "//evil.com" }],
    ["역슬래시 우회", { type: "gnd:navigate", url: "/\\evil.com" }],
    ["null", null],
    ["문자열", "gnd:navigate"],
  ])("거른다: %s", (_name, data) => {
    expect(parseSwNavigateMessage(data)).toBeNull();
  });
});
