import { describe, expect, it } from "vitest";
import {
  METRICS,
  dailyMetric,
  formatMetric,
  goalPace,
  gapMessage,
  metricTotalsByUser,
  minutesKnown,
  pinMine,
  rankMetric,
  representativeStanding,
  weeklyLeaders,
  type MetricRow,
} from "./challenge-metrics";

const TZ = "Asia/Seoul";
const S = "2026-09-01";

function row(
  userId: string,
  iso: string,
  o: Partial<{
    min: number | null | "none";
    kg: number;
    reps: number;
    km: number;
    done: boolean;
    type: "weight" | "bodyweight" | "cardio";
  }> = {},
): MetricRow {
  const done = o.done ?? true;
  const min = o.min === undefined ? 30 : o.min;
  return {
    userId,
    completedAt: iso,
    ...(min === "none" ? {} : { durationMinutes: min }),
    exercises: [
      {
        exerciseType: o.type ?? "weight",
        sets: [{ weightKg: o.kg ?? 0, reps: o.reps ?? 0, distanceMeters: null, isCompleted: done }],
      },
      {
        exerciseType: "cardio",
        sets: [{ weightKg: null, reps: null, distanceMeters: (o.km ?? 0) * 1000, isCompleted: done }],
      },
    ],
  };
}

const t = (sessions: number, minutes = 0, cardioKm = 0, volumeKg = 0) => ({
  sessions,
  minutes,
  cardioKm,
  volumeKg,
});

describe("metricTotalsByUser", () => {
  it("4종 합계 — 명단에 있는 사람만, 기간 밖 제외, 완료 세트만", () => {
    const m = metricTotalsByUser(
      [
        row("a", "2026-09-02T01:00:00Z", { min: 40, kg: 50, reps: 10, km: 3 }),
        row("a", "2026-09-02T09:00:00Z", { min: 20, kg: 20, reps: 5, km: 1, done: false }),
        row("a", "2026-08-30T01:00:00Z", { min: 99 }),
        row("x", "2026-09-02T01:00:00Z", { min: 99 }), // 명단 밖(나간 사람 등)
      ],
      ["a", "b"],
      S,
      "2026-09-10",
      TZ,
    );
    expect(m.get("a")).toEqual(t(2, 60, 3, 500));
    expect(m.get("b")).toEqual(t(0));
    expect(m.has("x")).toBe(false);
  });

  it("맨몸 세트의 무게×횟수는 볼륨에 안 들어간다(점수 집계와 같은 규칙)", () => {
    const m = metricTotalsByUser(
      [row("a", "2026-09-02T01:00:00Z", { kg: 10, reps: 10, type: "bodyweight" })],
      ["a"],
      S,
      "2026-09-10",
      TZ,
    );
    expect(m.get("a")?.volumeKg).toBe(0);
  });

  it("날짜는 사용자 시간대 — UTC 15:30은 서울 다음날", () => {
    const m = metricTotalsByUser([row("a", "2026-09-10T15:30:00Z")], ["a"], S, "2026-09-10", TZ);
    expect(m.get("a")?.sessions).toBe(0);
  });
});

describe("minutesKnown — 0117 전 응답", () => {
  it("행이 있는데 아무 행에도 운동 시간 키가 없으면 모른다", () => {
    expect(minutesKnown([row("a", "2026-09-02T01:00:00Z", { min: "none" })])).toBe(false);
    expect(minutesKnown([row("a", "2026-09-02T01:00:00Z", { min: null })])).toBe(true);
    expect(minutesKnown([])).toBe(true);
  });
});

