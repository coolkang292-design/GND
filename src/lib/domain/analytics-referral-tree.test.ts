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
