/**
 * 챌린지 종목별 경쟁 지표 (2026-10-07 최종 시안 · 사용자 지침).
 *
 * 진행 중엔 종합 점수를 잠그고(종료일 공개) **실제 운동 기록**으로 경쟁한다 — 4종:
 * 운동 횟수(완료 세션 수) · 운동 시간(`duration_minutes` 합) · 유산소 거리 · 웨이트 볼륨.
 * 종료 후에도 같은 함수로 지표별 최종 순위를 낸다. **종합 점수에는 들어가지 않는다.**
 *
 * ⚠️ 재료는 `get_challenge_period_sessions` 행뿐이다. 참가자 확인·사진 인증·삭제/취소 제외는
 *    서버가 한다. 여기서 다시 거르지 않는다(규칙이 두 벌이 되면 화면마다 숫자가 갈린다).
 *    여기서 거르는 것은 **현재 명단 밖 사람**(나간 사람 등)과 기간 밖 날짜뿐이다.
 * ⚠️ 거리·볼륨은 **완료 세트만**, 볼륨은 **웨이트 종목만** — `foldPeriodStats`와 같은 규칙.
 * ⚠️ 0은 순위가 없다. 아무도 유산소를 안 했는데 전원이 "1위"가 되는 걸 막는다.
 * ⚠️ 같은 값은 같은 등수(1·1·3) — `rankParticipants`·`activityLeaders`와 같은 규칙.
 * ⚠️ 참가자는 2명~수십 명이다(사용자 지시 2026-10-07). 목록은 `pinMine`으로 줄 수를 묶는다.
 */
import { inclusiveDays } from "./challenge-time";
import { dayKey } from "./time";
import { addDaysToDateKey } from "./workout-plan";

export type MetricKey = "sessions" | "minutes" | "cardioKm" | "volumeKg";
export type MetricTotals = Record<MetricKey, number>;

export const METRICS: readonly { key: MetricKey; label: string; unit: string; help: string }[] = [
  { key: "sessions", label: "운동 횟수", unit: "회", help: "챌린지 기간에 완료한 운동 수예요." },
  { key: "minutes", label: "운동 시간", unit: "분", help: "완료한 운동의 기록 시간을 모두 더했어요." },
  { key: "cardioKm", label: "유산소 거리", unit: "km", help: "완료한 유산소 세트의 거리를 모두 더했어요." },
  { key: "volumeKg", label: "웨이트 볼륨", unit: "kg", help: "완료한 웨이트 세트의 무게 × 횟수를 모두 더했어요." },
];

export function metricMeta(key: MetricKey) {
  return METRICS.find((m) => m.key === key)!;
}

/** `PeriodSessionRow`가 그대로 들어온다 — 필요한 모양만 구조적으로 받는다 */
export type MetricRow = {
  userId: string;
  completedAt: string;
  durationMinutes?: number | null;
  exercises: readonly {
    exerciseType: "weight" | "bodyweight" | "cardio";
    sets: readonly {
      weightKg: number | null;
      reps: number | null;
      distanceMeters: number | null;
      isCompleted: boolean;
    }[];
  }[];
};

const ZERO: MetricTotals = { sessions: 0, minutes: 0, cardioKm: 0, volumeKg: 0 };

/**
 * 운동 시간을 셀 수 있나 — 0117 전 응답이면 모른다(행이 있는데 아무 행에도 키가 없다).
 * 모를 때 운동 시간 랭킹을 그리면 전원 0 → "기록 없음"이라 거짓말이 된다.
 */
export function minutesKnown(rows: readonly MetricRow[]): boolean {
  return rows.length === 0 || rows.some((r) => r.durationMinutes !== undefined);
}

