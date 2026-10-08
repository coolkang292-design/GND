// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryStorage } from "./test-storage";
import { linkProviderOf, loginProviderOf } from "./provider";

const h = vi.hoisted(() => {
  const captures: Array<{ event: string; props: Record<string, unknown> }> = [];
  const state = { count: 1 as number | null, queries: 0, opted: false, distinctId: "anon", identified: false };
  const sdk = {
    init: vi.fn(),
    identify: vi.fn((id: string) => {
      state.distinctId = id;
      state.identified = true;
    }),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(() => {
      state.opted = true;
    }),
    opt_in_capturing: vi.fn(),
    has_opted_out_capturing: vi.fn(() => state.opted),
    setPersonProperties: vi.fn(),
    capture: vi.fn((event: string, props: Record<string, unknown>) => {
      captures.push({ event, props });
    }),
    get_property: vi.fn(() => undefined),
    get_distinct_id: vi.fn(() => state.distinctId),
  };
  return { captures, state, sdk };
});

vi.mock("posthog-js", () => ({ default: h.sdk }));
vi.mock("@/lib/supabase/client", () => {
  const chain = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "is", "not"]) q[m] = () => q;
    q.then = (resolve: (v: unknown) => void) => {
      h.state.queries += 1;
      resolve(
        h.state.count === null
          ? { count: null, error: { message: "boom" } }
          : { count: h.state.count, error: null },
      );
    };
    return q;
  };
  return {
    isSupabaseConfigured: () => true,
    getSupabaseBrowserClient: () => ({ from: () => ({ select: () => chain() }) }),
  };
});

const KEY = "phc_abcdefghij1234567890";
const U = "11111111-1111-4111-8111-111111111111";

let reportWorkoutCompleted: typeof import("./workout-event").reportWorkoutCompleted;
let syncAnalytics: typeof import("./client").syncAnalytics;
let grantAnalyticsConsent: typeof import("./consent-actions").grantAnalyticsConsent;

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
  installMemoryStorage();
  window.history.pushState({}, "", "/record");
  h.captures.length = 0;
  h.state.count = 1;
  h.state.queries = 0;
  h.state.opted = false;
  for (const f of Object.values(h.sdk)) (f as { mockClear?: () => void }).mockClear?.();
  ({ reportWorkoutCompleted } = await import("./workout-event"));
  ({ syncAnalytics } = await import("./client"));
  ({ grantAnalyticsConsent } = await import("./consent-actions"));
});

const base = {
  userId: U,
  sessionId: "sess-1",
  exerciseCount: 4,
  durationMinutes: 35,
  photoCount: 0,
  replay: false,
};

describe("provider 정규화", () => {
  it("가장 최근 신원을 허용된 값으로 줄인다", () => {
    const user = {
      identities: [
        { provider: "kakao", created_at: "2026-10-01T00:00:00Z" },
        { provider: "google", created_at: "2026-10-09T00:00:00Z" },
      ],
    };
    expect(linkProviderOf(user)).toBe("google");
    expect(loginProviderOf(user)).toBe("google");
    expect(linkProviderOf({ identities: [{ provider: "email" }] })).toBe("other");
    expect(loginProviderOf({ identities: [{ provider: "email" }] })).toBe("password");
    expect(linkProviderOf({ identities: [{ provider: "github" }] })).toBe("other");
    expect(linkProviderOf(null)).toBe("other");
    expect(loginProviderOf({ app_metadata: { provider: "kakao" } })).toBe("kakao");
  });
});

describe("workout_completed", () => {
  it("동의 전: DB 조회도 하지 않고 아무것도 보내지 않는다", async () => {
    await syncAnalytics({ userId: U, isAnonymous: false, pathname: "/record" });
    await reportWorkoutCompleted(base);
    expect(h.state.queries).toBe(0);
    expect(h.captures).toHaveLength(0);
  });

  it("첫 운동이면 is_first=true, 구간·수·사진 유무만 보낸다 (세션 id 등은 안 보낸다)", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: false, pathname: "/record" });
    await reportWorkoutCompleted(base);
    expect(h.captures).toEqual([
      {
        event: "workout_completed",
        props: {
          workout_index: 1,
          is_first: true,
          exercise_count: 4,
          duration_bucket: "20-40",
          has_photo: false,
        },
      },
    ]);
    expect(JSON.stringify(h.captures)).not.toContain("sess-1");
  });

  it("n번째 운동이면 is_first=false와 workout_index", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: false, pathname: "/record" });
    h.state.count = 7;
    await reportWorkoutCompleted({ ...base, sessionId: "sess-7", photoCount: 2 });
    expect(h.captures[0]!.props).toMatchObject({ workout_index: 7, is_first: false, has_photo: true });
  });

  it("같은 세션을 다시 닫아도(재시도·재생) 한 번만 나간다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: false, pathname: "/record" });
    await reportWorkoutCompleted(base);
    await reportWorkoutCompleted(base);
    await reportWorkoutCompleted({ ...base, replay: true, sessionId: "sess-2" });
    expect(h.captures).toHaveLength(1);
  });

  it("횟수 조회가 실패해도 이벤트는 나가되 is_first·workout_index는 뺀다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: false, pathname: "/record" });
    h.state.count = null;
    await reportWorkoutCompleted(base);
    expect(h.captures).toHaveLength(1);
    expect(h.captures[0]!.props).not.toHaveProperty("is_first");
    expect(h.captures[0]!.props).not.toHaveProperty("workout_index");
    expect(h.captures[0]!.props).toMatchObject({ exercise_count: 4, duration_bucket: "20-40" });
  });
});
