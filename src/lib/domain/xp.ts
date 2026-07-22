/** 운동 1회 XP 순수 계산. 서버 RPC와 동일 로직을 공유한다(표시·검증용). */
export interface WorkoutXpInput {
  isValidWorkout: boolean;
  durationMinutes: number;
  isPlanCompleted: boolean;
  isRecordComplete: boolean;
  hasVerificationPhoto: boolean;
  hasReceivedDailyWorkoutXp: boolean;
  isTabata: boolean;
}
export interface WorkoutXpBreakdown {
  baseXp: number; durationXp: number; planXp: number;
  recordXp: number; photoXp: number; totalXp: number;
  rejectionReason?: string;
}

export function getDurationXp(durationMinutes: number): number {
  if (durationMinutes >= 90) return 40;
  if (durationMinutes >= 60) return 30;
  if (durationMinutes >= 40) return 20;
  if (durationMinutes >= 20) return 10;
  return 0;
}

/** 서버 경과 초 → 내림 정수 분. RPC의 floor(sec/60)과 동일해야 한다. */
export function minutesFromSeconds(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}

/** 6시간(360분) 이상은 이상치로 보고 XP를 지급하지 않는다. */
export const MAX_XP_DURATION_MINUTES = 360;

/**
 * **지금 실제로 받을 수 있는** 하루 최대 운동 XP = 160
 * (기본 100 + 시간 40 + 기록 10 + 사진 10).
 *
 * 이 함수의 이론적 최대는 180이지만, 계획 완료 +20은 운영 중인
 * `complete_workout_v2`가 `v_plan := 0`으로 고정해 두어 **지급되지 않는다**
 * (계획-실행 필수판정 스키마가 없음 → 0023에서 교체 예정).
 *
 * 안내 문구는 반드시 이 상수를 써서 **받을 수 없는 XP를 받을 수 있는 것처럼
 * 알리지 않는다**(修正17). 0023 적용 시 180으로 올린다.
 */
export const MAX_DAILY_WORKOUT_XP_NOW = 160;

const ZERO: WorkoutXpBreakdown = {
  baseXp: 0, durationXp: 0, planXp: 0, recordXp: 0, photoXp: 0, totalXp: 0,
};

export function calculateWorkoutXp(input: WorkoutXpInput): WorkoutXpBreakdown {
  if (!input.isValidWorkout) return { ...ZERO, rejectionReason: "INVALID_WORKOUT" };
  if (input.durationMinutes >= MAX_XP_DURATION_MINUTES) return { ...ZERO, rejectionReason: "DURATION_TOO_LONG" };
  if (input.hasReceivedDailyWorkoutXp) return { ...ZERO, rejectionReason: "DAILY_XP_ALREADY_AWARDED" };

  const baseXp = 100;
  const durationXp = getDurationXp(input.durationMinutes);
  // 타바타는 구성이 고정 → 계획/기록 보너스 제외(설계 §3.1)
  const planXp = !input.isTabata && input.isPlanCompleted ? 20 : 0;
  const recordXp = !input.isTabata && input.isRecordComplete ? 10 : 0;
  const photoXp = input.hasVerificationPhoto ? 10 : 0;
  const totalXp = baseXp + durationXp + planXp + recordXp + photoXp;
  return { baseXp, durationXp, planXp, recordXp, photoXp, totalXp };
}
