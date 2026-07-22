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