export function metricTotalsByUser(
  rows: readonly MetricRow[],
  memberIds: readonly string[],
  startDate: string,
  endKey: string,
  timeZone: string,
): Map<string, MetricTotals> {
  const out = new Map<string, MetricTotals>(memberIds.map((id) => [id, { ...ZERO }]));
  for (const r of rows) {
    const total = out.get(r.userId);
    if (!total) continue;
    const k = dayKey(new Date(r.completedAt), timeZone);
    if (k < startDate || k > endKey) continue;
    total.sessions += 1;
    if (r.durationMinutes != null && r.durationMinutes > 0) total.minutes += r.durationMinutes;
    for (const ex of r.exercises) {
      for (const s of ex.sets) {
        if (!s.isCompleted) continue;
        if (ex.exerciseType === "weight") {
          total.volumeKg += Number(s.weightKg ?? 0) * (s.reps ?? 0);
        } else if (ex.exerciseType === "cardio") {
          total.cardioKm += Number(s.distanceMeters ?? 0) / 1000;
        }
      }
    }
  }
  return out;
}

export type MetricRank = { userId: string; value: number; rank: number | null };

const EPS = 1e-9;

/** 내림차순. 같은 값 = 같은 등수, 0 = 순위 없음(null, 맨 뒤). 동점 표시 순서는 userId로 고정 */
export function rankMetric(
  totals: ReadonlyMap<string, MetricTotals>,
  key: MetricKey,
): MetricRank[] {
  const list = [...totals].map(([userId, t]) => ({ userId, value: t[key] }));
  list.sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));
  const out: MetricRank[] = [];
  list.forEach((x, i) => {
    if (x.value <= EPS) {
      out.push({ ...x, rank: null });
      return;
    }
    const prev = out[i - 1];
    const rank =
      prev && prev.rank !== null && Math.abs(prev.value - x.value) <= EPS ? prev.rank : i + 1;
    out.push({ ...x, rank });
  });
  return out;
}

/** 시안 `내 현재 순위 👑 1위 · 운동 횟수 기준` — 내가 가장 높은 지표(동률이면 METRICS 순서) */
export function representativeStanding(
  totals: ReadonlyMap<string, MetricTotals>,
  myUserId: string,
  minutesAvailable: boolean,
): { metric: MetricKey; rank: number } | null {
  let best: { metric: MetricKey; rank: number } | null = null;
  for (const m of METRICS) {
    if (m.key === "minutes" && !minutesAvailable) continue;
    const mine = rankMetric(totals, m.key).find((r) => r.userId === myUserId);
    if (!mine || mine.rank === null) continue;
    if (best === null || mine.rank < best.rank) best = { metric: m.key, rank: mine.rank };
  }
  return best;
}

export function formatMetric(key: MetricKey, v: number): string {
  if (key === "cardioKm") return `${(Math.round(v * 10) / 10).toLocaleString()}km`;
  const n = Math.round(v).toLocaleString();
  if (key === "sessions") return `${n}회`;
  if (key === "minutes") return `${n}분`;
  return `${n}kg`;
}

/**
 * 시안 문구 — `2위와 +1회 차이예요! 한 번 더 하면 선두를 더 굳힐 수 있어요.` /
 * `1위까지 -24분!` · `24분만 더 하면 1위를 탈환할 수 있어요!`
 * `rival`은 비교 카드의 상대(내가 1위면 2위, 아니면 바로 위 등수 중 가장 가까운 사람).
 */
