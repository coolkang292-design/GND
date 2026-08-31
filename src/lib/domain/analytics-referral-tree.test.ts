import { describe, expect, it } from "vitest";
import { DIRECT_CAMPAIGN, type FunnelUserRow } from "./analytics-funnel";
import {
  MAX_REFERRAL_DEPTH,
  UNKNOWN_ROOT,
  campaignSpread,
  generationBucket,
  referralKind,
  resolveRoot,
} from "./analytics-referral-tree";

/**
 * 시나리오는 명령문 §9를 그대로 옮겼다.
 * `인플루언서 A → 철수 → 영희 → 민수`가 실제로 계보로 이어지는지 본다.
 */
function u(id: string, over: Partial<FunnelUserRow> = {}): FunnelUserRow {
  return {
    userId: id,
    isAnonymous: false,
    hasProfile: true,
    startedWorkout: false,
    completedWorkouts: 0,
    joinedChallenge: false,
    reworkoutD7: false,
    profileCampaign: null,
    invitedBy: null,
    inviteOrigin: null,
    ...over,
  };
}

const map = (users: FunnelUserRow[]) => new Map(users.map((x) => [x.userId, x]));

describe("시나리오 A — 친구 초대 확산 (campaign A → user1 → user2 → user3)", () => {
  const users = [
    u("user1", { profileCampaign: "campaign_a" }),
    u("user2", { invitedBy: "user1", inviteOrigin: "invite_link" }),
    u("user3", { invitedBy: "user2", inviteOrigin: "invite_link" }),
  ];
  const byId = map(users);

  it("직접 초대자가 바로 앞사람이다 — 뿌리와 섞이지 않는다", () => {
    expect(users[1].invitedBy).toBe("user1");
    expect(users[2].invitedBy).toBe("user2");
  });

  it("세 명 모두 뿌리가 campaign A다", () => {
    expect(resolveRoot("user1", byId).root).toBe("campaign_a");
    expect(resolveRoot("user2", byId).root).toBe("campaign_a");
    expect(resolveRoot("user3", byId).root).toBe("campaign_a");
  });

  it("세대가 0·1·2로 매겨진다", () => {
    expect(resolveRoot("user1", byId).generation).toBe(0);
    expect(resolveRoot("user2", byId).generation).toBe(1);
    expect(resolveRoot("user3", byId).generation).toBe(2);
  });

  it("⚠️ user2·user3의 acquisition_campaign은 여전히 비어 있다 (덮어쓰지 않음)", () => {
    expect(users[1].profileCampaign).toBeNull();
    expect(users[2].profileCampaign).toBeNull();
  });

  it("확산표에서 직접 1명 · 추가 2명 · 총 3명 · 배수 3", () => {
    const { rows } = campaignSpread(users);
    const a = rows.find((r) => r.root === "campaign_a")!;
    expect(a.direct).toBe(1);
    expect(a.viral).toBe(2);
    expect(a.total).toBe(3);
    expect(a.multiplier).toBe(3);
    expect(a.byGeneration).toEqual([1, 1, 1, 0]);
  });
});

describe("시나리오 B — 챌린지 초대 확산", () => {
  const users = [
    u("user1", { profileCampaign: "campaign_a" }),
    u("user2", { invitedBy: "user1", inviteOrigin: "challenge" }),
  ];

  it("직접 초대자는 user1이고 뿌리는 campaign A다", () => {
    const r = resolveRoot("user2", map(users));
    expect(users[1].invitedBy).toBe("user1");
    expect(r.root).toBe("campaign_a");
    expect(r.generation).toBe(1);
  });

  it("초대 종류가 챌린지로 구별된다", () => {
    expect(referralKind(users[1])).toBe("챌린지 초대");
  });
});

