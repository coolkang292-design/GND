import { describe, expect, it } from "vitest";
import {
  buildBriefings,
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
    ...over,
  };
}

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

describe("buildBriefings — 본문·dedupe_key", () => {
  const byUser = new Map<string, Date[]>([
    ["f1", [kst("2026-07-17T07:00:00")]],
    ["f2", [kst("2026-07-17T08:00:00")]],
  ]);

  it("본문은 언제나 null — 크루 집계 문구를 없앴다 (2026-07-28)", () => {
    // 어제 운동한 사람이 있든 없든, 크루가 있든 없든 결과가 같아야 한다.
    expect(buildBriefings([user({})], byUser, NOW).briefings[0].body).toBeNull();
    expect(
      buildBriefings([user({})], new Map(), NOW).briefings[0].body,
    ).toBeNull();
  });
  it("dedupe_key = morning_briefing:{userId}:{tz 로컬 날짜}", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].dedupeKey).toBe("morning_briefing:me:2026-07-18");
  });
});
