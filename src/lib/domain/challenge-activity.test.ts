import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PREVIEW_COUNT,
  ACTIVITY_ROW_LIMIT,
  activityLeaders,
  canExpandActivity,
  isActivityTruncated,
  visibleActivity,
  type ActivityRow,
} from "./challenge-activity";

function row(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    user_id: "u1",
    nickname: "철수",
    avatar_url: null,
    status: "completed",
    is_mine: false,
    ...over,
  };
}

/** 한 사람의 완료 운동 n개 */
function times(n: number, over: Partial<ActivityRow>): ActivityRow[] {
  return Array.from({ length: n }, () => row(over));
}

const many = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("visibleActivity / canExpandActivity — 최근 5개 + 펼쳐보기", () => {
  /**
   * ⚠️ `toBe(ACTIVITY_PREVIEW_COUNT)`로 쓰지 마라. 그러면 상수가 몇으로 바뀌든
   * 늘 통과한다 — 사용자가 정한 값이 실제로 그 값인지를 검사하지 못한다.
   */
  it("접으면 5개만 보인다 — 2026-09-18 사용자 지정값", () => {
    expect(ACTIVITY_PREVIEW_COUNT).toBe(5);
    expect(visibleActivity(many(7), false)).toEqual([0, 1, 2, 3, 4]);
  });

  it("앞에서 자른다 — 서버가 최신순으로 주므로 앞 5개가 최근 5개다", () => {
    expect(visibleActivity(["최신", "b", "c", "d", "e", "오래됨"], false)).toEqual(
      ["최신", "b", "c", "d", "e"],
    );
  });

  it("펼치면 전부 보인다", () => {
    expect(visibleActivity(many(7), true)).toHaveLength(7);
  });

  it("5개 이하면 접어도 전부 보이고 '더 보기'가 필요 없다", () => {
    expect(visibleActivity(many(5), false)).toHaveLength(5);
    expect(canExpandActivity(many(5))).toBe(false);
  });

  it("6개부터 '더 보기'가 뜬다", () => {
    expect(canExpandActivity(many(6))).toBe(true);
  });
});

describe("isActivityTruncated — 서버 상한", () => {
  it("200개에 닿으면 잘린 것으로 본다", () => {
    expect(ACTIVITY_ROW_LIMIT).toBe(200);
    expect(isActivityTruncated(many(200))).toBe(true);
    expect(isActivityTruncated(many(199))).toBe(false);
  });
});

describe("activityLeaders — 활동 TOP 3", () => {
  it("완료 운동 횟수가 많은 순서로 1·2·3위와 횟수를 준다", () => {
    const leaders = activityLeaders([
      ...times(2, { user_id: "b", nickname: "영희" }),
      ...times(5, { user_id: "a", nickname: "철수" }),
      ...times(3, { user_id: "c", nickname: "민수" }),
    ]);
    expect(leaders.map((l) => [l.rank, l.nickname, l.count])).toEqual([
      [1, "철수", 5],
      [2, "민수", 3],
      [3, "영희", 2],
    ]);
  });

  it("⚠️ 4위는 들어가지 않는다", () => {
    const leaders = activityLeaders([
      ...times(4, { user_id: "a", nickname: "가" }),
      ...times(3, { user_id: "b", nickname: "나" }),
      ...times(2, { user_id: "c", nickname: "다" }),
      ...times(1, { user_id: "d", nickname: "라" }),
    ]);
    expect(leaders).toHaveLength(3);
    expect(leaders.find((l) => l.userId === "d")).toBeUndefined();
  });

  it("⚠️ 운동 중인 행은 세지 않는다 — 취소되면 순위가 흔들린다", () => {
    const leaders = activityLeaders([
      ...times(2, { user_id: "a", nickname: "철수" }),
      row({ user_id: "a", nickname: "철수", status: "active" }),
      row({ user_id: "b", nickname: "영희", status: "active" }),
    ]);
    expect(leaders).toEqual([
      expect.objectContaining({ userId: "a", count: 2, rank: 1 }),
    ]);
  });

  it("횟수가 같으면 공동 등수다 — 1·1·3", () => {
    const leaders = activityLeaders([
      ...times(3, { user_id: "a", nickname: "나중" }),
      ...times(3, { user_id: "b", nickname: "가장" }),
      ...times(1, { user_id: "c", nickname: "셋째" }),
    ]);
    expect(leaders.map((l) => [l.rank, l.nickname])).toEqual([
      [1, "가장"],
      [1, "나중"],
      [3, "셋째"],
    ]);
  });

  it("3위가 동점이면 3위 전원이 들어간다", () => {
    const leaders = activityLeaders([
      ...times(5, { user_id: "a", nickname: "가" }),
      ...times(4, { user_id: "b", nickname: "나" }),
      ...times(2, { user_id: "c", nickname: "다" }),
      ...times(2, { user_id: "d", nickname: "라" }),
      ...times(1, { user_id: "e", nickname: "마" }),
    ]);
    expect(leaders.map((l) => [l.rank, l.userId])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
      [3, "d"],
    ]);
  });

  it("2위가 둘이면 다음은 4위라 들어가지 않는다", () => {
    const leaders = activityLeaders([
      ...times(5, { user_id: "a", nickname: "가" }),
      ...times(3, { user_id: "b", nickname: "나" }),
      ...times(3, { user_id: "c", nickname: "다" }),
      ...times(1, { user_id: "d", nickname: "라" }),
    ]);
    expect(leaders.map((l) => l.rank)).toEqual([1, 2, 2]);
  });

  it("내 운동이면 isMine을 넘긴다", () => {
    const [me] = activityLeaders(times(2, { user_id: "me", is_mine: true }));
    expect(me.isMine).toBe(true);
  });

  it("완료 운동이 하나도 없으면 빈 배열 — TOP 3를 그리지 않는다", () => {
    expect(activityLeaders([])).toEqual([]);
    expect(activityLeaders([row({ status: "active" })])).toEqual([]);
  });

  it("닉네임이 없어도 죽지 않고 뒤로 간다", () => {
    const leaders = activityLeaders([
      ...times(2, { user_id: "x", nickname: null }),
      ...times(2, { user_id: "y", nickname: "영희" }),
    ]);
    expect(leaders.map((l) => l.userId)).toEqual(["y", "x"]);
  });
});
