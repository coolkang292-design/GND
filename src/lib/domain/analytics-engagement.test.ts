import { describe, expect, it } from "vitest";
import {
  BRIEFING_TYPES,
  CHALLENGE_PEEK_UNLOCKED_TYPE,
  ENGAGEMENT_NOTIFICATION_TYPES,
  briefingSlotBreakdown,
  notificationConversion,
  REFERRAL_ATTRIBUTION_AVAILABLE,
  referralMetrics,
  viewingPassMetrics,
  workoutDayKeysByUser,
  type EngagementNotificationRow,
} from "./analytics-engagement";
import { buildPeriod, type SessionRow } from "./analytics";
import { DEFAULT_BRIEF_MINUTE, SLOT_MINUTES } from "./notify-time";
import { KING_DAYS } from "./viewing-pass";

const KST = "Asia/Seoul";
const now = new Date("2026-08-17T00:00:00Z");
const period = buildPeriod(28, now); // 2026-07-20 ~ 2026-08-17

function notif(
  over: Partial<EngagementNotificationRow> = {},
): EngagementNotificationRow {
  return {
    userId: "u1",
    type: "morning_briefing",
    // KST 2026-08-11 06:40 — UTC로 읽으면 08-10이 되어 날짜 판정이 갈린다
    createdAt: new Date("2026-08-10T21:40:00Z"),
    readAt: null,
    ...over,
  };
}

function completed(userId: string, iso: string): SessionRow {
  return {
    userId,
    status: "completed",
    startedAt: new Date(iso),
    completedAt: new Date(iso),
  };
}

/** 사용자 한 명의 운동일 집합 */
function days(userId: string, ...dayKeys: string[]) {
  return new Map([[userId, new Set(dayKeys)]]);
}

describe("workoutDayKeysByUser", () => {
  it("완료 세션만 KST 날짜로 모은다", () => {
    const map = workoutDayKeysByUser(
      [
        completed("u1", "2026-08-10T21:00:00Z"), // KST 08-11
        completed("u1", "2026-08-11T02:00:00Z"), // KST 08-11 (같은 날)
        {
          userId: "u1",
          status: "cancelled",
          startedAt: new Date("2026-08-12T02:00:00Z"),
          completedAt: null,
        },
      ],
      KST,
    );
    // UTC로 읽었다면 08-10과 08-11 두 날이 된다. KST에서는 같은 하루다.
    expect([...(map.get("u1") ?? [])]).toEqual(["2026-08-11"]);
  });

  it("완료 기록이 없는 사용자는 키 자체가 없다", () => {
    const map = workoutDayKeysByUser([], KST);
    expect(map.get("u1")).toBeUndefined();
  });
});

describe("notificationConversion", () => {
  it("대상 유형만 낸다 — 목록에 없는 알림은 결과에 없다", () => {
    const rows = notificationConversion(
      [notif({ type: "crew_request" }), notif({ type: "cheer" })],
      days("u1", "2026-08-11"),
      period,
      KST,
    );
    expect(rows.map((r) => r.type)).toEqual([
      "workout_suggestion",
      "morning_briefing",
    ]);
    // 대상 유형의 발송이 0이어도 줄은 남는다 — 0은 감출 사실이 아니다
    expect(rows.every((r) => r.sent === 0)).toBe(true);
    expect(rows.every((r) => r.opened.denominator === 0)).toBe(true);
  });

  it("기간 밖 알림은 세지 않는다", () => {
    const rows = notificationConversion(
      [
        notif({ createdAt: new Date("2026-07-01T00:00:00Z") }), // period.from 이전
        notif({ createdAt: new Date("2026-08-10T21:40:00Z") }),
      ],
      days("u1", "2026-08-11"),
      period,
      KST,
    );
    const brief = rows.find((r) => r.type === "morning_briefing")!;
    expect(brief.sent).toBe(1);
  });

  it("read_at이 null이면 열람으로 세지 않는다", () => {
    const rows = notificationConversion(
      [
        notif({ readAt: new Date("2026-08-11T00:00:00Z") }),
        notif({ readAt: null }),
      ],
      new Map(),
      period,
      KST,
    );
    const brief = rows.find((r) => r.type === "morning_briefing")!;
    expect(brief.opened).toEqual({ numerator: 1, denominator: 2 });
  });

  it("같은 날 여러 통을 받으면 발송은 여러 건이고 운동일 판정은 같은 날이다", () => {
    const rows = notificationConversion(
      [notif(), notif(), notif()],
      days("u1", "2026-08-11"),
      period,
      KST,
    );
    const brief = rows.find((r) => r.type === "morning_briefing")!;
    expect(brief.sent).toBe(3);
    // 사람이 아니라 발송 건이 모수다 — 세 통 다 "운동한 날에 받은 통"이다
    expect(brief.workedOutSameDay).toEqual({ numerator: 3, denominator: 3 });
  });

  it("운동 기록이 없는 사용자는 '받은 날 운동'에 안 들어간다", () => {
    const rows = notificationConversion(
      [notif({ userId: "u1" }), notif({ userId: "u2" })],
      days("u1", "2026-08-11"),
      period,
      KST,
    );
    const brief = rows.find((r) => r.type === "morning_briefing")!;
    expect(brief.workedOutSameDay).toEqual({ numerator: 1, denominator: 2 });
  });

  it("받은 날이 아닌 날 운동한 것은 세지 않는다", () => {
    const rows = notificationConversion(
      [notif()], // KST 08-11 수신
      days("u1", "2026-08-12"), // 다음 날 운동
      period,
      KST,
    );
    const brief = rows.find((r) => r.type === "morning_briefing")!;
    expect(brief.workedOutSameDay.numerator).toBe(0);
  });

  it("유형마다 한글 라벨을 붙인다", () => {
    const rows = notificationConversion([], new Map(), period, KST);
    expect(rows.find((r) => r.type === "workout_suggestion")!.label).toBe(
      "운동 제안",
    );
    expect(rows.find((r) => r.type === "morning_briefing")!.label).toBe(
      "아침 브리핑",
    );
  });
});

