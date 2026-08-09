import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyCrew: vi.fn(),
  getMyRecentPokeTargets: vi.fn(),
  getBadgeCatalog: vi.fn(),
  getCrewMemberProfile: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/crew-link", () => ({ getMyCrew: mocks.getMyCrew }));
vi.mock("@/lib/social", () => ({
  getMyRecentPokeTargets: mocks.getMyRecentPokeTargets,
}));
vi.mock("@/lib/badges", () => ({ getBadgeCatalog: mocks.getBadgeCatalog }));
vi.mock("@/lib/progression", () => ({
  getCrewMemberProfile: mocks.getCrewMemberProfile,
}));

import { getFriendBadges, getFriendBoardBase } from "./friends";
import { FRIEND_SESSION_ROW_LIMIT } from "./domain/friend-board";
import type { BadgeMeta } from "./domain/badges";

/** 체이닝 질의 빌더 — 어떤 필터가 걸렸는지 기록한다 */
function queryBuilder(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq", "is", "not", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve({ data: rows, error: null });
  };
  return { builder, calls };
}

function sessionRow(userId: string, completedAt: string, minutes = 30) {
  return { user_id: userId, completed_at: completedAt, duration_minutes: minutes };
}

const CATALOG: BadgeMeta[] = [
  {
    key: "streak_3", emoji: "🔥", name: "3일", description: "",
    tier: "bronze", rarity: "common", metricKey: "streak_days", threshold: 3,
    pointReward: 100, repeatable: false, repeatStep: null, sortOrder: 1,
  },
  {
    key: "streak_7", emoji: "🔥", name: "7일", description: "",
    tier: "silver", rarity: "rare", metricKey: "streak_days", threshold: 7,
    pointReward: 200, repeatable: false, repeatStep: null, sortOrder: 2,
  },
  // 등급 정렬을 가르려면 **희귀한 옛 배지**가 필요하다 (2026-08-09).
  // 최신순이면 밀려나고, 등급순이면 맨 앞에 온다 — 두 규칙이 갈리는 지점이다.
  {
    key: "volume_1t", emoji: "🏔️", name: "1톤", description: "",
    tier: "legend", rarity: "legend", metricKey: "weight_volume_kg",
    threshold: 1_000_000,
    pointReward: 2000, repeatable: false, repeatStep: null, sortOrder: 3,
  },
  // 같은 희귀도인데 티어가 다른 짝 — 2단 정렬을 가른다
  {
    key: "minutes_1000", emoji: "⏱️", name: "1000분", description: "",
    tier: "gold", rarity: "rare", metricKey: "total_minutes", threshold: 1000,
    pointReward: 300, repeatable: false, repeatStep: null, sortOrder: 4,
  },
];

afterEach(() => vi.clearAllMocks());

beforeEach(() => {
  mocks.getMyCrew.mockResolvedValue([
    { id: "f1", nickname: "친구하나", avatarUrl: "🐵", totalXp: 500,
      currentLevel: 3, currentStage: 1 },
  ]);
  mocks.getMyRecentPokeTargets.mockResolvedValue(new Set(["f1"]));
  mocks.getBadgeCatalog.mockResolvedValue(CATALOG);
});

