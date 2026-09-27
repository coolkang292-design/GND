/**
 * AI 코치의 목표 프로필 (0112 `training_profiles`).
 *
 * ⚠️ 여기 값 목록은 0112의 `check` 제약과 **글자까지 같아야 한다.** 한쪽만 바꾸면
 *    저장이 400으로 막힌다. 라벨은 화면용이고 DB에는 영문 키만 들어간다.
 */

import type { BodyPart } from "@/lib/types";

export const PRIMARY_GOALS = [
  { value: "hypertrophy", label: "근육 키우기" },
  { value: "strength", label: "힘 세지기" },
  { value: "fat_loss", label: "체지방 줄이기" },
  { value: "conditioning", label: "체력·지구력" },
  { value: "general_fitness", label: "건강 유지" },
] as const;

export const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "처음 · 6개월 미만" },
  { value: "intermediate", label: "꾸준히 · 1~3년" },
  { value: "advanced", label: "오래 · 3년 이상" },
] as const;

export const TRAINING_LOCATIONS = [
  { value: "gym", label: "헬스장" },
  { value: "home", label: "집" },
  { value: "outdoor", label: "야외" },
  { value: "mixed", label: "여러 곳" },
] as const;

export const SESSIONS_PER_WEEK_CHOICES = [2, 3, 4, 5, 6] as const;
export const SESSION_MINUTES_CHOICES = [20, 30, 45, 60, 90] as const;

/** 우선 부위로 고를 수 있는 것 — 카탈로그 body_part와 같은 한국어 값 */
export const PRIORITY_PART_CHOICES: readonly BodyPart[] = [
  "가슴",
  "등",
  "하체",
  "어깨",
  "팔",
  "코어",
  "유산소",
];

/** 불편 부위 — 유산소는 부위가 아니라 뺀다 (0112 check와 같다) */
export const LIMITATION_PART_CHOICES: readonly BodyPart[] = [
  "가슴",
  "등",
  "하체",
  "어깨",
  "팔",
  "코어",
];

export const MAX_PRIORITY_PARTS = 3;

export type PrimaryGoal = (typeof PRIMARY_GOALS)[number]["value"];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["value"];
export type TrainingLocation = (typeof TRAINING_LOCATIONS)[number]["value"];

export type TrainingProfile = {
  primaryGoal: PrimaryGoal;
  experienceLevel: ExperienceLevel;
  sessionsPerWeek: number;
  sessionMinutes: number;
  trainingLocation: TrainingLocation;
  priorityBodyParts: BodyPart[];
  limitationBodyParts: BodyPart[];
  currentWeightKg: number | null;
  targetWeightKg: number | null;
};

/** 시트의 입력 중 상태 — 필수 여섯 칸이 비어 있을 수 있다 */
export type TrainingProfileDraft = {
  primaryGoal: PrimaryGoal | null;
  experienceLevel: ExperienceLevel | null;
  sessionsPerWeek: number | null;
  sessionMinutes: number | null;
  trainingLocation: TrainingLocation | null;
  priorityBodyParts: BodyPart[];
  limitationBodyParts: BodyPart[];
  currentWeightKg: number | null;
  targetWeightKg: number | null;
};

export function emptyProfileDraft(): TrainingProfileDraft {
  return {
    primaryGoal: null,
    experienceLevel: null,
    sessionsPerWeek: null,
    sessionMinutes: null,
    trainingLocation: null,
    priorityBodyParts: [],
    limitationBodyParts: [],
    currentWeightKg: null,
    targetWeightKg: null,
  };
}

/** 체중 입력 — 0112 check(20~300)와 같은 범위만 받고, 나머지는 비운다 */
export function parseBodyWeight(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(value)) return null;
  if (value < 20 || value > 300) return null;
  return Math.round(value * 10) / 10;
}

/**
 * 필수 여섯 칸이 다 찼으면 저장 가능한 프로필, 아니면 `null`.
 *
 * 우선 부위는 **0개도 허용**한다 — "딱히 없음"도 답이다. 강요하면 아무거나 누른다.
 */
export function completeProfile(
  draft: TrainingProfileDraft,
): TrainingProfile | null {
  if (
    draft.primaryGoal === null ||
    draft.experienceLevel === null ||
    draft.sessionsPerWeek === null ||
    draft.sessionMinutes === null ||
    draft.trainingLocation === null
  ) {
    return null;
  }
  return {
    primaryGoal: draft.primaryGoal,
    experienceLevel: draft.experienceLevel,
    sessionsPerWeek: draft.sessionsPerWeek,
    sessionMinutes: draft.sessionMinutes,
    trainingLocation: draft.trainingLocation,
    priorityBodyParts: draft.priorityBodyParts.slice(0, MAX_PRIORITY_PARTS),
    limitationBodyParts: draft.limitationBodyParts.filter(
      (part) => part !== "유산소",
    ),
    currentWeightKg: draft.currentWeightKg,
    targetWeightKg: draft.targetWeightKg,
  };
}

/** 부위 칩 토글 — 우선 부위는 최대 3개, 넘치면 **새로 누른 것을 무시**한다 */
export function togglePart(
  selected: readonly BodyPart[],
  part: BodyPart,
  max = Number.POSITIVE_INFINITY,
): BodyPart[] {
  if (selected.includes(part)) return selected.filter((p) => p !== part);
  if (selected.length >= max) return [...selected];
  return [...selected, part];
}

/** DB 행(snake_case) → 도메인. 모르는 값이 섞였으면 `null` — 목표 설정을 다시 받는다 */
export function profileFromRow(row: {
  primary_goal: string;
  experience_level: string;
  sessions_per_week: number;
  session_minutes: number;
  training_location: string;
  priority_body_parts: string[] | null;
  limitation_body_parts: string[] | null;
  current_weight_kg: number | string | null;
  target_weight_kg: number | string | null;
}): TrainingProfile | null {
  const goal = PRIMARY_GOALS.find((g) => g.value === row.primary_goal);
  const level = EXPERIENCE_LEVELS.find((l) => l.value === row.experience_level);
  const location = TRAINING_LOCATIONS.find(
    (l) => l.value === row.training_location,
  );
  if (!goal || !level || !location) return null;
  const parts = (values: string[] | null, allowed: readonly BodyPart[]) =>
    (values ?? []).filter((v): v is BodyPart =>
      (allowed as readonly string[]).includes(v),
    );
  const num = (v: number | string | null) =>
    v === null || v === "" ? null : Number(v);
  return {
    primaryGoal: goal.value,
    experienceLevel: level.value,
    sessionsPerWeek: row.sessions_per_week,
    sessionMinutes: row.session_minutes,
    trainingLocation: location.value,
    priorityBodyParts: parts(row.priority_body_parts, PRIORITY_PART_CHOICES),
    limitationBodyParts: parts(row.limitation_body_parts, LIMITATION_PART_CHOICES),
    currentWeightKg: num(row.current_weight_kg),
    targetWeightKg: num(row.target_weight_kg),
  };
}

/** 도메인 → DB 행. `user_id`는 부르는 쪽이 붙인다 */
export function profileToRow(profile: TrainingProfile) {
  return {
    primary_goal: profile.primaryGoal,
    experience_level: profile.experienceLevel,
    sessions_per_week: profile.sessionsPerWeek,
    session_minutes: profile.sessionMinutes,
    training_location: profile.trainingLocation,
    priority_body_parts: profile.priorityBodyParts,
    limitation_body_parts: profile.limitationBodyParts,
    current_weight_kg: profile.currentWeightKg,
    target_weight_kg: profile.targetWeightKg,
  };
}
