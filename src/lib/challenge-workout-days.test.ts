/**
 * 범용 목표 `workout_days`(운동한 날) — 0108 (2026-09-18).
 *
 * "주 3회"만 고른 사람도 챌린지에 **완전한 참가자**가 되어야 한다. 그러려면
 * 목표 행이 하나는 있어야 하고(`start_challenge`·`autostart_due_challenges`가
 * 목표 0개를 막거나 뺀다), 그 행의 실적은 **종목과 무관하게** 운동한 날 수여야 한다.
 *
 * ⚠️ 실적을 새로 세지 않는다 — 참여율 분자와 같은 `PeriodStats.workoutDays`다.
 *    사진 인증 필터는 서버(`get_challenge_period_sessions`)가 이미 건다.
 */
import { describe, expect, it } from "vitest";
import {
  GOAL_TYPE_META,
  actualForGoal,
  buildParticipantInput,
  countsTowardChallenge,
  foldPeriodStats,
  goalCategories,
  goalLabel,
  sessionGoalContribution,
  type PeriodSessionRow,
} from "@/lib/challenge";
import {
  plannedDaysForPeriod,
  rankParticipants,
  scoreParticipant,
} from "@/lib/domain/goal-score";
import type { UserGoal } from "@/lib/types";

const KST = "Asia/Seoul";

const set = (over: Partial<PeriodSessionRow["exercises"][number]["sets"][number]>) => ({
  weightKg: null,
  reps: null,
  distanceMeters: null,
  durationSeconds: null,
  isCompleted: true,
  ...over,
});

/** KST 날짜 하루 정오의 ISO 시각 */
const noonKst = (day: string) => `${day}T03:00:00Z`;

const weightSession = (day: string, userId = "u1"): PeriodSessionRow => ({
  userId,
  completedAt: noonKst(day),
  exercises: [
    {
      exerciseType: "weight",
      exerciseName: "벤치프레스",
      bodyPart: "가슴",
      sets: [set({ weightKg: 60, reps: 10 })],
    },
  ],
});

const cardioSession = (day: string, userId = "u1"): PeriodSessionRow => ({
  userId,
  completedAt: noonKst(day),
  exercises: [
    {
      exerciseType: "cardio",
      exerciseName: "러닝",
      bodyPart: "유산소",
      sets: [set({ distanceMeters: 5000, durationSeconds: 1800 })],
    },
  ],
});

const bodyweightSession = (day: string, userId = "u1"): PeriodSessionRow => ({
  userId,
  completedAt: noonKst(day),
  exercises: [
    {
      exerciseType: "bodyweight",
      exerciseName: "푸시업",
      bodyPart: "가슴",
      sets: [set({ reps: 20 })],
    },
  ],
});

function goalRow(over: Partial<UserGoal>): UserGoal {
  return {
    id: "g1",
    user_id: "u1",
    challenge_id: "c1",
    group_id: "grp",
    goal_type: "workout_days",
    target_value: 12,
    unit: "일",
    planned_days: 3,
    qualifier: null,
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T00:00:00Z",
    ...over,
  };
}

describe("workout_days — 메타·라벨", () => {
  it("화면 이름은 '운동한 날', 단위는 '일'이다", () => {
    expect(GOAL_TYPE_META.workout_days.unit).toBe("일");
    expect(goalLabel("workout_days")).toBe("운동한 날");
  });

  it("종목 조건(하루 N종목+)을 붙이지 않는다 — 종목 수와 무관한 목표다", () => {
    expect(goalLabel("workout_days", 3)).toBe("운동한 날");
  });
});

describe("workout_days — 집계는 종목을 가리지 않는다", () => {
  const rows = [
    weightSession("2026-09-21"), // 웨이트만 한 날
    cardioSession("2026-09-22"), // 유산소만 한 날
    bodyweightSession("2026-09-23"), // 맨몸만 한 날
    weightSession("2026-09-24"),
    cardioSession("2026-09-24"), // 같은 날 두 번 — 1일
    bodyweightSession("2026-09-24"), // 같은 날 세 번째 — 여전히 1일
  ];
  const stats = foldPeriodStats(rows, "2026-09-21", "2026-10-18", KST).get("u1")!;

  it("웨이트·유산소·맨몸 완료일을 모두 인정하고, 같은 날 여러 세션은 1일로 센다", () => {
    expect(actualForGoal(stats, "workout_days")).toBe(4);
  });

  it("참여율 분자(workoutDays)와 같은 값이다 — 두 벌로 세지 않는다", () => {
    expect(actualForGoal(stats, "workout_days")).toBe(stats.workoutDays);
  });

  it("같은 기록으로 weight_days는 웨이트 한 날만 센다 — 위장 저장하면 안 되는 이유", () => {
    // `주 3회`를 weight_days로 저장했다면 유산소·맨몸만 한 날이 0일로 잡힌다
    expect(actualForGoal(stats, "weight_days", 1)).toBe(2);
    expect(actualForGoal(stats, "workout_days")).toBe(4);
  });

  it("기간 밖 운동은 세지 않는다", () => {
    const s = foldPeriodStats(
      [weightSession("2026-09-20"), cardioSession("2026-09-21")],
      "2026-09-21",
      "2026-10-18",
      KST,
    ).get("u1")!;
    expect(actualForGoal(s, "workout_days")).toBe(1);
  });
});