describe("getFriendBoardBase — 친구 세션 질의", () => {
  /**
   * ⚠️ 이 단언이 이 파일의 핵심이다. RLS가 친구 세션을 공개분으로 좁히는데
   * **내 세션은 전부** 보인다. 필터를 빼면 나만 다른 자로 재게 된다.
   *
   * 2026-08-07에 내 행이 목록에 들어오면서 이 단언의 무게가 더 커졌다 — 이제
   * 나도 질의 대상이라 필터가 빠지면 **내 비공개 세션이 내 행만 부풀린다.**
   * 예전엔 나를 아예 안 넣어서 드러나지 않았을 실수다.
   */
  it("공개(group) 완료 세션만 센다 — 친구와 같은 자로 재기 위해서다", async () => {
    const { builder, calls } = queryBuilder([sessionRow("f1", "2026-08-06T02:00:00Z")]);
    mocks.from.mockReturnValue(builder);

    await getFriendBoardBase("me");

    const eqArgs = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqArgs).toContainEqual(["visibility", "group"]);
    expect(eqArgs).toContainEqual(["status", "completed"]);
    expect(calls.find((c) => c.method === "is")?.args).toEqual([
      "deleted_at",
      null,
    ]);
  });

  /**
   * ⚠️ 2026-08-07 사용자 지시로 내 행이 목록 맨 위에 생겼다. 내 활동도 **같은
   * 질의 한 번**으로 받는다 — 따로 부르면 질의가 하나 늘고, 더 나쁘게는 필터가
   * 갈려 내 숫자만 다른 자로 재게 된다.
   */
  it("내 id와 친구 id를 한 질의로 함께 받는다", async () => {
    const { builder, calls } = queryBuilder([]);
    mocks.from.mockReturnValue(builder);

    await getFriendBoardBase("me");

    const inArgs = calls.find((c) => c.method === "in")?.args as [
      string,
      string[],
    ];
    expect(inArgs[0]).toBe("user_id");
    expect(inArgs[1]).toContain("me");
    expect(inArgs[1]).toContain("f1");
  });

  it("행 상한을 명시한다 — 잘렸는지 알아야 숫자가 조용히 틀리지 않는다", async () => {
    const { builder, calls } = queryBuilder([]);
    mocks.from.mockReturnValue(builder);

    await getFriendBoardBase("me");

    expect(calls.find((c) => c.method === "limit")?.args).toEqual([
      FRIEND_SESSION_ROW_LIMIT,
    ]);
  });

  it("상한에 못 미치면 truncated가 false다", async () => {
    const { builder } = queryBuilder([sessionRow("f1", "2026-08-06T02:00:00Z")]);
    mocks.from.mockReturnValue(builder);

    const base = await getFriendBoardBase("me");
    expect(base.truncated).toBe(false);
    expect(base.activity.get("f1")?.workoutCount).toBe(1);
  });

  it("상한만큼 받으면 truncated가 true다", async () => {
    const rows = Array.from({ length: FRIEND_SESSION_ROW_LIMIT }, () =>
      sessionRow("f1", "2026-08-06T02:00:00Z"),
    );
    const { builder } = queryBuilder(rows);
    mocks.from.mockReturnValue(builder);

    expect((await getFriendBoardBase("me")).truncated).toBe(true);
  });

  it("찌른 기록을 그대로 실어 보낸다 — 앱을 다시 켜도 잠금이 유지된다", async () => {
    const { builder } = queryBuilder([]);
    mocks.from.mockReturnValue(builder);

    expect((await getFriendBoardBase("me")).poked.has("f1")).toBe(true);
  });

  it("친구가 없으면 질의를 아예 하지 않는다", async () => {
    mocks.getMyCrew.mockResolvedValue([]);
    const base = await getFriendBoardBase("me");

    expect(mocks.from).not.toHaveBeenCalled();
    expect(base.crew).toEqual([]);
  });
});

