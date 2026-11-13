import { describe, expect, it } from "vitest";
import { buildParticipantInput, EMPTY_STATS, foldPeriodStats, type MyChallenge, type PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";
import { rankForChallenge } from "./challenge-ranking";
import { calculateWorkoutImpact, forecastWorkout, recommendWorkoutAdditions, type ChallengeScoreSnapshot } from "./challenge-workout-impact";

function goal(type: UserGoal["goal_type"], target = 100, userId = "A", qualifier: number | null = null): UserGoal {
  return { id: `${userId}-${type}`, user_id: userId, challenge_id: "ch", group_id: "g", goal_type: type, target_value: target, planned_days: 1, qualifier, unit: null, created_at: "", updated_at: "" };
}
function exercise(name = "스쿼트", type: "weight" | "cardio" | "bodyweight" = "weight", reps = 10, minutes = 0, km = 0): PeriodSessionRow["exercises"][number] {
  return { exerciseName: name, exerciseType: type, bodyPart: "하체", sets: [{ weightKg: 20, reps, durationSeconds: minutes * 60, distanceMeters: km * 1000, isCompleted: true }] };
}
function row(id: string, ex = [exercise()], userId = "A", date = "2026-11-13"): PeriodSessionRow {
  return { sessionId: id, userId, completedAt: `${date}T03:00:00Z`, durationMinutes: 10, exercises: ex };
}
function snapshot(goals = [goal("weight_reps")], rows: PeriodSessionRow[] = []): ChallengeScoreSnapshot {
  return { challenge: { id: "ch", group_id: "g", name: "test", start_date: "2026-11-13", end_date: "2026-11-19", status: "active", myStatus: "joined", myRole: "member", scoring_version: 2, live_ranking: true } as MyChallenge, goals, rows, participantIds: ["A", "B"], timeZone: "Asia/Seoul" };
}

describe("workout impact: current records with/without a session", () => {
  it("same-day second workout adds reps but never another participation day", () => {
    const s = snapshot([goal("weight_reps"), goal("workout_days", 7)], [row("first"), row("second")]);
    const r = calculateWorkoutImpact(s, "A", "second")!;
    expect(r.beforeScore).toBe(29.71);
    expect(r.afterScore).toBe(33.71);
    expect(r.delta).toBe(4);
    expect(r.goalChanges.find((g) => g.type === "workout_days")?.delta).toBe(0);
  });
  it("a qualifier is crossed by distinct exercises across sessions on the same day", () => {
    const s = snapshot([goal("weight_days", 1, "A", 2)], [row("first"), row("second", [exercise("런지")])]);
    const r = calculateWorkoutImpact(s, "A", "second")!;
    expect(r.goalChanges[0]).toMatchObject({ before: 0, after: 1, delta: 1 });
    expect(r.delta).toBe(83);
  });
  it("includes completion bonus and caps achievement past the goal", () => {
    const s = snapshot([goal("weight_reps", 20)], [row("first", [exercise("스쿼트", "weight", 19)]), row("second", [exercise("스쿼트", "weight", 10)])]);
    expect(calculateWorkoutImpact(s, "A", "second")).toMatchObject({ beforeScore: 96, afterScore: 103, delta: 7 });
    s.rows.push(row("third"));
    expect(calculateWorkoutImpact(s, "A", "third")?.delta).toBe(0);
    expect(calculateWorkoutImpact(s, "A", "third")?.reason).toBeTruthy();
  });
  it.each([1, 2])("uses the same scoring entry point for v%s", (version) => {
    const s = snapshot([goal("weight_reps", 73)], [row("first"), row("second")]);
    s.challenge.scoring_version = version;
    const stats = foldPeriodStats(s.rows, s.challenge.start_date, s.challenge.end_date, s.timeZone);
    const ranking = rankForChallenge({ scoringVersion: version, inputs: s.participantIds.map((userId) => buildParticipantInput({ userId, goals: s.goals.filter((g) => g.user_id === userId), stats: stats.get(userId) ?? EMPTY_STATS, periodDays: 7 })), rows: s.rows, startDate: s.challenge.start_date, endDate: s.challenge.end_date, timeZone: s.timeZone });
    expect(calculateWorkoutImpact(s, "A", "second")?.afterScore).toBe(Number(ranking.find((r) => r.userId === "A")!.overall.toFixed(2)));
  });
  it("re-ranks a v2 tie even when basic score stays the same", () => {
    const s = snapshot([goal("workout_days", 1), goal("workout_days", 1, "B")], [row("a"), row("b", [], "B"), row("second")]);
    const result = calculateWorkoutImpact(s, "A", "second")!;
    expect(result.delta).toBe(0);
    expect(result.beforeRank).toBe(1);
    expect(result.afterRank).toBe(1);
    expect(result.tieReason).toBeTruthy();
    s.rows[0].durationMinutes = 5;
    expect(calculateWorkoutImpact(s, "A", "second")).toMatchObject({ beforeRank: 2, afterRank: 1, delta: 0 });
  });
  it("uses cycle time and excludes cycle distance from Nov 3 starts", () => {
    const s = snapshot([goal("cycle_time", 40), goal("cardio_distance", 20)], [row("cycle", [exercise("사이클", "cardio", 0, 20, 10)])]);
    const changes = calculateWorkoutImpact(s, "A", "cycle")!.goalChanges;
    expect(changes.find((g) => g.type === "cycle_time")?.delta).toBe(20);
    expect(changes.find((g) => g.type === "cardio_distance")?.delta).toBe(0);
    s.challenge.start_date = "2026-11-02";
    expect(calculateWorkoutImpact(s, "A", "cycle")!.goalChanges.find((g) => g.type === "cardio_distance")?.delta).toBe(10);
  });
  it("does not invent a missing/photo-excluded session or show hidden rankings", () => {
    const s = snapshot([goal("weight_reps")], [row("real")]);
    expect(calculateWorkoutImpact(s, "A", "photo-excluded")).toBeNull();
    expect(calculateWorkoutImpact(s, "B", "real")).toBeNull();
    s.rows[0].completedAt = "2026-11-12T03:00:00Z";
    expect(calculateWorkoutImpact(s, "A", "real")).toBeNull();
    s.rows[0] = row("real");
    s.challenge.live_ranking = false;
    expect(calculateWorkoutImpact(s, "A", "real")).toBeNull();
    expect(forecastWorkout(s, "A", row("plan"))).toBeNull();
    expect(recommendWorkoutAdditions(s, "A", row("plan"))).toEqual([]);
    s.challenge.live_ranking = true;
    s.challenge.myStatus = "invited";
    expect(calculateWorkoutImpact(s, "A", "real")).toBeNull();
    s.challenge.myStatus = "joined";
    s.challenge.status = "ended";
    expect(calculateWorkoutImpact(s, "A", "real")).toBeNull();
    s.challenge.status = "active";
    s.goals = [];
    expect(calculateWorkoutImpact(s, "A", "real")).toBeNull();
  });
});

describe("plan forecast and bounded additions", () => {
  it("does not reuse interval-round repetitions but preserves regular exercises after the interval block", () => {
    const recent = row("interval", [
      exercise("인터벌 스쿼트", "bodyweight", 4), exercise("인터벌 푸시업", "bodyweight", 4),
      exercise("인터벌 런지", "bodyweight", 4), exercise("인터벌 점프", "bodyweight", 4),
      exercise("일반 스쿼트", "weight", 8),
    ]);
    recent.tabataMinutes = 8;
    const s = snapshot([goal("bodyweight_reps", 1000), goal("weight_reps", 1000)], [recent]);
    const names = recommendWorkoutAdditions(s, "A", row("plan", [exercise("플랭크", "bodyweight", 0, 1)])).map((r) => r.exercise.name);
    expect(names).toEqual(["일반 스쿼트"]);
  });
  it("appends a suggestion once when the plan has duplicate exercise names, matching the UI", () => {
    const s = snapshot([goal("weight_reps", 100)]);
    const plan = row("plan", [exercise(), exercise()]);
    const suggestion = recommendWorkoutAdditions(s, "A", plan)[0];
    const extra = suggestion.exercise.sets[0];
    const applied = structuredClone(plan);
    applied.exercises[0].sets.push({ weightKg: extra.weightKg, reps: extra.reps, durationSeconds: extra.durationMin * 60, distanceMeters: extra.distanceKm * 1000, isCompleted: true });
    const difference = Math.round((forecastWorkout(s, "A", applied)!.afterScore - forecastWorkout(s, "A", plan)!.afterScore) * 100) / 100;
    expect(suggestion.extraPoints).toBe(difference);
    expect(suggestion.extraPoints).toBe(8);
  });
  it("marks all planned sets complete, ignores colliding session ids, and adds extra points beyond the plan", () => {
    const s = snapshot([goal("weight_reps", 25)], [row("existing")]);
    const plan = row("existing");
    plan.exercises[0].sets[0].isCompleted = false;
    const forecast = forecastWorkout(s, "A", plan)!;
    expect(forecast).toMatchObject({ beforeScore: 52, afterScore: 84, delta: 32 });
    const suggestions = recommendWorkoutAdditions(s, "A", plan);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ afterScore: 103, extraPoints: 19 });
    expect(suggestions[0].exercise.sets[0]).toMatchObject({ reps: 5, weightKg: 20 });
  });
  it("prefers planned exercises, can reuse own recent exercises, and returns at most two", () => {
    const s = snapshot([goal("weight_reps", 1000)], [row("recent", [exercise("벤치"), exercise("로우"), exercise("런지")]), row("other", [exercise("남의 운동")], "B")]);
    const suggestions = recommendWorkoutAdditions(s, "A", row("plan"));
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].exercise.name).toBe("스쿼트");
    expect(suggestions.every((r) => r.exercise.name !== "남의 운동")).toBe(true);
    expect(suggestions.every((r) => r.exercise.sets[0].reps <= 10 && r.extraPoints > 0)).toBe(true);
  });
  it("bounds time and distance additions to 25% of familiar doses and absolute caps", () => {
    const time = snapshot([goal("cycle_time", 1000)]);
    const timeSuggestion = recommendWorkoutAdditions(time, "A", row("plan", [exercise("사이클", "cardio", 0, 20)]))[0];
    expect(timeSuggestion.exercise.sets[0].durationMin).toBeLessThanOrEqual(5);
    const distance = snapshot([goal("cardio_distance", 100)]);
    const distanceSuggestion = recommendWorkoutAdditions(distance, "A", row("plan", [exercise("러닝", "cardio", 0, 0, 8)]))[0];
    expect(distanceSuggestion.exercise.sets[0].distanceKm).toBeLessThanOrEqual(1);
    const short = recommendWorkoutAdditions(distance, "A", row("plan", [exercise("걷기", "cardio", 0, 0, 2)]))[0];
    expect(short.exercise.sets[0].distanceKm).toBeLessThanOrEqual(0.5);
    const long = recommendWorkoutAdditions(time, "A", row("plan", [exercise("사이클", "cardio", 0, 120)]))[0];
    expect(long.exercise.sets[0].durationMin).toBeLessThanOrEqual(10);
    const reps = recommendWorkoutAdditions(snapshot([goal("weight_reps", 1000)]), "A", row("plan", [exercise("스쿼트", "weight", 6)]))[0];
    expect(reps.exercise.sets[0].reps).toBeLessThanOrEqual(6);
  });
  it("uses a smaller precise addition when it completes the goal and preserves its bonus", () => {
    const s = snapshot([goal("cardio_distance", 8.1)]);
    const result = recommendWorkoutAdditions(s, "A", row("plan", [exercise("러닝", "cardio", 0, 0, 8)]))[0];
    expect(result.exercise.sets[0].distanceKm).toBe(0.1);
    expect(result.afterScore).toBe(103);
    expect(result.extraPoints).toBe(3.99);
  });
  it("never adds a fake day or distinct exercise by splitting the same name", () => {
    const s = snapshot([goal("weight_days", 1, "A", 2)], [row("recent")]);
    expect(recommendWorkoutAdditions(s, "A", row("plan"))).toEqual([]);
    const days = snapshot([goal("workout_days", 7)], [row("recent")]);
    expect(recommendWorkoutAdditions(days, "A", row("plan"))).toEqual([]);
  });
  it("uses the plan date, excludes recent records after it, and never mutates inputs", () => {
    const s = snapshot([goal("weight_reps")], [row("recent", [exercise("지난 운동")])]);
    const plan = row("plan");
    plan.completedAt = "2026-11-14T03:00:00Z";
    const before = JSON.stringify({ s, plan });
    const first = forecastWorkout(s, "A", plan);
    expect(forecastWorkout(s, "A", plan)).toEqual(first);
    expect(recommendWorkoutAdditions(s, "A", plan)).toEqual(recommendWorkoutAdditions(s, "A", plan));
    expect(JSON.stringify({ s, plan })).toBe(before);
    plan.completedAt = "2026-11-20T03:00:00Z";
    expect(forecastWorkout(s, "A", plan)).toBeNull();
  });
  it("does not recommend somebody else's, future, or period-excluded exercise", () => {
    const s = snapshot([goal("weight_reps", 1000)], [
      row("future", [exercise("미래 운동")], "A", "2026-11-15"),
      row("old", [exercise("기간 밖 운동")], "A", "2026-11-12"),
      row("other", [exercise("남의 운동")], "B"),
    ]);
    expect(recommendWorkoutAdditions(s, "A", row("plan")).map((r) => r.exercise.name)).toEqual(["스쿼트"]);
  });
  it("rejects a mismatched owner and empty or invalid prescriptions rather than fabricating a day", () => {
    const s = snapshot();
    expect(forecastWorkout(s, "A", row("plan", [exercise()], "B"))).toBeNull();
    const empty = row("plan", [exercise("스쿼트", "weight", 0)]);
    expect(forecastWorkout(s, "A", empty)).toBeNull();
    empty.exercises[0].sets[0].reps = Number.NaN;
    expect(forecastWorkout(s, "A", empty)).toBeNull();
    s.participantIds = ["B"];
    expect(forecastWorkout(s, "A", row("plan"))).toBeNull();
  });
});
