/**
 * AI 코치 — AI에 **보내는 것**과 AI에게서 **받은 것을 믿기 전에** 하는 일 (설계 2026-09-28 §5).
 *
 * ⚠️ AI 결과는 데이터다. 명령이 아니다. 여기서 모양·길이·종목 이름·행동을
 *    코드 판정과 대조해 맞지 않는 것은 버리거나 코드 값으로 덮는다.
 *
 * ⚠️ 보내지 않는 것: 이름·닉네임·이메일·user id·세션 id·메모·통증 **부위**·체중.
 *    분석에 필요한 것은 숫자와 판정뿐이다. AI 제공사가 해외(DeepSeek)라 더 엄격하다.
 */

import {
  FEEDBACK_LIMITS,
  MAX_EXERCISES_FOR_AI,
} from "./coach-config";
import type { TrainingProfile } from "./training-profile";
import {
  normalizeExerciseName,
  type EffortLevel,
  type ExerciseAnalysis,
  type ExerciseMetrics,
  type NextAction,
  type ReasonCode,
  type Signal,
  type WorkoutAnalysis,
} from "./workout-analysis";

// ── 출력 모양 ────────────────────────────────────────────────

export type CoachItem = { exercise: string | null; message: string };
export type CoachAction = CoachItem & { action: NextAction };

export type CoachFeedback = {
  summary: string;
  primary_result: { type: Signal; message: string };
  wins: CoachItem[];
  cautions: CoachItem[];
  next_actions: CoachAction[];
  coach_message: string;
};

const NEXT_ACTIONS: readonly NextAction[] = [
  "maintain",
  "increase_candidate",
  "decrease_candidate",
  "recover",
  "observe",
];

/** 기록이 처음이면 이 문장을 쓴다 (명령문 §12) — AI가 다르게 말해도 덮는다 */
export const BASELINE_MESSAGE =
  "첫 기준 기록을 만들었습니다. 다음 운동부터 변화 추이를 비교할 수 있습니다.";

/** 통증·컨디션 신고 세션에서 AI가 증량을 말했을 때 대신 쓰는 문장 */
export const SAFETY_COACH_MESSAGE =
  "오늘은 몸 상태를 먼저 챙겨요. 다음 운동은 무게를 올리지 말고 편한 강도로 유지하세요.";

// ── 입력 모양 (AI에 보내는 JSON) ─────────────────────────────

type CompactMetrics = {
  weight_kg?: number;
  reps?: number[];
  total_reps?: number;
  volume_kg?: number;
  duration_sec?: number;
  distance_m?: number;
  pace_sec_per_km?: number;
  avg_set_interval_sec?: number;
};

export type CoachInputExercise = {
  exercise: string;
  kind: "weight" | "bodyweight_reps" | "bodyweight_time" | "cardio";
  current: CompactMetrics;
  previous: CompactMetrics | null;
  changes: Partial<Record<keyof ExerciseAnalysis["deltas"], number>>;
  signal: Signal;
  action: NextAction;
  reasons: ReasonCode[];
  effort: EffortLevel | null;
};

export type CoachInput = {
  goal: {
    primary_goal: TrainingProfile["primaryGoal"];
    experience_level: TrainingProfile["experienceLevel"];
    priority_body_parts: string[];
  } | null;
  session: {
    duration_minutes: number | null;
    completed_sets: number;
    total_reps: number;
    weight_volume_kg: number;
    comparable_volume_change_pct: number | null;
  };
  primary_result: Signal;
  progression_blocked: boolean;
  user_feedback: {
    overall_effort: EffortLevel | null;
    pain_reported: boolean;
    low_condition: boolean;
    short_time: boolean;
    equipment_unavailable: boolean;
  };
  set_interval_reliability: WorkoutAnalysis["dataQuality"]["setInterval"];
  exercises: CoachInputExercise[];
};

function compact(m: ExerciseMetrics, includeInterval: boolean): CompactMetrics {
  const out: CompactMetrics = {};
  if (m.topWeightKg !== null) out.weight_kg = m.topWeightKg;
  if (m.reps.length > 0) {
    out.reps = m.reps;
    out.total_reps = m.totalReps;
  }
  if (m.volumeKg !== null) out.volume_kg = m.volumeKg;
  if (m.totalDurationSec !== null) out.duration_sec = m.totalDurationSec;
  if (m.distanceM !== null) out.distance_m = m.distanceM;
  if (m.paceSecPerKm !== null) out.pace_sec_per_km = m.paceSecPerKm;
  // 믿을 수 없는 간격은 아예 보내지 않는다 (명령문 §8)
  if (includeInterval && m.setInterval.reliability === "valid" && m.setInterval.avgSec !== null) {
    out.avg_set_interval_sec = m.setInterval.avgSec;
  }
  return out;
}

