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
   */
  it("공개(group) 완료 세션만 센다 — 친구와 같은 자로 재기 위해서다", async () => {
    const { builder, calls } = queryBuilder([sessionRow("f1", "2026-08-06T02:00:00Z")]);
    mocks.from.mockReturnValue(builder);

    await getFriendBoardBase();

    const eqArgs = calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqArgs).toContainEqual(["visibility", "group"]);
    expect(eqArgs).toContainEqual(["status", "completed"]);
    expect(calls.find((c) => c.method === "is")?.args).toEqual([
      "deleted_at",
      null,
    ]);
  });

  it("행 상한을 명시한다 — 잘렸는지 알아야 숫자가 조용히 틀리지 않는다", async () => {
    const { builder, calls } = queryBuilder([]);
    mocks.from.mockReturnValue(builder);

    await getFriendBoardBase();

    expect(calls.find((c) => c.method === "limit")?.args).toEqual([
      FRIEND_SESSION_ROW_LIMIT,
    ]);
  });

  it("상한에 못 미치면 truncated가 false다", async () => {
    const { builder } = queryBuilder([sessionRow("f1", "2026-08-06T02:00:00Z")]);
    mocks.from.mockReturnValue(builder);

    const base = await getFriendBoardBase();
    expect(base.truncated).toBe(false);
    expect(base.activity.get("f1")?.workoutCount).toBe(1);
  });

  it("상한만큼 받으면 truncated가 true다", async () => {
    const rows = Array.from({ length: FRIEND_SESSION_ROW_LIMIT }, () =>
      sessionRow("f1", "2026-08-06T02:00:00Z"),
    );
    const { builder } = queryBuilder(rows);
    mocks.from.mockReturnValue(builder);

    expect((await getFriendBoardBase()).truncated).toBe(true);
  });

  it("찌른 기록을 그대로 실어 보낸다 — 앱을 다시 켜도 잠금이 유지된다", async () => {
    const { builder } = queryBuilder([]);
    mocks.from.mockReturnValue(builder);

    expect((await getFriendBoardBase()).poked.has("f1")).toBe(true);
  });

  it("친구가 없으면 질의를 아예 하지 않는다", async () => {
    mocks.getMyCrew.mockResolvedValue([]);
    const base = await getFriendBoardBase();

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

  /** 썸네일은 최근에 딴 것부터 — 화면이 `/badges/<key>.png`로 그린다 */
  it("최근에 딴 배지 키를 최신순으로 준다", async () => {
    mocks.getCrewMemberProfile.mockResolvedValue({
      badges: [
        {
          badgeKey: "streak_3",
          periodKey: "",
          earnedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          badgeKey: "streak_7",
          periodKey: "",
          earnedAt: new Date("2026-08-01T00:00:00Z"),
        },
      ],
    });

    expect((await getFriendBadges(["f1"])).get("f1")?.recentKeys).toEqual([
      "streak_7",
      "streak_3",
    ]);
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

    expect((await getFriendBadges(["f1"])).get("f1")?.recentKeys).toEqual([
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
    expect(result?.recentKeys).toEqual(["streak_3"]);
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
