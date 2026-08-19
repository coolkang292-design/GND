import { describe, expect, it } from "vitest";
import { MIN_DONE_BAR_PERCENT, weeklyBars } from "./today-status";

const TZ = "Asia/Seoul";
/** 2026-08-19 09:00 KST */
const at = (day: number, hour = 9) =>
  new Date(Date.UTC(2026, 7, day, hour - 9, 0, 0));

describe("weeklyBars", () => {
  it("오늘까지 7칸을 만든다 — 마지막이 오늘", () => {
    const bars = weeklyBars([], "2026-08-19", TZ);
    expect(bars).toHaveLength(7);
    expect(bars[6].dayKey).toBe("2026-08-19");
    expect(bars[0].dayKey).toBe("2026-08-13");
    expect(bars[6].isToday).toBe(true);
    expect(bars[0].isToday).toBe(false);
  });

  it("요일 한 글자를 붙인다", () => {
    const bars = weeklyBars([], "2026-08-19", TZ);
    // 2026-08-19는 수요일
    expect(bars[6].label).toBe("수");
    expect(bars[0].label).toBe("목");
  });

  it("같은 날 여러 세션은 분을 더한다", () => {
    const bars = weeklyBars(
      [
        { completedAt: at(19), durationMinutes: 30 },
        { completedAt: at(19, 20), durationMinutes: 15 },
      ],
      "2026-08-19",
      TZ,
    );
    expect(bars[6].minutes).toBe(45);
    expect(bars[6].done).toBe(true);
  });

  it("7일 범위 밖 세션은 버린다", () => {
    const bars = weeklyBars(
      [{ completedAt: at(1), durationMinutes: 60 }],
      "2026-08-19",
      TZ,
    );
    expect(bars.every((b) => b.minutes === 0)).toBe(true);
  });

  /**
   * ⚠️⚠️ **운동은 했는데 시간이 0분인 날이 있다.** 지난 운동을 나중에 적으면
   * 앱 시계가 안 돌아서 `duration_minutes`가 비거나 0이다. 높이를 분에만 걸면
   * 그 날이 **빈칸으로 그려진다** — 운동한 사람에게 "안 했다"고 말하는 셈이다.
   */
  it("운동은 했는데 0분이면 최소 높이를 준다", () => {
    const bars = weeklyBars(
      [{ completedAt: at(19), durationMinutes: null }],
      "2026-08-19",
      TZ,
    );
    expect(bars[6].done).toBe(true);
    expect(bars[6].minutes).toBe(0);
    expect(bars[6].heightPercent).toBe(MIN_DONE_BAR_PERCENT);
  });

  it("안 한 날은 높이 0", () => {
    const bars = weeklyBars([], "2026-08-19", TZ);
    expect(bars.every((b) => b.heightPercent === 0)).toBe(true);
    expect(bars.every((b) => b.done === false)).toBe(true);
  });

  it("가장 긴 날이 100%, 나머지는 비례", () => {
    const bars = weeklyBars(
      [
        { completedAt: at(19), durationMinutes: 60 },
        { completedAt: at(18), durationMinutes: 30 },
      ],
      "2026-08-19",
      TZ,
    );
    expect(bars[6].heightPercent).toBe(100);
    expect(bars[5].heightPercent).toBe(50);
  });

  it("짧은 날도 최소 높이 아래로 안 내려간다", () => {
    const bars = weeklyBars(
      [
        { completedAt: at(19), durationMinutes: 600 },
        { completedAt: at(18), durationMinutes: 1 },
      ],
      "2026-08-19",
      TZ,
    );
    expect(bars[5].heightPercent).toBe(MIN_DONE_BAR_PERCENT);
  });

  it("timezone을 따른다 — KST 자정 직전 세션은 그날 것이다", () => {
    // 2026-08-19 23:30 KST = 2026-08-19T14:30Z
    const bars = weeklyBars(
      [{ completedAt: new Date("2026-08-19T14:30:00Z"), durationMinutes: 20 }],
      "2026-08-19",
      TZ,
    );
    expect(bars[6].minutes).toBe(20);
  });
});
