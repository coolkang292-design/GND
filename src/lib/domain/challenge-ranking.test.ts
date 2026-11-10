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

const base = { startDate: "2026-11-01", endDate: "2026-11-28", timeZone: "Asia/Seoul" } as const;
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
      expect(r.overall).toBeCloseTo(same.overall, 1);
      expect(r.achievement).toBeCloseTo(same.achievement, 9);
    }
  });

  it("v2 동점: 목표 수가 많은 쪽이 앞선다 (v1은 같은 입력에서 목표 수를 안 본다)", () => {
    const inputs = [input("A", [...T3]), input("B", [...T4])];
    const r = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base });
    expect(r.find((x) => x.userId === "B")!.rank).toBe(1);
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
    // 시간은 건너뛰고 횟수(2 > 1)로 A가 앞선다. 시간만 봤다면 A(60)도 앞서지만 이유가 다르다
    expect(a.rank).toBe(1);
    expect(a.v2!.tieBreak.kind).toBe("sessions");
    expect(a.v2!.tieBreak.minutesSkipped).toBe(true);
  });

  it("기간 밖·명단 밖 세션은 세지 않는다", () => {
    const inputs = [input("A", [...T3])];
    const rows = [row("A", "2026-10-30", 30), row("X", "2026-11-03", 30), row("A", "2026-11-03", 30)];
    const r = rankForChallenge({ scoringVersion: 2, inputs, rows, ...base });
    expect(r[0].v2!.breakdown.workoutSessions).toBe(1);
  });
});