describe("시나리오 C — 혼합 (친구 + 챌린지)", () => {
  const users = [
    u("user1", { profileCampaign: "campaign_a" }),
    u("user2", { invitedBy: "user1", inviteOrigin: "invite_link" }),
    u("user3", { invitedBy: "user1", inviteOrigin: "challenge" }),
  ];

  it("세 명 모두 뿌리가 A다", () => {
    const byId = map(users);
    for (const id of ["user1", "user2", "user3"]) {
      expect(resolveRoot(id, byId).root).toBe("campaign_a");
    }
  });

  it("초대 종류는 친구와 챌린지로 각각 구별된다", () => {
    expect(referralKind(users[1])).toBe("친구 초대");
    expect(referralKind(users[2])).toBe("챌린지 초대");
    const { kinds } = campaignSpread(users);
    const byKind = Object.fromEntries(kinds.map((k) => [k.kind, k.count]));
    expect(byKind["친구 초대"]).toBe(1);
    expect(byKind["챌린지 초대"]).toBe(1);
    expect(byKind["외부 유입"]).toBe(1);
  });
});

describe("시나리오 D — 다른 인플루언서는 절대 섞이지 않는다", () => {
  const users = [
    u("a1", { profileCampaign: "campaign_a" }),
    u("a2", { invitedBy: "a1", inviteOrigin: "invite_link" }),
    u("a3", { invitedBy: "a2", inviteOrigin: "challenge" }),
    u("b1", { profileCampaign: "campaign_b" }),
    u("b2", { invitedBy: "b1", inviteOrigin: "invite_link" }),
  ];

  it("A 계보 3명, B 계보 2명으로 갈린다", () => {
    const { rows } = campaignSpread(users);
    const a = rows.find((r) => r.root === "campaign_a")!;
    const b = rows.find((r) => r.root === "campaign_b")!;
    expect(a.total).toBe(3);
    expect(b.total).toBe(2);
    expect(a.direct).toBe(1);
    expect(b.direct).toBe(1);
  });

  it("A의 자손이 B 집계에 한 명도 들어가지 않는다", () => {
    const byId = map(users);
    expect(resolveRoot("a3", byId).root).toBe("campaign_a");
    expect(resolveRoot("b2", byId).root).toBe("campaign_b");
    const { rows } = campaignSpread(users);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(users.length);
  });
});

describe("시나리오 E — 직접 유입은 다른 캠페인에 들어가지 않는다", () => {
  const users = [
    u("a1", { profileCampaign: "campaign_a" }),
    u("plain"), // utm도 inviter도 없다
  ];

  it("(직접 유입)으로 따로 남는다", () => {
    const r = resolveRoot("plain", map(users));
    expect(r.root).toBe(DIRECT_CAMPAIGN);
    expect(r.anomaly).toBeNull();
    expect(referralKind(users[1])).toBe("출처 모름");
  });

  it("campaign A 집계에 섞이지 않는다", () => {
    const { rows } = campaignSpread(users);
    expect(rows.find((r) => r.root === "campaign_a")!.total).toBe(1);
    expect(rows.find((r) => r.root === DIRECT_CAMPAIGN)!.total).toBe(1);
  });
});

