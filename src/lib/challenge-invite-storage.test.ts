// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingChallengeInvite,
  peekPendingChallengeInvite,
  peekPendingChallengeInviteDetail,
  pendingChallengeInvitePath,
  savePendingChallengeInvite,
} from "./challenge";

const KEY = "gnd-pending-challenge-invite";

beforeEach(() => localStorage.clear());

/**
 * 초대 보관함 (0091).
 *
 * 초대 링크로 왔는데 프로필이 없는 사람은 온보딩으로 밀린다. 그 사이 코드를
 * 들고 있어야 닉네임을 정한 뒤 이어서 참가할 수 있다. 0091부터 **초대자 id도**
 * 같이 나른다 — 참가자가 뿌린 링크로 온 신입이 **누구와** 친구가 되는지가
 * 여기 실려 간다.
 */
describe("초대 보관함", () => {
  it("코드와 초대자를 같이 보관하고 꺼낸다", () => {
    savePendingChallengeInvite("GND-ABCDE", "user-1");
    expect(peekPendingChallengeInviteDetail()).toEqual({
      code: "GND-ABCDE",
      by: "user-1",
    });
  });

  it("초대자가 없으면 null로 담긴다", () => {
    savePendingChallengeInvite("GND-ABCDE");
    expect(peekPendingChallengeInviteDetail()).toEqual({
      code: "GND-ABCDE",
      by: null,
    });
  });

  /**
   * ⚠️ 이게 이 파일의 존재 이유다. **배포 순간에 이미 링크를 열어 둔 사람**의
   *    localStorage에는 옛 형식(코드 문자열 하나)이 들어 있다. JSON으로만 읽으면
   *    그 사람은 챌린지에 못 들어가고, 아무도 신고하지 않으면 조용히 사라진다.
   */
  it("옛 형식(코드 문자열)도 그대로 읽는다", () => {
    localStorage.setItem(KEY, "GND-OLDCD");
    expect(peekPendingChallengeInviteDetail()).toEqual({
      code: "GND-OLDCD",
      by: null,
    });
    expect(peekPendingChallengeInvite()).toBe("GND-OLDCD");
  });

  it("깨진 JSON은 없는 것으로 친다", () => {
    localStorage.setItem(KEY, "{not json");
    expect(peekPendingChallengeInviteDetail()).toBeNull();
    expect(pendingChallengeInvitePath()).toBeNull();
  });

  it("비어 있으면 null", () => {
    expect(peekPendingChallengeInviteDetail()).toBeNull();
    expect(pendingChallengeInvitePath()).toBeNull();
  });

  /**
   * ⚠️ 주소 조립을 호출부에서 하면 안 된다. 로그인·OAuth 콜백·온보딩 **세 곳**이
   *    같은 주소를 만들고 있었는데, `&by=`를 더할 때 두 곳이 흘렸다.
   */
  it("이어가는 주소에 초대자가 실린다", () => {
    savePendingChallengeInvite("GND-ABCDE", "user-1");
    expect(pendingChallengeInvitePath()).toBe(
      "/challenge?join=GND-ABCDE&by=user-1",
    );
  });

  it("초대자가 없으면 by를 안 붙인다", () => {
    savePendingChallengeInvite("GND-ABCDE");
    expect(pendingChallengeInvitePath()).toBe("/challenge?join=GND-ABCDE");
  });

  it("코드에 특수문자가 있어도 인코딩한다", () => {
    savePendingChallengeInvite("A&B=C", "u/1");
    expect(pendingChallengeInvitePath()).toBe("/challenge?join=A%26B%3DC&by=u%2F1");
  });

  it("지우면 사라진다", () => {
    savePendingChallengeInvite("GND-ABCDE", "user-1");
    clearPendingChallengeInvite();
    expect(peekPendingChallengeInviteDetail()).toBeNull();
  });
});
