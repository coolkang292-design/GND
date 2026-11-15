import { describe, expect, it } from "vitest";
import type { MetricRow } from "./challenge-metrics";
import { rankForChallenge } from "./challenge-ranking";
import type { ParticipantInput } from "./goal-score";

const input = (userId: string, types: ParticipantInput["goals"][number]["type"][]): ParticipantInput => ({
  userId,
  goals: types.map((type) => ({ type, target: 10, actual: 8 })),
  workoutDays: 5,
  plannedDays: 10,
});

const row = (userId: string, day: string, durationMinutes: number | null): MetricRow => ({
  userId,
  completedAt: `${day}T03:00:00.000Z`,
  durationMinutes,
  exercises: [],
});

// 기본은 최종 발표(활동 점수 포함). 진행 중 동작은 아래 `live` 테스트에서 따로 본다
const base = { startDate: "2026-11-01", endDate: "2026-11-28", timeZone: "Asia/Seoul", includeActivity: true } as const;
const T3 = ["workout_days", "weight_days", "bodyweight_days"] as const;
const T4 = ["workout_days", "weight_days", "bodyweight_days", "cardio_time"] as const;

describe("rankForChallenge", () => {
  it("scoring_version이 없거나 1이면 v1 — v2 상세가 붙지 않는다", () => {
    for (const v of [undefined, null, 1]) {
      const r = rankForChallenge({ scoringVersion: v, inputs: [input("A", [...T3])], rows: [], ...base });
      expect(r[0].v2).toBeNull();
    }
  });

  it("v2는 같은 사람·같은 기록에서 v1과 같은 기본 점수를 낸다 (점수 자는 하나)", () => {
    const inputs = [input("A", [...T3]), input("B", [...T4])];
    const v1 = rankForChallenge({ scoringVersion: 1, inputs, rows: [], ...base });
    const v2 = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base });
    for (const r of v2) {
      const same = v1.find((x) => x.userId === r.userId)!;
      // 기본 점수는 v1과 같다. `overall`(표시 점수)은 거기에 활동 점수를 더한 총점이다
      expect(r.v2!.baseScore).toBeCloseTo(same.overall, 1);
      expect(r.overall).toBeCloseTo(r.v2!.baseScore + r.v2!.activityScore, 5);
      expect(r.achievement).toBeCloseTo(same.achievement, 9);
    }
  });

  it("v2: 운동한 날이 많은 쪽이 활동 점수로 앞선다 — 목표 수는 순위 기준이 아니다", () => {
    // 계획일(10) 이상이라 참여율은 둘 다 100%. 목표 수는 B가 많지만 날은 A가 많다.
    const inputs = [
      { ...input("A", [...T3]), workoutDays: 12 },
      { ...input("B", [...T4]), workoutDays: 11 },
    ];
    const r = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base });
    expect(r.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(r.find((x) => x.userId === "B")!.rank).toBe(2);
    expect(r.find((x) => x.userId === "A")!.v2!.activityScore).toBe(12);
  });

  it("v2 동점: 날 수가 같으면 목표 수가 달라도 공동 순위다", () => {
    const inputs = [input("A", [...T3]), input("B", [...T4])];
    const r = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base });
    expect(r.map((x) => x.rank)).toEqual([1, 1]);
  });

  it("세션 행에서 횟수·시간을 가져온다 — 시간이 0분인 세션이 있으면 그 사람 때문에 시간 비교를 건너뛴다", () => {
    const inputs = [input("A", [...T3]), input("B", [...T3])];
    const rows = [
      row("A", "2026-11-03", 60),
      row("A", "2026-11-04", 0), // 시간 안 잡힘
      row("B", "2026-11-03", 10),
    ];
    const r = rankForChallenge({ scoringVersion: 2, inputs, rows, ...base });
    const a = r.find((x) => x.userId === "A")!;
    const b = r.find((x) => x.userId === "B")!;
    expect(a.v2!.breakdown.workoutSessions).toBe(2);
    expect(a.v2!.breakdown.workoutMinutes).toBe(60);
    expect(a.v2!.breakdown.minutesComplete).toBe(false);
    expect(b.v2!.breakdown.minutesComplete).toBe(true);
    // 활동 점수: A = 날 5 + 2회 + 60분(1점) = 8점, B = 날 5 + 1회 + 10분(0.17점) = 6.17점 → 총점으로 A가 앞선다
    expect(a.v2!.activityScore).toBe(8);
    expect(b.v2!.activityScore).toBe(6.17);
    expect(a.rank).toBe(1);
    expect(a.v2!.tieBreak.kind).toBe("none");
  });

  it("진행 중(includeActivity false)에는 기본 점수만으로 순위가 정해지고 overall도 기본 점수다", () => {
    const inputs = [
      { ...input("A", [...T3]), workoutDays: 12 },
      { ...input("B", [...T3]), workoutDays: 11 },
    ];
    const live = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base, includeActivity: false });
    const fin = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base, includeActivity: true });
    for (const r of live) {
      expect(r.overall).toBe(r.v2!.baseScore); // 활동 점수가 점수에 새지 않는다
      expect(r.v2!.activityIncluded).toBe(false);
    }
    // 최종 발표는 같은 기록에 활동 점수(날 12·11점)가 더해진다
    for (const r of fin) {
      expect(r.overall).toBeCloseTo(r.v2!.baseScore + r.v2!.activityScore, 5);
      expect(r.v2!.activityIncluded).toBe(true);
    }
    expect(fin.find((x) => x.userId === "A")!.overall).toBeGreaterThan(live.find((x) => x.userId === "A")!.overall);
  });

  it("진행 중 동점은 날 수 → 횟수 → 시간으로 가른다 (기본 점수가 같을 때)", () => {
    const inputs = [
      { ...input("A", [...T3]), workoutDays: 12 },
      { ...input("B", [...T4]), workoutDays: 11 },
    ];
    const live = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base, includeActivity: false });
    expect(live.find((x) => x.userId === "A")!.rank).toBe(1);
    expect(live.find((x) => x.userId === "B")!.rank).toBe(2);
    expect(live[0].v2!.tieBreak.kind).toBe("days");
  });

  it("기간 밖·명단 밖 세션은 세지 않는다", () => {
    const inputs = [input("A", [...T3])];
    const rows = [row("A", "2026-10-30", 30), row("X", "2026-11-03", 30), row("A", "2026-11-03", 30)];
    const r = rankForChallenge({ scoringVersion: 2, inputs, rows, ...base });
    expect(r[0].v2!.breakdown.workoutSessions).toBe(1);
  });
});