describe("시나리오 F — 순환·깨진 데이터에서 멈춘다", () => {
  it("A↔B 순환에서 무한 루프가 없고 (뿌리 불명)이 된다", () => {
    const users = [u("A", { invitedBy: "B" }), u("B", { invitedBy: "A" })];
    const byId = map(users);
    const a = resolveRoot("A", byId);
    expect(a.root).toBe(UNKNOWN_ROOT);
    expect(a.anomaly).toBe("cycle");
  });

  it("자기 자신을 초대자로 가리켜도 멈춘다", () => {
    const users = [u("me", { invitedBy: "me" })];
    const r = resolveRoot("me", map(users));
    expect(r.root).toBe(UNKNOWN_ROOT);
    expect(r.anomaly).toBe("self");
  });

  it("초대자가 없는(삭제된) 사람은 missing_inviter다", () => {
    const users = [u("orphan", { invitedBy: "지워진사람" })];
    const r = resolveRoot("orphan", map(users));
    expect(r.root).toBe(UNKNOWN_ROOT);
    expect(r.anomaly).toBe("missing_inviter");
  });

  it("사슬이 너무 길면 깊이 제한에서 끊는다", () => {
    const n = MAX_REFERRAL_DEPTH + 5;
    const chain = Array.from({ length: n }, (_, i) =>
      u(`u${i}`, i === 0 ? {} : { invitedBy: `u${i - 1}` }),
    );
    const r = resolveRoot(`u${n - 1}`, map(chain));
    expect(r.anomaly).toBe("too_deep");
    expect(r.root).toBe(UNKNOWN_ROOT);
  });

  it("⚠️ 깨진 데이터를 임의의 캠페인에 넣지 않고 이상 건수로 보고한다", () => {
    const users = [
      u("a1", { profileCampaign: "campaign_a" }),
      u("X", { invitedBy: "Y" }),
      u("Y", { invitedBy: "X" }),
    ];
    const { rows, anomalies, anomalyTotal } = campaignSpread(users);
    expect(rows.find((r) => r.root === "campaign_a")!.total).toBe(1);
    expect(anomalyTotal).toBe(2);
    expect(anomalies.find((a) => a.kind === "cycle")!.count).toBe(2);
    // 깨진 둘은 (뿌리 불명)에만 있다
    expect(rows.find((r) => r.root === UNKNOWN_ROOT)!.total).toBe(2);
  });

  it("사용자가 목록에 아예 없어도 던지지 않는다", () => {
    expect(() => resolveRoot("없는사람", new Map())).not.toThrow();
    expect(resolveRoot("없는사람", new Map()).anomaly).toBe("missing_inviter");
  });
});

describe("시나리오 G — 기존 first-touch 보존", () => {
  it("초대로 들어왔어도 자기 utm이 있으면 그게 자기 뿌리다 (0세대)", () => {
    /*
      "영희 자체의 acquisition_campaign을 억지로 influencer_a로 덮어쓰지 마라."
      계산은 읽기만 하므로 원본이 그대로 남는다.
    */
    const users = [
      u("user1", { profileCampaign: "campaign_a" }),
      u("user2", {
        invitedBy: "user1",
        inviteOrigin: "invite_link",
        profileCampaign: "campaign_b", // 자기 링크로도 들어왔다
      }),
    ];
    const r = resolveRoot("user2", map(users));
    expect(r.root).toBe("campaign_b");
    expect(r.generation).toBe(0);
    // 원본이 바뀌지 않았다
    expect(users[1].profileCampaign).toBe("campaign_b");
    expect(users[1].invitedBy).toBe("user1");
  });

  it("campaignSpread는 입력을 변형하지 않는다", () => {
    const users = [
      u("user1", { profileCampaign: "campaign_a" }),
      u("user2", { invitedBy: "user1", inviteOrigin: "invite_link" }),
    ];
    const snapshot = JSON.stringify(users);
    campaignSpread(users);
    expect(JSON.stringify(users)).toBe(snapshot);
  });
});

describe("시나리오 H — 확산표의 단조성", () => {
  it("뒤 단계 인원이 앞 단계보다 커지지 않는다", () => {
    const users = [
      u("d1", { profileCampaign: "campaign_a", isAnonymous: false, startedWorkout: true, completedWorkouts: 5, reworkoutD7: true, joinedChallenge: true }),
      u("d2", { invitedBy: "d1", isAnonymous: false, startedWorkout: true, completedWorkouts: 1 }),
      u("d3", { invitedBy: "d2", isAnonymous: false, startedWorkout: true }),
      u("d4", { invitedBy: "d3", isAnonymous: true }),
    ];
    const a = campaignSpread(users).rows.find((r) => r.root === "campaign_a")!;
    expect(a.total).toBeGreaterThanOrEqual(a.permanent);
    expect(a.permanent).toBeGreaterThanOrEqual(a.startedWorkout);
    expect(a.startedWorkout).toBeGreaterThanOrEqual(a.completedWorkout);
    expect(a.completedWorkout).toBeGreaterThanOrEqual(a.threeWorkouts);
    expect(a.threeWorkouts).toBeGreaterThanOrEqual(a.reworkoutD7);
    expect(a.direct + a.viral).toBe(a.total);
  });
});

