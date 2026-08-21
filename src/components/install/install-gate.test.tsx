// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallGate } from "./install-gate";

/**
 * **게이트가 실제로 시트를 띄우는가.**
 *
 * ⚠️ 이 파일이 늦게 생겼다. 처음엔 시트의 *생김새*만 개발 서버에서 보고
 *    "확인했다"고 했는데, 정작 **뜨는가**는 아무도 안 봤다. 사장님이
 *    *"그냥 로그인되고 기록 화면으로 넘어가는데?"* 라고 물어서 드러났다.
 *    판정 함수(`install-prompt.test.ts`)가 통과해도 배선이 끊기면 아무것도 안 뜬다.
 */

const auth = vi.hoisted(() => ({
  state: {
    configured: true,
    loading: false,
    userId: null as string | null,
    error: null as string | null,
  },
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => auth.state,
}));

const identity = vi.hoisted(() => ({
  providers: ["kakao"] as string[],
  fail: false,
}));
vi.mock("@/lib/identity", () => ({
  getMyIdentities: async () => {
    if (identity.fail) throw new Error("network");
    return identity.providers;
  },
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosKakao:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.2.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
}

function setStandalone(on: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: on && q.includes("standalone"), media: q }),
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  auth.state.loading = false;
  auth.state.userId = "u1";
  identity.providers = ["kakao"];
  identity.fail = false;
  setStandalone(false);
  setUA(UA.iosSafari);
});

afterEach(() => cleanup());

/** 시트가 떴는가 — 제목으로 확인한다 */
async function sheetTitle(): Promise<string | null> {
  try {
    const el = await screen.findByRole("dialog", {}, { timeout: 1500 });
    return el.getAttribute("aria-label");
  } catch {
    return null;
  }
}

describe("InstallGate — 뜨는가", () => {
  it("⚠️ 카카오 계정으로 로그인한 아이폰 사파리 사용자에게 설치 안내가 뜬다", async () => {
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("홈 화면에 GND 놓기");
  });

  it("⚠️ 카톡 인앱에서는 사파리로 옮기라는 안내가 뜬다", async () => {
    setUA(UA.iosKakao);
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("이제 홈 화면에 놓을 차례예요");
  });

  it("안드로이드에도 뜬다 (이벤트가 없으면 손으로 하는 안내)", async () => {
    setUA(UA.androidChrome);
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("홈 화면에 GND 놓기");
  });
});

describe("InstallGate — 안 뜨는가 (부정 확인)", () => {
  it("이미 설치해서 쓰는 사람에게는 안 뜬다", async () => {
    setStandalone(true);
    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();
  });

  it("⚠️ 익명 계정에는 안 뜬다 — 설치하면 그 계정으로 못 돌아온다", async () => {
    identity.providers = [];
    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();
  });

  it("신원 조회가 실패하면 안 띄운다 — '모른다'는 '붙었다'가 아니다", async () => {
    identity.fail = true;
    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();
  });

  it("인증이 아직 로딩 중이면 기다린다", async () => {
    auth.state.loading = true;
    auth.state.userId = null;
    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();
  });

  it("같은 세션에서 한 번 띄웠으면 다시 안 띄운다", async () => {
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("홈 화면에 GND 놓기");
    cleanup();

    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();
  });

  it("'다 했어요'를 누른 적이 있으면 새 세션에도 안 뜬다", async () => {
    localStorage.setItem(
      "gnd:install-offer",
      JSON.stringify({ dismissedAt: null, dismissCount: 0, done: true }),
    );
    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();
  });
});
