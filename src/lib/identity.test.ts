import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkIdentity: vi.fn(),
  signInWithOAuth: vi.fn(),
  getUserIdentities: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      linkIdentity: mocks.linkIdentity,
      signInWithOAuth: mocks.signInWithOAuth,
      getUserIdentities: mocks.getUserIdentities,
    },
  }),
}));

import {
  ALL_PROVIDERS,
  enabledProviders,
  getMyIdentities,
  identityError,
  linkProvider,
  signInWithProvider,
  takeAuthIntent,
} from "./identity";

/** Map으로 받친 가짜 저장소 — 이 파일은 jsdom이 아니라 localStorage가 없다 */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    get size() {
      return m.size;
    },
  };
}

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.linkIdentity.mockResolvedValue({ data: {}, error: null });
  mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
  // jsdom이 아닌 환경에서도 callbackUrl이 origin을 읽을 수 있게 한다
  vi.stubGlobal("window", { location: { origin: "https://gnd-one.vercel.app" } });
});

afterEach(() => {
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = ORIGINAL_FLAG;
  vi.unstubAllGlobals();
});

describe("enabledProviders — 플래그", () => {
  it("두 개를 켜면 둘 다 나온다", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao,google";
    expect(enabledProviders()).toEqual(["kakao", "google"]);
  });

  it("하나만 켜면 하나만 나온다", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "kakao";
    expect(enabledProviders()).toEqual(["kakao"]);
  });

  it("공백·대소문자를 견딘다", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = " Kakao , GOOGLE ";
    expect(enabledProviders()).toEqual(["kakao", "google"]);
  });

  /**
   * ⚠️ 이게 이 파일에서 제일 중요한 단언이다. 대시보드 설정이 안 끝난 채로
   * 배포되면 온보딩 주 버튼이 실패하는데, 그건 **신규 사용자가 앱에 못 들어오는**
   * 일이다. 플래그를 안 켜면 버튼이 아예 안 그려져야 한다.
   */
  it("비어 있으면 아무 제공자도 안 준다 (fail-closed)", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "";
    expect(enabledProviders()).toEqual([]);
    delete process.env.NEXT_PUBLIC_OAUTH_PROVIDERS;
    expect(enabledProviders()).toEqual([]);
  });

  it("모르는 이름은 무시한다 — 오타로 없는 버튼이 생기지 않는다", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "naver,kakaotalk,kakao";
    expect(enabledProviders()).toEqual(["kakao"]);
  });

  it("목록 순서는 ALL_PROVIDERS를 따른다 — 화면 순서가 플래그 순서로 흔들리지 않는다", () => {
    process.env.NEXT_PUBLIC_OAUTH_PROVIDERS = "google,kakao";
    expect(enabledProviders()).toEqual([...ALL_PROVIDERS]);
  });
});

/**
 * ⚠️⚠️ 이 describe가 이 기능의 본체다.
 *
 * 온보딩·`/account`는 **익명 세션이 살아 있는 화면**이다. 거기서
 * `signInWithOAuth`를 부르면 그 계정을 버리고 새 계정으로 갈아타 **기록이
 * 분리된다** — 계정을 지키려다 잃는, 이 기능에서 제일 나쁜 실패다.
 * 호출 스파이로 둘을 못 뒤바꾸게 고정한다.
 */
