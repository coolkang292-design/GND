import { describe, expect, test } from "vitest";
import { normalizeInviteCode } from "@/lib/domain/invite-code";

describe("normalizeInviteCode — 사용자 입력을 표준 코드로", () => {
  test("소문자·공백 → 대문자 트림", () => {
    expect(normalizeInviteCode("  gnd-7k2ab ")).toBe("GND-7K2AB");
  });

  test("GND- 접두사 없이 입력해도 붙여준다", () => {
    expect(normalizeInviteCode("7k2ab")).toBe("GND-7K2AB");
  });

  test("전체 초대 링크를 붙여넣으면 코드만 추출", () => {
    expect(
      normalizeInviteCode("https://gnd.app/invite/GND-7K2AB"),
    ).toBe("GND-7K2AB");
  });

  test("빈 입력은 null", () => {
    expect(normalizeInviteCode("   ")).toBeNull();
    expect(normalizeInviteCode("")).toBeNull();
  });

  test("코드 본문이 없는 입력(GND-만)은 null", () => {
    expect(normalizeInviteCode("GND-")).toBeNull();
  });
});
