import { describe, expect, it } from "vitest";
import {
  buildBriefings,
  crewFriendsWorkedYesterday,
  DEFAULT_BRIEF_HOUR,
  type BriefingUser,
} from "./briefing";

// 기준 시각: 2026-07-18(토) KST 09:10 = UTC 00:10. 어제 = KST 7/17.
const NOW = new Date("2026-07-18T00:10:00Z");
const TZ = "Asia/Seoul";
const kst = (s: string) => new Date(`${s}+09:00`); // "2026-07-17T20:00:00" 등

function user(over: Partial<BriefingUser>): BriefingUser {
  return {
    userId: "me",
    timezone: TZ,
    completedAts: [kst("2026-07-14T19:00:00")], // 4일 전 → d1
    morningBrief: true,
    crewMemberIds: [],
    ...over,
  };
}

describe("crewFriendsWorkedYesterday", () => {
  const byUser = new Map<string, Date[]>([
    ["me", [kst("2026-07-17T20:00:00")]],
    ["f1", [kst("2026-07-17T07:00:00")]],
    ["f2", [kst("2026-07-16T07:00:00")]], // 그저께 — 카운트 제외
    ["f3", [kst("2026-07-17T23:59:00")]], // 어제 자정 직전 — 포함
  ]);

  it("어제 운동한 친구만 센다 (그저께 제외)", () => {
    expect(
      crewFriendsWorkedYesterday("me", ["f1", "f2"], byUser, NOW, TZ),
    ).toBe(1);
  });
  it("다중 크루 중복 인원은 1명", () => {
    expect(
      crewFriendsWorkedYesterday("me", ["f1", "f1", "f3"], byUser, NOW, TZ),
    ).toBe(2);
  });
  it("본인은 제외 — 어제 나만 운동이면 0", () => {
    expect(crewFriendsWorkedYesterday("me", ["me"], byUser, NOW, TZ)).toBe(0);
  });
  it("tz 자정 경계: KST 7/18 00:00(UTC 7/17 15:00)은 어제가 아니다", () => {
    const m = new Map([["f1", [new Date("2026-07-17T15:00:00Z")]]]);
    expect(crewFriendsWorkedYesterday("me", ["f1"], m, NOW, TZ)).toBe(0);
  });
});

describe("buildBriefings — skip 판정", () => {
  it("완료 세션 없으면 no_history", () => {
    const { briefings, skipped } = buildBriefings(
      [user({ completedAts: [] })], new Map(), NOW,
    );
    expect(briefings).toHaveLength(0);
    expect(skipped).toEqual([{ userId: "me", reason: "no_history" }]);
  });
  it("morning_brief=false면 opted_out", () => {
    const { skipped } = buildBriefings(
      [user({ morningBrief: false })], new Map(), NOW,
    );
    expect(skipped[0].reason).toBe("opted_out");
  });
  it("invocationHour 7이면 전원 hour_mismatch (시간 선택 확장 대비)", () => {
    const { briefings, skipped } = buildBriefings([user({})], new Map(), NOW, 7);
    expect(briefings).toHaveLength(0);
    expect(skipped[0].reason).toBe("hour_mismatch");
  });
  it("기본값: NOW(KST 9시)면 DEFAULT_BRIEF_HOUR와 일치해 발송", () => {
    expect(DEFAULT_BRIEF_HOUR).toBe(9);
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings).toHaveLength(1);
  });
});

describe("buildBriefings — 제목(스트릭 단계)", () => {
  it("d1 단계: 🔥 접두 + 스트릭 수 포함 (브리핑용 조립)", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].title.startsWith("🔥 ")).toBe(true);
    expect(briefings[0].title).toContain("1일"); // 4일 전 1회 운동 → 스트릭 1
  });
  it("expired: 소멸 유저도 재점화 카피로 발송", () => {
    const { briefings } = buildBriefings(
      [user({ completedAts: [kst("2026-07-10T19:00:00")] })], new Map(), NOW,
    );
    expect(briefings).toHaveLength(1);
    expect(briefings[0].title).toContain("불꽃");
  });
  it("today_done: 오늘 이미 완료면 칭찬 카피", () => {
    const { briefings } = buildBriefings(
      [user({ completedAts: [kst("2026-07-18T07:00:00")] })], new Map(), NOW,
    );
    expect(briefings[0].title).toContain("오늘 완료");
  });
  it("로테이션 결정성: 같은 입력이면 같은 제목", () => {
    const a = buildBriefings([user({})], new Map(), NOW).briefings[0].title;
    const b = buildBriefings([user({})], new Map(), NOW).briefings[0].title;
    expect(a).toBe(b);
  });
});

describe("buildBriefings — 본문(크루 한 줄)·dedupe_key", () => {
  const byUser = new Map<string, Date[]>([
    ["f1", [kst("2026-07-17T07:00:00")]],
    ["f2", [kst("2026-07-17T08:00:00")]],
  ]);

  it("친구 2명 어제 운동 → n명 문구", () => {
    const { briefings } = buildBriefings(
      [user({ crewMemberIds: ["me", "f1", "f2"] })], byUser, NOW,
    );
    expect(briefings[0].body).toBe("어제 크루 친구 2명이 운동했어요 💪");
  });
  it("친구는 있는데 어제 0명 → 독려 문구", () => {
    const { briefings } = buildBriefings(
      [user({ crewMemberIds: ["me", "f9"] })], byUser, NOW,
    );
    expect(briefings[0].body).toBe(
      "어제는 다들 쉬었네요. 오늘 첫 타자 어때요? 🏃",
    );
  });
  it("크루 없음(혼자 크루 포함) → 본문 null", () => {
    const { briefings } = buildBriefings(
      [user({ crewMemberIds: ["me"] })], byUser, NOW,
    );
    expect(briefings[0].body).toBeNull();
  });
  it("dedupe_key = morning_briefing:{userId}:{tz 로컬 날짜}", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].dedupeKey).toBe("morning_briefing:me:2026-07-18");
  });
});
