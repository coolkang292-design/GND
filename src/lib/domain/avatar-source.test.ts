import { describe, expect, it } from "vitest";
import { avatarSource, isPhotoAvatar } from "./avatar-source";

/**
 * `profiles.avatar_url` 한 칸에 **이모지와 사진 URL이 섞여 산다**(0001 주석이
 * 처음부터 "이모지 문자 또는 storage 경로"라고 적어 뒀다).
 *
 * ⚠️⚠️ **판정을 화면에서 하지 마라.** 이 값을 그리는 곳이 14군데다. 한 곳이라도
 * `?? "👤"`로 남아 있으면 그 화면에 `https://…`가 **글자로 그대로 나온다.**
 * 그래서 판정은 여기 한 곳뿐이고, 화면은 `<Avatar>`만 쓴다.
 */
describe("avatarSource", () => {
  it("빈 값은 none — 화면이 기본 아이콘을 고르게 한다", () => {
    expect(avatarSource(null).kind).toBe("none");
    expect(avatarSource(undefined).kind).toBe("none");
    expect(avatarSource("").kind).toBe("none");
    expect(avatarSource("   ").kind).toBe("none");
  });

  it("이모지는 emoji로, 값을 그대로 돌려준다", () => {
    expect(avatarSource("🧔")).toEqual({ kind: "emoji", emoji: "🧔" });
    expect(avatarSource("💁‍♀️")).toEqual({ kind: "emoji", emoji: "💁‍♀️" });
  });

  it("http/https로 시작하면 photo", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/avatars/u/1.jpg";
    expect(avatarSource(url)).toEqual({ kind: "photo", url });
    expect(avatarSource("http://x.test/a.jpg").kind).toBe("photo");
  });

  it("앞뒤 공백이 붙어 와도 photo로 본다 — 붙여넣기 사고 방지", () => {
    const url = "https://x.test/a.jpg";
    expect(avatarSource(`  ${url}  `)).toEqual({ kind: "photo", url });
  });

  it("대문자 스킴도 photo", () => {
    expect(avatarSource("HTTPS://x.test/a.jpg").kind).toBe("photo");
  });

  /**
   * ⚠️ `javascript:`·`data:` 같은 다른 스킴은 **사진으로 보지 않는다.**
   * `<img src>`에 그대로 실리면 안 되는 값이다. 이모지로 떨어뜨리면 화면에
   * 이상한 글자가 보일 뿐 실행되지 않는다 — 조용히 실행되는 쪽보다 낫다.
   */
  it("http가 아닌 스킴은 photo가 아니다", () => {
    expect(avatarSource("javascript:alert(1)").kind).toBe("emoji");
    expect(avatarSource("data:image/png;base64,AAA").kind).toBe("emoji");
    expect(avatarSource("//x.test/a.jpg").kind).toBe("emoji");
  });

  it("isPhotoAvatar는 같은 판정을 불리언으로 준다", () => {
    expect(isPhotoAvatar("https://x.test/a.jpg")).toBe(true);
    expect(isPhotoAvatar("🧔")).toBe(false);
    expect(isPhotoAvatar(null)).toBe(false);
  });
});
