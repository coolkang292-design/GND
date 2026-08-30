import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InviteSheet, inviteError } from "./invite-sheet";

const html = (
  myRole: "host" | "member",
  status: string,
  discoverable = false,
  recruitNote: string | null = null,
  recruitImageUrl: string | null = null,
) =>
  renderToStaticMarkup(
    <InviteSheet
      challengeId="c1"
      myRole={myRole}
      status={status}
      discoverable={discoverable}
      recruitNote={recruitNote}
      recruitImageUrl={recruitImageUrl}
      onInvited={() => {}}
    />,
  );

describe("InviteSheet — 노출 조건", () => {
  it("host + setup이면 초대 입력이 보인다", () => {
    const out = html("host", "setup");
    expect(out).toContain("챌린지 초대");
    expect(out).toContain('placeholder="닉네임"');
  });

  /**
   * 참가자 초대 (0091, 사장님 지시 2026-08-31).
   *
   * 옛 동작은 `member`면 통째로 `null`이었다. 이제 **링크만** 준다.
   */
  it("참가자에게는 초대 링크만 보인다", () => {
    const out = html("member", "setup");
    expect(out).toContain("초대 링크 복사하기");
    expect(out).toContain("친구 초대");
  });

  /**
   * ⚠️ 이게 이 묶음에서 가장 중요한 단언이다. 참가자에게 방장 기능이 새면
   *    **눌리는데 서버가 not_host로 막는 버튼**이 된다 — 사용자는 고장으로 읽는다.
   */
  it("참가자에게 방장 전용 기능이 새지 않는다", () => {
    const out = html("member", "setup", true, "모집글이에요", "https://x/y.jpg");
    expect(out, "닉네임 초대가 샜다").not.toContain('placeholder="닉네임"');
    expect(out, "모집 공개 토글이 샜다").not.toContain("피드에서 참가자 구하기");
    expect(out, "모집글이 샜다").not.toContain("모집글 저장");
    expect(out, "모집 사진이 샜다").not.toContain("모집 사진");
  });

  it("시작한 뒤에는 참가자에게 아무것도 안 보인다", () => {
    // 방장은 이유를 적은 자리를 남기지만, 참가자는 애초에 관리 화면이 아니라
    // 빈 카드를 남길 이유가 없다.
    expect(html("member", "active")).toBe("");
    expect(html("member", "ended")).toBe("");
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

/**
 * 피드 모집 토글 (0085).
 *
 * ⚠️ 닉네임 초대·링크 초대와 **같은 시트**에 둔다. 참가자를 모으는 방법 셋이
 *    흩어지면 방장이 그중 둘만 안다.
 */
describe("InviteSheet — 피드 모집", () => {
  it("host + setup이면 모집 토글이 보인다", () => {
    expect(html("host", "setup")).toContain("피드에서 참가자 구하기");
  });

  it("이미 켜져 있으면 체크된 채로 그린다", () => {
    expect(html("host", "setup", true)).toContain("checked");
  });

  /** 시작한 뒤에는 시트 전체가 닫힌 이유만 그린다 — 모집도 함께 사라진다 */
  it("active에서는 모집 토글이 없다", () => {
    expect(html("host", "active")).not.toContain("피드에서 참가자 구하기");
  });

  it("방장이 아니면 아무것도 없다", () => {
    expect(html("member", "setup")).not.toContain("피드에서 참가자 구하기");
  });

  /** ⚠️ 끌 수 있다는 사실을 말해 준다 — 못 내리는 줄 알면 아무도 안 켠다 */
  it("끄면 새로 못 들어온다고 알려준다", () => {
    expect(html("host", "setup")).toContain("끄면 새로 들어올 수 없어요");
  });
});
