import { describe, expect, it } from "vitest";
import { cappedLevelCaption } from "./level-caption";

describe("레벨이 멈췄을 때 문구", () => {
  it("짧은 문구는 진화 미션을 말한다", () => {
    expect(cappedLevelCaption({ compact: true })).toBe("경험치 가득 · 진화 미션을 채워요");
  });
  it("긴 문구는 경험치가 계속 쌓인다는 것과 누적 경험치를 먼저 말한다", () => {
    const t = cappedLevelCaption({ totalXp: 7500 });
    expect(t).toContain("경험치는 계속 쌓여요");
    expect(t).toContain("누적 7,500 XP");
    expect(t).toContain("진화 미션");
  });
  it("누적 값을 모르면(없음·NaN) 숫자를 지어내지 않는다", () => {
    expect(cappedLevelCaption({})).not.toContain("누적");
    expect(cappedLevelCaption({ totalXp: Number.NaN })).not.toContain("누적");
  });
});
