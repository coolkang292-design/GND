import { describe, expect, it } from "vitest";
import {
  buildBriefings,
  DEFAULT_BRIEF_HOUR,
  type BriefingUser,
} from "./briefing";
import { MIN_SESSIONS_FOR_ESTIMATE } from "./notify-time";

// 기준 시각: 2026-07-18(토) KST 09:10 = UTC 00:10. 어제 = KST 7/17.
const NOW = new Date("2026-07-18T00:10:00Z");
const TZ = "Asia/Seoul";
const kst = (s: string) => new Date(`${s}+09:00`); // "2026-07-17T20:00:00" 등

function user(over: Partial<BriefingUser>): BriefingUser {
  return {
    userId: "me",
    timezone: TZ,
    completedAts: [kst("2026-07-14T19:00:00")], // 4일 전 → d1
    // 기본값은 **추정 불가**(표본 미달)다. 그래야 이 파일의 옛 단언들이
    // 09:00 폴백 위에서 그대로 성립한다 — 시각 판정이 아니라 문구·dedupe를 보는 테스트다.
    startedAts: [],
    morningBrief: true,
    // ── 2026-08-16 제안 파이프라인 ──
    // ⚠️ 가입일 기본값은 **창 밖**이다. 창 안으로 두면 위쪽
    //    "완료 세션 없으면 no_history" 단언이 제안 때문에 통과하게 되어 깨진다.
    signedUpAt: kst("2026-06-01T00:00:00"),
    hasPlanToday: false,
    isInActiveChallenge: false,
    lastSessionWasInterval: false,
    ...over,
  };
}

/** 평소 시작 시각이 `hh:mm`인 사람 — 추정이 서도록 최소 표본을 채운다 */
function withHabit(hh: number, mm = 0, over: Partial<BriefingUser> = {}) {
  const starts = Array.from({ length: MIN_SESSIONS_FOR_ESTIMATE }, (_, i) => {
    const day = String(17 - i).padStart(2, "0");
    const h = String(hh).padStart(2, "0");
    const m = String(mm).padStart(2, "0");
    return kst(`2026-07-${day}T${h}:${m}:00`);
  });
  return user({ startedAts: starts, ...over });
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
  it("invocationHour 7이면 전원 slot_mismatch (수동 검증용 오버라이드)", () => {
    const { briefings, skipped } = buildBriefings([user({})], new Map(), NOW, 7);
    expect(briefings).toHaveLength(0);
    expect(skipped[0].reason).toBe("slot_mismatch");
  });
  it("기록이 적어 추정이 없으면 09:00 폴백으로 발송된다", () => {
    // NOW = KST 09:10 → 09:00 슬롯
    expect(DEFAULT_BRIEF_HOUR).toBe(9);
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings).toHaveLength(1);
  });
});

/**
 * 2026-08-13 — 전원 09:00에서 **각자 평소 시작 30분 전**으로 바뀌었다.
 * 설계: `docs/superpowers/specs/2026-08-13-personalized-briefing-time-design.md`
 *
 * ⚠️ 이 describe가 개인화의 회귀선이다. 크론이 30분마다 돌지 않으면 여기가 통과해도
 * 실제로는 한 슬롯만 발송된다 — 그건 배포 후 실물로 확인해야 한다(설계 §5).
 */
describe("buildBriefings — 평소 시작 30분 전", () => {
  it("평소 19시에 운동하면 18:30 슬롯에 보낸다", () => {
    const at1830 = new Date("2026-07-18T09:35:00Z"); // KST 18:35 → 18:30 슬롯
    const { briefings } = buildBriefings(
      [withHabit(19)],
      new Map(),
      at1830,
    );
    expect(briefings).toHaveLength(1);
  });

  /** ⚠️ 개인화의 핵심 — 습관이 있는 사람은 **09:00에 오지 않는다** */
  it("평소 19시에 운동하는 사람은 아침 9시에 받지 않는다", () => {
    const { briefings, skipped } = buildBriefings(
      [withHabit(19)],
      new Map(),
      NOW, // KST 09:10
    );
    expect(briefings).toHaveLength(0);
    expect(skipped[0].reason).toBe("slot_mismatch");
  });

  it("자정 직후에 운동하는 사람은 전날 23:30 슬롯에 받는다", () => {
    const at2335 = new Date("2026-07-18T14:35:00Z"); // KST 23:35 → 23:30 슬롯
    const { briefings } = buildBriefings(
      [withHabit(0, 5)],
      new Map(),
      at2335,
    );
    expect(briefings).toHaveLength(1);
  });

  /**
   * ⚠️ 크론이 30분마다 돌아도 하루 한 번만 가야 한다. 최종 보장은 DB의
   * unique(dedupe_key)지만, 키가 **날짜 단위**임을 여기서 고정한다 —
   * 시각이 키에 섞이면 30분마다 새 알림이 간다.
   */
  it("dedupe_key에 시각이 섞이지 않는다 — 하루 한 번", () => {
    const at1830 = new Date("2026-07-18T09:35:00Z");
    const { briefings } = buildBriefings([withHabit(19)], new Map(), at1830);
    expect(briefings[0].dedupeKey).toBe("morning_briefing:me:2026-07-18");
    expect(briefings[0].dedupeKey).not.toMatch(/18:30|1830/);
  });
});

