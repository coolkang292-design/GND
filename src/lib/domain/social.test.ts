import { describe, expect, it } from "vitest";
import { activeSessionIds, unreadCount, type SocialEvent } from "./social";

const ev = (
  sid: string,
  type: SocialEvent["event_type"],
  at: string,
): SocialEvent => ({ session_id: sid, event_type: type, created_at: at });

describe("activeSessionIds", () => {
  it("started만 있으면 진행 중", () => {
    expect(
      activeSessionIds(
        [ev("s1", "workout_started", "2026-07-17T10:00:00Z")],
        new Date("2026-07-17T10:30:00Z"),
      ),
    ).toEqual(["s1"]);
  });

  it("completed/cancelled가 붙으면 제외", () => {
    expect(
      activeSessionIds(
        [
          ev("s1", "workout_started", "2026-07-17T10:00:00Z"),
          ev("s1", "workout_completed", "2026-07-17T11:00:00Z"),
          ev("s2", "workout_started", "2026-07-17T10:30:00Z"),
          ev("s3", "workout_started", "2026-07-17T09:00:00Z"),
          ev("s3", "workout_cancelled", "2026-07-17T09:10:00Z"),
        ],
        new Date("2026-07-17T11:30:00Z"),
      ),
    ).toEqual(["s2"]);
  });

  it("최근 시작 순으로 정렬", () => {
    expect(
      activeSessionIds(
        [
          ev("s1", "workout_started", "2026-07-17T09:00:00Z"),
          ev("s2", "workout_started", "2026-07-17T10:00:00Z"),
        ],
        new Date("2026-07-17T10:30:00Z"),
      ),
    ).toEqual(["s2", "s1"]);
  });

  it("6시간 지난 started는 유령 세션으로 제외", () => {
    expect(
      activeSessionIds(
        [ev("s1", "workout_started", "2026-07-17T00:00:00Z")],
        new Date("2026-07-17T07:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("6시간 경계 직전은 포함", () => {
    expect(
      activeSessionIds(
        [ev("s1", "workout_started", "2026-07-17T00:00:00Z")],
        new Date("2026-07-17T05:59:59Z"),
      ),
    ).toEqual(["s1"]);
  });

  it("빈 입력", () => {
    expect(activeSessionIds([])).toEqual([]);
  });
});

describe("unreadCount", () => {
  it("read_at null만 센다", () => {
    expect(
      unreadCount([
        { read_at: null },
        { read_at: "2026-07-17T01:00:00Z" },
        { read_at: null },
      ]),
    ).toBe(2);
  });

  it("빈 배열은 0", () => {
    expect(unreadCount([])).toBe(0);
  });
});
