import { describe, expect, it } from "vitest";
import {
  crewTodaySummary,
  personalTodayAction,
  resolvePersonalTodayStatus,
  TODAY_STATUS_LABEL,
} from "./home-competition";

describe("home competition rules", () => {
  it("완료가 운동 중보다 우선한다", () => {
    expect(resolvePersonalTodayStatus(true, true)).toBe("done");
    expect(resolvePersonalTodayStatus(false, true)).toBe("active");
    expect(resolvePersonalTodayStatus(false, false)).toBe("idle");
  });

  /**
   * ⚠️ 문구를 **문자열 그대로** 단언한다. `TODAY_STATUS_LABEL[x]`로 기대값을 만들면
   * 빈 문자열을 돌려줘도 통과한다 — 화면에서 상태가 사라진 것을 잡지 못한다.
   */
  it("오늘 상태 문구는 한 곳에서 온다", () => {
    expect(TODAY_STATUS_LABEL.done).toBe("오늘 완료");
    expect(TODAY_STATUS_LABEL.active).toBe("운동 중");
    expect(TODAY_STATUS_LABEL.idle).toBe("운동 전");
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
