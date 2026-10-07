/**
 * 챌린지 결과 화면 도메인 (2026-10-07 사용자 시안 — 「챌린지 종료!」·「나의 챌린지 결과」).
 *
 * I/O 없음. 재료는 `get_challenge_period_sessions` 행(점수와 같은 원천), 내 계획,
 * 본인 XP·포인트·배지 장부뿐이다.
 *
 * ⚠️ 종합점수를 여기서 만들지 않는다 — `scoreParticipant`만 만든다(주차 추세도
 *    `lib/challenge.ts`의 `myScoreTrend`가 그 길을 지난다).
 * ⚠️ 날짜는 `foldPeriodStats`와 같은 `dayKey(…, timeZone)`로 자른다. 다르게 자르면 화면의
 *    운동일과 점수의 참여율이 서로 다른 말을 한다.
 * ⚠️ 주차는 달력 주가 아니라 **시작일부터 7일씩**이다(`challengeLevel` 블록과 같은 자).
 * ⚠️ 보상 칸은 새 지급이 아니다. 기간 동안 원래 쌓인 장부를 잘라 보여 줄 뿐이다
 *    (2026-10-05 결정: 챌린지 자체 지급 기능은 없다).
 */
import { longestConsecutiveDays } from "./challenge-milestones";
import { inclusiveDays } from "./challenge-time";
import { getLevelFromTotalXp, getLevelProgress } from "./progression";
import { dayKey } from "./time";
import { addDaysToDateKey } from "./workout-plan";

/** `PeriodSessionRow`가 그대로 들어온다 — 필요한 모양만 구조적으로 받는다 */
export type ReportSessionInput = {
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

export type DayTotals = {
  dayKey: string;
  sessions: number;
  completedSets: number;
  /** 운동 시간 합(분). 시간이 기록된 세션이 없으면 null — 0분과 다르다 */
  minutes: number | null;
  cardioKm: number;
  volumeKg: number;
};

export function dailyTotals(
  sessions: readonly ReportSessionInput[],
  startDate: string,
  endDate: string,
  timeZone: string,
): Map<string, DayTotals> {
  const out = new Map<string, DayTotals>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.completedAt), timeZone);
    if (key < startDate || key > endDate) continue;
    const t = out.get(key) ?? {
      dayKey: key,
      sessions: 0,
      completedSets: 0,
      minutes: null,
      cardioKm: 0,
      volumeKg: 0,
    };
    t.sessions += 1;
    if (s.durationMinutes != null && s.durationMinutes > 0) {
      t.minutes = (t.minutes ?? 0) + s.durationMinutes;
    }
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (!set.isCompleted) continue;
        t.completedSets += 1;
        if (ex.exerciseType === "weight") {
          t.volumeKg += Number(set.weightKg ?? 0) * (set.reps ?? 0);
        } else if (ex.exerciseType === "cardio") {
          t.cardioKm += Number(set.distanceMeters ?? 0) / 1000;
        }
      }
    }
    out.set(key, t);
  }
  return out;
}

export type PlanInput = { planDate: string; setCount: number };

export type DailyBar = {
  dayKey: string;
  /** 1부터 — x축 */
  day: number;
  planCount: number;
  planSets: number;
  actualCount: number;
  actualSets: number;
  minutes: number | null;
};

/** 시안 `일별 활동` — 날마다 계획(세트)·실제(완료 세트) 한 쌍 */
export function dailyBars(
  totals: ReadonlyMap<string, DayTotals>,
  plans: readonly PlanInput[],
  startDate: string,
  endDate: string,
): DailyBar[] {
  const planByDay = new Map<string, { count: number; sets: number }>();
  for (const p of plans) {
    if (p.planDate < startDate || p.planDate > endDate) continue;
    const v = planByDay.get(p.planDate) ?? { count: 0, sets: 0 };
    v.count += 1;
    v.sets += p.setCount;
    planByDay.set(p.planDate, v);
  }
  const n = Math.max(0, inclusiveDays(startDate, endDate));
  return Array.from({ length: n }, (_, i) => {
    const key = addDaysToDateKey(startDate, i);
    const t = totals.get(key);
    const p = planByDay.get(key);
    return {
      dayKey: key,
      day: i + 1,
      planCount: p?.count ?? 0,
      planSets: p?.sets ?? 0,
      actualCount: t?.sessions ?? 0,
      actualSets: t?.completedSets ?? 0,
      minutes: t?.minutes ?? null,
    };
  });
}

export type WeekAchievement = { week: number; target: number; done: number; extra: number };

/** 시안 `주간 달성 히트맵` — 주마다 목표 횟수만큼 칸, 운동한 날만큼 채움 */
export function weeklyAchievement(
  workoutDayKeys: readonly string[],
  startDate: string,
  endDate: string,
  weeklyTarget: number,
): WeekAchievement[] {
  const days = new Set(workoutDayKeys);
  const n = Math.max(0, inclusiveDays(startDate, endDate));
  const out: WeekAchievement[] = [];
  for (let w = 0; w * 7 < n; w++) {
    const len = Math.min(7, n - w * 7);
    let count = 0;
    for (let d = 0; d < len; d++) {
      if (days.has(addDaysToDateKey(startDate, w * 7 + d))) count++;
    }
    const target = Math.max(1, Math.min(weeklyTarget, len));
    out.push({
      week: w + 1,
      target,
      done: Math.min(count, target),
      extra: Math.max(0, count - target),
    });
  }
  return out;
}

