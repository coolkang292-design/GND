import { describe, expect, it } from "vitest";
import {
  activeSessionIds,
  feedDateLabel,
  firstWorkoutImagePath,
  groupByDay,
  workoutImageList,
  unreadCount,
  type SocialEvent,
} from "./social";

describe("firstWorkoutImagePath", () => {
  it("객체 관계에서 사진 경로를 반환한다", () => {
    expect(firstWorkoutImagePath({ image_path: "photos/object.jpg" })).toBe(
      "photos/object.jpg",
    );
  });

  it("배열 관계에서 첫 사진 경로를 반환한다", () => {
    expect(
      firstWorkoutImagePath([
        { image_path: "photos/first.jpg" },
        { image_path: "photos/second.jpg" },
      ]),
    ).toBe("photos/first.jpg");
  });

  it("null 또는 빈 배열이면 null을 반환한다", () => {
    expect(firstWorkoutImagePath(null)).toBeNull();
    expect(firstWorkoutImagePath([])).toBeNull();
  });

  /**
   * ⚠️ 이 단언이 2026-09-10에 잡은 버그를 지킨다. 다중 사진(0103) 전에는
   *    `[0]`을 집어도 정답이 하나뿐이라 안 보였다. 지금은 임베드 순서가
   *    보장되지 않으므로 **슬롯이 앞선 것**을 집어야 한다.
   */
  it("sort_order가 있으면 반환 순서와 무관하게 슬롯이 앞선 사진을 고른다", () => {
    expect(
      firstWorkoutImagePath([
        { image_path: "photos/third.jpg", sort_order: 2 },
        { image_path: "photos/first.jpg", sort_order: 0 },
        { image_path: "photos/second.jpg", sort_order: 1 },
      ] as never),
    ).toBe("photos/first.jpg");
  });

  it("삭제로 슬롯에 구멍이 나도 앞선 것을 고른다", () => {
    expect(
      firstWorkoutImagePath([
        { image_path: "photos/late.jpg", sort_order: 4 },
        { image_path: "photos/early.jpg", sort_order: 1 },
      ] as never),
    ).toBe("photos/early.jpg");
  });
});

describe("workoutImageList — 임베드 정규화", () => {
  it("객체 하나면 1개짜리 배열", () => {
    expect(workoutImageList({ image_path: "a.jpg" })).toEqual([
      { image_path: "a.jpg" },
    ]);
  });

  it("배열이면 그대로", () => {
    expect(workoutImageList([{ image_path: "a.jpg" }, { image_path: "b.jpg" }])).toHaveLength(2);
  });

  it("null·undefined면 빈 배열 — 사진 없는 세션이 여기로 온다", () => {
    expect(workoutImageList(null)).toEqual([]);
    expect(workoutImageList(undefined)).toEqual([]);
  });
});

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
