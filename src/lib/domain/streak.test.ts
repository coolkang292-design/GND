import { describe, expect, it } from "vitest";
import {
  currentStreak,
  streakStage,
  workoutDayKeys,
} from "./streak";

describe("workoutDayKeys — 완료 순간 → tz 기준 운동일 (중복 제거·오름차순)", () => {
  it("같은 날 복수 운동은 1일로 센다", () => {
    const keys = workoutDayKeys(
      [
        new Date("2026-07-13T01:00:00Z"), // KST 7/13 10:00
        new Date("2026-07-13T11:00:00Z"), // KST 7/13 20:00
      ],
      "Asia/Seoul",
    );
    expect(keys).toEqual(["2026-07-13"]);
  });

  it("UTC 자정 경계는 사용자 timezone 기준으로 판정한다", () => {
    // UTC 7/12 16:00 = KST 7/13 01:00
    const keys = workoutDayKeys([new Date("2026-07-12T16:00:00Z")], "Asia/Seoul");
    expect(keys).toEqual(["2026-07-13"]);
  });

  it("오름차순 정렬", () => {
    const keys = workoutDayKeys(
      [new Date("2026-07-13T03:00:00Z"), new Date("2026-07-10T03:00:00Z")],
      "Asia/Seoul",
    );
    expect(keys).toEqual(["2026-07-10", "2026-07-13"]);
  });
});

describe("currentStreak — 5일 소멸 윈도우 (가장 최근 사슬의 운동일 수)", () => {
  it("운동 기록 없음 → 0", () => {
    expect(currentStreak([], "2026-07-13")).toBe(0);
  });

  it("오늘 운동 → 1", () => {
    expect(currentStreak(["2026-07-13"], "2026-07-13")).toBe(1);
  });

  it("간격 4일 이하면 사슬이 이어진다 (연속일 필요 없음)", () => {
    // 7/13 ← 7/10 (간격 3) ← 7/07 (간격 3) → 3일
    expect(
      currentStreak(["2026-07-07", "2026-07-10", "2026-07-13"], "2026-07-13"),
    ).toBe(3);
  });

  it("간격 5일 이상이면 사슬이 끊긴다", () => {
    // 7/13 ← 7/07 은 간격 6 → 오늘 하루만
    expect(currentStreak(["2026-07-07", "2026-07-13"], "2026-07-13")).toBe(1);
  });

  it("마지막 운동이 4일 전이면 아직 유지된다", () => {
    expect(currentStreak(["2026-07-08", "2026-07-09"], "2026-07-13")).toBe(2);
  });

  it("마지막 운동이 5일 전이면 소멸 → 0", () => {
    expect(currentStreak(["2026-07-07", "2026-07-08"], "2026-07-13")).toBe(0);
  });

  it("월 경계를 넘는 간격도 정확히 계산한다", () => {
    expect(currentStreak(["2026-06-30", "2026-07-02"], "2026-07-02")).toBe(2);
  });
});

describe("streakStage — 단계 판정 (오늘완료/D-4~D-1/소멸)", () => {
  it("기록 없음 → none", () => {
    expect(streakStage([], "2026-07-13")).toBe("none");
  });

  it("오늘 완료 → today_done", () => {
    expect(streakStage(["2026-07-13"], "2026-07-13")).toBe("today_done");
  });

  it("1일 전 → d4 (소멸까지 4일)", () => {
    expect(streakStage(["2026-07-12"], "2026-07-13")).toBe("d4");
  });

  it("2일 전 → d3", () => {
    expect(streakStage(["2026-07-11"], "2026-07-13")).toBe("d3");
  });

  it("3일 전 → d2", () => {
    expect(streakStage(["2026-07-10"], "2026-07-13")).toBe("d2");
  });

  it("4일 전 → d1 (오늘 안 하면 내일 소멸)", () => {
    expect(streakStage(["2026-07-09"], "2026-07-13")).toBe("d1");
  });

  it("5일 전 이상 → expired", () => {
    expect(streakStage(["2026-07-08"], "2026-07-13")).toBe("expired");
    expect(streakStage(["2026-06-01"], "2026-07-13")).toBe("expired");
  });
});
