import { describe, expect, it } from "vitest";
import {
  challengeDaysLeft,
  challengeDday,
  challengeStartHint,
  formatMonthDay,
  inclusiveDays,
} from "./challenge-time";

describe("challengeDaysLeft — 오늘~종료일 남은 일수(오늘 포함)", () => {
  it("종료 당일이면 1", () => {
    expect(challengeDaysLeft("2026-08-28", "2026-08-28")).toBe(1);
  });
  it("종료 하루 전이면 2", () => {
    expect(challengeDaysLeft("2026-08-27", "2026-08-28")).toBe(2);
  });
  it("종료일이 지났으면 0", () => {
    expect(challengeDaysLeft("2026-08-29", "2026-08-28")).toBe(0);
  });
  it("월 경계를 넘어도 정확히 계산", () => {
    expect(challengeDaysLeft("2026-07-30", "2026-08-02")).toBe(4);
  });
});

/**
 * 2026-08-13에 추가. `challenge/page.tsx`가 같은 산수를 지역 함수 `periodDays`로
 * 다시 짜 놓고 있었고, 홈 챌린지 요약이 세 번째 구현을 만들 뻔했다.
 *
 * ⚠️ 세 함수가 **1씩 어긋난다.** 아래 표가 그 차이를 고정한다 —
 * 하나만 고치고 나머지를 안 보면 화면마다 D-day가 하루씩 달라진다.
 */
describe("inclusiveDays — 양끝을 포함한 기간 일수", () => {
  it("같은 날이면 1일이다", () => {
    expect(inclusiveDays("2026-08-13", "2026-08-13")).toBe(1);
  });
  it("하루 차이면 2일이다", () => {
    expect(inclusiveDays("2026-08-13", "2026-08-14")).toBe(2);
  });
  it("4주 챌린지(시작일 + 27일)는 28일이다", () => {
    expect(inclusiveDays("2026-08-13", "2026-09-09")).toBe(28);
  });
  it("월 경계를 넘어도 정확하다", () => {
    expect(inclusiveDays("2026-08-31", "2026-09-01")).toBe(2);
  });
  it("연 경계를 넘어도 정확하다", () => {
    expect(inclusiveDays("2026-12-31", "2027-01-01")).toBe(2);
  });
  it("윤년 2월 29일을 하루로 센다", () => {
    // 2028-02-28 · 02-29 · 03-01 = 3일. 윤년이 아니면 2일이 된다.
    expect(inclusiveDays("2028-02-28", "2028-03-01")).toBe(3);
  });
  it("끝이 시작보다 이르면 하한을 걸지 않고 0 이하를 돌려준다", () => {
    // ⚠️ 여기서 자르지 않는다. 자를지 말지는 부르는 쪽이 정한다 —
    //    challengeDaysLeft는 0으로 자르고, challengeDday는 음수를 그대로 쓴다.
    expect(inclusiveDays("2026-08-14", "2026-08-13")).toBe(0);
    expect(inclusiveDays("2026-08-15", "2026-08-13")).toBe(-1);
  });
});

describe("challengeDday — 화면에 적는 D-N", () => {
  it("종료 당일은 D-0이다", () => {
    expect(challengeDday("2026-08-28", "2026-08-28")).toBe(0);
  });
  it("종료 하루 전은 D-1이다", () => {
    expect(challengeDday("2026-08-27", "2026-08-28")).toBe(1);
  });
  it("종료일이 지나면 음수다 — 화면이 '종료'로 갈아탈 수 있어야 한다", () => {
    // ⚠️ 0으로 자르면 안 된다. 종료 당일과 지난 날이 똑같이 D-0으로 보인다.
    expect(challengeDday("2026-08-29", "2026-08-28")).toBe(-1);
  });
  it("월 경계를 넘어도 정확하다", () => {
    expect(challengeDday("2026-07-30", "2026-08-02")).toBe(3);
  });
});

describe("세 함수의 어긋남 — 한 곳에 고정한다", () => {
  it("challengeDaysLeft는 inclusiveDays를 0에서 자른 것이다", () => {
    for (const [today, end] of [
      ["2026-08-28", "2026-08-28"],
      ["2026-08-27", "2026-08-28"],
      ["2026-08-29", "2026-08-28"],
      ["2026-07-30", "2026-08-02"],
    ]) {
      expect(challengeDaysLeft(today, end)).toBe(
        Math.max(0, inclusiveDays(today, end)),
      );
    }
  });
  it("challengeDday는 inclusiveDays보다 정확히 1 작다", () => {
    for (const [today, end] of [
      ["2026-08-28", "2026-08-28"],
      ["2026-08-27", "2026-08-28"],
      ["2026-08-29", "2026-08-28"],
      ["2026-07-30", "2026-08-02"],
    ]) {
      expect(challengeDday(today, end)).toBe(inclusiveDays(today, end) - 1);
    }
  });
});

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
   * ⚠️⚠️ **이 블록에서 가장 중요한 단언이다.**
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
