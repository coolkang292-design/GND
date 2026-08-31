import { describe, expect, it } from "vitest";
import {
  DIRECT_CAMPAIGN,
  FUNNEL_STEPS,
  biggestFrictions,
  buildFunnel,
  campaignCohorts,
  eventsByUserMap,
  furthestStep,
  socialFunnel,
  type FunnelEventRow,
  type FunnelUserRow,
} from "./analytics-funnel";

/** 아무것도 안 한 사람 — 필요한 칸만 덮어써서 쓴다 */
function user(id: string, over: Partial<FunnelUserRow> = {}): FunnelUserRow {
  return {
    userId: id,
    isAnonymous: true,
    hasProfile: false,
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

function landing(
  id: string,
  campaign: string | null,
  source: string | null = "instagram",
  medium: string | null = "creator",
): FunnelEventRow {
  return { userId: id, eventName: "landing_opened", source, medium, campaign };
}

function ev(id: string, name: string): FunnelEventRow {
  return { userId: id, eventName: name, source: null, medium: null, campaign: null };
}

describe("furthestStep", () => {
  it("유입만 한 사람은 0단계다", () => {
    expect(furthestStep(user("u"), new Set())).toBe(0);
  });

  it("온보딩 화면을 봤으면 1단계", () => {
    expect(furthestStep(user("u"), new Set(["onboarding_started"]))).toBe(1);
  });

  it("카카오·구글을 눌렀으면 2단계 — 성공 못 해도 여기까지는 왔다", () => {
    expect(
      furthestStep(user("u"), new Set(["onboarding_started", "identity_link_started"])),
    ).toBe(2);
  });

  it("정식 계정이 되면 3단계 — 프로필보다 먼저다 (실제 제품 순서)", () => {
    expect(furthestStep(user("u", { isAnonymous: false }), new Set())).toBe(3);
  });

  it("프로필까지 만들면 4단계", () => {
    expect(
      furthestStep(user("u", { isAnonymous: false, hasProfile: true }), new Set()),
    ).toBe(4);
  });

  it("3회 운동은 7, 가입 7일 후 재운동은 8단계", () => {
    expect(furthestStep(user("u", { completedWorkouts: 3 }), new Set())).toBe(7);
    expect(furthestStep(user("u", { reworkoutD7: true }), new Set())).toBe(8);
  });

  it("뒤 단계에 도달했으면 앞 이벤트가 없어도 거쳐온 것으로 본다", () => {
    // 계측 시작 전에 가입한 사람은 onboarding_started 이벤트가 없다.
    // 그렇다고 "첫 운동은 했는데 온보딩은 안 했다"로 세면 표가 뒤집힌다.
    const u = user("old", { isAnonymous: false, hasProfile: true, startedWorkout: true });
    expect(furthestStep(u, new Set())).toBe(5);
  });
});

describe("buildFunnel", () => {
  it("⚠️ 뒤 단계가 앞 단계보다 커지지 않는다 (단조성)", () => {
    const users = [
      user("a"),
      user("b", { isAnonymous: false }),
      user("c", { isAnonymous: false, hasProfile: true, completedWorkouts: 5 }),
      user("d", { reworkoutD7: true }),
    ];
    const steps = buildFunnel(users, new Map());
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].count).toBeLessThanOrEqual(steps[i - 1].count);
    }
  });

  it("단계 수와 이름이 FUNNEL_STEPS와 같다", () => {
    const steps = buildFunnel([user("a")], new Map());
    expect(steps.map((s) => s.step)).toEqual([...FUNNEL_STEPS]);
  });

  it("첫 단계는 이탈률이 없다 — 직전이 없으므로", () => {
    const steps = buildFunnel([user("a")], new Map());
    expect(steps[0].dropped).toBeNull();
    expect(steps[0].dropRate).toBeNull();
  });

  it("각 단계의 이탈 수는 직전 단계와의 차이다", () => {
    const users = [user("a"), user("b"), user("c", { isAnonymous: false })];
    const events = eventsByUserMap([ev("a", "onboarding_started")]);
    const steps = buildFunnel(users, events);
    expect(steps[0].count).toBe(3); // 셋 다 유입
    expect(steps[1].count).toBe(2); // a(온보딩) + c(정식이라 거쳐옴)
    expect(steps[1].dropped).toBe(1);
    expect(steps[2].count).toBe(1); // c만
    expect(steps[2].dropped).toBe(1);
  });

  it("사용자가 없으면 전부 0이고 던지지 않는다", () => {
    const steps = buildFunnel([], new Map());
    expect(steps.every((s) => s.count === 0)).toBe(true);
    expect(steps[1].dropRate).toEqual({ numerator: 0, denominator: 0 });
  });
});

