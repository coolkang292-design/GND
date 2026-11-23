import { describe, expect, it } from "vitest";
import { buildParticipantInput, EMPTY_STATS, foldPeriodStats, type MyChallenge, type PeriodSessionRow } from "@/lib/challenge";
import type { UserGoal } from "@/lib/types";
import { rankForChallenge } from "./challenge-ranking";
import { calculateWorkoutImpact, forecastWorkout, recommendWorkoutAdditions, winGuidance, type ChallengeScoreSnapshot } from "./challenge-workout-impact";
import { ACTIVITY_RULE_TEXT, TIE_BREAK_RULE_TEXT } from "./goal-score-v2";

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
    // 기본 점수는 v1·v2가 같은 자다. v2의 `overall`은 총점(기본 + 활동)이라 기본 점수는 `v2.baseScore`에서 읽는다
    const mine = ranking.find((r) => r.userId === "A")!;
    expect(calculateWorkoutImpact(s, "A", "second")?.afterScore).toBe(Number((mine.v2 ? mine.v2.baseScore : mine.overall).toFixed(2)));
  });
  it("기본 + 활동 = 총점 증가분이고, 활동 몫(날·횟수·시간)의 합이 활동 점수와 같다 (센트 단위로 어긋나지 않는다)", () => {
    const s = snapshot([goal("weight_reps", 73)], [row("first"), row("second")]);
    for (const id of ["first", "second"]) {
      const r = calculateWorkoutImpact(s, "A", id)!;
      const c = (n: number) => Math.round(n * 100);
      expect(c(r.delta) + c(r.activityDelta)).toBe(c(r.totalDelta));
      expect(c(r.activityParts.days) + c(r.activityParts.sessions) + c(r.activityParts.minutes)).toBe(c(r.activityDelta));
    }
  });
  it("활동 점수가 오르면 기본 점수가 그대로여도 순위가 바뀐다 — 동점 탓으로 말하지 않는다", () => {
    const s = snapshot([goal("workout_days", 1), goal("workout_days", 1, "B")], [row("a"), row("b", [], "B"), row("second")]);
    const result = calculateWorkoutImpact(s, "A", "second")!;
    expect(result.delta).toBe(0); // 기본 점수는 만점에서 멈춘다
    expect(result.activityDelta).toBe(1.16); // 운동 1회(1점) + 시간 10분→20분(0.17→0.33점)
    expect(result.totalDelta).toBe(1.16);
    expect(result.afterTotal).toBeGreaterThan(result.beforeTotal);
    expect(result.beforeRank).toBe(1); // 처음엔 B와 같은 총점이라 공동 1위
    expect(result.afterRank).toBe(1);
    expect(result.tieReason).toBeNull(); // 이제 총점이 달라 동점이 아니다
    s.rows[0].durationMinutes = 5;
    expect(calculateWorkoutImpact(s, "A", "second")).toMatchObject({ beforeRank: 2, afterRank: 1, delta: 0 });
  });
  it("총점이 같아지는 순간 동점 사유를 알려준다", () => {
    // B는 같은 날 두 번, A는 한 번 → 운동 하나를 더하면 총점이 같아져 공동 순위가 된다
    const s = snapshot([goal("workout_days", 1), goal("workout_days", 1, "B")], [row("a"), row("b1", [], "B"), row("b2", [], "B"), row("second")]);
    const result = calculateWorkoutImpact(s, "A", "second")!;
    expect(result.delta).toBe(0);
    expect(result.beforeRank).toBe(2);
    expect(result.afterRank).toBe(1);
    expect(result.tieReason).toBeTruthy();
  });
  it("uses cycle time and excludes cycle distance from Nov 3 starts", () => {
    const s = snapshot([goal("cycle_time", 40), goal("cardio_distance", 20)], [row("cycle", [exercise("싸이클", "cardio", 0, 20, 10)])]);
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
    const timeSuggestion = recommendWorkoutAdditions(time, "A", row("plan", [exercise("싸이클", "cardio", 0, 20)]))[0];
    expect(timeSuggestion.exercise.sets[0].durationMin).toBeLessThanOrEqual(5);
    const distance = snapshot([goal("cardio_distance", 100)]);
    const distanceSuggestion = recommendWorkoutAdditions(distance, "A", row("plan", [exercise("러닝", "cardio", 0, 0, 8)]))[0];
    expect(distanceSuggestion.exercise.sets[0].distanceKm).toBeLessThanOrEqual(1);
    const short = recommendWorkoutAdditions(distance, "A", row("plan", [exercise("걷기", "cardio", 0, 0, 2)]))[0];
    expect(short.exercise.sets[0].distanceKm).toBeLessThanOrEqual(0.5);
    const long = recommendWorkoutAdditions(time, "A", row("plan", [exercise("싸이클", "cardio", 0, 120)]))[0];
    expect(long.exercise.sets[0].durationMin).toBeLessThanOrEqual(10);
    const reps = recommendWorkoutAdditions(snapshot([goal("weight_reps", 1000)]), "A", row("plan", [exercise("스쿼트", "weight", 6)]))[0];
    expect(reps.exercise.sets[0].reps).toBeLessThanOrEqual(6);
  });
  it("유산소 제안은 기존 값에 더해지는 문구로 보여 주고, 웨이트는 기존 문구를 유지한다", () => {
    const time = snapshot([goal("cycle_time", 1000)]);
    const cardio = recommendWorkoutAdditions(time, "A", row("plan", [exercise("싸이클", "cardio", 0, 40)]))[0];
    const added = cardio.exercise.sets[0].durationMin;
    expect(cardio.label).toBe(`싸이클 +${added}분 (40분 → ${Math.round((40 + added) * 100) / 100}분)`);
    const weight = recommendWorkoutAdditions(snapshot([goal("weight_reps", 1000)]), "A", row("plan", [exercise("스쿼트", "weight", 6)]))[0];
    expect(weight.label).toBe(`스쿼트 ${weight.exercise.sets[0].reps}회 추가`);
  });
  it("유산소 제안의 예상 점수는 합쳐 담은 계획의 예상 점수와 같다 (시뮬레이션 = 실제 적용)", () => {
    const s = snapshot([goal("cycle_time", 60)]);
    const plan = row("plan", [exercise("싸이클", "cardio", 0, 50)]);
    const suggestion = recommendWorkoutAdditions(s, "A", plan)[0];
    const added = suggestion.exercise.sets[0].durationMin;
    const merged = row("plan", [exercise("싸이클", "cardio", 0, 50 + added)]);
    const forecast = forecastWorkout(s, "A", merged);
    expect(forecast?.afterScore).toBe(suggestion.afterScore);
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

describe("winGuidance: 목표를 모두 채운 뒤 우승 안내", () => {
  const mins = (r: PeriodSessionRow, minutes: number | null): PeriodSessionRow => ({ ...r, durationMinutes: minutes });
  const day = (id: string, user: string, date: string, minutes: number | null = 10) =>
    mins(row(id, [exercise()], user, date), minutes);
  /** 둘 다 "운동한 날 1일" 목표(계획일 1)를 채운 상태 — 기본 점수는 같고 활동 점수로 갈린다 */
  const both = (rows: PeriodSessionRow[]) => snapshot([goal("workout_days", 1), goal("workout_days", 1, "B")], rows);

  it("목표가 남아 있으면 안내하지 않는다 (추가 점수 안내가 맡는다)", () => {
    expect(winGuidance(snapshot([goal("weight_reps", 100)], [row("a")]), "A")).toBeNull();
  });
  it("참여율이 아직 100%가 아니면 안내하지 않는다 — 운동일을 더하면 기본 점수가 오른다", () => {
    const s = snapshot([{ ...goal("workout_days", 1), planned_days: 5 }], [row("a")]);
    expect(winGuidance(s, "A")).toBeNull();
  });
  it("v1 챌린지·실시간 랭킹을 끈 방은 안내하지 않는다", () => {
    const s = both([day("a", "A", "2026-11-13"), day("b", "B", "2026-11-13")]);
    s.challenge.scoring_version = 1;
    expect(winGuidance(s, "A")).toBeNull();
    s.challenge.scoring_version = 2;
    s.challenge.live_ranking = false;
    expect(winGuidance(s, "A")).toBeNull();
  });
  it("규칙 문구는 환산 비율과 동점 규칙 상수에서 온다", () => {
    const g = winGuidance(both([day("a", "A", "2026-11-13"), day("b", "B", "2026-11-13")]), "A")!;
    expect(g.rule).toContain(TIE_BREAK_RULE_TEXT);
    expect(g.rule).toContain(ACTIVITY_RULE_TEXT);
  });
  it("비교할 참가자가 없으면 그렇다고 말한다", () => {
    const s = both([day("a", "A", "2026-11-13")]);
    s.participantIds = ["A"];
    const g = winGuidance(s, "A")!;
    expect(g.standing).toContain("비교할 참가자가 없어요");
    expect(g.action).toContain("활동 점수가 계속 올라요");
  });
  it("1위면 점수 차이와 지키는 법을 말한다", () => {
    const rows = [day("a1", "A", "2026-11-13"), day("a2", "A", "2026-11-14"), day("b", "B", "2026-11-13")];
    const g = winGuidance(both(rows), "A")!;
    expect(g.standing).toContain("1위예요");
    expect(g.standing).toContain("2.16점 차이로 앞서 있어요"); // A 4.33점 − B 2.17점
    expect(g.action).toContain("지키려면");
    expect(g.action).toContain("약 3점"); // 새로운 날에 60분 = 1일 + 1회 + 60분
  });
  it("뒤지면 앞서기 위해 몇 점이 더 필요한지 말한다", () => {
    const rows = [day("a", "A", "2026-11-13"), day("b1", "B", "2026-11-13"), day("b2", "B", "2026-11-14")];
    const g = winGuidance(both(rows), "A")!;
    expect(g.standing).toContain("2위예요");
    expect(g.standing).toContain("2.16점 앞서요");
    expect(g.action).toContain("2.17점 이상");
  });
  it("총점이 같으면 운동한 날 수로 가른다 — 뒤지면 며칠이 더 필요한지", () => {
    // A: 2일·2회·10분, B: 1일·3회·10분 → 둘 다 4.17점
    const rows = [day("a1", "A", "2026-11-13", 5), day("a2", "A", "2026-11-14", 5), day("b1", "B", "2026-11-13", 3), day("b2", "B", "2026-11-13", 3), day("b3", "B", "2026-11-13", 4)];
    const ahead = winGuidance(both(rows), "A")!;
    expect(ahead.standing).toContain("총점이 같은 참가자 1명 중 앞서 있어요");
    expect(ahead.standing).toContain("운동한 날 수");
    const behind = winGuidance(both(rows), "B")!;
    expect(behind.standing).toContain("운동한 날 수에서 먼저 앞서요");
    expect(behind.action).toContain("2일");
  });
  it("날 수가 같으면 운동 횟수로 가른다", () => {
    // A: 1일·2회·10분(3.17점), B: 1일·1회·70분(1+1+1.17 = 3.17점)
    const rows = [day("a1", "A", "2026-11-13", 5), day("a2", "A", "2026-11-13", 5), day("b", "B", "2026-11-13", 70)];
    const behind = winGuidance(both(rows), "B")!;
    expect(behind.standing).toContain("운동 횟수에서 먼저 앞서요");
    expect(behind.action).toContain("2회");
  });
  it("날·횟수가 같고 시간이 0.01점 안쪽으로만 다르면 운동 시간으로 가른다", () => {
    const rows = [day("a", "A", "2026-11-13", 10), day("b", "B", "2026-11-13", 10.2)];
    const g = winGuidance(both(rows), "B")!;
    expect(g.standing).toContain("앞서 있어요 (운동 시간 기준)");
  });
  it("계획을 넣으면 그 계획을 마친 뒤의 순위로 안내한다", () => {
    const rows = [day("a", "A", "2026-11-13", 10), day("b1", "B", "2026-11-13", 10), day("b2", "B", "2026-11-13", 10)];
    const before = winGuidance(both(rows), "A")!;
    expect(before.standing).toContain("2위예요");
    const plan = day("plan", "A", "2026-11-14", 60);
    const after = winGuidance(both(rows), "A", plan)!;
    expect(after.standing).toContain("이 계획을 마치면");
    expect(after.standing).toContain("1위예요");
  });
  it("모든 기준이 같으면 공동 순위라고 말한다", () => {
    const g = winGuidance(both([day("a", "A", "2026-11-13"), day("b", "B", "2026-11-13")]), "A")!;
    expect(g.standing).toContain("공동 순위");
  });
  it("일부 시간 기록이 비면 시간은 비교하지 않는다고 알린다", () => {
    const g = winGuidance(both([day("a", "A", "2026-11-13", null), day("b", "B", "2026-11-13", null)]), "A")!;
    expect(g.standing).toContain("운동 시간은 비교하지 않아요");
    expect(g.standing).toContain("공동 순위");
  });
});