export type BestRecord = { value: number; dayKey: string } | null;
export type BestRecords = {
  longestStreak: number;
  maxMinutes: BestRecord;
  maxCardioKm: BestRecord;
  maxVolumeKg: BestRecord;
};

function maxBy(
  totals: ReadonlyMap<string, DayTotals>,
  pick: (t: DayTotals) => number | null,
): BestRecord {
  let best: BestRecord = null;
  const days = [...totals.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  for (const t of days) {
    const v = pick(t);
    if (v == null || v <= 0) continue;
    if (best === null || v > best.value) best = { value: v, dayKey: t.dayKey };
  }
  return best;
}

export function bestRecords(totals: ReadonlyMap<string, DayTotals>): BestRecords {
  return {
    // 마일스톤과 같은 함수 — 달력상 하루도 안 빠진 날 수(앱 스트릭 5일 유예와 다르다)
    longestStreak: longestConsecutiveDays([...totals.keys()]),
    maxMinutes: maxBy(totals, (t) => t.minutes),
    maxCardioKm: maxBy(totals, (t) => t.cardioKm),
    maxVolumeKg: maxBy(totals, (t) => t.volumeKg),
  };
}

export function weekCutoffs(
  startDate: string,
  endDate: string,
): { label: string; endKey: string }[] {
  const n = Math.max(0, inclusiveDays(startDate, endDate));
  const out: { label: string; endKey: string }[] = [];
  for (let w = 1; (w - 1) * 7 < n; w++) {
    out.push({ label: `${w}주`, endKey: addDaysToDateKey(startDate, Math.min(w * 7, n) - 1) });
  }
  return out;
}

export type LedgerRow = { amount: number; transactionType: string; createdAt: string };

export type PeriodRewards = {
  xpGained: number;
  pointsEarned: number;
  badgeCount: number;
  levelAtStart: number;
  levelAtEnd: number;
  stageNameAtEnd: string;
  totalXpAtEnd: number;
  /** 다음 레벨 누적 XP. 최고 레벨이면 null */
  nextLevelXp: number | null;
  /** 0~100 */
  percentAtEnd: number;
};

/**
 * 시안 `Lv.2 산책러 +1 레벨 업 · 1,250 / 2,000 XP`와 `획득한 보상`.
 *
 * 장부에는 **지금까지** 행이 있으므로, 종료 뒤에 쌓인 XP를 빼서 종료 시점 값을 만든다.
 * reverse(회수)는 금액 부호와 상관없이 뺀다 — 장부 부호 규칙에 묶이지 않게.
 * 포인트는 `earn`만 센다(쓴 포인트는 보상이 아니다).
 */
export function periodRewards(input: {
  currentTotalXp: number;
  xpRows: readonly LedgerRow[];
  pointRows: readonly LedgerRow[];
  badgeEarnedAts: readonly string[];
  startDate: string;
  endDate: string;
  timeZone: string;
}): PeriodRewards {
  const keyOf = (iso: string) => dayKey(new Date(iso), input.timeZone);
  const net = (r: LedgerRow) =>
    r.transactionType === "reverse" ? -Math.abs(r.amount) : r.amount;
  let afterEnd = 0;
  let inPeriod = 0;
  for (const r of input.xpRows) {
    const k = keyOf(r.createdAt);
    if (k > input.endDate) afterEnd += net(r);
    else if (k >= input.startDate) inPeriod += net(r);
  }
  const totalXpAtEnd = Math.max(0, input.currentTotalXp - afterEnd);
  const totalXpAtStart = Math.max(0, totalXpAtEnd - inPeriod);
  const end = getLevelProgress(totalXpAtEnd);
  const inRange = (iso: string) => {
    const k = keyOf(iso);
    return k >= input.startDate && k <= input.endDate;
  };
  return {
    xpGained: inPeriod,
    pointsEarned: input.pointRows
      .filter((r) => r.transactionType === "earn" && inRange(r.createdAt))
      .reduce((s, r) => s + r.amount, 0),
    badgeCount: input.badgeEarnedAts.filter(inRange).length,
    levelAtStart: getLevelFromTotalXp(totalXpAtStart).level,
    levelAtEnd: end.currentLevel,
    stageNameAtEnd: end.stageName,
    totalXpAtEnd,
    nextLevelXp: end.nextLevelRequiredXp,
    percentAtEnd: end.percent,
  };
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 시안 표기 `9/14(일)` */
export function formatShortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}/${d}(${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** 시안 `상위 12%` — 순위/인원, 최소 1% */
export function topPercent(rank: number, total: number): number {
  if (total <= 0) return 100;
  return Math.max(1, Math.round((rank / total) * 100));
}

/** 시안 말풍선 두 줄 */
export function cheerCopy(rank: number): [string, string] {
  if (rank === 1) return ["잘했다!", "계속 가자!"];
  if (rank <= 3) return ["좋았어!", "한 칸만 더!"];
  return ["수고했어!", "다음엔 더 위로!"];
}

export function resultShareText(input: {
  challengeName: string;
  rank: number;
  total: number;
  overall: number;
  workoutDays: number;
  periodDays: number;
}): string {
  return [
    `GND 「${input.challengeName}」 결과`,
    `${input.total}명 중 ${input.rank}위 · 종합 ${input.overall.toFixed(1)}점`,
    `${input.periodDays}일 중 ${input.workoutDays}일 운동했어요`,
  ].join("\n");
}
