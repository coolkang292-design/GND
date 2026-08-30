import { describe, expect, it } from "vitest";

import {
  BIO_MAX_LENGTH,
  LINK_MAX_LENGTH,
  checkProfileLink,
  isValidBio,
  linkErrorMessage,
  linkLabel,
  normalizeText,
} from "./profile-links";

describe("normalizeText / isValidBio", () => {
  it("공백만 있으면 null", () => {
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
  });

  it("앞뒤 공백을 뗀다", () => {
    expect(normalizeText("  퇴근 후 주 4회  ")).toBe("퇴근 후 주 4회");
  });

  /** ⚠️ DB CHECK가 120자다. 여기서 안 막으면 저장이 통째로 실패한다 */
  it("소개는 120자까지", () => {
    expect(isValidBio("가".repeat(BIO_MAX_LENGTH))).toBe(true);
    expect(isValidBio("가".repeat(BIO_MAX_LENGTH + 1))).toBe(false);
  });

  it("소개 없음은 유효하다", () => {
    expect(isValidBio(null)).toBe(true);
    expect(isValidBio("  ")).toBe(true);
  });
});

describe("checkProfileLink — 스킴", () => {
  /** ⚠️⚠️ 이 검사의 존재 이유. 링크는 사용자가 눌러서 이동하는 곳이다 */
  it("javascript: 를 막는다", () => {
    expect(checkProfileLink("instagram", "javascript:alert(1)")).toEqual({
      ok: false,
      reason: "scheme",
    });
  });

  it("data: 를 막는다", () => {
    expect(
      checkProfileLink("youtube", "data:text/html;base64,PHNjcmlwdD4="),
    ).toEqual({ ok: false, reason: "scheme" });
  });

  /**
   * ⚠️ http도 막는다. DB CHECK가 `https://`로 시작하는지 보기 때문에, 여기서
   * 통과시키면 저장이 실패하는데 사용자는 이유를 모른다.
   */
  it("http 평문을 막는다", () => {
    expect(checkProfileLink("youtube", "http://youtube.com/@me")).toEqual({
      ok: false,
      reason: "scheme",
    });
  });
});

describe("checkProfileLink — 도메인", () => {
  /**
   * ⚠️⚠️ 회귀 방어. `host.endsWith("instagram.com")`으로 짜면
   * **`evilinstagram.com`이 통과한다.**
   */
  it("비슷한 이름의 다른 도메인을 막는다", () => {
    expect(
      checkProfileLink("instagram", "https://evilinstagram.com/me"),
    ).toEqual({ ok: false, reason: "host" });
    expect(checkProfileLink("youtube", "https://notyoutube.com/@me")).toEqual({
      ok: false,
      reason: "host",
    });
  });

  it("관계없는 도메인을 막는다", () => {
    expect(checkProfileLink("instagram", "https://evil.com/me")).toEqual({
      ok: false,
      reason: "host",
    });
  });

  it("Instagram 정상 주소를 통과시킨다", () => {
    const r = checkProfileLink("instagram", "https://instagram.com/gnd_user");
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe("https://instagram.com/gnd_user");
  });

  it("YouTube 정상 주소를 통과시킨다", () => {
    expect(checkProfileLink("youtube", "https://youtube.com/@gnd").ok).toBe(true);
    expect(checkProfileLink("youtube", "https://youtu.be/abc123").ok).toBe(true);
    expect(checkProfileLink("youtube", "https://m.youtube.com/@gnd").ok).toBe(
      true,
    );
  });

  it("하위 도메인은 통과시킨다", () => {
    expect(checkProfileLink("instagram", "https://www.instagram.com/me").ok).toBe(
      true,
    );
  });

  it("서로의 도메인은 통과시키지 않는다", () => {
    expect(checkProfileLink("instagram", "https://youtube.com/@me").ok).toBe(
      false,
    );
  });
});

describe("checkProfileLink — 그 밖", () => {
  it("빈 값은 통과하고 null이 된다", () => {
    expect(checkProfileLink("instagram", "  ")).toEqual({
      ok: true,
      value: null,
    });
    expect(checkProfileLink("youtube", null)).toEqual({ ok: true, value: null });
  });

  it("주소 형식이 아니면 거부한다", () => {
    expect(checkProfileLink("instagram", "instagram.com/me")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("200자를 넘으면 거부한다", () => {
    const long = "https://instagram.com/" + "a".repeat(LINK_MAX_LENGTH);
    expect(checkProfileLink("instagram", long)).toEqual({
      ok: false,
      reason: "length",
    });
  });
});

describe("linkErrorMessage", () => {
  it("도메인 오류는 어느 서비스인지 말해 준다", () => {
    expect(
      linkErrorMessage("instagram", { ok: false, reason: "host" }),
    ).toContain("Instagram");
    expect(linkErrorMessage("youtube", { ok: false, reason: "host" })).toContain(
      "YouTube",
    );
  });

  it("통과한 검사에는 문구가 없다", () => {
    expect(linkErrorMessage("instagram", { ok: true, value: null })).toBe("");
  });
});

describe("linkLabel", () => {
  it("핸들을 뽑는다", () => {
    expect(linkLabel("instagram", "https://instagram.com/gnd_user")).toBe(
      "@gnd_user",
    );
    expect(linkLabel("youtube", "https://youtube.com/@gnd")).toBe("@gnd");
  });

  it("경로가 없으면 서비스 이름", () => {
    expect(linkLabel("instagram", "https://instagram.com/")).toBe("Instagram");
  });

  it("망가진 주소에도 안 터진다", () => {
    expect(linkLabel("youtube", "not a url")).toBe("YouTube");
  });
});
