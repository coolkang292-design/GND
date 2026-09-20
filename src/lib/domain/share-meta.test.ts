import { describe, expect, it } from "vitest";

import {
  challengeShareMeta,
  DEFAULT_SHARE,
  friendInviteShareMeta,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  OG_IMAGES,
} from "./share-meta";

describe("challengeShareMeta", () => {
  it("초대자와 챌린지 이름이 둘 다 있으면 둘 다 말한다 (D3)", () => {
    expect(
      challengeShareMeta({
        challengeName: "4주 챌린지",
        inviterNickname: "민수",
      }).title,
    ).toBe("민수님이 4주 챌린지에 초대했어요");
  });

  /**
   * ⚠️⚠️ **조회가 실패해도 제목이 비면 안 된다.** 빈 제목을 주면 카카오가
   *    `<title>`로 폴백해 `GND / 여기를 눌러 링크를 확인하세요`로 되돌아간다 —
   *    이 작업이 고치려던 바로 그 화면이다. 네 조합을 전부 못 박는다.
   */
  it("초대자만 있어도 문장이 된다", () => {
    expect(
      challengeShareMeta({ challengeName: null, inviterNickname: "민수" }).title,
    ).toBe("민수님이 운동 챌린지에 초대했어요");
  });

  it("챌린지 이름만 있어도 문장이 된다", () => {
    expect(
      challengeShareMeta({ challengeName: "4주 챌린지", inviterNickname: null })
        .title,
    ).toBe("4주 챌린지, 같이 할래?");
  });

  it("둘 다 없어도 제목이 비지 않는다", () => {
    const meta = challengeShareMeta({});
    expect(meta.title).toBe("운동 챌린지에 초대받았어요");
    expect(meta.title.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
  });

  it("빈 문자열·공백은 없는 것으로 친다", () => {
    expect(
      challengeShareMeta({ challengeName: "   ", inviterNickname: "" }).title,
    ).toBe("운동 챌린지에 초대받았어요");
  });

  /**
   * 닉네임·챌린지 이름은 사용자가 정하는 값이라 길이 상한이 없다. 카카오는 제목을
   * 잘라서 보여 주므로, 잘리는 자리가 **초대자 이름 한가운데**면 안 된다.
   */
  it("긴 닉네임을 자른다", () => {
    const meta = challengeShareMeta({
      challengeName: "4주 챌린지",
      inviterNickname: "아주아주아주아주아주아주아주긴닉네임",
    });
    expect(meta.title).toContain("…");
    expect(meta.title.startsWith("아주아주아주아주아주아주")).toBe(true);
  });

  it("챌린지 카드 그림을 쓴다", () => {
    expect(challengeShareMeta({}).image).toBe(OG_IMAGES.challenge);
  });
});

describe("friendInviteShareMeta", () => {
  it("친구 코드면 초대자 닉네임을 말한다", () => {
    expect(friendInviteShareMeta({ inviterNickname: "민수" }).title).toBe(
      "민수님이 GND 친구로 초대했어요",
    );
  });

  /** 0061 이전에 뿌려진 그룹 코드 링크도 문장이 돼야 한다 */
  it("옛 그룹 코드면 그룹 이름으로 말한다", () => {
    expect(
      friendInviteShareMeta({ inviterNickname: null, groupName: "리얼GND" })
        .title,
    ).toBe("리얼GND 크루에 초대받았어요");
  });

  it("아무것도 못 찾아도 제목이 비지 않는다", () => {
    expect(friendInviteShareMeta({}).title).toBe("GND에 초대받았어요");
  });

  /**
   * ⚠️ 이 앱엔 초대가 두 종류다(`/invite/[code]` · `/c/[code]`). 같은 문구를 쓰면
   *    받는 사람이 챌린지 초대로 오해한다 — 2026-08-07 사용자 질문이 그것이었다.
   */
  it("챌린지 초대와 다른 문구·다른 그림을 쓴다", () => {
    const friend = friendInviteShareMeta({ inviterNickname: "민수" });
    const challenge = challengeShareMeta({ inviterNickname: "민수" });
    expect(friend.title).not.toBe(challenge.title);
    expect(friend.description).not.toBe(challenge.description);
    expect(friend.image).toBe(OG_IMAGES.invite);
    expect(friend.image).not.toBe(challenge.image);
  });
});

describe("카드 규격", () => {
  it("1200×630 (1.91:1) — 카카오 큰 카드 안전값", () => {
    expect(OG_IMAGE_WIDTH).toBe(1200);
    expect(OG_IMAGE_HEIGHT).toBe(630);
    expect(OG_IMAGE_WIDTH / OG_IMAGE_HEIGHT).toBeCloseTo(1.9, 1);
  });

  it("세 그림이 서로 다르고 모두 /og/ 아래에 있다", () => {
    const paths = Object.values(OG_IMAGES);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p.startsWith("/og/")).toBe(true);
  });

  it("기본 카드도 제목·설명·그림이 채워져 있다", () => {
    expect(DEFAULT_SHARE.title.length).toBeGreaterThan(0);
    expect(DEFAULT_SHARE.description.length).toBeGreaterThan(0);
    expect(DEFAULT_SHARE.image).toBe(OG_IMAGES.default);
  });
});
