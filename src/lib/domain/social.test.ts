import { describe, expect, it } from "vitest";
import {
  activeSessionIds,
  feedDateLabel,
  groupByDay,
  unreadCount,
  type SocialEvent,
} from "./social";

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

describe("groupByDay — 피드 날짜별 그룹핑 (KST)", () => {
  const item = (iso: string) => ({ completedAt: new Date(iso) });

  it("같은 날짜(tz 기준)는 한 그룹으로 묶고 순서를 유지한다", () => {
    const a = item("2026-07-18T10:00:00+09:00");
    const b = item("2026-07-18T08:00:00+09:00");
    const c = item("2026-07-17T22:00:00+09:00");
    const groups = groupByDay([a, b, c], "Asia/Seoul");
    expect(groups.map((g) => g.dateKey)).toEqual(["2026-07-18", "2026-07-17"]);
    expect(groups[0].items).toEqual([a, b]);
    expect(groups[1].items).toEqual([c]);
  });

  it("자정 경계: KST 00:30은 UTC 전날이어도 KST 날짜로 묶인다", () => {
    const late = item("2026-07-17T15:30:00Z"); // KST 7/18 00:30
    expect(groupByDay([late], "Asia/Seoul")[0].dateKey).toBe("2026-07-18");
  });

  it("빈 목록은 빈 그룹", () => {
    expect(groupByDay([], "Asia/Seoul")).toEqual([]);
  });
});

describe("feedDateLabel — 날짜 헤더 라벨", () => {
  it("오늘/어제는 상대 라벨", () => {
    expect(feedDateLabel("2026-07-18", "2026-07-18", "2026-07-17")).toBe("오늘");
    expect(feedDateLabel("2026-07-17", "2026-07-18", "2026-07-17")).toBe("어제");
  });

  it("그 외는 M월 D일 (요일)", () => {
    // 2026-07-10은 금요일
    expect(feedDateLabel("2026-07-10", "2026-07-18", "2026-07-17")).toBe(
      "7월 10일 (금)",
    );
  });

  it("다른 해는 연도 포함", () => {
    expect(feedDateLabel("2025-12-31", "2026-07-18", "2026-07-17")).toBe(
      "2025년 12월 31일 (수)",
    );
  });
});
