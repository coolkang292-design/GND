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
let reportWorkoutStarted: typeof import("./workout-event").reportWorkoutStarted;
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
  ({ reportWorkoutCompleted, reportWorkoutStarted } = await import("./workout-event"));
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
          is_internal: false,
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

describe("workout_completed — 첫 운동은 사용자당 한 번", () => {
  it("첫 운동을 지우고 다시 끝내도(DB상 완료 1회가 두 번) is_first=true는 한 번만 나간다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });
    h.state.count = 1;
    await reportWorkoutCompleted({ ...base, sessionId: "first-a" });
    await reportWorkoutCompleted({ ...base, sessionId: "first-b" }); // 지우고 새로 한 첫 운동
    expect(h.captures.filter((c) => c.props.is_first === true)).toHaveLength(1);
    // 두 번째 운동은 정상적으로 나간다
    h.state.count = 2;
    await reportWorkoutCompleted({ ...base, sessionId: "second" });
    expect(h.captures.map((c) => c.props.workout_index)).toEqual([1, 2]);
  });
});

describe("workout_started", () => {
  it("동의 전: DB 조회도 하지 않고 아무것도 보내지 않는다", async () => {
    await syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });
    await reportWorkoutStarted({ userId: U, sessionId: "s1" });
    expect(h.state.queries).toBe(0);
    expect(h.captures).toHaveLength(0);
  });

  it("완료 0회면 is_first=true, workout_index=1 (세션 id는 안 보낸다)", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });
    h.state.count = 0;
    await reportWorkoutStarted({ userId: U, sessionId: "sess-start-1" });
    expect(h.captures).toEqual([
      { event: "workout_started", props: { workout_index: 1, is_first: true, is_internal: false } },
    ]);
    expect(JSON.stringify(h.captures)).not.toContain("sess-start-1");
  });

  it("완료 n회면 workout_index=n+1, is_first=false — 그 운동을 끝내면 completed의 index와 같다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });
    h.state.count = 4;
    await reportWorkoutStarted({ userId: U, sessionId: "s5" });
    h.state.count = 5; // 끝낸 뒤 DB 완료 수
    await reportWorkoutCompleted({ ...base, sessionId: "s5" });
    expect(h.captures.map((c) => [c.event, c.props.workout_index, c.props.is_first])).toEqual([
      ["workout_started", 5, false],
      ["workout_completed", 5, false],
    ]);
  });

  it("같은 세션에서 시작을 다시 눌러도, 첫 운동을 여러 번 시작해도 is_first=true는 한 번", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });
    h.state.count = 0;
    await reportWorkoutStarted({ userId: U, sessionId: "a" });
    await reportWorkoutStarted({ userId: U, sessionId: "a" }); // 재시도
    await reportWorkoutStarted({ userId: U, sessionId: "b" }); // 첫 운동을 버리고 새로 시작
    expect(h.captures).toHaveLength(1);
    expect(h.captures[0]!.props.is_first).toBe(true);
    // 첫 운동이 아닌 시작은 세션마다 한 번
    h.state.count = 1;
    await reportWorkoutStarted({ userId: U, sessionId: "c" });
    await reportWorkoutStarted({ userId: U, sessionId: "c" });
    await reportWorkoutStarted({ userId: U, sessionId: "d" });
    expect(h.captures).toHaveLength(3);
  });

  it("횟수 조회가 실패해도 이벤트는 나가되 is_first·workout_index는 뺀다", async () => {
    grantAnalyticsConsent();
    await syncAnalytics({ userId: U, isAnonymous: true, pathname: "/record" });
    h.state.count = null;
    await reportWorkoutStarted({ userId: U, sessionId: "x" });
    expect(h.captures).toEqual([{ event: "workout_started", props: { is_internal: false } }]);
  });
});
