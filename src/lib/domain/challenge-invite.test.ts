import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHALLENGE_DAYS,
  challengeInviteUrl,
  defaultChallengeName,
  defaultChallengePeriod,
  inviteSharePayload,
  shareOutcomeMessage,
} from "./challenge-invite";

describe("challengeInviteUrl", () => {
  it("챌린지 탭이 읽는 `?join=` 주소를 만든다", () => {
    expect(challengeInviteUrl("https://gnd-one.vercel.app", "GND-ABCDE")).toBe(
      "https://gnd-one.vercel.app/challenge?join=GND-ABCDE",
    );
  });

  it("코드를 URL 인코딩한다", () => {
    // 지금 코드 형식은 영숫자지만, 서버가 형식을 바꿔도 링크가 깨지지 않아야 한다.
    expect(challengeInviteUrl("https://x.app", "A B&C")).toBe(
      "https://x.app/challenge?join=A%20B%26C",
    );
  });

  it("origin 끝의 슬래시를 겹치지 않는다", () => {
    expect(challengeInviteUrl("https://x.app/", "C1")).toBe(
      "https://x.app/challenge?join=C1",
    );
  });
});

describe("defaultChallengePeriod", () => {
  /**
   * ⚠️⚠️ **오늘로 시작하면 안 된다.** `autostart_due_challenges`가
   * `status='setup' and start_date <= 오늘`인 방을 **전부 active로 올리고**, 그때
   * 목표가 없는 참가자를 `dropped`로 뺀다. 그 RPC는 크론뿐 아니라 **챌린지 탭이
   * 열릴 때마다** 클라이언트에서도 돈다(2026-08-17 브라우저 실측).
   *
   * 그래서 옛 구현(오늘 시작)은 방을 만든 직후 같은 화면의 조회가 방을 시작시켜
   * `issue_challenge_invite_code`가 `invalid_status:active`로 **400**을 냈다 —
   * 친구를 부르려고 만든 방인데 초대가 그 자리에서 닫혔다.
   */
  it("**내일** 시작한다 — 오늘로 두면 방이 즉시 시작돼 초대가 닫힌다", () => {
    expect(defaultChallengePeriod("2026-08-17").startDate).toBe("2026-08-18");
  });

  it("시작일부터 4주(28일)짜리다 — 양끝 포함", () => {
    expect(defaultChallengePeriod("2026-08-17")).toEqual({
      startDate: "2026-08-18",
      endDate: "2026-09-14",
    });
  });

  it("월을 넘어가도 맞다", () => {
    expect(defaultChallengePeriod("2026-12-31")).toEqual({
      startDate: "2027-01-01",
      endDate: "2027-01-28",
    });
  });

  it("윤년 2월을 지나도 맞다", () => {
    expect(defaultChallengePeriod("2028-02-10")).toEqual({
      startDate: "2028-02-11",
      endDate: "2028-03-09",
    });
  });

  it("기본 기간은 28일이다", () => {
    expect(DEFAULT_CHALLENGE_DAYS).toBe(28);
  });
});

describe("defaultChallengeName", () => {
  it("기간과 어긋나지 않는 이름을 준다", () => {
    // ⚠️ 이름이 `4주`인데 기간이 28일이 아니면 화면이 거짓말을 한다.
    expect(defaultChallengeName()).toBe("4주 챌린지");
    expect(DEFAULT_CHALLENGE_DAYS / 7).toBe(4);
  });
});

describe("inviteSharePayload", () => {
  it("받는 사람이 무엇인지 알 수 있게 챌린지 이름을 싣는다", () => {
    const p = inviteSharePayload("4주 챌린지", "https://x.app/challenge?join=C1");
    expect(p.title).toContain("4주 챌린지");
    expect(p.text).toContain("4주 챌린지");
    expect(p.url).toBe("https://x.app/challenge?join=C1");
  });

  it("본문에도 주소를 넣는다 — 카톡이 url 필드를 버릴 때가 있다", () => {
    const p = inviteSharePayload("8월", "https://x.app/challenge?join=C1");
    expect(p.text).toContain("https://x.app/challenge?join=C1");
  });
});

describe("shareOutcomeMessage", () => {
  it("결과마다 다음에 할 일이 다르므로 문구도 다르다", () => {
    const shared = shareOutcomeMessage("shared");
    const copied = shareOutcomeMessage("copied");
    const manual = shareOutcomeMessage("manual");
    expect(new Set([shared, copied, manual]).size).toBe(3);
  });

  it("복사만 된 경우에는 붙여넣으라고 말한다", () => {
    expect(shareOutcomeMessage("copied")).toContain("붙여넣기");
  });

  it("자동 복사까지 실패하면 화면의 링크를 쓰라고 말한다", () => {
    expect(shareOutcomeMessage("manual")).toContain("링크");
  });

  it("어떤 결과도 실패처럼 읽히지 않는다 — 챌린지는 이미 만들어졌다", () => {
    for (const o of ["shared", "copied", "manual"] as const) {
      expect(shareOutcomeMessage(o)).not.toContain("실패");
    }
  });
});
