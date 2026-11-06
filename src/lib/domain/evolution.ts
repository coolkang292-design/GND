/**
 * 캐릭터 진화 v3.0 — 다음 단계까지의 조건 판정 (**읽기 전용 · 표시용**).
 *
 * 설계: XP는 "자격", 운동 지속성과 개인 성장이 실질 조건이다.
 *   조건 A XP 레벨 · 조건 B 누적 운동일/경과 주/최근 활동 · 조건 C 개인 성장률
 *
 * ⚠️ 이 모듈은 **단계를 바꾸지 않는다.** 실제 단계(`user_progress.current_stage`)와
 *    해금 판정은 아직 XP 기준 그대로이고, 여기서는 "다음 진화까지 무엇이 남았나"만
 *    계산해 화면에 보여 준다. 서버 판정·해금 테이블은 별도 단계(승인 후)에서 만든다.
 */
import { getLevelFromTotalXp } from "./progression";
import { growthTips } from "./evolution-guidance";

export type StageRequirement = {
  /** XP 자격 — 이 레벨 이상 */
  minLevel: number;
  /** 누적 유효 운동일 */
  days: number;
  /** 첫 유효 운동 이후 경과 주 */
  weeks: number;
  /**
   * 개인 성장률(%) 기준.
   * `null` = 없음(2단계) · `0` = **기준선 확보**만 요구(3단계) · 양수 = 그 % 이상.
   */
  growthPct: number | null;
  /** 최근 활동 조건 (6·7단계) */
  recent?: { windowDays: number; days: number };
};

/** 목표 단계(2~7)별 진화 기준. 사용자 확정표(2026-11-06). */
export const EVOLUTION_REQUIREMENTS: Record<number, StageRequirement> = {
  2: { minLevel: 6, days: 6, weeks: 2, growthPct: null },
  3: { minLevel: 11, days: 18, weeks: 6, growthPct: 0 },
  4: { minLevel: 16, days: 36, weeks: 12, growthPct: 5 },
  5: { minLevel: 21, days: 60, weeks: 24, growthPct: 8 },
  6: { minLevel: 26, days: 100, weeks: 40, growthPct: 12, recent: { windowDays: 28, days: 8 } },
  7: { minLevel: 31, days: 156, weeks: 60, growthPct: 15, recent: { windowDays: 42, days: 12 } },
};

/** 측정 불가 사용자의 대체 경로 — 운동일 기준을 1.5배로 */
export const ALT_PATH_MULTIPLIER = 1.5;

/** 종목 하나의 성장 상세 — 구체적인 운동 지침(몇 kg·몇 번)을 만드는 재료 */
export type ExerciseGrowth = {
  exercise: string;
  /** w = 중량+반복(추정 1RM) · r = 맨몸 반복 · t = 시간 유지 */
  kind: "w" | "r" | "t";
  /** 이 종목을 기록한 날 수 */
  dayCount: number;
  /** 처음 3번 기록의 가운데 값 (지표 단위) */
  base: number;
  /** 최근 3번 기록의 가운데 값 */
  recent: number;
  /** 6일 이상 기록해야 값이 생긴다. 상한 없이 실제 %. */
  growthPct: number | null;
  /** 지금 내 수준의 대표 세트 (최근 3번 중 가운데 기록) */
  last: { weight: number | null; reps: number | null; seconds: number | null };
};

export type GrowthSummary = {
  /** 종목별 상세 (기준선 3일 이상인 종목만). 없어도 판정은 된다. */
  exercises?: ExerciseGrowth[];
  /** 초기 3·최근 3 비교가 가능한(≥6일 기록) 종목 수 */
  measuredCount: number;
  /** 기준선(≥3일 기록)이 생긴 종목 수 */
  baselineCount: number;
  /** 종목별 성장률(상한·하한 적용)의 중앙값. 측정 종목이 2개 미만이면 null = "측정 준비 중" */
  value: number | null;
};

export type ConditionKey = "xp" | "days" | "weeks" | "growth" | "recent";

export type EvolutionCondition = {
  key: ConditionKey;
  met: boolean;
  /** 현재 값. 성장률이 아직 측정 전이면 null */
  current: number | null;
  required: number;
  /** 0~1 진행도 (막대용) */
  progress: number;
  /** growth 전용: 측정 전 */
  preparing?: boolean;
  /** growth 전용: 3단계처럼 "시작 기록(기준선) 만들기"만 요구하는 조건 */
  baselineOnly?: boolean;
  /** growth 전용: "이렇게 해 보세요" 구체적 지침 (종목·kg·횟수) */
  tips?: string[];
  /** days 전용: 대체 경로(1.5배) 기준이 적용됐다 */
  altPath?: boolean;
  /** recent 전용 */
  windowDays?: number;
};

