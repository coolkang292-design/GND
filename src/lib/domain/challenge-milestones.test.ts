import { describe, expect, it } from "vitest";
import { challengeMilestones, longestConsecutiveDays } from "./challenge-milestones";

const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-09-${String(from + i).padStart(2, "0")}`);

describe("longestConsecutiveDays", () => {
  it("하루라도 빠지면 끊긴다 — 앱 스트릭의 5일 유예와 다르다", () => {
    expect(longestConsecutiveDays(["2026-09-01", "2026-09-03", "2026-09-05"])).toBe(1);
    expect(longestConsecutiveDays([...days(1, 4), ...days(6, 12)])).toBe(7);
  });

  it("같은 날 중복은 하루", () => {
    expect(longestConsecutiveDays(["2026-09-01", "2026-09-01", "2026-09-02"])).toBe(2);
  });

  it("월 경계를 넘는다", () => {
    expect(longestConsecutiveDays(["2026-09-30", "2026-10-01"])).toBe(2);
  });
});

describe("challengeMilestones", () => {
  const base = {
    startDate: "2026-09-01",
    endDate: "2026-09-28",
    totalDays: 28,
  };

  it("7일 달성 · 14일 진행 중 · 완주 잠금 (시안 배치)", () => {
    const m = challengeMilestones({
      ...base,
      workoutDayKeys: days(1, 9),
      todayKey: "2026-09-10",
      dayIndex: 10,
    });
    expect(m.map((x) => x.state)).toEqual(["done", "progress", "locked"]);
    expect(m[1].ratio).toBeCloseTo(9 / 14);
    expect(m[2].title).toBe("28일 완주");
  });

  it("아무것도 안 했으면 첫 칸만 진행 중", () => {
    const m = challengeMilestones({
      ...base,
      workoutDayKeys: [],
      todayKey: "2026-09-03",
      dayIndex: 3,
    });
    expect(m.map((x) => x.state)).toEqual(["progress", "locked", "locked"]);
  });

  it("기간 밖·미래 운동일은 세지 않는다", () => {
    const m = challengeMilestones({
      ...base,
      workoutDayKeys: ["2026-08-25", ...days(26, 27), "2026-09-01"],
      todayKey: "2026-09-02",
      dayIndex: 2,
    });
    expect(m[0].ratio).toBeCloseTo(1 / 7);
  });

  it("종료일이 지나면 완주는 달성", () => {
    const m = challengeMilestones({
      ...base,
      workoutDayKeys: [],
      todayKey: "2026-09-29",
      dayIndex: 28,
    });
    expect(m[2].state).toBe("done");
  });
});
