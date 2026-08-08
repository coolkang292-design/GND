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
    expect(out).toContain("챌린지 초대");
    expect(out).toContain('placeholder="닉네임"');
  });

  it("host가 아니면 아무것도 렌더하지 않는다", () => {
    expect(html("member", "setup")).toBe("");
  });

  it("시작한 뒤에는 초대 수단을 없애되 자리는 지키고 이유를 말한다", () => {
    // 영역을 통째로 숨기면 "왜 초대가 없지?"가 된다. 규칙을 감추지 않는다.
    const active = html("host", "active");
    expect(active).toContain("챌린지 초대");
    expect(active).toContain("이미 시작해서 초대가 닫혔어요");
    expect(active).not.toContain("초대 링크 복사하기");
    expect(active).not.toContain('placeholder="닉네임"');
  });

  it("끝난 챌린지는 새 챌린지를 만들라고 안내한다", () => {
    const ended = html("host", "ended");
    expect(ended).toContain("끝난 챌린지예요");
    expect(ended).not.toContain("초대 링크 복사하기");
  });
});

describe("InviteSheet — 초대 링크", () => {
  it("링크 복사 버튼이 있다 (크루 밖 사람을 부르는 경로)", () => {
    expect(html("host", "setup")).toContain("초대 링크 복사하기");
  });

  it("링크 참가자 안내는 조건절을 달고 있다 — 기존 사용자와 신규 가입자가 다르다", () => {
    // 0063 전에는 "링크로 참가해도 서로 크루가 되지는 않아요"라는 **단정문**이었다.
    // 신규 가입자는 이제 방장과 친구가 되므로(0063) 조건 없는 단정문은 거짓이다.
    // 태그를 걷어내고 "조건 → 결과" 순서로 단언한다 — 조건절을 빼고 단정문으로
    // 되돌리면 두 정규식이 모두 깨진다.
    const text = html("host", "setup").replace(/<[^>]*>/g, "");
    expect(text).toMatch(/이미 GND를 쓰는 사람[^.]*서로 크루가 되지 않아요/);
    expect(text).toMatch(/GND가 처음인 사람[^.]*나와 친구가 돼요/);
    expect(text).toContain("이 챌린지 안에서만");
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
