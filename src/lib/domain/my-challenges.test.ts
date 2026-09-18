import { describe, expect, it } from "vitest";
import {
  SECTION_LABEL,
  challengeDayProgress,
  groupMyChallenges,
  primaryActionOf,
  sectionOf,
  type MyChallengeLike,
} from "./my-challenges";

function ch(over: Partial<MyChallengeLike> & { id: string }): MyChallengeLike {
  return {
    status: "setup",
    myStatus: "joined",
    start_date: "2026-09-21",
    end_date: "2026-10-18",
    created_at: "2026-09-18T00:00:00Z",
    ...over,
  };
}

describe("sectionOf — 상태별 칸", () => {
  it("진행 중 · 준비 중 · 초대받음 · 종료", () => {
    expect(sectionOf(ch({ id: "a", status: "active" }))).toBe("active");
    expect(sectionOf(ch({ id: "b", status: "setup" }))).toBe("setup");
    expect(sectionOf(ch({ id: "c", status: "setup", myStatus: "invited" }))).toBe("invited");
    expect(sectionOf(ch({ id: "d", status: "ended" }))).toBe("ended");
  });

  it("취소된 챌린지는 어느 칸에도 없다", () => {
    expect(sectionOf(ch({ id: "x", status: "cancelled" }))).toBeNull();
  });

  it("목표를 안 세워 빠진(dropped) 진행 중 챌린지는 종료 칸으로 — 할 일이 없다", () => {
    expect(sectionOf(ch({ id: "y", status: "active", myStatus: "dropped" }))).toBe("ended");
  });

  it("칸 이름은 한글이다", () => {
    expect(SECTION_LABEL).toEqual({
      active: "진행 중",
      setup: "준비 중",
      invited: "초대받음",
      ended: "종료",
    });
  });
});

describe("groupMyChallenges — 칸 순서와 칸 안의 순서", () => {
  const list = [
    ch({ id: "ended-old", status: "ended", end_date: "2026-08-01" }),
    ch({ id: "setup-late", status: "setup", start_date: "2026-09-25" }),
    ch({ id: "active-late", status: "active", end_date: "2026-10-30" }),
    ch({ id: "invite", status: "setup", myStatus: "invited" }),
    ch({ id: "setup-soon", status: "setup", start_date: "2026-09-19" }),
    ch({ id: "active-soon", status: "active", end_date: "2026-09-30" }),
    ch({ id: "ended-new", status: "ended", end_date: "2026-09-10" }),
    ch({ id: "gone", status: "cancelled" }),
  ];
  const groups = groupMyChallenges(list);

  it("진행 중 → 준비 중 → 초대받음 → 종료, 빈 칸은 없다", () => {
    expect(groups.map((g) => g.section)).toEqual(["active", "setup", "invited", "ended"]);
    expect(groupMyChallenges([ch({ id: "only", status: "active" })]).map((g) => g.section)).toEqual([
      "active",
    ]);
  });

  it("진행 중은 끝나는 날이 가까운 순, 준비 중은 시작이 가까운 순, 종료는 최근 순", () => {
    const ids = (s: string) => groups.find((g) => g.section === s)!.items.map((c) => c.id);
    expect(ids("active")).toEqual(["active-soon", "active-late"]);
    expect(ids("setup")).toEqual(["setup-soon", "setup-late"]);
    expect(ids("ended")).toEqual(["ended-new", "ended-old"]);
  });

  it("여러 챌린지를 한 목록에 다 보여준다 — 가로 칩으로 고르게 하지 않는다", () => {
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    expect(count).toBe(7); // 취소 1개만 빠진다
  });
});

