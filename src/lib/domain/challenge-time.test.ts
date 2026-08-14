import { describe, expect, it } from "vitest";
import { challengeStartHint, formatMonthDay } from "./challenge-time";

describe("formatMonthDay — 시작일 표시", () => {
  it("앞의 0을 떼고 한국어로 적는다", () => {
    expect(formatMonthDay("2026-08-01")).toBe("8월 1일");
    expect(formatMonthDay("2026-12-25")).toBe("12월 25일");
  });

  /**
   * ⚠️ 이 파일의 다른 함수와 같은 이유로 `Date`를 쓰지 않는다.
   * `new Date("2026-08-20")`은 UTC 자정으로 읽히고, KST보다 뒤인 기기에서는
   * `8월 19일`이 된다. 문자열을 그대로 쪼개면 그 문제가 아예 없다.
   */
  it("연도가 달라도 월·일만 적는다", () => {
    expect(formatMonthDay("2099-01-09")).toBe("1월 9일");
  });
});

describe("challengeStartHint — 자동 시작이 주인공이다", () => {
  const base = {
    startDateKey: "2026-08-20",
    todayKey: "2026-08-14",
    allSet: false,
    allApproved: false,
    approvedCount: 0,
    memberCount: 4,
  };

  /**
   * ⚠️⚠️ **이 파일에서 가장 중요한 단언이다.**
   *
   * `autostart_due_challenges()`가 시작일에 동의 없이 챌린지를 연다
   * (`docs/db-current-schema.sql:415`). 그런데 화면은 2026-08-14까지
   * `전원 KPI 설정 + 전원 동의 시 챌린지가 시작돼요`라고만 적어서,
   * 안 막혀 있는데 막혔다고 읽혔다. 이 단언이 그 회귀선이다.
   */
  it("시작일이 아직이면 그 날짜에 자동으로 시작된다고 말한다", () => {
    const hint = challengeStartHint(base);
    expect(hint.notice).toContain("8월 20일");
    expect(hint.notice).toContain("자동");
    expect(hint.notice).not.toContain("전원 동의 시");
  });

  it("목표를 안 세우면 본인만 빠진다는 것도 함께 알린다", () => {
    // autostart는 목표 없는 참가자를 dropped로 빼고, 그 사람은 시작 알림도
    // 못 받는다. 최소한 시작 전에는 말해 줘야 한다.
    expect(challengeStartHint(base).notice).toContain("빠져요");
  });

  it("시작일 당일이면 곧 시작된다고 말한다", () => {
    const hint = challengeStartHint({ ...base, todayKey: "2026-08-20" });
    expect(hint.notice).toContain("곧");
    expect(hint.notice).not.toContain("8월 20일에 자동으로");
  });

  it("시작일이 지났어도 막다른 길로 말하지 않는다", () => {
    const hint = challengeStartHint({ ...base, todayKey: "2026-08-25" });
    expect(hint.notice).toContain("곧");
  });

  describe("수동 시작 버튼 — 유일한 문이 아니라 지름길이다", () => {
    it("전원이 목표를 세우기 전에는 무엇이 남았는지 적는다", () => {
      const hint = challengeStartHint(base);
      expect(hint.buttonLabel).toContain("지금 바로 시작");
      expect(hint.buttonLabel).toContain("목표");
      expect(hint.canStartNow).toBe(false);
      // 옛 라벨 `전원 목표 세팅 대기 중…`은 기다리는 것 말고 할 일이 없어
      // 보였다. 되돌아가면 잡힌다.
      expect(hint.buttonLabel).not.toBe("전원 목표 세팅 대기 중…");
    });

    it("동의만 남았으면 진행 수를 보여준다", () => {
      const hint = challengeStartHint({
        ...base,
        allSet: true,
        approvedCount: 2,
      });
      expect(hint.buttonLabel).toContain("2/4");
      expect(hint.canStartNow).toBe(false);
    });

    it("전원이 마치면 누를 수 있다", () => {
      const hint = challengeStartHint({
        ...base,
        allSet: true,
        allApproved: true,
        approvedCount: 4,
      });
      expect(hint.buttonLabel).toBe("지금 바로 시작하기");
      expect(hint.canStartNow).toBe(true);
    });

    /**
     * 참가자가 0명이면 `allSet`이 false다(`challenge/page.tsx:445` —
     * `members.length > 0 &&`). 정상 경로에선 `create_challenge_room`이 방장을
     * 넣으므로 1 이상이지만, 조회가 아직 안 왔을 때 이 상태가 한 프레임 스친다.
     * 그때 "누를 수 있다"고 하면 안 된다.
     */
    it("참가자를 아직 모를 때는 누를 수 없다", () => {
      const hint = challengeStartHint({ ...base, memberCount: 0 });
      expect(hint.canStartNow).toBe(false);
    });
  });
});