export type EvolutionStatus = {
  currentStage: number;
  /** 최종 단계면 null */
  nextStage: number | null;
  level: number;
  conditions: EvolutionCondition[];
  allMet: boolean;
};

export type EvolutionInput = {
  totalXp: number;
  /** 현재(보호된) 단계 — 화면이 보여 주는 단계 */
  currentStage: number;
  /** 유효 운동일 `YYYY-MM-DD`(KST) 목록. 같은 날 여러 번이어도 1일이라 중복은 접는다 */
  workoutDays: string[];
  /** 오늘 `YYYY-MM-DD`(KST) */
  today: string;
  growth: GrowthSummary;
};

const DAY_MS = 86_400_000;

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** 두 날짜 키 사이 일수 (b - a). 달력 기준이라 DST·시각과 무관하다. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

function ratio(current: number, required: number): number {
  if (required <= 0) return 1;
  return Math.max(0, Math.min(1, current / required));
}

export function evaluateEvolution(input: EvolutionInput): EvolutionStatus {
  const level = getLevelFromTotalXp(input.totalXp).level;
  const next = input.currentStage + 1;
  const req = EVOLUTION_REQUIREMENTS[next];
  if (!req) {
    return {
      currentStage: input.currentStage,
      nextStage: null,
      level,
      conditions: [],
      allMet: false,
    };
  }

  const uniqueDays = [...new Set(input.workoutDays)]
    .filter((d) => d <= input.today)
    .sort();
  const dayCount = uniqueDays.length;
  const weeks = uniqueDays.length
    ? Math.floor(daysBetween(uniqueDays[0], input.today) / 7)
    : 0;

  // 성장률 측정 가능 여부 — 3단계는 기준선만, 4단계부터는 실제 성장률(측정 종목 ≥2)
  const needsGrowth = req.growthPct !== null;
  const baselineOnly = req.growthPct === 0;
  const measurable = baselineOnly
    ? input.growth.baselineCount >= 1
    : input.growth.value !== null;

  // 대체 경로: 성장 조건이 있는데 **측정 자체가 불가**할 때만. 측정했는데 미달이면 우회 불가.
  const altPath = needsGrowth && !measurable;
  const requiredDays = altPath ? Math.ceil(req.days * ALT_PATH_MULTIPLIER) : req.days;

  const conditions: EvolutionCondition[] = [
    {
      key: "xp",
      met: level >= req.minLevel,
      current: level,
      required: req.minLevel,
      progress: ratio(level, req.minLevel),
    },
    {
      key: "days",
      met: dayCount >= requiredDays,
      current: dayCount,
      required: requiredDays,
      progress: ratio(dayCount, requiredDays),
      altPath,
    },
    {
      key: "weeks",
      met: weeks >= req.weeks,
      current: weeks,
      required: req.weeks,
      progress: ratio(weeks, req.weeks),
    },
  ];

  if (needsGrowth) {
    if (baselineOnly) {
      conditions.push({
        key: "growth",
        met: measurable,
        current: measurable ? 1 : null,
        required: 1,
        progress: measurable ? 1 : 0,
        preparing: !measurable,
        baselineOnly: true,
        tips: measurable ? undefined : growthTips(input.growth, 0),
      });
    } else if (input.growth.value !== null) {
      const v = input.growth.value;
      conditions.push({
        key: "growth",
        met: v >= (req.growthPct as number),
        current: v,
        required: req.growthPct as number,
        progress: ratio(Math.max(0, v), req.growthPct as number),
        tips:
          v >= (req.growthPct as number)
            ? undefined
            : growthTips(input.growth, req.growthPct as number),
      });
    } else {
      // 측정 전 — 0%라고 쓰지 않는다. 대체 경로(운동일 1.5배)가 대신 요구된다.
      conditions.push({
        key: "growth",
        met: false,
        current: null,
        required: req.growthPct as number,
        progress: 0,
        preparing: true,
        tips: growthTips(input.growth, req.growthPct as number),
      });
    }
  }

  if (req.recent) {
    const recent = req.recent;
    const recentDays = uniqueDays.filter(
      (d) => daysBetween(d, input.today) < recent.windowDays,
    ).length;
    conditions.push({
      key: "recent",
      met: recentDays >= recent.days,
      current: recentDays,
      required: recent.days,
      progress: ratio(recentDays, recent.days),
      windowDays: recent.windowDays,
    });
  }

  // 대체 경로 사용자는 성장 조건이 "측정 전"이어도 막히지 않는다 (운동일 1.5배가 대신한다).
  const allMet = conditions.every((c) =>
    c.key === "growth" && altPath ? true : c.met,
  );

  return {
    currentStage: input.currentStage,
    nextStage: next,
    level,
    conditions,
    allMet,
  };
}
