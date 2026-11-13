/**
 * 실데이터 비교 (작업지시서 §12) — 닉네임 하나의 기존(v1)과 신규(v3: 단계 진입 기준 최고 기록) 성장을 나란히 찍는다.
 *
 * 실행: GROWTH_LIVE_NICK=오뎅끼데스까 pnpm vitest run src/lib/domain/level-growth.live.test.ts
 * 환경변수가 없으면 건너뛴다. 운영 DB를 **읽기만** 한다(service role, .env.local).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeGrowth, type GrowthRecord } from "./evolution-growth";
import { computeStageGrowth, toMetricPoints, type RawSession } from "./level-growth";
import { fmtGrowthPct, fmtSample } from "./level-growth-copy";
import { getStageGroups } from "./progression";
import { DEFAULT_TIMEZONE, dayKey } from "./time";

const NICK = process.env.GROWTH_LIVE_NICK;

describe.skipIf(!NICK)("level-growth v3 실데이터 비교", () => {
  it("기존/신규 비교표를 출력하고, XP·레벨이 그대로인지 본다", async () => {
    const env = Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
    const base = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const get = async (path: string) => {
      const res = await fetch(`${base}${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(`${path} → ${res.status}`);
      return res.json();
    };

    const [profile] = await get(`/rest/v1/profiles?select=id&nickname=eq.${encodeURIComponent(NICK as string)}`);
    expect(profile, `닉네임 ${NICK} 없음`).toBeTruthy();
    const uid = profile.id as string;

    const [progress] = await get(`/rest/v1/user_progress?select=total_xp,current_level&user_id=eq.${uid}`);
    const groups = getStageGroups();
    const stage = groups.find((g) => progress.current_level >= g.startLevel && progress.current_level <= g.endLevel);
    expect(stage).toBeTruthy();
    const prev = groups.find((g) => g.stageIndex === (stage as { stageIndex: number }).stageIndex - 1);

    const entries: { level: number; entered_at: string }[] = await get(
      `/rest/v1/user_level_history?select=level,entered_at&user_id=eq.${uid}&level=in.(${(stage as { startLevel: number }).startLevel}${prev ? `,${prev.startLevel}` : ""})`,
    );
    const entryAt = (lv: number | undefined) => entries.find((e) => e.level === lv)?.entered_at;
    const stageEntry = entryAt((stage as { startLevel: number }).startLevel);
    expect(stageEntry, "현재 단계 진입 이력 없음 — 0132 적용 여부 또는 1단계(기준 없음)").toBeTruthy();
    const prevEntry = entryAt(prev?.startLevel);

    const sessions: RawSession[] = await get(
      `/rest/v1/workout_sessions?select=completed_at,tabata_minutes,workout_exercises(exercise_name,exercise_type,sort_order,workout_sets(weight_kg,reps,duration_seconds,is_completed))&user_id=eq.${uid}&status=eq.completed&deleted_at=is.null&completed_at=not.is.null&order=completed_at.desc&limit=1000`,
    );
    expect(sessions.length).toBeGreaterThan(0);

    // v1 — src/lib/evolution.ts가 하는 그대로
    const records: GrowthRecord[] = [];
    for (const s of sessions) {
      const day = dayKey(new Date(s.completed_at), DEFAULT_TIMEZONE);
      for (const ex of s.workout_exercises ?? []) {
        const sets = (ex.workout_sets ?? []).filter((x) => x.is_completed !== false);
        if (sets.length > 0) records.push({ exercise: ex.exercise_name, day, sets });
      }
    }
    const v1 = computeGrowth(records);

    // v3
    const points = toMetricPoints(sessions);
    const v3 = computeStageGrowth({
      points,
      stageEnteredAtMs: Date.parse(stageEntry as string),
      previousStageEnteredAtMs: prevEntry ? Date.parse(prevEntry) : null,
    });

    const v1Of = new Map((v1.exercises ?? []).map((e) => [e.exercise, e.growthPct]));
    const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtGrowthPct(v));

    console.log(
      `\n${NICK} · Lv.${progress.current_level} · ${progress.total_xp} XP · ${(stage as { stageIndex: number }).stageIndex}단계 진입 ${stageEntry}`,
    );
    console.log(`v1 종합(전 기간 처음3 vs 최근3): ${pct(v1.value)} · 측정 ${v1.measuredCount}종목`);
    console.log(
      `v3: 성장 ${v3.growths.length}종목 · 유지/하락 ${v3.unchangedCount} · 비교 불가 ${v3.unmatched.length} · 이전 단계 종목 수 ${v3.previousStageExerciseCount ?? "—"}`,
    );
    console.table(
      v3.growths.map((g) => ({
        종목: g.exerciseKey,
        "기준(진입 전 최고)": `${fmtSample(g.kind, g.baselineBest)} (${g.baselineDay})`,
        "지금(이번 단계 최고)": `${fmtSample(g.kind, g.currentBest)} (${g.currentDay})`,
        v3: fmtGrowthPct(g.growthPct),
        v1: pct(v1Of.get(g.exerciseKey)),
      })),
    );
    console.log("비교 불가(진입 전 기록 없음):", v3.unmatched.map((u) => u.exerciseKey).join(", ") || "없음");
    const v3Names = new Set(points.map((p) => p.exerciseKey));
    const v1Only = (v1.exercises ?? []).map((e) => e.exercise.trim()).filter((n) => !v3Names.has(n));
    console.log("v1에만 있던 종목(인터벌 라운드·유산소 시간 등):", v1Only.join(", ") || "없음");

    // 계산은 읽기만 한다 — 돌린 뒤에도 XP와 레벨이 같아야 한다
    const [after] = await get(`/rest/v1/user_progress?select=total_xp,current_level&user_id=eq.${uid}`);
    expect(after).toEqual(progress);
  }, 60_000);
});
