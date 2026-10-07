import { describe, expect, it } from "vitest";
import {
  bestRecords,
  cheerCopy,
  dailyBars,
  dailyTotals,
  formatShortDay,
  periodRewards,
  restRanking,
  resultShareText,
  topPercent,
  weekCutoffs,
  weeklyAchievement,
  type ReportSessionInput,
} from "./challenge-report";

const TZ = "Asia/Seoul";
const S = "2026-09-01";
const E = "2026-09-28";

function session(
  completedAt: string,
  o: Partial<{ minutes: number | null; kg: number; reps: number; km: number; done: boolean }> = {},
): ReportSessionInput {
  const done = o.done ?? true;
  return {
    completedAt,
    durationMinutes: o.minutes ?? null,
    exercises: [
      {
        exerciseType: "weight",
        sets: [{ weightKg: o.kg ?? 0, reps: o.reps ?? 0, distanceMeters: null, isCompleted: done }],
      },
      {
        exerciseType: "cardio",
        sets: [{ weightKg: null, reps: null, distanceMeters: (o.km ?? 0) * 1000, isCompleted: done }],
      },
    ],
  };
}

describe("dailyTotals", () => {
  it("날짜는 사용자 시간대로 자른다 — foldPeriodStats와 같은 자", () => {
    // UTC 15:30 = 서울 다음날 00:30
    const m = dailyTotals([session("2026-09-01T15:30:00Z", { minutes: 30 })], S, E, TZ);
    expect([...m.keys()]).toEqual(["2026-09-02"]);
  });

  it("같은 날은 더하고 기간 밖은 버린다", () => {
    const m = dailyTotals(
      [
        session("2026-09-02T01:00:00Z", { minutes: 30, kg: 50, reps: 10, km: 2 }),
        session("2026-09-02T10:00:00Z", { minutes: 15, kg: 20, reps: 5, km: 1.5 }),
        session("2026-08-30T01:00:00Z", { minutes: 99 }),
      ],
      S,
      E,
      TZ,
    );
    expect(m.get("2026-09-02")).toEqual({
      dayKey: "2026-09-02",
      sessions: 2,
      completedSets: 4,
      minutes: 45,
      cardioKm: 3.5,
      volumeKg: 600,
    });
    expect(m.has("2026-08-30")).toBe(false);
  });

  it("운동 시간이 없으면 null — 0분과 다르다(0117 전)", () => {
    expect(dailyTotals([session("2026-09-02T01:00:00Z")], S, E, TZ).get("2026-09-02")?.minutes).toBeNull();
  });

  it("완료 안 한 세트는 합계에 없지만 그날은 운동한 날이다(참여율과 같은 규칙)", () => {
    const t = dailyTotals(
      [session("2026-09-02T01:00:00Z", { kg: 50, reps: 10, km: 2, done: false })],
      S,
      E,
      TZ,
    ).get("2026-09-02");
    expect(t).toEqual({
      dayKey: "2026-09-02",
      sessions: 1,
      completedSets: 0,
      minutes: null,
      cardioKm: 0,
      volumeKg: 0,
    });
  });
});

describe("dailyBars", () => {
  it("기간 일수만큼, 계획은 같은 날끼리 더하고 기간 밖 계획은 버린다", () => {
    const totals = dailyTotals([session("2026-09-03T01:00:00Z", { minutes: 40 })], S, "2026-09-07", TZ);
    const bars = dailyBars(
      totals,
      [
        { planDate: "2026-09-03", setCount: 6 },
        { planDate: "2026-09-03", setCount: 4 },
        { planDate: "2026-09-05", setCount: 8 },
        { planDate: "2026-08-31", setCount: 9 },
      ],
      S,
      "2026-09-07",
    );
    expect(bars).toHaveLength(7);
    expect(bars[2]).toEqual({
      dayKey: "2026-09-03",
      day: 3,
      planCount: 2,
      planSets: 10,
      actualCount: 1,
      actualSets: 2,
      minutes: 40,
    });
    expect(bars[4]).toEqual({
      dayKey: "2026-09-05",
      day: 5,
      planCount: 1,
      planSets: 8,
      actualCount: 0,
      actualSets: 0,
      minutes: null,
    });
  });
});

describe("weeklyAchievement", () => {
  it("주마다 목표 횟수 칸, 넘친 날은 extra", () => {
    const keys = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-09"];
    expect(weeklyAchievement(keys, S, "2026-09-14", 4)).toEqual([
      { week: 1, target: 4, done: 4, extra: 1 },
      { week: 2, target: 4, done: 1, extra: 0 },
    ]);
  });

  it("마지막 주가 짧으면 목표도 그 일수까지만", () => {
    const w = weeklyAchievement([], S, "2026-09-09", 5);
    expect(w[1]).toEqual({ week: 2, target: 2, done: 0, extra: 0 });
  });
});

describe("bestRecords", () => {
  it("하루 최대값과 날짜, 동률이면 이른 날", () => {
    const totals = dailyTotals(
      [
        session("2026-09-02T01:00:00Z", { minutes: 50, kg: 100, reps: 10, km: 3 }),
        session("2026-09-03T01:00:00Z", { minutes: 92, kg: 50, reps: 10, km: 3 }),
        session("2026-09-04T01:00:00Z", { minutes: 20 }),
      ],
      S,
      E,
      TZ,
    );
    expect(bestRecords(totals)).toEqual({
      longestStreak: 3,
      maxMinutes: { value: 92, dayKey: "2026-09-03" },
      maxCardioKm: { value: 3, dayKey: "2026-09-02" },
      maxVolumeKg: { value: 1000, dayKey: "2026-09-02" },
    });
  });

  it("값이 없으면 null", () => {
    const r = bestRecords(dailyTotals([session("2026-09-02T01:00:00Z")], S, E, TZ));
    expect([r.maxMinutes, r.maxCardioKm, r.maxVolumeKg]).toEqual([null, null, null]);
    expect(r.longestStreak).toBe(1);
  });
});