describe("biggestFrictions", () => {
  it("⚠️ 표본이 5 미만이면 아무것도 내지 않는다 — 가짜 확신 금지", () => {
    // 실사용자 4명 규모. 여기서 "50% 이탈"이라고 말하면 안 된다.
    const users = [user("a"), user("b"), user("c"), user("d", { isAnonymous: false })];
    const steps = buildFunnel(users, new Map());
    expect(biggestFrictions(steps)).toEqual([]);
  });

  it("표본이 충분하면 가장 크게 빠진 구간을 낸다", () => {
    // 유입 10 → 온보딩 2 (8명 이탈) → 그 뒤로는 유지
    const users = [
      ...Array.from({ length: 8 }, (_, i) => user(`drop${i}`)),
      user("x", { isAnonymous: false }),
      user("y", { isAnonymous: false }),
    ];
    const steps = buildFunnel(users, new Map());
    const f = biggestFrictions(steps);
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].from).toBe("유입");
    expect(f[0].to).toBe("온보딩 시작");
    expect(f[0].dropped).toBe(8);
  });

  it("이탈이 없는 구간은 후보가 아니다", () => {
    const users = Array.from({ length: 6 }, (_, i) => user(`u${i}`));
    const steps = buildFunnel(users, new Map());
    // 유입 6 → 온보딩 0 이므로 그 구간만 나오고, 그 뒤 0→0 구간은 안 나온다
    const f = biggestFrictions(steps);
    expect(f).toHaveLength(1);
    expect(f[0].to).toBe("온보딩 시작");
  });
});

describe("campaignCohorts — 캠페인 분리", () => {
  it("⚠️ source가 같아도 인플루언서 A와 B가 섞이지 않는다", () => {
    const users = [
      user("a1", { isAnonymous: false }),
      user("a2"),
      user("b1", { isAnonymous: false, hasProfile: true }),
    ];
    const events = [
      landing("a1", "influencer_a_pilot01"),
      landing("a2", "influencer_a_pilot01"),
      landing("b1", "influencer_b_pilot01"),
    ];
    const { rows } = campaignCohorts(users, events);
    expect(rows).toHaveLength(2);

    const a = rows.find((r) => r.campaign === "influencer_a_pilot01")!;
    const b = rows.find((r) => r.campaign === "influencer_b_pilot01")!;
    expect(a.entered).toBe(2);
    expect(b.entered).toBe(1);
    // 둘 다 source=instagram인데 갈렸다 — 이게 이 기능의 존재 이유다
    expect(a.source).toBe("instagram");
    expect(b.source).toBe("instagram");
  });

  it("⚠️ 같은 인플루언서의 pilot01과 pilot02가 섞이지 않는다", () => {
    const users = [
      user("p1", { isAnonymous: false }),
      user("p2a", { isAnonymous: false, hasProfile: true }),
      user("p2b", { isAnonymous: false, hasProfile: true }),
    ];
    const events = [
      landing("p1", "influencer_a_pilot01"),
      landing("p2a", "influencer_a_pilot02"),
      landing("p2b", "influencer_a_pilot02"),
    ];
    const { rows } = campaignCohorts(users, events);
    const p1 = rows.find((r) => r.campaign === "influencer_a_pilot01")!;
    const p2 = rows.find((r) => r.campaign === "influencer_a_pilot02")!;
    expect(p1.entered).toBe(1);
    expect(p2.entered).toBe(2);
    // pilot02가 프로필까지 2명 — 개선됐는지 비교할 수 있어야 한다
    const profileIdx = FUNNEL_STEPS.indexOf("프로필 완료");
    expect(p1.steps[profileIdx].count).toBe(0);
    expect(p2.steps[profileIdx].count).toBe(2);
  });

  it("⚠️ campaign이 없는 직접 유입을 통계에서 빼지 않는다", () => {
    const users = [user("d1"), user("c1")];
    const events = [landing("d1", null, null, null), landing("c1", "pilot01")];
    const { rows } = campaignCohorts(users, events);
    expect(rows.map((r) => r.campaign).sort()).toEqual(
      [DIRECT_CAMPAIGN, "pilot01"].sort(),
    );
  });

  it("landing_opened가 없는 사용자는 집단에 안 들어간다 (계측 전 가입자)", () => {
    const users = [user("old", { hasProfile: true }), user("new")];
    const { rows, measured } = campaignCohorts(users, [landing("new", "pilot01")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].entered).toBe(1);
    // 화면이 "왜 표가 비었나"를 말할 수 있게 계측 비율을 낸다
    expect(measured).toEqual({ numerator: 1, denominator: 2 });
  });

  it("유입이 많은 순으로 정렬된다", () => {
    const users = [user("a"), user("b"), user("c")];
    const { rows } = campaignCohorts(users, [
      landing("a", "small"),
      landing("b", "big"),
      landing("c", "big"),
    ]);
    expect(rows[0].campaign).toBe("big");
    expect(rows[1].campaign).toBe("small");
  });
});