describe("rankMetric", () => {
  const totals = new Map([
    ["a", t(12, 509, 0, 100)],
    ["b", t(11, 533, 0, 100)],
    ["c", t(11, 412, 0, 0)],
  ]);

  it("내림차순, 같은 값은 같은 등수, 다음은 건너뜀", () => {
    expect(rankMetric(totals, "sessions").map((r) => [r.userId, r.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
    ]);
    expect(rankMetric(totals, "minutes").map((r) => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
  });

  it("0은 순위 없음(null) — 아무도 안 한 지표에서 전원 1위가 되지 않게", () => {
    expect(rankMetric(totals, "cardioKm").map((r) => r.rank)).toEqual([null, null, null]);
    expect(rankMetric(totals, "volumeKg").map((r) => [r.userId, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", null],
    ]);
  });

  it("2명도 된다", () => {
    const two = new Map([
      ["a", t(1)],
      ["b", t(3)],
    ]);
    expect(rankMetric(two, "sessions").map((r) => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("40명도 된다 — 순서·등수 일관", () => {
    const many = new Map(Array.from({ length: 40 }, (_, i) => [`u${i}`, t(i % 7)] as const));
    const r = rankMetric(many, "sessions");
    expect(r).toHaveLength(40);
    expect(r[0].value).toBe(6);
    expect(r.filter((x) => x.rank === 1).every((x) => x.value === 6)).toBe(true);
    expect(r.filter((x) => x.value === 0).every((x) => x.rank === null)).toBe(true);
    // 등수는 줄 위치 +1 이하이고 내려가기만 한다
    r.forEach((x, i) => x.rank !== null && expect(x.rank).toBeLessThanOrEqual(i + 1));
  });
});

describe("representativeStanding — 시안 `내 현재 순위 1위 · 운동 횟수 기준`", () => {
  it("내가 가장 높은 지표, 동률이면 횟수→시간→거리→볼륨 순", () => {
    const totals = new Map([
      ["me", t(5, 100, 9, 0)],
      ["b", t(6, 200, 3, 10)],
    ]);
    expect(representativeStanding(totals, "me", true)).toEqual({ metric: "cardioKm", rank: 1 });
  });

  it("같은 등수면 앞선 지표", () => {
    const totals = new Map([
      ["me", t(9, 300, 0, 0)],
      ["b", t(6, 200, 0, 0)],
    ]);
    expect(representativeStanding(totals, "me", true)).toEqual({ metric: "sessions", rank: 1 });
  });

  it("운동 시간 집계 전(0117)이면 시간 지표는 후보에서 뺀다", () => {
    const totals = new Map([
      ["me", t(1, 50)],
      ["b", t(2, 10)],
    ]);
    expect(representativeStanding(totals, "me", false)).toEqual({ metric: "sessions", rank: 2 });
  });

  it("아무 기록도 없으면 null", () => {
    expect(representativeStanding(new Map([["me", t(0)]]), "me", true)).toBeNull();
  });
});

describe("gapMessage — 시안 문구", () => {
  const totals = new Map([
    ["me", t(12, 509)],
    ["b", t(11, 533)],
    ["c", t(9, 412)],
  ]);

  it("1위: 2위와 +N 차이 + 한 번 더", () => {
    const g = gapMessage(rankMetric(totals, "sessions"), "me", "sessions");
    expect(g.headline).toBe("2위와 +1회 차이예요!");
    expect(g.tip).toBe("한 번 더 하면 선두를 더 굳힐 수 있어요.");
    expect(g.rival?.userId).toBe("b");
    expect(g.diff).toBe(1);
  });

  it("2위: 1위까지 -N + 탈환", () => {
    const g = gapMessage(rankMetric(totals, "minutes"), "me", "minutes");
    expect(g.headline).toBe("1위까지 -24분!");
    expect(g.tip).toBe("24분만 더 하면 1위를 탈환할 수 있어요!");
    expect(g.rival?.userId).toBe("b");
  });

  it("공동 등수 바로 아래면 그 등수를 상대로", () => {
    const tied = new Map([
      ["a", t(5)],
      ["b", t(5)],
      ["me", t(3)],
    ]);
    const g = gapMessage(rankMetric(tied, "sessions"), "me", "sessions");
    expect(g.headline).toBe("1위까지 -2회!");
  });

  it("공동 1위", () => {
    const tie = new Map([
      ["me", t(3)],
      ["b", t(3)],
    ]);
    expect(gapMessage(rankMetric(tie, "sessions"), "me", "sessions").headline).toBe("공동 1위예요!");
  });

  it("혼자 기록이 있으면 선두", () => {
    const solo = new Map([
      ["me", t(3)],
      ["b", t(0)],
    ]);
    expect(gapMessage(rankMetric(solo, "sessions"), "me", "sessions").headline).toBe("지금 선두예요!");
  });

  it("기록 없음", () => {
    const g = gapMessage(rankMetric(totals, "cardioKm"), "me", "cardioKm");
    expect(g.headline).toBe("아직 기록이 없어요");
    expect(g.rival).toBeNull();
  });
});

describe("weeklyLeaders — 이번 주 1위 칩", () => {
  it("오늘이 속한 챌린지 주(시작일부터 7일씩)만 센다", () => {
    const rows = [
      row("b", "2026-09-02T01:00:00Z"), // 1주 — b가 더 많지만 지난주다
      row("b", "2026-09-03T01:00:00Z"),
      row("b", "2026-09-04T01:00:00Z"),
      row("b", "2026-09-09T01:00:00Z"), // 2주
      row("me", "2026-09-10T01:00:00Z"),
      row("me", "2026-09-11T01:00:00Z"),
    ];
    expect(weeklyLeaders(rows, ["me", "b"], S, "2026-09-12", TZ, "sessions")).toEqual(["me"]);
  });
});

describe("pinMine — TOP N + 내 줄 고정 (2명~수십 명)", () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}` }));

  it("내가 안이면 그대로 N줄", () => {
    const r = pinMine(people(30), "u3", 5);
    expect(r.rows.map((x) => x.userId)).toEqual(["u1", "u2", "u3", "u4", "u5"]);
    expect(r.pinned).toBe(false);
  });

  it("내가 밖이면 N줄 + 내 줄", () => {
    const r = pinMine(people(30), "u22", 5);
    expect(r.rows.map((x) => x.userId)).toEqual(["u1", "u2", "u3", "u4", "u5", "u22"]);
    expect(r.pinned).toBe(true);
  });

  it("2명이면 2줄", () => {
    expect(pinMine(people(2), "u2", 5).rows).toHaveLength(2);
  });
});

describe("표기", () => {
  it("formatMetric", () => {
    expect(formatMetric("sessions", 12)).toBe("12회");
    expect(formatMetric("minutes", 509.4)).toBe("509분");
    expect(formatMetric("cardioKm", 42.26)).toBe("42.3km");
    expect(formatMetric("volumeKg", 12350)).toBe("12,350kg");
    expect(METRICS.map((m) => m.label)).toEqual(["운동 횟수", "운동 시간", "유산소 거리", "웨이트 볼륨"]);
  });
});

describe("dailyMetric — 내 진행 현황 막대", () => {
  it("기간 날짜마다 값, 이번 주만 자를 수 있다", () => {
    const totals = new Map([
      ["2026-09-02", { dayKey: "2026-09-02", sessions: 2, completedSets: 3, minutes: 62, cardioKm: 1.5, volumeKg: 300 }],
      ["2026-09-09", { dayKey: "2026-09-09", sessions: 1, completedSets: 1, minutes: null, cardioKm: 0, volumeKg: 0 }],
    ]);
    const all = dailyMetric(totals, "minutes", "2026-09-01", "2026-09-10");
    expect(all).toHaveLength(10);
    expect(all[1]).toEqual({ dayKey: "2026-09-02", value: 62 });
    expect(all[8]).toEqual({ dayKey: "2026-09-09", value: 0 });
    expect(dailyMetric(totals, "sessions", "2026-09-08", "2026-09-10").map((d) => d.value)).toEqual([0, 1, 0]);
  });
});

describe("goalPace — 같은 지표 목표가 있을 때만 하루 페이스", () => {
  it("유산소 거리·볼륨만 대응, 하루 = 목표 ÷ 기간 일수", () => {
    expect(goalPace([{ goal_type: "cardio_distance", target_value: 30 }], "cardioKm", 30)).toBe(1);
    expect(goalPace([{ goal_type: "volume", target_value: 6000 }], "volumeKg", 30)).toBe(200);
    expect(goalPace([{ goal_type: "workout_days", target_value: 20 }], "sessions", 30)).toBeNull();
    expect(goalPace([], "minutes", 30)).toBeNull();
  });
});