describe("linkProvider vs signInWithProvider — 뒤바꾸면 기록이 갈린다", () => {
  it("linkProvider는 linkIdentity만 부른다", async () => {
    await linkProvider("kakao");
    expect(mocks.linkIdentity).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("signInWithProvider는 signInWithOAuth만 부른다", async () => {
    await signInWithProvider("kakao");
    expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(mocks.linkIdentity).not.toHaveBeenCalled();
  });

  it("둘 다 /auth/callback으로 돌아오게 한다", async () => {
    await linkProvider("google");
    await signInWithProvider("google");
    for (const spy of [mocks.linkIdentity, mocks.signInWithOAuth]) {
      expect(spy.mock.calls[0][0]).toEqual({
        provider: "google",
        options: { redirectTo: "https://gnd-one.vercel.app/auth/callback" },
      });
    }
  });

  it("서버 오류는 삼키지 않고 던진다", async () => {
    mocks.linkIdentity.mockResolvedValue({
      data: null,
      error: new Error("manual_linking_disabled"),
    });
    await expect(linkProvider("kakao")).rejects.toThrow(
      "manual_linking_disabled",
    );
  });
});

/**
 * ⚠️ 돌아온 사람을 어디로 보낼지는 **떠나기 전에** 정해진다. `/auth/callback`은
 * 도착 주소만 봐서는 "연결하러 갔던 사람"과 "로그인하러 갔던 사람"을 구분할 수
 * 없어서, 2026-08-10까지 둘 다 `/account`(설정)로 보냈다 — 로그아웃했다 돌아온
 * 사람이 설정 화면에 떨어졌다(사용자 지적).
 */
describe("auth intent — 돌아왔을 때 갈 곳", () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    vi.stubGlobal("localStorage", store);
  });

  it("signInWithProvider는 signin으로 남긴다", async () => {
    await signInWithProvider("kakao");
    expect(store.getItem("gnd-auth-intent")).toBe("signin");
  });

  it("linkProvider는 link로 남긴다", async () => {
    await linkProvider("kakao");
    expect(store.getItem("gnd-auth-intent")).toBe("link");
  });

  it("한 번 꺼내면 지워진다 — 다음 왕복까지 오염되지 않는다", async () => {
    await signInWithProvider("kakao");
    expect(takeAuthIntent()).toBe("signin");
    expect(takeAuthIntent()).toBeNull();
    expect(store.size).toBe(0);
  });

  /**
   * ⚠️ 못 떠났는데 의도가 남으면 **다음 왕복이 그걸 주워 읽는다.** 예: `/account`
   * 에서 카카오 연결이 실패한 뒤 `/login`으로 가서 구글로 들어오면, 저장된 것은
   * "link"라 홈이 아니라 설정으로 간다.
   */
  it("떠나지 못하면(오류) 의도를 남기지 않는다", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: null,
      error: new Error("provider is not enabled"),
    });
    await expect(signInWithProvider("kakao")).rejects.toThrow();
    expect(store.getItem("gnd-auth-intent")).toBeNull();
  });

  it("아무것도 안 남겼으면 null이다 (호출하는 쪽이 기본값을 정한다)", () => {
    expect(takeAuthIntent()).toBeNull();
  });

  /** 저장소가 막힌 브라우저(프라이빗 모드)에서도 로그인 자체는 되어야 한다 */
  it("저장소가 막혀도 로그인을 막지 않는다", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    await expect(signInWithProvider("kakao")).resolves.toBeUndefined();
    expect(takeAuthIntent()).toBeNull();
  });
});

describe("getMyIdentities", () => {
  it("붙어 있는 제공자 이름만 준다", async () => {
    mocks.getUserIdentities.mockResolvedValue({
      data: { identities: [{ provider: "kakao" }, { provider: "email" }] },
      error: null,
    });
    expect(await getMyIdentities()).toEqual(["kakao", "email"]);
  });

  /** 익명 계정 = 붙은 신원이 하나도 없는 계정. 화면이 이걸로 잠금을 판정한다. */
  it("익명 계정이면 빈 배열이다", async () => {
    mocks.getUserIdentities.mockResolvedValue({
      data: { identities: [] },
      error: null,
    });
    expect(await getMyIdentities()).toEqual([]);
  });

  it("identities가 없어도 터지지 않는다", async () => {
    mocks.getUserIdentities.mockResolvedValue({ data: null, error: null });
    expect(await getMyIdentities()).toEqual([]);
  });
});

describe("identityError — 실패 갈래 (설계 §5.5)", () => {
  /**
   * ⚠️ "기록이 옮겨지지 않는다"를 반드시 말해야 한다. 이 말이 없으면 사용자는
   * 계정이 지켜진 줄 알고 브라우저를 지운다 — 그 순간 기록이 사라진다.
   */
  it("이미 다른 GND 계정에 붙은 신원이면 기록이 안 옮겨진다고 말한다", () => {
    const msg = identityError(new Error("identity_already_exists"));
    expect(msg).toContain("이미 다른 GND 계정");
    expect(msg).toContain("옮겨지지 않아요");
  });

  it("manual linking이 꺼져 있으면 설정 문제라고 구분해 말한다", () => {
    const msg = identityError(new Error("Manual linking is disabled"));
    expect(msg).toContain("manual linking");
    // 사용자 잘못으로 읽히면 안 된다
    expect(msg).not.toContain("다시 시도");
  });

  it("모르는 오류는 원문을 보여준다 (조용히 삼키지 않는다)", () => {
    expect(identityError(new Error("boom"))).toBe("연결하지 못했어요 (boom)");
  });
});
