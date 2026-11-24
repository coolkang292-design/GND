import { describe, expect, it } from "vitest";
import { classifyClient } from "./client-kind";

const c = (userAgent: string, webdriver?: boolean) => classifyClient({ userAgent, webdriver });

describe("classifyClient", () => {
  it("헤드리스 크롬은 automation (11/6~7에 36개 들어온 UA)", () => {
    expect(
      c("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.0 Safari/537.36"),
    ).toBe("automation");
  });
  it("navigator.webdriver면 UA가 멀쩡해도 automation", () => {
    expect(c("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157.0.0.0 Safari/537.36", true)).toBe("automation");
  });
  it("카카오톡·인스타·페북·네이버 인앱을 구분한다", () => {
    expect(c("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Mobile/15E148 KAKAOTALK 11.0.0")).toBe("inapp_kakao");
    expect(c("Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 350.0")).toBe("inapp_instagram");
    expect(c("Mozilla/5.0 (Linux; Android 14) [FBAN/FB4A;FBAV/450.0]")).toBe("inapp_facebook");
    expect(c("Mozilla/5.0 (Linux; Android 14) NAVER(inapp; search; 1000; 12.0)")).toBe("inapp_naver");
  });
  it("이름 없는 Android WebView(11/2 가입 실패 UA 형태)는 inapp_other", () => {
    expect(
      c("Mozilla/5.0 (Linux; Android 17; SM-S936N Build/CP2A.260605.016; wv) AppleWebKit/537.36 Chrome/157.0 Mobile Safari/537.36"),
    ).toBe("inapp_other");
  });
  it("Safari/ 없는 iOS 모바일은 웹뷰, 있는 쪽은 일반 브라우저", () => {
    expect(c("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe("inapp_other");
    expect(c("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("browser");
  });
  it("데스크톱·일반 안드로이드 크롬은 browser", () => {
    expect(c("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157.0.0.0 Safari/537.36")).toBe("browser");
    expect(c("Mozilla/5.0 (Linux; Android 16; SM-S931B) Chrome/157.0 Mobile Safari/537.36")).toBe("browser");
  });
  it("UA가 없으면 browser로 둔다(추측해서 봇으로 단정하지 않는다)", () => {
    expect(classifyClient({ userAgent: null })).toBe("browser");
  });
});
