/**
 * 챌린지 목표에 맞춘 오늘의 퀘스트 (사용자 지시 2026-11-06).
 *
 * 진행 중인 챌린지가 있으면 퀘스트가 "지난 운동 그대로"가 아니라 **내가 챌린지에서 세운
 * 목표에 쌓이는 운동**을 제안한다. 목표가 여러 분류에 걸쳐 있으면(웨이트 + 유산소 …)
 * **날짜로 돌려가며** 한 분류씩 제안한다 — 매일 같은 것만 권하면 나머지 목표는 영영
 * 안 채워진다. 같은 날에는 항상 같은 분류다(렌더마다 안 바뀐다).
 *
 * I/O 없음 — 어떤 운동을 담을지만 정한다. 담는 일은 기록 화면이 한다.
 */
import { GOAL_TYPE_META } from "@/lib/challenge";
import type { UserGoal, CatalogExercise } from "@/lib/types";
import type { QuestFocus, QuestFocusKind } from "@/lib/domain/daily-quest";

export type { QuestFocus, QuestFocusKind };

const ORDER: QuestFocusKind[] = ["weight", "cardio", "bodyweight", "interval"];

/** `YYYY-MM-DD` → 에포크 일수 (타임존과 무관한 달력 일수) */
function dayNumber(todayKey: string): number {
  const [y, m, d] = todayKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function labelOf(goal: UserGoal): string {
  const meta = GOAL_TYPE_META[goal.goal_type];
  const value = goal.target_value;
  return `${meta.label} ${Number.isInteger(value) ? value : value.toFixed(1)}${meta.unit}`;
}

function focusKindOf(goal: UserGoal): QuestFocusKind | null {
  if (goal.goal_type === "tabata_count") return "interval";
  const c = GOAL_TYPE_META[goal.goal_type].category;
  // `workout_days`("any")는 종목을 안 가린다 — 특정 분류를 권할 이유가 없다
  return c === "any" ? null : (c as QuestFocusKind);
}

/**
 * 오늘 퀘스트가 겨냥할 목표 분류. 목표가 없거나 종목을 안 가리는 목표뿐이면 `null`
 * (그 사람은 기존 퀘스트: 지난 운동 · 걷기 · 인터벌).
 */
export function pickChallengeFocus(
  goals: readonly UserGoal[] | null | undefined,
  todayKey: string,
): QuestFocus | null {
  if (!goals || goals.length === 0) return null;

  const firstByKind = new Map<QuestFocusKind, UserGoal>();
  for (const g of goals) {
    const kind = focusKindOf(g);
    if (kind && !firstByKind.has(kind)) firstByKind.set(kind, g);
  }
  const kinds = ORDER.filter((k) => firstByKind.has(k));
  if (kinds.length === 0) return null;

  const kind = kinds[dayNumber(todayKey) % kinds.length];
  return { kind, goalLabel: labelOf(firstByKind.get(kind)!) };
}

/** 분류별로 먼저 권하는 종목 — 이름이 카탈로그에 있으면 그것부터 */
const PREFERRED: Record<Exclude<QuestFocusKind, "interval">, readonly string[]> = {
  weight: ["스쿼트", "벤치프레스", "랫풀다운", "데드리프트", "숄더 프레스"],
  cardio: ["러닝", "트레드밀", "걷기", "사이클"],
  bodyweight: ["푸시업", "스쿼트", "플랭크", "런지", "풀업"],
};

const MAX_ITEMS: Record<Exclude<QuestFocusKind, "interval">, number> = {
  weight: 3,
  cardio: 2,
  bodyweight: 3,
};

function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * 오늘 담을 종목. 우선순위: **내가 해 온 그 분류의 종목**(최근 순) → 분류별 추천 이름 →
 * 카탈로그의 그 분류 첫 종목들. 분류(`exercise_type`)가 맞는 것만 담는다 — 맞지 않으면
 * 챌린지 실적이 오르지 않는다(`countsTowardChallenge`).
 */
export function pickChallengeExercises(
  kind: Exclude<QuestFocusKind, "interval">,
  catalog: readonly CatalogExercise[],
  recentNames: readonly string[],
): CatalogExercise[] {
  const ofType = catalog.filter((c) => c.exercise_type === kind);
  const byName = new Map(ofType.map((c) => [norm(c.name), c] as const));
  const limit = MAX_ITEMS[kind];
  const picked: CatalogExercise[] = [];
  const seen = new Set<string>();
  const take = (item: CatalogExercise | undefined) => {
    if (!item || seen.has(item.id) || picked.length >= limit) return;
    seen.add(item.id);
    picked.push(item);
  };

  for (const name of recentNames) take(byName.get(norm(name)));
  for (const name of PREFERRED[kind]) {
    const key = norm(name);
    take(byName.get(key) ?? ofType.find((c) => norm(c.name).includes(key)));
  }
  for (const item of ofType) take(item);
  return picked;
}
