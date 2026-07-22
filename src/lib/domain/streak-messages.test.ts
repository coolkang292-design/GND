import { describe, expect, it } from "vitest";
import { STAGE_MESSAGES, pickByDay } from "./streak-messages";
import { daysSinceLastWorkout, streakStage } from "./streak";

describe("d4 카피 — 어제는 '운동한 날'이지 '쉰 날'이 아니다", () => {
  it("d4는 마지막 운동이 어제인 상태다", () => {
    // 이 전제가 깨지면 아래 문구 규칙도 다시 봐야 한다.
    expect(streakStage(["2026-07-22"], "2026-07-23")).toBe("d4");
    expect(daysSinceLastWorkout(["2026-07-22"], "2026-07-23")).toBe(1);
  });

  it("어느 변형도 어제를 쉰 날로 단정하지 않는다", () => {
    // 2026-07-23 사용자 신고: 어제 운동했는데 "어제 쉬셨다?"가 떴다.
    // 로테이션되므로 세 변형 전부를 검사한다.
    const variants = STAGE_MESSAGES.d4 ?? [];
    expect(variants.length).toBeGreaterThan(0);
    for (const make of variants) {
      const msg = make(2);
      for (const banned of [
        "어제 쉬",
        "하루 걸렀",
        "어제 뭐 하셨",
        "이틀째",
        "연속 휴식",
      ]) {
        expect(msg).not.toContain(banned);
      }
      expect(msg).toContain("2일"); // 스트릭 수는 계속 정확히 찌른다
      expect(msg).toContain("D-4");
    }
  });
});

describe("나머지 단계는 쉰 일수를 정확히 말한다", () => {
  // d3=2일째, d2=3일째, d1=4일째(오늘 포함) — gap과 일치해야 한다.
  it.each([
    ["d3", "2026-07-21", 2],
    ["d2", "2026-07-20", 3],
    ["d1", "2026-07-19", 4],
  ] as const)("%s = gap %i", (stage, lastDay, gap) => {
    expect(streakStage([lastDay], "2026-07-23")).toBe(stage);
    expect(daysSinceLastWorkout([lastDay], "2026-07-23")).toBe(gap);
  });

  it("d1은 '오늘 안 하면 리셋'이 맞다 (내일이면 소멸)", () => {
    expect(streakStage(["2026-07-19"], "2026-07-24")).toBe("expired");
    for (const make of STAGE_MESSAGES.d1 ?? []) {
      expect(make(5)).toContain("D-1");
    }
  });
});

describe("pickByDay — 같은 날엔 고정, 날마다 로테이션", () => {
  it("같은 날짜는 항상 같은 변형", () => {
    const v = ["a", "b", "c"];
    expect(pickByDay(v, "2026-07-23")).toBe(pickByDay(v, "2026-07-23"));
  });

  it("여러 날에 걸쳐 변형이 하나로 고정되지 않는다", () => {
    const v = ["a", "b", "c"];
    const days = Array.from(
      { length: 30 },
      (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`,
    );
    expect(new Set(days.map((d) => pickByDay(v, d))).size).toBeGreaterThan(1);
  });
});