describe("ENGAGEMENT_NOTIFICATION_TYPES", () => {
  it("패널이 세는 유형을 하나도 빠뜨리지 않는다", () => {
    // 조회가 이 목록으로 서버에서 좁힌다. 여기 빠진 유형은 패널이 세도 0으로 나온다.
    const rows = notificationConversion([], new Map(), period, KST);
    for (const type of [
      ...rows.map((r) => r.type),
      ...BRIEFING_TYPES,
      CHALLENGE_PEEK_UNLOCKED_TYPE,
    ]) {
      expect(ENGAGEMENT_NOTIFICATION_TYPES).toContain(type);
    }
  });

  it("중복 없이 담는다 — .in() 질의에 같은 값을 두 번 넣지 않는다", () => {
    expect(ENGAGEMENT_NOTIFICATION_TYPES).toHaveLength(
      new Set(ENGAGEMENT_NOTIFICATION_TYPES).size,
    );
  });
});

describe("briefingSlotBreakdown", () => {
  const rows: EngagementNotificationRow[] = [
    notif({ userId: "u1", createdAt: new Date("2026-08-10T21:40:00Z") }), // KST 06:40
    notif({ userId: "u2", createdAt: new Date("2026-08-10T20:10:00Z") }), // KST 05:10
    notif({
      userId: "u1",
      type: "workout_suggestion",
      createdAt: new Date("2026-08-11T00:05:00Z"), // KST 09:05
    }),
  ];

  it("KST 30분 슬롯으로 나누고 시각 오름차순으로 낸다", () => {
    const slots = briefingSlotBreakdown(
      rows,
      days("u1", "2026-08-11"),
      period,
      KST,
    );
    // UTC로 읽었다면 00:00 · 20:00 · 21:30이 된다
    expect(slots.map((s) => s.label)).toEqual(["05:00", "06:30", "09:00"]);
    expect(slots.map((s) => s.minuteOfDay)).toEqual([300, 390, 540]);
    // 슬롯 시작은 SLOT_MINUTES의 배수다
    expect(slots.every((s) => s.minuteOfDay % SLOT_MINUTES === 0)).toBe(true);
  });

  it("빈 슬롯은 결과에 넣지 않는다", () => {
    const slots = briefingSlotBreakdown(rows, new Map(), period, KST);
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.sent > 0)).toBe(true);
  });

  it("09:00만 폴백 슬롯으로 표시한다", () => {
    const slots = briefingSlotBreakdown(rows, new Map(), period, KST);
    expect(slots.find((s) => s.minuteOfDay === DEFAULT_BRIEF_MINUTE)!
      .isFallbackSlot).toBe(true);
    expect(slots.find((s) => s.label === "06:30")!.isFallbackSlot).toBe(false);
  });

  it("제안 알림도 같은 아침 발송이라 함께 센다", () => {
    // buildBriefings가 같은 발송을 제안 유무로 유형만 바꿔 내보낸다.
    // 유형 하나만 세면 제안이 나간 날의 발송 시각이 통째로 사라진다.
    expect([...BRIEFING_TYPES]).toContain("workout_suggestion");
    const slots = briefingSlotBreakdown(
      rows,
      days("u1", "2026-08-11"),
      period,
      KST,
    );
    const nine = slots.find((s) => s.label === "09:00")!;
    expect(nine.sent).toBe(1);
    expect(nine.workedOutSameDay).toEqual({ numerator: 1, denominator: 1 });
  });

  it("운동 기록이 없으면 0으로 나누지 않는다", () => {
    const slots = briefingSlotBreakdown(rows, new Map(), period, KST);
    for (const s of slots) {
      expect(s.workedOutSameDay.numerator).toBe(0);
      expect(s.workedOutSameDay.denominator).toBe(s.sent);
    }
  });

  it("기간 밖 발송은 슬롯에 넣지 않는다", () => {
    const slots = briefingSlotBreakdown(
      [notif({ createdAt: new Date("2026-06-01T00:00:00Z") })],
      new Map(),
      period,
      KST,
    );
    expect(slots).toEqual([]);
  });
});