describe("weekCutoffs", () => {
  it("주차 끝 날짜, 마지막 주는 종료일", () => {
    expect(weekCutoffs(S, "2026-09-10")).toEqual([
      { label: "1주", endKey: "2026-09-07" },
      { label: "2주", endKey: "2026-09-10" },
    ]);
  });
});

describe("periodRewards", () => {
  const ledger = (amount: number, createdAt: string, transactionType = "earn") => ({
    amount,
    transactionType,
    createdAt,
  });

  it("기간 XP·포인트·배지, 종료 뒤에 쌓인 XP는 빼고 종료 시점 레벨을 잰다", () => {
    const r = periodRewards({
      currentTotalXp: 1400,
      xpRows: [
        ledger(300, "2026-09-02T01:00:00Z"),
        ledger(250, "2026-09-20T01:00:00Z"),
        ledger(-50, "2026-09-21T01:00:00Z", "reverse"),
        ledger(200, "2026-10-02T01:00:00Z"), // 종료 뒤
      ],
      pointRows: [
        ledger(120, "2026-09-05T01:00:00Z"),
        ledger(80, "2026-09-06T01:00:00Z"),
        ledger(500, "2026-09-07T01:00:00Z", "spend"),
        ledger(30, "2026-10-03T01:00:00Z"),
      ],
      badgeEarnedAts: ["2026-09-10T01:00:00Z", "2026-10-03T01:00:00Z"],
      startDate: S,
      endDate: E,
      timeZone: TZ,
    });
    expect(r.xpGained).toBe(500); // 300 + 250 - 50
    expect(r.totalXpAtEnd).toBe(1200); // 1400 - 200
    expect(r.levelAtStart).toBe(4); // 700 XP → Lv.4 (600 이상 800 미만)
    expect(r.levelAtEnd).toBe(6); // 1200 XP → Lv.6 (1000 이상 1400 미만)
    expect(r.nextLevelXp).toBe(1400);
    expect(r.pointsEarned).toBe(200);
    expect(r.badgeCount).toBe(1);
  });

  it("reverse 금액의 부호와 상관없이 빼기로 센다", () => {
    const common = { currentTotalXp: 100, pointRows: [], badgeEarnedAts: [], startDate: S, endDate: E, timeZone: TZ };
    const a = periodRewards({
      ...common,
      xpRows: [ledger(100, "2026-09-02T01:00:00Z"), ledger(-30, "2026-09-03T01:00:00Z", "reverse")],
    });
    const b = periodRewards({
      ...common,
      xpRows: [ledger(100, "2026-09-02T01:00:00Z"), ledger(30, "2026-09-03T01:00:00Z", "reverse")],
    });
    expect(a.xpGained).toBe(70);
    expect(b.xpGained).toBe(70);
  });
});

describe("표기", () => {
  it("formatShortDay — 9/14(월)", () => {
    expect(formatShortDay("2026-09-14")).toBe("9/14(월)");
    expect(formatShortDay("2026-09-18")).toBe("9/18(금)");
  });

  it("topPercent — 순위/인원, 최소 1%", () => {
    expect(topPercent(1, 3)).toBe(33);
    expect(topPercent(1, 200)).toBe(1);
    expect(topPercent(3, 3)).toBe(100);
  });

  it("cheerCopy — 1위는 시안 문구", () => {
    expect(cheerCopy(1)).toEqual(["잘했다!", "계속 가자!"]);
  });

  it("resultShareText", () => {
    expect(
      resultShareText({
        challengeName: "9월 챌린지",
        rank: 1,
        total: 3,
        overall: 83.24,
        workoutDays: 20,
        periodDays: 28,
      }),
    ).toBe("GND 「9월 챌린지」 결과\n3명 중 1위 · 종합 83.2점\n28일 중 20일 운동했어요");
  });
});

describe("restRanking — 2명부터 수십 명까지", () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}` }));

  it("3명 이하는 목록이 없다", () => {
    expect(restRanking(people(2), "u1", false).rows).toEqual([]);
    expect(restRanking(people(3), "u3", false).rows).toEqual([]);
  });

  it("10명까지는 4~10위 전부", () => {
    const r = restRanking(people(10), "u1", false);
    expect(r.rows.map((x) => x.userId)).toEqual(["u4", "u5", "u6", "u7", "u8", "u9", "u10"]);
    expect(r.hiddenCount).toBe(0);
  });

  it("30명 — 접으면 4~10위 + 내 줄, 나머지는 숨김 수", () => {
    const r = restRanking(people(30), "u25", false);
    expect(r.rows.map((x) => x.userId)).toEqual(["u4", "u5", "u6", "u7", "u8", "u9", "u10", "u25"]);
    expect(r.gapBeforeLast).toBe(true);
    expect(r.hiddenCount).toBe(19);
  });

  it("내가 11위면 사이가 없다", () => {
    const r = restRanking(people(30), "u11", false);
    expect(r.rows.at(-1)?.userId).toBe("u11");
    expect(r.gapBeforeLast).toBe(false);
  });

  it("내가 10위 안이면 내 줄을 덧붙이지 않는다", () => {
    const r = restRanking(people(30), "u5", false);
    expect(r.rows).toHaveLength(7);
    expect(r.hiddenCount).toBe(20);
  });

  it("펼치면 4위부터 전부", () => {
    expect(restRanking(people(30), "u25", true).rows).toHaveLength(27);
  });
});