describe("buildBriefings — 제목(스트릭 단계)", () => {
  it("d1 단계: 🔥 접두 + 스트릭 수 포함 (브리핑용 조립)", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].title.startsWith("🔥 ")).toBe(true);
    expect(briefings[0].title).toContain("1일"); // 4일 전 1회 운동 → 스트릭 1
  });
  it("expired: 소멸 유저도 재점화 카피로 발송", () => {
    // 2026-08-16: 계획 없는 날은 제안이 제목을 가져간다(아래 "계획 없는 날 제안"
    // describe). 이 단언은 원래 스트릭 문구 조립 자체를 보는 것이므로,
    // 제안이 끼어들지 않도록 오늘 계획이 있는 경우로 고정한다.
    const { briefings } = buildBriefings(
      [
        user({
          completedAts: [kst("2026-07-10T19:00:00")],
          hasPlanToday: true,
        }),
      ],
      new Map(),
      NOW,
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
    // 2026-08-16: 제안이 있으면 본문을 채운다(아래 "계획 없는 날 제안" describe).
    // 이 단언은 그 이전의 "크루 집계 문구 제거"를 보는 것이므로, 제안이 끼어들지
    // 않도록 오늘 계획이 있는 경우로 고정한다.
    // 어제 운동한 사람이 있든 없든, 크루가 있든 없든 결과가 같아야 한다.
    expect(
      buildBriefings([user({ hasPlanToday: true })], byUser, NOW).briefings[0]
        .body,
    ).toBeNull();
    expect(
      buildBriefings([user({ hasPlanToday: true })], new Map(), NOW)
        .briefings[0].body,
    ).toBeNull();
  });
  it("dedupe_key = morning_briefing:{userId}:{tz 로컬 날짜}", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].dedupeKey).toBe("morning_briefing:me:2026-07-18");
  });
});

/**
 * 2026-08-16 — 계획 없는 날 제안.
 * 설계: `docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md`
 */
describe("buildBriefings — 계획 없는 날 제안", () => {
  /**
   * ⚠️⚠️ **회귀선이다.** 이 게이트가 "신규에게 걷기"의 전부다.
   * 옛 코드는 `completedAts.length === 0`이면 무조건 스킵해서 신규 유저가
   * 알림을 **한 통도** 못 받았다.
   */
  it("가입 창 안의 신규 유저는 제안을 받는다", () => {
    const { briefings, skipped } = buildBriefings(
      [
        user({
          completedAts: [],
          signedUpAt: kst("2026-07-16T00:00:00"), // 2일 전 → 창 안
        }),
      ],
      new Map(),
      NOW,
    );
    expect(skipped).toHaveLength(0);
    expect(briefings).toHaveLength(1);
    expect(briefings[0].title).toContain("10분");
    expect(briefings[0].type).toBe("workout_suggestion");
    expect(briefings[0].body).not.toBeNull();
  });

  /**
   * 위와 한 쌍이다. 한쪽만 있으면 창을 통째로 열어도 통과한다.
   */
  it("가입 창이 지난 무기록 유저는 여전히 no_history다", () => {
    const { briefings, skipped } = buildBriefings(
      [user({ completedAts: [] })], // 기본 가입일 = 창 밖
      new Map(),
      NOW,
    );
    expect(briefings).toHaveLength(0);
    expect(skipped).toEqual([{ userId: "me", reason: "no_history" }]);
  });

  /**
   * ⚠️ opt-out은 제안보다 **앞**이다. 같은 채널이므로 똑같이 존중한다 —
   * 순서를 뒤집으면 "알림 껐는데 오네"가 된다.
   */
  it("morning_brief를 끈 사람은 제안이 있어도 안 받는다", () => {
    const { briefings, skipped } = buildBriefings(
      [
        user({
          completedAts: [],
          signedUpAt: kst("2026-07-16T00:00:00"),
          morningBrief: false,
        }),
      ],
      new Map(),
      NOW,
    );
    expect(briefings).toHaveLength(0);
    expect(skipped[0].reason).toBe("opted_out");
  });

  it("이력 있는 사람은 지난 운동 제안을 받는다", () => {
    const { briefings } = buildBriefings([user({})], new Map(), NOW);
    expect(briefings[0].type).toBe("workout_suggestion");
    expect(briefings[0].body).toContain("4분");
  });

  /**
   * ⚠️⚠️ **기존 동작 보존의 회귀선이다.** 계획이 있는 날은 지금 그대로
   * 스트릭 브리핑이 나가야 한다. 제안이 그 자리를 뺏으면 안 된다.
   */
  it("오늘 계획이 있으면 지금 그대로 morning_briefing이다", () => {
    const { briefings } = buildBriefings(
      [user({ hasPlanToday: true })],
      new Map(),
      NOW,
    );
    expect(briefings[0].type).toBe("morning_briefing");
    expect(briefings[0].body).toBeNull();
  });

  /**
   * ⚠️⚠️ **전환일 두 통째 방지.** 유니크 인덱스가 `dedupe_key` 하나에만
   * 걸려 있어서(`notifications_dedupe_key_uidx`), 키를 바꾸면 이미 브리핑을
   * 받은 사람에게 제안이 **한 통 더** 뚫린다.
   */
  it("dedupe_key는 type과 무관하게 그대로다", () => {
    const withPlan = buildBriefings(
      [user({ hasPlanToday: true })], new Map(), NOW,
    ).briefings[0];
    const withSuggestion = buildBriefings([user({})], new Map(), NOW)
      .briefings[0];
    expect(withPlan.dedupeKey).toBe(withSuggestion.dedupeKey);
    expect(withPlan.dedupeKey).toContain("morning_briefing:");
  });
});