function kindOf(ex: ExerciseAnalysis): CoachInputExercise["kind"] {
  if (ex.type === "cardio") return "cardio";
  if (ex.type === "weight") return "weight";
  return ex.measure === "time" ? "bodyweight_time" : "bodyweight_reps";
}

/** 기준선이 아닌 것 → 한 세트 수가 많은 것 순. 입력을 짧게 유지한다 */
function pickForAi(exercises: readonly ExerciseAnalysis[]): ExerciseAnalysis[] {
  return [...exercises]
    .sort((a, b) => {
      const aBase = a.signal === "baseline" ? 1 : 0;
      const bBase = b.signal === "baseline" ? 1 : 0;
      if (aBase !== bBase) return aBase - bBase;
      return b.current.completedSets - a.current.completedSets;
    })
    .slice(0, MAX_EXERCISES_FOR_AI);
}

export function buildCoachInput(
  analysis: WorkoutAnalysis,
  profile: TrainingProfile | null,
): CoachInput {
  const flag = (f: string) => analysis.flags.includes(f as never);
  return {
    goal: profile
      ? {
          primary_goal: profile.primaryGoal,
          experience_level: profile.experienceLevel,
          priority_body_parts: profile.priorityBodyParts,
        }
      : null,
    session: {
      duration_minutes: analysis.session.durationMinutes,
      completed_sets: analysis.session.completedSets,
      total_reps: analysis.session.totalReps,
      weight_volume_kg: analysis.session.weightVolumeKg,
      comparable_volume_change_pct: analysis.session.comparableVolumeDeltaPct,
    },
    primary_result: analysis.primary,
    progression_blocked: analysis.safety.progressionBlocked,
    user_feedback: {
      overall_effort: analysis.sessionEffort,
      pain_reported: flag("pain"),
      low_condition: flag("low_condition"),
      short_time: flag("short_time"),
      equipment_unavailable: flag("equipment_unavailable"),
    },
    set_interval_reliability: analysis.dataQuality.setInterval,
    exercises: pickForAi(analysis.exercises).map((ex) => {
      const changes: CoachInputExercise["changes"] = {};
      for (const [k, v] of Object.entries(ex.deltas)) {
        if (v !== null) changes[k as keyof typeof ex.deltas] = v;
      }
      return {
        exercise: ex.name,
        kind: kindOf(ex),
        current: compact(ex.current, true),
        previous: ex.previous ? compact(ex.previous, true) : null,
        changes,
        signal: ex.signal,
        action: ex.action,
        reasons: ex.reasons,
        effort: ex.effort,
      };
    }),
  };
}

// ── 지시문 ───────────────────────────────────────────────────

const OUTPUT_EXAMPLE = `{
  "summary": "같은 14kg에서 총 반복이 2회 늘었어요.",
  "primary_result": { "type": "progress", "message": "덤벨 숄더 프레스 총 반복이 36회에서 38회로 늘었습니다." },
  "wins": [ { "exercise": "덤벨 숄더 프레스", "message": "같은 무게로 반복을 늘렸어요." } ],
  "cautions": [],
  "next_actions": [ { "exercise": "덤벨 숄더 프레스", "action": "maintain", "message": "14kg을 유지하고 총 40회를 먼저 노려 보세요." } ],
  "coach_message": "무게를 서두르기보다 반복을 채우는 흐름이 좋습니다."
}`;

/**
 * 시스템 지시문. DeepSeek JSON 모드는 지시문에 **"json"이라는 단어와 예시**가
 * 있어야 한다(공식 문서, 2026-09-28 확인).
 */
export function coachSystemPrompt(): string {
  return [
    "당신은 GND 운동 앱의 AI 코치다. 사용자가 방금 끝낸 운동을 본인의 과거 기록과 비교해 코드가 계산한 결과를 json으로 받는다.",
    "",
    "규칙:",
    "1. 주어진 데이터만 사용한다. 없는 기록·수치·사용자 상태를 추측하거나 지어내지 않는다.",
    "2. 숫자는 입력에 있는 값만 그대로 쓴다. 새로 계산하지 않는다.",
    "3. primary_result와 각 종목의 signal·action은 이미 정해진 판정이다. 바꾸지 않는다.",
    "4. 비교 대상은 사용자 본인의 과거 기록뿐이다. 다른 사람과 비교하지 않는다.",
    "5. 무게·반복·볼륨·체감·세트 간격을 함께 해석한다. avg_set_interval_sec는 수행과 휴식을 합친 보조 신호라 그것 하나로 향상이나 저하를 단정하지 않는다.",
    `6. primary_result가 baseline이면 향상·하락을 말하지 말고 "${BASELINE_MESSAGE}"라는 뜻으로 설명한다.`,
    "7. progression_blocked가 true면 무게나 강도를 올리라는 말을 절대 하지 않는다. 통증은 진단하지 말고 무리하지 말라고만 한다.",
    "8. 근거를 찾을 수 없으면 \"판단 데이터가 부족합니다\"라고 쓴다.",
    "9. 한국어 존댓말. 불필요한 칭찬과 긴 설명을 하지 않는다. summary는 한 문장, wins·cautions·next_actions는 각각 최대 2개.",
    "10. next_actions의 action은 그 종목 입력의 action 값을 그대로 쓴다. exercise는 입력에 있는 이름을 그대로 쓰거나 null.",
    "11. primary_result.type은 입력의 primary_result 값과 같아야 한다.",
    "",
    "반드시 아래 형식의 json 객체 하나만 출력한다. 다른 글은 쓰지 않는다.",
    OUTPUT_EXAMPLE,
  ].join("\n");
}