export function gapMessage(
  ranks: readonly MetricRank[],
  myUserId: string,
  key: MetricKey,
): { headline: string; tip: string; rival: MetricRank | null; diff: number } {
  const me = ranks.find((r) => r.userId === myUserId);
  if (!me || me.rank === null) {
    return { headline: "아직 기록이 없어요", tip: "첫 기록을 남기면 순위에 들어가요.", rival: null, diff: 0 };
  }
  if (me.rank === 1) {
    const tied = ranks.filter((r) => r.rank === 1 && r.userId !== myUserId);
    if (tied.length > 0) {
      return { headline: "공동 1위예요!", tip: "한 번 더 하면 단독 선두예요.", rival: tied[0], diff: 0 };
    }
    const second = ranks.find((r) => r.userId !== myUserId && r.rank !== null) ?? null;
    if (!second) return { headline: "지금 선두예요!", tip: "이대로 지켜 보세요.", rival: null, diff: 0 };
    const diff = me.value - second.value;
    return {
      headline: `${second.rank}위와 +${formatMetric(key, diff)} 차이예요!`,
      tip:
        key === "sessions"
          ? "한 번 더 하면 선두를 더 굳힐 수 있어요."
          : "조금만 더 하면 선두를 더 굳힐 수 있어요.",
      rival: second,
      diff,
    };
  }
  const myRank = me.rank;
  const above = ranks.filter((r) => r.rank !== null && r.rank < myRank);
  const rival = above[above.length - 1];
  const diff = rival.value - me.value;
  return {
    headline: `${rival.rank}위까지 -${formatMetric(key, diff)}!`,
    tip: `${formatMetric(key, diff)}만 더 하면 ${rival.rank}위를 탈환할 수 있어요!`,
    rival,
    diff,
  };
}

/** 시안·지침 `이번 주 1위` 칩 — 오늘이 속한 챌린지 주(시작일부터 7일씩) */
export function weeklyLeaders(
  rows: readonly MetricRow[],
  memberIds: readonly string[],
  startDate: string,
  todayKey: string,
  timeZone: string,
  key: MetricKey,
): string[] {
  const idx = Math.max(0, inclusiveDays(startDate, todayKey) - 1);
  const weekStart = addDaysToDateKey(startDate, Math.floor(idx / 7) * 7);
  const ranks = rankMetric(metricTotalsByUser(rows, memberIds, weekStart, todayKey, timeZone), key);
  return ranks.filter((r) => r.rank === 1).map((r) => r.userId);
}

/**
 * TOP N + 내 줄 고정 — 2명이면 2줄, 수십 명이면 N줄 + (밖에 있으면) 내 줄.
 * 자리 기준이라 공동 등수가 있어도 줄 수가 일정하다.
 */
export function pinMine<T extends { userId: string }>(
  list: readonly T[],
  myUserId: string,
  limit: number,
): { rows: T[]; pinned: boolean } {
  const head = list.slice(0, limit);
  if (head.some((r) => r.userId === myUserId)) return { rows: head, pinned: false };
  const mine = list.find((r) => r.userId === myUserId);
  return mine ? { rows: [...head, mine], pinned: true } : { rows: head, pinned: false };
}

/** `dailyTotals`(challenge-report)의 하루 합계 중 지표에 필요한 칸만 */
type DayLike = { sessions: number; minutes: number | null; cardioKm: number; volumeKg: number };

/** 시안 `내 진행 현황` — 기간 날짜마다 선택 지표 값(기록 없는 날 0) */
export function dailyMetric(
  totals: ReadonlyMap<string, DayLike>,
  key: MetricKey,
  startDate: string,
  endKey: string,
): { dayKey: string; value: number }[] {
  const n = Math.max(0, inclusiveDays(startDate, endKey));
  return Array.from({ length: n }, (_, i) => {
    const k = addDaysToDateKey(startDate, i);
    const t = totals.get(k);
    return { dayKey: k, value: t ? (t[key] ?? 0) : 0 };
  });
}

/**
 * 시안의 점선 `목표 420분` — **같은 지표의 목표가 있을 때만** 하루 페이스(목표 ÷ 기간 일수).
 * 운동 횟수(목표는 운동'일'), 운동 시간(목표는 유산소 시간만)은 대응하는 목표가 없어 그리지 않는다.
 */
export function goalPace(
  goals: readonly { goal_type: string; target_value: number | string }[],
  key: MetricKey,
  periodDays: number,
): number | null {
  const type = key === "cardioKm" ? "cardio_distance" : key === "volumeKg" ? "volume" : null;
  if (!type || periodDays <= 0) return null;
  const g = goals.find((x) => x.goal_type === type);
  return g ? Number(g.target_value) / periodDays : null;
}
