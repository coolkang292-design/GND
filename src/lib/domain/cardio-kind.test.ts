import { describe, expect, it } from "vitest";
import { cardioKindOf } from "./cardio-kind";

describe("cardioKindOf — 유산소를 거리·사이클·기타로 가른다", () => {
  it.each([
    ["걷기", "distance"],
    ["러닝", "distance"],
    ["트레드밀", "distance"],
    ["사이클", "cycle"],
    ["실내자전거", "cycle"],
    ["스피닝", "cycle"],
    ["로잉", "other"],
    ["줄넘기", "other"],
    ["요가", "other"],
  ] as const)("%s → %s", (name, kind) => {
    expect(cardioKindOf(name)).toBe(kind);
  });

  it("알 수 없는 이름은 기타(시간)로 떨어진다 — 거리 목표를 부풀리지 않는다", () => {
    // 운영에 실제로 있는 사용자 종목 이름 (스칼레또)
    expect(cardioKindOf("평일")).toBe("other");
    expect(cardioKindOf("")).toBe("other");
  });

  it("사이클이 걷기·러닝 글자보다 먼저 걸린다", () => {
    expect(cardioKindOf("러닝 바이크")).toBe("cycle");
  });
});