describe("getFriendBadges — 1인 1콜, 실패는 그 사람만", () => {
  it("사람마다 정의자 RPC를 부른다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [{ badgeKey: "streak_3", periodKey: "", earnedAt: new Date() }],
    });

    const counts = await getFriendBadges(["f1", "f2"]);
    expect(mocks.getCrewMemberProfile).toHaveBeenCalledTimes(2);
    expect(counts.get("f1")?.total).toBe(1);
  });

  /**
   * 썸네일은 **등급 좋은 것부터** — 화면이 `/badges/<key>.png`로 그린다.
   *
   * 2026-08-09 사용자 지시로 최신순 → 등급순이 됐다. 옛 규칙에서는 방금 딴
   * `first_workout`이 오래전에 딴 `legend`를 밀어냈다 — 자랑하라고 만든 자리인데
   * 자랑할 것이 안 보였다.
   *
   * ⚠️ 이 테스트는 **옛 배지를 더 희귀하게** 만들어 두 규칙을 가른다. 최신순으로
   * 되돌리면 실패한다. 날짜를 뒤집지 마라 — 뒤집는 순간 아무것도 검증 못 한다.
   */
  it("등급이 좋은 배지를 먼저 준다 — 오래됐어도 앞에 온다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        {
          badgeKey: "volume_1t", // legend, 반년 전
          periodKey: "",
          earnedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          badgeKey: "streak_3", // common, 오늘
          periodKey: "",
          earnedAt: new Date("2026-08-09T00:00:00Z"),
        },
      ],
    });

    expect((await getFriendBadges(["f1"])).get("f1")?.showcaseKeys).toEqual([
      "volume_1t",
      "streak_3",
    ]);
  });

  it("희귀도가 같으면 티어로 가른다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        // 둘 다 rare. silver < gold라 minutes_1000이 앞이다.
        { badgeKey: "streak_7", periodKey: "", earnedAt: new Date("2026-08-09") },
        {
          badgeKey: "minutes_1000",
          periodKey: "",
          earnedAt: new Date("2026-01-01"),
        },
      ],
    });

    expect((await getFriendBadges(["f1"])).get("f1")?.showcaseKeys).toEqual([
      "minutes_1000",
      "streak_7",
    ]);
  });

  it("세 장까지만 준다 — 등급 낮은 것이 잘린다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        { badgeKey: "streak_3", periodKey: "", earnedAt: new Date("2026-08-09") },
        { badgeKey: "volume_1t", periodKey: "", earnedAt: new Date("2026-01-01") },
        {
          badgeKey: "minutes_1000",
          periodKey: "",
          earnedAt: new Date("2026-02-01"),
        },
        { badgeKey: "streak_7", periodKey: "", earnedAt: new Date("2026-03-01") },
      ],
    });

    const result = (await getFriendBadges(["f1"])).get("f1");
    // legend → rare/gold → rare/silver 순. common인 streak_3가 잘린다.
    expect(result?.showcaseKeys).toEqual([
      "volume_1t",
      "minutes_1000",
      "streak_7",
    ]);
    expect(result?.total).toBe(4);
  });

  /**
   * ⚠️ RPC는 `user_badges` 행을 그대로 준다. 카탈로그에서 내린 배지 키가 섞이면
   * 화면에 **깨진 이미지**가 뜬다 — 개수뿐 아니라 썸네일 키도 걸러야 한다.
   */
  it("카탈로그에 없는 키는 썸네일에도 안 넣는다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        { badgeKey: "없는배지", periodKey: "", earnedAt: new Date() },
        { badgeKey: "streak_3", periodKey: "", earnedAt: new Date() },
      ],
    });

    expect((await getFriendBadges(["f1"])).get("f1")?.showcaseKeys).toEqual([
      "streak_3",
    ]);
  });

  it("같은 배지를 반복해 따도 썸네일은 한 번만 쓴다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        { badgeKey: "streak_3", periodKey: "a", earnedAt: new Date() },
        { badgeKey: "streak_3", periodKey: "b", earnedAt: new Date() },
      ],
    });

    const result = (await getFriendBadges(["f1"])).get("f1");
    expect(result?.showcaseKeys).toEqual(["streak_3"]);
    expect(result?.total).toBe(1);
  });

  /** ⚠️ 실패한 사람이 맵에서 **빠져야** 화면이 "0개"가 아니라 "—"를 그린다 */
  it("한 명이 실패해도 나머지는 살아남고, 실패한 사람은 맵에 없다", async () => {
    mocks.getCrewMemberProfile
      .mockRejectedValueOnce(new Error("not_crew"))
      .mockResolvedValueOnce({
        badges: [
          { badgeKey: "streak_3", periodKey: "", earnedAt: new Date() },
          { badgeKey: "streak_7", periodKey: "", earnedAt: new Date() },
        ],
      });

    const counts = await getFriendBadges(["fail", "ok"]);
    expect(counts.has("fail")).toBe(false);
    expect(counts.get("ok")?.total).toBe(2);
  });

  it("카탈로그에 없는 배지는 세지 않는다 — 프로필 시트와 같은 규칙이다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        { badgeKey: "streak_3", periodKey: "", earnedAt: new Date() },
        { badgeKey: "없는배지", periodKey: "", earnedAt: new Date() },
      ],
    });

    expect((await getFriendBadges(["f1"])).get("f1")?.total).toBe(1);
  });

  it("빈 목록이면 RPC를 부르지 않는다", async () => {
    await getFriendBadges([]);
    expect(mocks.getCrewMemberProfile).not.toHaveBeenCalled();
    expect(mocks.getBadgeCatalog).not.toHaveBeenCalled();
  });
});
