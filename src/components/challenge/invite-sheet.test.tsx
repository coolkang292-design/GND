import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InviteSheet, inviteError } from "./invite-sheet";

const html = (myRole: "host" | "member", status: string) =>
  renderToStaticMarkup(
    <InviteSheet
      challengeId="c1"
      myRole={myRole}
      status={status}
      onInvited={() => {}}
    />,
  );

describe("InviteSheet — 노출 조건", () => {
  it("host + setup이면 초대 입력이 보인다", () => {
    const out = html("host", "setup");
    expect(out).toContain("크루 초대");
    expect(out).toContain('placeholder="닉네임"');
  });

  it("host가 아니면 아무것도 렌더하지 않는다", () => {
    expect(html("member", "setup")).toBe("");
  });

  it("시작한 뒤에는 렌더하지 않는다 (초대는 setup 단계만)", () => {
    expect(html("host", "active")).toBe("");
    expect(html("host", "ended")).toBe("");
  });
});

describe("InviteSheet — 초대 링크", () => {
  it("링크 복사 버튼이 있다 (크루 밖 사람을 부르는 경로)", () => {
    expect(html("host", "setup")).toContain("초대 링크 복사하기");
  });

  it("링크로 참가하면 서로 크루가 된다는 것을 화면에 알린다", () => {
    const out = html("host", "setup");
    // 이 경고는 뺄 수 없다. crew_links에 challenge_id가 없어 챌린지가 끝나도
    // 관계가 남는데(설계 D5), 문서에만 적으면 아무도 안 읽는다.
    expect(out).toContain("서로 크루가 돼요");
    expect(out).toContain("아는 사람에게만");
  });
});

describe("inviteError — 서버 오류 코드를 사람 말로", () => {
  const cases: [string, string][] = [
    ["already_invited", "이미 초대했거나 참가 중이에요"],
    ["not_host", "방장만 초대할 수 있어요"],
    ["self_invite", "본인은 초대할 수 없어요"],
    ["target_not_found", "그 닉네임을 찾지 못했어요"],
    ["invalid_status:active", "시작한 챌린지에는 초대할 수 없어요"],
  ];
  for (const [code, expected] of cases) {
    it(`${code} → "${expected}"`, () => {
      expect(inviteError(new Error(code))).toBe(expected);
    });
  }

  it("모르는 오류는 원문을 보여준다 (조용히 삼키지 않는다)", () => {
    expect(inviteError(new Error("boom"))).toBe("초대 실패: boom");
  });
});