describe("workout_days — 기록 화면 경고를 끈다 (goalCategories)", () => {
  it("workout_days가 있으면 세 분류 모두 챌린지에 잡힌다", () => {
    const cats = goalCategories([{ goal_type: "workout_days" }]);
    expect(countsTowardChallenge("weight", cats)).toBe(true);
    expect(countsTowardChallenge("cardio", cats)).toBe(true);
    expect(countsTowardChallenge("bodyweight", cats)).toBe(true);
  });

  it("세부 목표와 섞여 있어도 특정 분류로 좁히지 않는다", () => {
    const cats = goalCategories([
      { goal_type: "workout_days" },
      { goal_type: "cardio_distance" },
    ]);
    expect([...cats].sort()).toEqual(["bodyweight", "cardio", "weight"]);
  });

  it("workout_days가 없으면 예전처럼 좁힌다 (기존 동작 불변)", () => {
    const cats = goalCategories([{ goal_type: "cardio_distance" }]);
    expect(countsTowardChallenge("weight", cats)).toBe(false);
  });
});

describe("workout_days — 목표 한 줄만으로 완전한 참가자", () => {
  const periodDays = 28; // 4주
  const target = plannedDaysForPeriod(3, periodDays);

  it("4주 × 주 3회의 목표값은 계획일수 계산값(12일)이다", () => {
    expect(target).toBe(12);
  });

  it("점수를 계산한다 — 12일 모두 채우면 달성·참여 100%에 완료 보너스", () => {
    const days = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 21 + i * 2));
      return d.toISOString().slice(0, 10);
    });
    const stats = foldPeriodStats(
      days.map((d, i) => (i % 3 === 0 ? weightSession(d) : i % 3 === 1 ? cardioSession(d) : bodyweightSession(d))),
      "2026-09-21",
      "2026-10-18",
      KST,
    ).get("u1")!;
    const input = buildParticipantInput({
      userId: "u1",
      goals: [goalRow({ target_value: target })],
      stats,
      periodDays,
    });
    const score = scoreParticipant(input);
    expect(score.achievement).toBe(100);
    expect(score.participation).toBe(100);
    expect(score.completedGoalCount).toBe(1);
    expect(score.overall).toBe(103);
  });

  it("절반만 채우면 달성률과 참여율이 같이 50%다 — 기본 목표는 곧 '주 N회 지킨 비율'", () => {
    const stats = foldPeriodStats(
      ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"].map((d) =>
        cardioSession(d),
      ),
      "2026-09-21",
      "2026-10-18",
      KST,
    ).get("u1")!;
    const score = scoreParticipant(
      buildParticipantInput({
        userId: "u1",
        goals: [goalRow({ target_value: target })],
        stats,
        periodDays,
      }),
    );
    expect(score.achievement).toBe(50);
    expect(score.participation).toBe(50);
    expect(score.overall).toBe(50);
  });

  it("세부 목표와 함께 채점된다 — workout_days + cardio_distance", () => {
    const stats = foldPeriodStats(
      ["2026-09-21", "2026-09-22", "2026-09-23"].map((d) => cardioSession(d)),
      "2026-09-21",
      "2026-10-18",
      KST,
    ).get("u1")!;
    const input = buildParticipantInput({
      userId: "u1",
      goals: [
        goalRow({ target_value: target }),
        goalRow({ id: "g2", goal_type: "cardio_distance", target_value: 30, unit: "km" }),
      ],
      stats,
      periodDays,
    });
    expect(input.goals).toEqual([
      { type: "workout_days", target: 12, actual: 3 },
      { type: "cardio_distance", target: 30, actual: 15 },
    ]);
    // (3/12 = 25% + 15/30 = 50%) / 2 = 37.5
    expect(scoreParticipant(input).achievement).toBe(37.5);
  });

  it("순위표에서도 다른 참가자와 같이 정렬된다", () => {
    const stats = foldPeriodStats(
      [cardioSession("2026-09-21"), weightSession("2026-09-22", "u2")],
      "2026-09-21",
      "2026-10-18",
      KST,
    );
    const ranked = rankParticipants([
      buildParticipantInput({
        userId: "u1",
        goals: [goalRow({ target_value: 12 })],
        stats: stats.get("u1")!,
        periodDays,
      }),
      buildParticipantInput({
        userId: "u2",
        goals: [goalRow({ user_id: "u2", target_value: 4, planned_days: 1 })],
        stats: stats.get("u2")!,
        periodDays,
      }),
    ]);
    // u2는 1/4 = 25%, u1은 1/12 ≈ 8.3% — 자기 목표 대비 비율로 겨룬다
    expect(ranked.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });
});

describe("workout_days — 완료 화면의 기여 (sessionGoalContribution)", () => {
  it("어떤 운동이든 '+1일'이 쌓인다", () => {
    for (const session of [
      weightSession("2026-09-21"),
      cardioSession("2026-09-21"),
      bodyweightSession("2026-09-21"),
    ]) {
      const [c] = sessionGoalContribution({
        session,
        goals: [{ goal_type: "workout_days", target_value: 12 }],
        timeZone: KST,
      });
      expect(c).toEqual({
        type: "workout_days",
        label: "운동한 날",
        delta: 1,
        unit: "일",
        target: 12,
      });
    }
  });
});
