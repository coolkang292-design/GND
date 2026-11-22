import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMyStageEvolutionStatus } from "@/lib/stage-evolution";
import {
  buildEvolutionMission,
  type BaselineEntry,
  type EvolutionMission,
  type MissionExercise,
} from "@/lib/domain/evolution-mission";
import { newSet, type LocalSet } from "@/lib/workout";
import type { CatalogExercise } from "@/lib/types";

const KINDS = new Set(["w", "r", "t", "c"]);

/** 서버 JSON(`points`)을 믿지 않고 한 점씩 걸러 읽는다 — 이상한 점은 버린다 */
function parseBaselineRow(row: { exercise_key: unknown; metric_kind: unknown; points: unknown }): BaselineEntry | null {
  if (typeof row.exercise_key !== "string" || typeof row.metric_kind !== "string" || !KINDS.has(row.metric_kind)) return null;
  if (!Array.isArray(row.points)) return null;
  const points: BaselineEntry["points"] = [];
  for (const p of row.points as Record<string, unknown>[]) {
    const best = (p?.best ?? null) as Record<string, unknown> | null;
    const value = Number(p?.value);
    const completedAtMs = Number(p?.completedAtMs);
    if (!best || !Number.isFinite(value) || !Number.isFinite(completedAtMs)) continue;
    const num = (n: unknown) => (n === null || n === undefined ? null : Number.isFinite(Number(n)) ? Number(n) : null);
    points.push({
      value,
      day: String(p.day ?? ""),
      completedAtMs,
      best: {
        weight: num(best.weight),
        reps: num(best.reps),
        seconds: num(best.seconds),
        ...(num(best.distanceMeters) !== null ? { distanceMeters: num(best.distanceMeters) as number } : {}),
      },
    });
  }
  return { exerciseKey: row.exercise_key, kind: row.metric_kind as BaselineEntry["kind"], points };
}

/**
 * 오늘의 진화 미션을 읽는다. 서버가 진화 규칙을 쓰지 않거나(`legacy_xp`·미설치) 보여 줄 게
 * 없으면 `null`. **조회 실패는 던진다** — 호출부가 미션만 숨기고 기록 화면은 살린다.
 */
export async function getMyEvolutionMission(todayKey: string): Promise<EvolutionMission | null> {
  const status = await getMyStageEvolutionStatus();
  if (!status || status.mode === "legacy_xp") return null;

  let baselines: BaselineEntry[] = [];
  // 경험치만 보는 단계·기준이 아직 없는 단계는 종목 제안이 없으니 기준선을 읽지 않는다
  if (status.mode === "gated" && status.state === "blocked") {
    const { data, error } = await getSupabaseBrowserClient()
      .from("stage_growth_baselines")
      .select("exercise_key, metric_kind, points")
      .eq("stage", status.currentStage); // RLS: 본인 행만
    if (error) throw error;
    baselines = (data ?? []).map(parseBaselineRow).filter((b): b is BaselineEntry => b !== null);
  }
  return buildEvolutionMission({ status, baselines, todayKey });
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 미션 종목 → 기록 화면이 담을 수 있는 모양. 카탈로그에 같은 이름이 없으면 **담지 않는다**
 * (이름이 다른 종목을 담으면 기준 종목이 아니라 서버 비교가 안 된다).
 *
 * 세트: 목표 세트가 **맨 마지막**이고 앞은 지난 기준 기록 그대로다 — 서버는 종목의 최고
 * 세트 하나로 성장을 재므로, 가볍게 몸을 풀고 마지막에 목표를 넘으면 된다.
 */
export function missionPicks(
  exercises: readonly MissionExercise[],
  catalog: readonly CatalogExercise[],
): { picks: { item: CatalogExercise; sets: LocalSet[] }[]; missing: string[] } {
  const byName = new Map(catalog.map((c) => [norm(c.name), c] as const));
  const picks: { item: CatalogExercise; sets: LocalSet[] }[] = [];
  const missing: string[] = [];
  for (const ex of exercises) {
    const item = byName.get(norm(ex.exerciseKey));
    if (!item) {
      missing.push(ex.exerciseKey);
      continue;
    }
    const make = (t: MissionExercise["target"]): LocalSet => {
      const sec = t.durationSec ?? 0;
      return newSet({
        weightKg: t.weightKg ?? 0,
        reps: t.reps ?? 0,
        distanceKm: t.distanceKm ?? 0,
        durationSec: sec,
        durationMin: Math.round((sec / 60) * 1000) / 1000,
      });
    };
    // 유산소는 한 번에 같은 시간 안에 더 멀리 — 세트 하나
    const sets = ex.kind === "c" ? [make(ex.target)] : [make(ex.from), make(ex.from), make(ex.target)];
    picks.push({ item, sets });
  }
  return { picks, missing };
}