describe("viewingPassMetrics", () => {
  /** 2026-08-10(월)부터 n일 연속, KST 정오 완료 */
  function weekDays(userId: string, n: number): SessionRow[] {
    return Array.from({ length: n }, (_, i) =>
      completed(userId, `2026-08-${String(10 + i).padStart(2, "0")}T03:00:00Z`),
    );
  }

  it("주 5일을 채운 (사용자, 주) 쌍을 센다", () => {
    const m = viewingPassMetrics(weekDays("u1", KING_DAYS), 0, 0, 0, KST);
    expect(m.kingEligibleWeeks).toBe(1);
  });

  it("같은 날 두 번 운동해도 하루로 센다", () => {
    const m = viewingPassMetrics(
      [
        ...weekDays("u1", KING_DAYS - 1),
        completed("u1", "2026-08-13T09:00:00Z"), // 08-13 두 번째
      ],
      0,
      0,
      0,
      KST,
    );
    expect(m.kingEligibleWeeks).toBe(0);
  });

  it("5일 미만인 주는 자격에 안 든다", () => {
    const m = viewingPassMetrics(weekDays("u1", KING_DAYS - 1), 0, 0, 0, KST);
    expect(m.kingEligibleWeeks).toBe(0);
  });

  it("사람과 주가 다르면 따로 센다", () => {
    const m = viewingPassMetrics(
      [
        ...weekDays("u1", KING_DAYS),
        ...weekDays("u2", KING_DAYS),
        // u1의 다음 주(08-17 월 ~) 5일
        ...Array.from({ length: KING_DAYS }, (_, i) =>
          completed("u1", `2026-08-${17 + i}T03:00:00Z`),
        ),
      ],
      0,
      0,
      0,
      KST,
    );
    expect(m.kingEligibleWeeks).toBe(3);
  });

  it("사용 0건이어도 0으로 나누지 않고 0/N으로 남긴다", () => {
    const m = viewingPassMetrics(weekDays("u1", KING_DAYS), 0, 3, 2, KST);
    expect(m.kingUsed).toBe(0);
    expect(m.kingUsage).toEqual({ numerator: 0, denominator: 1 });
    expect(m.challengeUsage).toEqual({ numerator: 2, denominator: 3 });
    expect(Number.isNaN(m.kingUsage.numerator / m.kingUsage.denominator)).toBe(
      false,
    );
  });

  it("자격 주가 하나도 없으면 모수 0이다 — 0%가 아니라 측정 불가", () => {
    const m = viewingPassMetrics([], 0, 0, 0, KST);
    expect(m.kingUsage).toEqual({ numerator: 0, denominator: 0 });
    expect(m.challengeUsage).toEqual({ numerator: 0, denominator: 0 });
  });
});

describe("referralMetrics", () => {
  it("연결 한 행이 두 사람을 크루 보유자로 만든다", () => {
    const m = referralMetrics([{ userA: "u1", userB: "u2" }], 4, 4);
    expect(m.crewLinks).toBe(1);
    expect(m.usersWithCrew).toEqual({ numerator: 2, denominator: 4 });
  });

  it("같은 사람이 여러 연결을 가져도 보유자는 1명이다", () => {
    const m = referralMetrics(
      [
        { userA: "u1", userB: "u2" },
        { userA: "u1", userB: "u3" },
      ],
      3,
      3,
    );
    expect(m.usersWithCrew.numerator).toBe(3);
    // 연결 끝 4개 / 프로필 3명
    expect(m.avgCrewPerUser).toBe(1.3);
  });

  it("프로필이 0명이면 모수 0이고 평균은 0이다", () => {
    const m = referralMetrics([], 0, 0);
    expect(m.usersWithCrew.denominator).toBe(0);
    expect(m.inviteCodeIssued.denominator).toBe(0);
    expect(m.avgCrewPerUser).toBe(0);
    expect(Number.isFinite(m.avgCrewPerUser)).toBe(true);
  });

  it("초대 코드 발급률은 프로필을 모수로 쓴다", () => {
    const m = referralMetrics([], 7, 7);
    expect(m.inviteCodeIssued).toEqual({ numerator: 7, denominator: 7 });
  });

  it("출처 계측이 없다는 사실을 상수로 들고 있다", () => {
    // crew_links에 출처 컬럼이 없어 바이럴 계수는 계산할 수 없다.
    // 이 상수가 true가 되는 날은 마이그레이션과 RPC 3곳이 함께 바뀐 날이다.
    expect(REFERRAL_ATTRIBUTION_AVAILABLE).toBe(false);
  });
});
