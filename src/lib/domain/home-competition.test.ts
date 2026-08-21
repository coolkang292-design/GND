import { describe, expect, it } from "vitest";
import {
  crewTodaySummary,
  personalComparisonText,
  personalTodayAction,
  resolvePersonalTodayStatus,
} from "./home-competition";

describe("home competition rules", () => {
  it("완료가 운동 중보다 우선한다", () => {
    expect(resolvePersonalTodayStatus(true, true)).toBe("done");
    expect(resolvePersonalTodayStatus(false, true)).toBe("active");
    expect(resolvePersonalTodayStatus(false, false)).toBe("idle");
  });

  it("크루 완료 인원은 크루 행만 센다", () => {
    expect(
      crewTodaySummary([
        { status: "done" },
        { status: "active" },
        { status: "idle" },
      ]),
    ).toEqual({ total: 3, done: 1 });
  });

  it("비교 문구는 완료 요약을 한 번만 말하고 내 상태를 붙인다", () => {
    const summary = { total: 2, done: 1 };
    expect(personalComparisonText(summary, "idle")).toBe(
      "크루 2명 중 1명 완료 · 나는 아직",
    );
    expect(personalComparisonText(summary, "active")).toBe(
      "크루 2명 중 1명 완료 · 나는 운동 중",
    );
    expect(personalComparisonText(summary, "done")).toBe(
      "크루 2명 중 1명 완료 · 나도 완료",
    );
  });

  /**
   * ⚠️ 조회 전(`null`)과 크루 0명을 구별한다. 둘을 합치면 조회가 늦는 동안
   * "아직 크루가 없어요"가 번쩍였다가 사라진다 — 없던 크루가 생긴 것처럼 읽힌다.
   */
  it("조회 전과 크루 0명을 다르게 말한다", () => {
    expect(personalComparisonText(null, "idle")).toBe("크루 현황을 불러오는 중…");
    expect(personalComparisonText({ total: 0, done: 0 }, "done")).toBe(
      "아직 크루가 없어요",
    );
  });

  it("운동 완료 뒤에는 링크가 아니라 칭찬 배너다", () => {
    expect(personalTodayAction("idle", 160)).toEqual({
      kind: "link",
      label: "오늘 운동하고 +160 XP",
    });
    expect(personalTodayAction("active", 160)).toEqual({
      kind: "link",
      label: "운동 이어가기",
    });
    expect(personalTodayAction("done", 160)).toEqual({
      kind: "success",
      label: "오늘 운동 완료! 오늘도 해냈어요 🔥",
    });
  });

  /**
   * ⚠️ XP 숫자를 하드코딩하지 않는다는 것을 **다른 값으로** 확인한다.
   * 160으로만 재면 `"오늘 운동하고 +160 XP"`를 문자열로 박아도 통과한다.
   */
  it("CTA의 XP는 인자에서 온다 — 상수를 바꾸면 문구도 바뀐다", () => {
    expect(personalTodayAction("idle", 180).label).toBe(
      "오늘 운동하고 +180 XP",
    );
  });
});