describe("campaignCohorts — campaign 귀속 불일치", () => {
  it("불일치를 세어서 낸다", () => {
    const users = [
      user("m1", { hasProfile: true, profileCampaign: "pilot02" }),
      user("m2", { hasProfile: true, profileCampaign: "pilot02" }),
      user("ok", { hasProfile: true, profileCampaign: "pilot01" }),
    ];
    const events = [
      landing("m1", "pilot01"),
      landing("m2", "pilot01"),
      landing("ok", "pilot01"),
    ];
    const { mismatches } = campaignCohorts(users, events);
    expect(mismatches.count).toBe(2);
    expect(mismatches.samples).toEqual([
      { eventCampaign: "pilot01", profileCampaign: "pilot02", count: 2 },
    ]);
  });

  it("⚠️ 불일치가 있어도 던지지 않고 rows를 정상 반환한다 (운영 보호)", () => {
    const users = [user("m", { hasProfile: true, profileCampaign: "다른값" })];
    const events = [landing("m", "pilot01")];
    expect(() => campaignCohorts(users, events)).not.toThrow();
    const { rows, mismatches } = campaignCohorts(users, events);
    expect(rows).toHaveLength(1);
    expect(rows[0].entered).toBe(1);
    expect(mismatches.count).toBe(1);
  });

  it("한쪽이 비어 있는 것은 불일치가 아니다", () => {
    // 프로필을 아직 안 만들었거나(정상) 계측 전 유입이라 비어 있는 경우가 많다
    const users = [
      user("noProfile", { profileCampaign: null }),
      user("noEvent", { hasProfile: true, profileCampaign: "pilot01" }),
    ];
    const events = [landing("noProfile", "pilot01"), landing("noEvent", null)];
    expect(campaignCohorts(users, events).mismatches.count).toBe(0);
  });

  it("⚠️ 구분자 없이 키를 만들지 않는다 — (ab,c)와 (a,bc)가 섞이면 안 된다", () => {
    const users = [
      user("x", { hasProfile: true, profileCampaign: "c" }),
      user("y", { hasProfile: true, profileCampaign: "bc" }),
    ];
    const events = [landing("x", "ab"), landing("y", "a")];
    const { mismatches } = campaignCohorts(users, events);
    expect(mismatches.count).toBe(2);
    // 두 쌍이 각각 1건씩이어야 한다. 한 줄로 뭉치면 키가 충돌한 것이다.
    expect(mismatches.samples).toHaveLength(2);
    expect(mismatches.samples.every((m) => m.count === 1)).toBe(true);
  });

  it("⚠️ samples에 사용자 id·이메일이 들어가지 않는다 (개인정보)", () => {
    const users = [
      user("11111111-2222-3333-4444-555555555555", {
        hasProfile: true,
        profileCampaign: "pilot02",
      }),
    ];
    const events = [landing("11111111-2222-3333-4444-555555555555", "pilot01")];
    const { mismatches } = campaignCohorts(users, events);
    const dumped = JSON.stringify(mismatches);
    expect(dumped).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(dumped).not.toContain("@");
  });
});

describe("socialFunnel", () => {
  it("챌린지는 본 사람 중 참가한 사람으로 센다", () => {
    const users = [
      user("v1", { joinedChallenge: true }),
      user("v2"),
      user("never"), // 챌린지 화면을 안 봤다
    ];
    const events = eventsByUserMap([
      ev("v1", "challenge_viewed"),
      ev("v2", "challenge_viewed"),
    ]);
    const s = socialFunnel(users, events);
    expect(s.viewed).toBe(2);
    expect(s.joined).toBe(1);
    expect(s.conversion).toEqual({ numerator: 1, denominator: 2 });
  });

  it("아무도 안 봤으면 0으로 나누지 않는다", () => {
    const s = socialFunnel([user("a")], new Map());
    expect(s.viewed).toBe(0);
    expect(s.conversion).toEqual({ numerator: 0, denominator: 0 });
  });
});

describe("CampaignRow.challengeJoined", () => {
  it("캠페인별 챌린지 참가자를 따로 센다 — 퍼널 단계가 아니다", () => {
    const users = [
      user("a", { joinedChallenge: true }),
      user("b"),
      user("c", { joinedChallenge: true }),
    ];
    const events = [landing("a", "p1"), landing("b", "p1"), landing("c", "p2")];
    const { rows } = campaignCohorts(users, events);
    expect(rows.find((r) => r.campaign === "p1")!.challengeJoined).toBe(1);
    expect(rows.find((r) => r.campaign === "p2")!.challengeJoined).toBe(1);
    // 챌린지를 안 한 b가 퍼널에서 이탈로 잡히지 않는다
    expect(rows.find((r) => r.campaign === "p1")!.entered).toBe(2);
  });
});
