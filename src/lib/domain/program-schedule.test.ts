import { describe, expect, it } from "vitest";
import {
  buildMissedSessionProposal,
  buildProgramSchedule,
  localDateTimeToIso,
  type ProgramPlanForReschedule,
} from "./program-schedule";

const seoulSlots = [
  { weekday: 1 as const, time: "19:00" },
  { weekday: 3 as const, time: "19:00" },
  { weekday: 5 as const, time: "18:00" },
];

function dayDifference(a: string, b: string): number {
  return (
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
    86_400_000
  );
}

function expectRecoveryGap(dates: string[]): void {
  for (let index = 1; index < dates.length; index += 1) {
    expect(dayDifference(dates[index - 1], dates[index])).toBeGreaterThanOrEqual(2);
  }
}

describe("localDateTimeToIso", () => {
  it("서울 외 IANA 시간대의 벽시계 시각을 정확한 순간으로 바꾼다", () => {
    expect(
      localDateTimeToIso("2026-01-15", "09:30", "America/New_York"),
    ).toBe("2026-01-15T14:30:00.000Z");
  });

  it("DST 전환 뒤의 유효한 시각에는 바뀐 오프셋을 적용한다", () => {
    expect(
      localDateTimeToIso("2026-03-08", "03:30", "America/New_York"),
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("DST 전환으로 존재하지 않는 현지 시각은 거부한다", () => {
    expect(() =>
      localDateTimeToIso("2026-03-08", "02:30", "America/New_York"),
    ).toThrow("program_local_time_missing");
  });

  it.each([
    ["2026-11-01", "01:30", "America/New_York", "2026-11-01T05:30:00.000Z"],
    ["2026-10-25", "01:30", "Europe/London", "2026-10-25T00:30:00.000Z"],
  ])("DST 종료로 현지 시각이 중복되면 가장 이른 순간을 고른다", (date, time, zone, iso) => {
    expect(localDateTimeToIso(date, time, zone)).toBe(iso);
  });

  it.each([
    ["2026-02-30", "09:00", "Asia/Seoul", "program_invalid_date"],
    ["2026-02-20", "24:00", "Asia/Seoul", "program_invalid_time"],
    ["2026-02-20", "09:00", "Not/A_Timezone", "program_invalid_timezone"],
  ])("잘못된 날짜·시간·시간대는 명확한 오류로 거부한다", (date, time, zone, error) => {
    expect(() => localDateTimeToIso(date, time, zone)).toThrow(error);
  });
});

describe("buildProgramSchedule", () => {
  it("월·수·금 6주 18회를 시작일 이후부터 A/B/C 순서로 만든다", () => {
    const out = buildProgramSchedule({
      startDate: "2026-08-17",
      slots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    });

    expect(out.plans).toHaveLength(18);
    expect(out.plans[0]).toEqual({
      date: "2026-08-17",
      scheduledAt: "2026-08-17T10:00:00.000Z",
      week: 1,
      session: 1,
      templateKey: "A",
    });
    expect(out.plans.at(-1)).toEqual({
      date: "2026-09-25",
      scheduledAt: "2026-09-25T09:00:00.000Z",
      week: 6,
      session: 3,
      templateKey: "C",
    });
    expect(
      out.plans.map(({ week, session, templateKey }) => ({
        week,
        session,
        templateKey,
      })),
    ).toEqual(
      Array.from({ length: 18 }, (_, index) => ({
        week: Math.floor(index / 3) + 1,
        session: (index % 3) + 1,
        templateKey: ["A", "B", "C"][index % 3],
      })),
    );
    expect(out.conflicts).toEqual([]);
  });

  it("시작일이 비선택 요일이어도 이후 첫 선택 요일부터 날짜순으로 만든다", () => {
    const out = buildProgramSchedule({
      startDate: "2026-08-18",
      slots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    });

    expect(out.plans.slice(0, 4).map((plan) => plan.date)).toEqual([
      "2026-08-19",
      "2026-08-21",
      "2026-08-24",
      "2026-08-26",
    ]);
    expect(out.plans.slice(0, 3).map((plan) => plan.scheduledAt)).toEqual([
      "2026-08-19T10:00:00.000Z",
      "2026-08-21T09:00:00.000Z",
      "2026-08-24T10:00:00.000Z",
    ]);
  });

  it.each([
    {
      slots: [
      { weekday: 1 as const, time: "19:00" },
      { weekday: 2 as const, time: "19:00" },
      { weekday: 5 as const, time: "19:00" },
      ],
    },
    {
      slots: [
      { weekday: 0 as const, time: "19:00" },
      { weekday: 1 as const, time: "19:00" },
      { weekday: 4 as const, time: "19:00" },
      ],
    },
  ])("주 경계를 포함해 연속 요일은 회복 간격 오류로 거부한다", ({ slots }) => {
    expect(() =>
      buildProgramSchedule({
        startDate: "2026-08-17",
        slots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set(),
      }),
    ).toThrow("program_recovery_gap");
  });

  it.each([
    [seoulSlots.slice(0, 2), "program_slots_count"],
    [
      [seoulSlots[0], seoulSlots[0], seoulSlots[2]],
      "program_slot_weekday_duplicate",
    ],
    [
      [seoulSlots[0], { weekday: 3 as const, time: "9:00" }, seoulSlots[2]],
      "program_invalid_time",
    ],
  ])("잘못된 슬롯 입력을 거부한다", (slots, error) => {
    expect(() =>
      buildProgramSchedule({
        startDate: "2026-08-17",
        slots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set(),
      }),
    ).toThrow(error);
  });

  it("연말과 윤년 경계를 UTC 날짜 연산으로 넘는다", () => {
    const yearEnd = buildProgramSchedule({
      startDate: "2026-12-31",
      slots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    });
    const leapYear = buildProgramSchedule({
      startDate: "2028-02-28",
      slots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(),
    });

    expect(yearEnd.plans.slice(0, 3).map((plan) => plan.date)).toEqual([
      "2027-01-01",
      "2027-01-04",
      "2027-01-06",
    ]);
    expect(leapYear.plans.slice(0, 3).map((plan) => plan.date)).toEqual([
      "2028-02-28",
      "2028-03-01",
      "2028-03-03",
    ]);
  });

  it("충돌하면 이후 회차도 밀어 RPC에 바로 보낼 수 있는 완성 일정을 반환한다", () => {
    const occupied = new Set(["2026-08-19", "2026-08-20"]);
    const out = buildProgramSchedule({
      startDate: "2026-08-17",
      slots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: occupied,
    });

    const finalDates = out.plans.map((plan) => plan.date);
    expect(finalDates.slice(0, 4)).toEqual([
      "2026-08-17",
      "2026-08-21",
      "2026-08-24",
      "2026-08-26",
    ]);
    expect(out.plans).toHaveLength(18);
    expect(new Set(finalDates).size).toBe(18);
    expect(finalDates.every((date) => !occupied.has(date))).toBe(true);
    expectRecoveryGap(finalDates);
    expect(out.conflicts[0]).toEqual({
      date: "2026-08-19",
      suggestedDate: "2026-08-21",
      scheduledAt: "2026-08-21T09:00:00.000Z",
    });
    expect(out.conflicts).toHaveLength(17);
    expect(out.plans.every((plan) => Boolean(plan.scheduledAt))).toBe(true);
    expect(occupied).toEqual(new Set(["2026-08-19", "2026-08-20"]));
  });

  it("복수 충돌도 결정적으로 해소하고 모든 프로그램 회차의 회복 간격을 지킨다", () => {
    const input = {
      startDate: "2026-08-17",
      slots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(["2026-08-17", "2026-08-19", "2026-08-20"]),
    };
    const first = buildProgramSchedule(input);
    const second = buildProgramSchedule(input);
    expect(second).toEqual(first);
    expect(first.plans).toHaveLength(18);
    expect(new Set(first.plans.map((plan) => plan.date)).size).toBe(18);
    expect(
      first.plans.every((plan) => !input.occupiedDates.has(plan.date)),
    ).toBe(true);
    expectRecoveryGap(first.plans.map((plan) => plan.date));
    expect(first.conflicts[0]).toMatchObject({
      date: "2026-08-17",
      suggestedDate: "2026-08-21",
    });
  });
});

describe("buildMissedSessionProposal", () => {
  const plans: ProgramPlanForReschedule[] = [
    { id: "done", date: "2026-08-10", completed: true },
    { id: "missed-a", date: "2026-08-11", completed: false },
    { id: "missed-b", date: "2026-08-12", completed: false },
    { id: "future-a", date: "2026-08-17", completed: false },
    { id: "future-b", date: "2026-08-19", completed: false },
  ];

  it("완료 회차는 제외하고 과거 미완료 회차만 오늘 이후로 옮긴다", () => {
    expect(
      buildMissedSessionProposal({
        plans,
        todayKey: "2026-08-14",
        preferredSlots: seoulSlots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set(),
      }),
    ).toEqual([
      { planId: "missed-a", fromDate: "2026-08-11", suggestedDate: "2026-08-14", scheduledAt: "2026-08-14T09:00:00.000Z" },
      { planId: "missed-b", fromDate: "2026-08-12", suggestedDate: "2026-08-17", scheduledAt: "2026-08-17T10:00:00.000Z" },
      { planId: "future-a", fromDate: "2026-08-17", suggestedDate: "2026-08-19", scheduledAt: "2026-08-19T10:00:00.000Z" },
      { planId: "future-b", fromDate: "2026-08-19", suggestedDate: "2026-08-21", scheduledAt: "2026-08-21T09:00:00.000Z" },
    ]);
  });

  it("공간이 부족하면 뒤의 미완료 회차도 밀어 전체 회차 순서를 보존한다", () => {
    expect(
      buildMissedSessionProposal({
        plans,
        todayKey: "2026-08-16",
        preferredSlots: seoulSlots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set(),
      }),
    ).toEqual([
      { planId: "missed-a", fromDate: "2026-08-11", suggestedDate: "2026-08-17", scheduledAt: "2026-08-17T10:00:00.000Z" },
      { planId: "missed-b", fromDate: "2026-08-12", suggestedDate: "2026-08-19", scheduledAt: "2026-08-19T10:00:00.000Z" },
      { planId: "future-a", fromDate: "2026-08-17", suggestedDate: "2026-08-21", scheduledAt: "2026-08-21T09:00:00.000Z" },
      { planId: "future-b", fromDate: "2026-08-19", suggestedDate: "2026-08-24", scheduledAt: "2026-08-24T10:00:00.000Z" },
    ]);
  });

  it("기존 점유·완료 날짜와 다른 제안을 피하고 입력을 바꾸지 않는다", () => {
    const input = {
      plans,
      todayKey: "2026-08-14",
      preferredSlots: seoulSlots,
      timeZone: "Asia/Seoul",
      occupiedDates: new Set(["2026-08-14", "2026-08-15"]),
    };
    const beforePlans = structuredClone(plans);
    const beforeOccupied = new Set(input.occupiedDates);
    const moves = buildMissedSessionProposal(input);

    expect(moves).toEqual([
      { planId: "missed-a", fromDate: "2026-08-11", suggestedDate: "2026-08-17", scheduledAt: "2026-08-17T10:00:00.000Z" },
      { planId: "missed-b", fromDate: "2026-08-12", suggestedDate: "2026-08-19", scheduledAt: "2026-08-19T10:00:00.000Z" },
      { planId: "future-a", fromDate: "2026-08-17", suggestedDate: "2026-08-21", scheduledAt: "2026-08-21T09:00:00.000Z" },
      { planId: "future-b", fromDate: "2026-08-19", suggestedDate: "2026-08-24", scheduledAt: "2026-08-24T10:00:00.000Z" },
    ]);
    expect(plans).toEqual(beforePlans);
    expect(input.occupiedDates).toEqual(beforeOccupied);
    expect(moves.some((move) => move.planId === "done")).toBe(false);
    expect(new Set(moves.map((move) => move.suggestedDate)).size).toBe(
      moves.length,
    );
    expectRecoveryGap(moves.map((move) => move.suggestedDate));
  });

  it("한 주의 선호 요일이 모두 막히면 가장 가까운 빈 날짜를 사용한다", () => {
    expect(
      buildMissedSessionProposal({
        plans: [
          { id: "missed", date: "2026-08-10", completed: false },
          { id: "future", date: "2026-08-24", completed: false },
        ],
        todayKey: "2026-08-17",
        preferredSlots: seoulSlots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set(["2026-08-17", "2026-08-19", "2026-08-21"]),
      }),
    ).toEqual([
      { planId: "missed", fromDate: "2026-08-10", suggestedDate: "2026-08-18", scheduledAt: "2026-08-18T10:00:00.000Z" },
    ]);
  });

  it("누락된 회차가 없으면 기존 미래 날짜를 그대로 보존한다", () => {
    expect(
      buildMissedSessionProposal({
        plans: plans.slice(3),
        todayKey: "2026-08-14",
        preferredSlots: seoulSlots,
        timeZone: "Asia/Seoul",
        occupiedDates: new Set(),
      }),
    ).toEqual([]);
  });
});
