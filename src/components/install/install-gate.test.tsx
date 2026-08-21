// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallGate, OPEN_INSTALL_GUIDE_EVENT } from "./install-gate";

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
  hasLinkedIdentity: async () => {
    if (identity.fail) throw new Error("판단 불가");
    return identity.providers.length > 0;
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

  /**
   * ⚠️⚠️ 2026-08-22 사장님 지시로 뒤집었다 — *"로그인을 했든 안 했든 앱이 안
   * 깔려 있으면 나가게 세팅된 게 아닌가?"*. 옛 판은 익명이면 **침묵**했다.
   */
  it("⚠️ 익명 계정에는 '먼저 로그인' 시트가 뜬다 — 침묵하지 않는다", async () => {
    identity.providers = [];
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("먼저 로그인해 주세요");
  });

  it("안드로이드에도 뜬다 (이벤트가 없으면 손으로 하는 안내)", async () => {
    setUA(UA.androidChrome);
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("홈 화면에 GND 놓기");
  });

  /**
   * ⚠️⚠️ **회귀 테스트 (2026-08-22, 사장님 실기기 신고).**
   * *"설치 화면이 잠깐 떴다가 사라지고 기록화면으로 랜딩"* — 옛 코드는 시트를
   * **띄우는 순간** 세션 표식을 남겨서, 사용자가 버튼을 누르기 전에 페이지가
   * 한 번 더 로드되면 표식만 남고 시트는 영영 안 떴다.
   * 표식은 **사람이 봤다는 증거**여야 한다. 렌더는 증거가 아니다.
   */
  it("⚠️ 아무 버튼도 안 눌렀으면 페이지가 다시 로드돼도 또 뜬다", async () => {
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("홈 화면에 GND 놓기");

    cleanup(); // 페이지가 통째로 다시 로드된 상황 (sessionStorage는 남는다)

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

  it("⚠️ 신원 판단이 실패하면 아무 말도 안 한다 — '모른다'는 '안 붙었다'가 아니다", async () => {
    // 여기서 '익명'으로 밀면 멀쩡히 로그인한 사람에게 "먼저 로그인하세요"라는
    // **틀린 말**을 하게 된다.
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

  it("사용자가 닫으면 같은 세션에서는 다시 안 뜬다", async () => {
    setUA(UA.iosKakao);
    render(<InstallGate />);
    expect(await sheetTitle()).toBe("이제 홈 화면에 놓을 차례예요");

    fireEvent.click(screen.getByRole("button", { name: "알겠어요" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    cleanup();

    setUA(UA.iosKakao);
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

  /**
   * ⚠️⚠️ 사장님이 갇혔던 자리 — "다 했어요"를 누르면 자동 안내가 영영 안 뜬다.
   * 내 정보 탭의 진입점이 그 문을 다시 연다.
   */
  it("⚠️ '다 했어요'로 막혀 있어도 내 정보 탭에서 직접 열면 뜬다", async () => {
    localStorage.setItem(
      "gnd:install-offer",
      JSON.stringify({ dismissedAt: null, dismissCount: 0, done: true }),
    );
    render(<InstallGate />);
    expect(await sheetTitle()).toBeNull();

    window.dispatchEvent(new Event(OPEN_INSTALL_GUIDE_EVENT));
    expect(await sheetTitle()).toBe("홈 화면에 GND 놓기");
  });
});