describe("확산 배수", () => {
  it("직접 20 · 총 50이면 배수 2.5다", () => {
    const users = [
      ...Array.from({ length: 20 }, (_, i) =>
        u(`d${i}`, { profileCampaign: "big" }),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        u(`v${i}`, { invitedBy: `d${i % 20}`, inviteOrigin: "invite_link" }),
      ),
    ];
    const row = campaignSpread(users).rows.find((r) => r.root === "big")!;
    expect(row.direct).toBe(20);
    expect(row.viral).toBe(30);
    expect(row.total).toBe(50);
    expect(row.multiplier).toBe(2.5);
  });

  it("⚠️ 직접 유입이 0이면 배수를 계산하지 않는다 (0으로 나누지 않는다)", () => {
    // 초대자가 집계에서 빠진 경우 등 — 뿌리는 불명이고 직접이 0이다
    const users = [u("orphan", { invitedBy: "없는사람" })];
    const row = campaignSpread(users).rows.find((r) => r.root === UNKNOWN_ROOT)!;
    expect(row.direct).toBe(0);
    expect(row.multiplier).toBeNull();
  });

  it("사용자가 없으면 빈 결과이고 던지지 않는다", () => {
    const r = campaignSpread([]);
    expect(r.rows).toEqual([]);
    expect(r.anomalyTotal).toBe(0);
  });
});

describe("generationBucket", () => {
  it("3세대 이상은 한 칸에 모은다", () => {
    expect(generationBucket(0)).toBe("0세대");
    expect(generationBucket(2)).toBe("2세대");
    expect(generationBucket(3)).toBe("3세대+");
    expect(generationBucket(9)).toBe("3세대+");
  });
});

describe("referralKind — 초대 종류 구별", () => {
  it("네 가지를 가른다", () => {
    expect(referralKind(u("a", { profileCampaign: "x" }))).toBe("외부 유입");
    expect(
      referralKind(u("b", { invitedBy: "a", inviteOrigin: "invite_link" })),
    ).toBe("친구 초대");
    expect(
      referralKind(u("c", { invitedBy: "a", inviteOrigin: "challenge" })),
    ).toBe("챌린지 초대");
    expect(referralKind(u("d"))).toBe("출처 모름");
  });

  it("초대자는 있는데 경로 기록이 없으면 친구로 넘겨짚지 않는다", () => {
    // 0079 이전에 맺어진 관계는 origin이 'unknown'이거나 없다
    expect(referralKind(u("e", { invitedBy: "a", inviteOrigin: null }))).toBe(
      "출처 모름",
    );
    expect(
      referralKind(u("f", { invitedBy: "a", inviteOrigin: "unknown" })),
    ).toBe("출처 모름");
  });
});