export function coachUserPrompt(input: CoachInput): string {
  return `오늘 운동 분석 데이터(json):\n${JSON.stringify(input)}`;
}

// ── 받은 것 검증 ─────────────────────────────────────────────

/** 모델 응답 문자열 → 객체. 코드 펜스를 벗긴다. 객체가 아니면 null */
export function parseModelJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const value: unknown = JSON.parse(trimmed);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * 증량을 말하는 문장인가 — 통증·컨디션 신고 세션에서만 쓴다.
 * 넉넉하게 잡는다. 잘못 걸려도 안전 문장으로 바뀔 뿐이다.
 */
const INCREASE_TALK =
  /증량|(무게|중량|강도|kg)를?\s*(더\s*)?(올|높|늘)|올려\s*(보|봐)|더\s*무겁게/;

function mentionsIncrease(value: string): boolean {
  return INCREASE_TALK.test(value);
}

/**
 * AI 결과를 코드 판정에 맞춘다. 쓸 수 없으면 `null` (= 실패로 기록한다).
 */
export function sanitizeCoachFeedback(
  raw: unknown,
  analysis: WorkoutAnalysis,
): CoachFeedback | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const blocked = analysis.safety.progressionBlocked;

  let summary = text(obj.summary, FEEDBACK_LIMITS.summary);
  let coachMessage = text(obj.coach_message, FEEDBACK_LIMITS.coachMessage);
  if (!summary || !coachMessage) return null;

  const byKey = new Map(analysis.exercises.map((ex) => [ex.key, ex]));
  const resolve = (value: unknown): ExerciseAnalysis | null =>
    typeof value === "string"
      ? (byKey.get(normalizeExerciseName(value)) ?? null)
      : null;

  const items = (value: unknown, max: number): CoachItem[] => {
    if (!Array.isArray(value)) return [];
    const out: CoachItem[] = [];
    for (const item of value) {
      if (out.length >= max) break;
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const message = text(it.message, FEEDBACK_LIMITS.itemMessage);
      if (!message) continue;
      if (blocked && mentionsIncrease(message)) continue;
      out.push({ exercise: resolve(it.exercise)?.name ?? null, message });
    }
    return out;
  };

  const nextActions: CoachAction[] = [];
  if (Array.isArray(obj.next_actions)) {
    for (const item of obj.next_actions) {
      if (nextActions.length >= FEEDBACK_LIMITS.nextActions) break;
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const message = text(it.message, FEEDBACK_LIMITS.itemMessage);
      const action = NEXT_ACTIONS.find((a) => a === it.action);
      if (!message || !action) continue;
      if (blocked && mentionsIncrease(message)) continue;
      const target = resolve(it.exercise);
      if (target) {
        // 코드가 정한 행동과 다르면 버린다 — 행동만 고치면 문장과 어긋난다
        if (action !== target.action) continue;
        nextActions.push({ exercise: target.name, action, message });
      } else {
        // 종목을 모르면 무게를 움직이는 후보가 될 수 없다
        if (action === "increase_candidate" || action === "decrease_candidate") continue;
        nextActions.push({ exercise: null, action, message });
      }
    }
  }

  if (blocked) {
    if (mentionsIncrease(summary)) summary = "오늘 운동을 기록했어요. 몸 상태를 먼저 챙겨요.";
    if (mentionsIncrease(coachMessage)) coachMessage = SAFETY_COACH_MESSAGE;
  }

  const primaryRaw =
    obj.primary_result && typeof obj.primary_result === "object"
      ? (obj.primary_result as Record<string, unknown>)
      : {};
  const primaryMessage =
    analysis.primary === "baseline"
      ? BASELINE_MESSAGE
      : (text(primaryRaw.message, FEEDBACK_LIMITS.primaryMessage) ?? summary);

  return {
    summary,
    primary_result: {
      type: analysis.primary,
      message:
        blocked && mentionsIncrease(primaryMessage) ? summary : primaryMessage,
    },
    wins: items(obj.wins, FEEDBACK_LIMITS.wins),
    cautions: items(obj.cautions, FEEDBACK_LIMITS.cautions),
    next_actions: nextActions,
    coach_message: coachMessage,
  };
}