describe("primaryActionOf — 한 화면에 대표 버튼 하나", () => {
  const base = { hasMyGoals: false, endedByDate: false };

  describe("목록 카드", () => {
    const card = (c: Partial<MyChallengeLike>, extra: Partial<typeof base> = {}) =>
      primaryActionOf({ ...ch({ id: "c", ...c }), ...base, ...extra }, "card");

    it("진행 중 → 오늘 운동하기", () => {
      expect(card({ status: "active" })).toEqual({ kind: "goto_record", label: "오늘 운동하기" });
    });
    it("준비 중 + 내 목표 없음 → 내 목표 정하기", () => {
      expect(card({ status: "setup" })).toEqual({ kind: "open_goal_setup", label: "내 목표 정하기" });
    });
    it("준비 중 + 목표 있음 → 시작 준비 보기", () => {
      expect(card({ status: "setup" }, { hasMyGoals: true })).toEqual({
        kind: "open_detail",
        label: "시작 준비 보기",
      });
    });
    it("초대받음 → 초대 확인", () => {
      expect(card({ status: "setup", myStatus: "invited" })).toEqual({
        kind: "open_detail",
        label: "초대 확인",
      });
    });
    it("종료 → 결과 보기", () => {
      expect(card({ status: "ended" })).toEqual({ kind: "open_detail", label: "결과 보기" });
    });
    it("종료일이 지난 진행 중 → 운동이 아니라 결과", () => {
      expect(card({ status: "active" }, { endedByDate: true })).toEqual({
        kind: "open_detail",
        label: "결과 보기",
      });
    });
  });

  describe("상세", () => {
    const detail = (c: Partial<MyChallengeLike>, extra: Partial<typeof base> = {}) =>
      primaryActionOf({ ...ch({ id: "c", ...c }), ...base, ...extra }, "detail");

    it("초대받음 → 참여하기", () => {
      expect(detail({ myStatus: "invited" })).toEqual({ kind: "accept_invite", label: "참여하기" });
    });
    it("참가 + 목표 없음 → 내 목표 정하기", () => {
      expect(detail({})).toEqual({ kind: "open_goal_setup", label: "내 목표 정하기" });
    });
    it("준비 완료 → 친구 초대하기 (상세가 곧 준비 화면이라 자기 자신을 가리키지 않는다)", () => {
      expect(detail({}, { hasMyGoals: true })).toEqual({ kind: "share_invite", label: "친구 초대하기" });
    });
    it("진행 중 → 오늘 운동하기", () => {
      expect(detail({ status: "active" }, { hasMyGoals: true })).toEqual({
        kind: "goto_record",
        label: "오늘 운동하기",
      });
    });
    it("종료일 지난 진행 중 → 결과 발표하기", () => {
      expect(detail({ status: "active" }, { endedByDate: true })).toEqual({
        kind: "finalize",
        label: "결과 발표하기",
      });
    });
    it("종료 → 대표 버튼 없음 (결과가 곧 내용이다)", () => {
      expect(detail({ status: "ended" })).toEqual({ kind: "none", label: "" });
    });
    it("빠진(dropped) 진행 중 → 대표 버튼 없음", () => {
      expect(detail({ status: "active", myStatus: "dropped" })).toEqual({ kind: "none", label: "" });
    });
  });
});

describe("challengeDayProgress — DAY 7 / 28", () => {
  const start = "2026-09-21";
  const end = "2026-10-18"; // 28일

  it("진행 중이면 오늘이 몇째 날인지와 비율", () => {
    expect(challengeDayProgress("2026-09-27", start, end)).toEqual({
      phase: "running",
      day: 7,
      total: 28,
      ratio: 0.25,
      daysUntilStart: 0,
    });
  });

  it("시작 전이면 0일째, 시작까지 남은 날", () => {
    expect(challengeDayProgress("2026-09-18", start, end)).toEqual({
      phase: "before",
      day: 0,
      total: 28,
      ratio: 0,
      daysUntilStart: 3,
    });
  });

  it("끝났으면 마지막 날에 멈춘다", () => {
    expect(challengeDayProgress("2026-10-30", start, end)).toEqual({
      phase: "after",
      day: 28,
      total: 28,
      ratio: 1,
      daysUntilStart: 0,
    });
  });

  it("시작일·종료일 당일도 기간 안이다", () => {
    expect(challengeDayProgress(start, start, end).day).toBe(1);
    expect(challengeDayProgress(end, start, end).day).toBe(28);
  });
});