describe("⚠️ attribution 충돌 — 초대자와 자기 유입이 다른 캠페인일 때", () => {
  /*
    사용자 지시 (2026-08-31). 외부 파일럿 전 필수 검증.

      user1: acquisition_campaign = influencer_a
      user2: acquisition_campaign = influencer_b
      이후 user1이 user2를 초대해서 user2.invited_by = user1

    이때 user2의 **직접 초대자는 user1**이지만 **뿌리는 influencer_b**여야 한다.
    invited_by 사슬을 무조건 최상단까지 올라가 자기 first-touch를 덮으면 안 된다.

    규칙:
      1) 자기에게 유효한 first-touch campaign이 있으면 **그것이 뿌리다**
      2) 없을 때만 invited_by를 따라 상위의 뿌리를 물려받는다
  */
  const conflict = [
    u("user1", { profileCampaign: "influencer_a" }),
    u("user2", {
      profileCampaign: "influencer_b",
      invitedBy: "user1",
      inviteOrigin: "invite_link",
    }),
  ];

  it("user2의 직접 초대자는 user1이다", () => {
    expect(conflict[1].invitedBy).toBe("user1");
  });

  it("⚠️ user2의 뿌리는 influencer_b다 — 초대자 것으로 덮이지 않는다", () => {
    const r = resolveRoot("user2", map(conflict));
    expect(r.root).toBe("influencer_b");
    expect(r.root).not.toBe("influencer_a");
  });

  it("user2는 0세대다 — 자기 링크로 직접 들어왔으므로", () => {
    expect(resolveRoot("user2", map(conflict)).generation).toBe(0);
  });

  it("확산표에서 두 캠페인이 각각 1명씩이고 섞이지 않는다", () => {
    const { rows } = campaignSpread(conflict);
    const a = rows.find((r) => r.root === "influencer_a")!;
    const b = rows.find((r) => r.root === "influencer_b")!;
    expect(a.total).toBe(1);
    expect(b.total).toBe(1);
    expect(a.direct).toBe(1);
    expect(b.direct).toBe(1);
    // influencer_a가 user2를 자기 성과로 가져가지 않는다
    expect(a.viral).toBe(0);
  });

  it("원본 값이 그대로 남는다 — 계산은 읽기만 한다", () => {
    campaignSpread(conflict);
    expect(conflict[1].profileCampaign).toBe("influencer_b");
    expect(conflict[1].invitedBy).toBe("user1");
  });

  it("3단 사슬에서도 중간에 자기 캠페인이 있으면 거기서 끊긴다", () => {
    // A → user1 → user2(자기 캠페인 B 있음) → user3
    // user3는 user2를 물려받아야 하므로 뿌리가 B다. A가 아니다.
    const chain = [
      u("user1", { profileCampaign: "influencer_a" }),
      u("user2", { profileCampaign: "influencer_b", invitedBy: "user1" }),
      u("user3", { invitedBy: "user2", inviteOrigin: "challenge" }),
    ];
    const byId = map(chain);
    expect(resolveRoot("user3", byId).root).toBe("influencer_b");
    expect(resolveRoot("user3", byId).generation).toBe(1);
    // influencer_a 계보에는 user1 한 명뿐이다
    const { rows } = campaignSpread(chain);
    expect(rows.find((r) => r.root === "influencer_a")!.total).toBe(1);
    expect(rows.find((r) => r.root === "influencer_b")!.total).toBe(2);
  });
});

describe("⚠️ referral kind는 '정확한 두 사람의 연결'을 쓴다", () => {
  /*
    사용자 지시 (2026-08-31). 임의의 crew_links 행이 아니라 **현재 사용자와
    profiles.invited_by가 가리키는 그 쌍**의 origin이어야 한다.

    실제 배선은 `queries.ts`가 한다:
      inviteOrigin = originByPair.get(pairKey(내id, 내invited_by))
    `crew_links`의 기본키가 (user_a, user_b)이고 삽입이 항상 least/greatest를
    쓰므로 쌍당 행이 하나다(운영 실측: 중복 쌍 0건). 그래서 모호함이 없다.

    여기서는 그 결과값이 종류 판정에 어떻게 쓰이는지를 고정한다.
  */
  it("초대자가 없으면 origin이 있어도 초대로 치지 않는다", () => {
    // 크루는 맺어져 있지만(검색으로 만난 사이) 나를 데려온 사람은 아니다
    expect(referralKind(u("x", { invitedBy: null, inviteOrigin: "invite_link" }))).toBe(
      "출처 모름",
    );
  });

  it("같은 초대자라도 연결 종류에 따라 친구/챌린지가 갈린다", () => {
    expect(referralKind(u("f", { invitedBy: "inv", inviteOrigin: "invite_link" }))).toBe("친구 초대");
    expect(referralKind(u("c", { invitedBy: "inv", inviteOrigin: "challenge" }))).toBe("챌린지 초대");
  });

  it("검색으로 맺은 연결은 초대가 아니다 — 친구 초대로 넘겨짚지 않는다", () => {
    expect(referralKind(u("s", { invitedBy: "inv", inviteOrigin: "search" }))).toBe(
      "출처 모름",
    );
  });

  it("자기 캠페인이 있으면 초대 관계가 있어도 '외부 유입'이다", () => {
    expect(
      referralKind(u("e", { profileCampaign: "x", invitedBy: "inv", inviteOrigin: "invite_link" })),
    ).toBe("외부 유입");
  });
});
