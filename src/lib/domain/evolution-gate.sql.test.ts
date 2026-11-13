/** 임시 로컬 PGlite를 지정한 경우만 실행. 운영 DB에 연결하지 않는다. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { computeEvolutionGrowthScore, computeStageGrowth, toMetricPoints, type MetricPoint, type RawSession } from "./level-growth";

describe.skipIf(!process.env.GND_PGLITE_MODULE)("SQL·TS 독립 계산 대조", () => {
  it("중량·반복·시간·유산소·인터벌/누락 제외의 원본 변환과 최종 점수가 일치", async () => {
    const { PGlite } = createRequire(import.meta.url)(process.env.GND_PGLITE_MODULE as string);
    const db = await PGlite.create();
    try {
      await db.exec(readFileSync("scripts/fixtures/evolution-gate-schema.sql", "utf8"));
      await db.exec(readFileSync("supabase/migrations/0133_stage_evolution_foundation.sql", "utf8"));
      const uid = "00000000-0000-4000-8000-000000000001";
      await db.query("insert into auth.users values ($1)", [uid]);
      const sessions: RawSession[] = [];
      for (let stage = 0; stage < 2; stage++) {
        const s: RawSession = { completed_at: `2026-${stage ? "11" : "10"}-10T23:30:00Z`, tabata_minutes: null,
          workout_exercises: [
            { exercise_name: "벤치", exercise_type: "weight", sort_order: 0, workout_sets: [
              { weight_kg: stage ? 55 : 50, reps: 10, duration_seconds: null, is_completed: true },
              { weight_kg: 300, reps: 31, duration_seconds: null, is_completed: true },
              { weight_kg: 100, reps: 10, duration_seconds: null, is_completed: false }] },
            { exercise_name: "맨몸", exercise_type: "bodyweight", sort_order: 1, workout_sets: [
              { weight_kg: null, reps: stage ? 12 : 10, duration_seconds: null, is_completed: true }] },
            { exercise_name: "플랭크", exercise_type: "time", sort_order: 2, workout_sets: [
              { weight_kg: null, reps: null, duration_seconds: stage ? 66 : 60, is_completed: true }] },
            { exercise_name: "사이클", exercise_type: "cardio", sort_order: 3, workout_sets: [
              { weight_kg: null, reps: null, duration_seconds: stage ? 1980 : 1800, distance_meters: stage ? 9900 : 9000, is_completed: true }] },
            { exercise_name: "누락유산소", exercise_type: "cardio", sort_order: 4, workout_sets: [
              { weight_kg: null, reps: null, duration_seconds: 1800, distance_meters: 5000, is_completed: true },
              { weight_kg: null, reps: null, duration_seconds: 1800, distance_meters: null, is_completed: true }] },
          ] };
        sessions.push(s);
      }
      sessions.push({ ...sessions[1], tabata_minutes: 4,
        workout_exercises: [ { ...sessions[1].workout_exercises![1], exercise_name: "인터벌 제외", sort_order: 0 },
          { ...sessions[1].workout_exercises![2], exercise_name: "인터벌 뒤 이어하기", sort_order: 4 } ] });
      for (const s of sessions) {
        const { rows: [row] } = await db.query("insert into public.workout_sessions(user_id,started_at,completed_at,duration_minutes,status,tabata_minutes) values ($1,$2::timestamptz-interval '30 minutes',$2,30,'completed',$3) returning id", [uid, s.completed_at, s.tabata_minutes]);
        for (const e of s.workout_exercises!) {
          const { rows: [ex] } = await db.query("insert into public.workout_exercises(session_id,exercise_name,exercise_type,sort_order) values ($1,$2,$3,$4) returning id", [row.id, e.exercise_name, e.exercise_type, e.sort_order]);
          for (const set of e.workout_sets!) await db.query("insert into public.workout_sets(workout_exercise_id,weight_kg,reps,duration_seconds,distance_meters,is_completed) values ($1,$2,$3,$4,$5,$6)", [ex.id, set.weight_kg, set.reps, set.duration_seconds, set.distance_meters ?? null, set.is_completed]);
        }
      }
      const points = toMetricPoints(sessions);
      const { rows: [sqlPoints] } = await db.query("select gnd_evolution.metric_points($1,'-infinity','2026-12-01') v", [uid]);
      const sort = (p: MetricPoint[]) => [...p].sort((a,b) => a.completedAtMs-b.completedAtMs || a.exerciseKey.localeCompare(b.exerciseKey));
      expect(sort(sqlPoints.v)).toEqual(sort(points));
      const entry = Date.parse("2026-11-01T00:00:00Z");
      const ts = computeStageGrowth({ points, stageEnteredAtMs: entry, previousStageEnteredAtMs: Date.parse("2026-10-01") });
      const tsScore = computeEvolutionGrowthScore(ts, 4);
      const { rows: [sql] } = await db.query("select gnd_evolution.score_points($1::jsonb,$2::jsonb,4) v", [JSON.stringify(points.filter(p => p.completedAtMs <= entry)), JSON.stringify(points.filter(p => p.completedAtMs > entry))]);
      expect(sql.v.averagePct).toBeCloseTo(tsScore.averagePct, 8);
      expect(sql.v.selected.map((g: {exerciseKey: string}) => g.exerciseKey).sort()).toEqual(tsScore.selected.map(g => g.exerciseKey).sort());
      expect(sql.v.summary.comparableCount).toBe(ts.comparableCount);
      expect(sql.v.summary.unmatched).toEqual(ts.unmatched);
      for (const g of ts.growths) {
        const got = sql.v.summary.growths.find((s: {exerciseKey: string}) => s.exerciseKey === g.exerciseKey);
        expect(got.growthPct).toBeCloseTo(g.growthPct, 8);
        expect(got.baselineBest).toEqual(g.baselineBest); expect(got.currentBest).toEqual(g.currentBest);
      }
    } finally { await db.close(); }
  }, 30_000);
});
