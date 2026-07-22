import { describe, expect, it } from "vitest";
import {
  getDurationXp,
  minutesFromSeconds,
  calculateWorkoutXp,
  MAX_DAILY_WORKOUT_XP_NOW,
} from "./xp";

const base = {
  isValidWorkout: true, durationMinutes: 30, isPlanCompleted: false,
  isRecordComplete: false, hasVerificationPhoto: false,
  hasReceivedDailyWorkoutXp: false, isTabata: false,
};

describe("getDurationXp — 시간 구간 경계(분)", () => {
  it.each([
    [0,0],[9,0],[10,0],[19,0],[20,10],[39,10],[40,20],[59,20],
    [60,30],[89,30],[90,40],[120,40],[359,40],
  ])("%i분 → %i XP", (min, xp) => expect(getDurationXp(min)).toBe(xp));
});

// 서버 시간(초)은 내림해 정수 분으로 만든다. RPC의 floor(sec/60)과 동일 로직.
describe("초 단위 경계 → 내림 분 → 시간 XP", () => {
  it.each([
    [1199, 19, 0],  // 19분 59초 → 19분 → 0
    [1200, 20, 10], // 20분 00초 → 20분 → 10
    [2399, 39, 10], // 39분 59초 → 39분 → 10
    [2400, 40, 20], // 40분 00초 → 40분 → 20
    [5399, 89, 30], // 89분 59초 → 89분 → 30
    [5400, 90, 40], // 90분 00초 → 90분 → 40
    [21599, 359, 40], // 359분 59초 → 359분 → 40
  ])("%i초 → %i분 → %i XP", (sec, min, xp) => {
    expect(minutesFromSeconds(sec)).toBe(min);
    expect(getDurationXp(minutesFromSeconds(sec))).toBe(xp);
  });
  it("360분 00초(21600초) → XP 지급 거부", () => {
    const min = minutesFromSeconds(21600);
    expect(min).toBe(360);
    const r = calculateWorkoutXp({ ...base, durationMinutes: min });
    expect(r.totalXp).toBe(0);
    expect(r.rejectionReason).toBe("DURATION_TOO_LONG");
  });
});

describe("calculateWorkoutXp", () => {
  it("기본 완료 100 + 시간만", () => {
    expect(calculateWorkoutXp({ ...base }).totalXp).toBe(110);
  });
  it("45분 전보너스 = 160", () => {
    const r = calculateWorkoutXp({ ...base, durationMinutes: 45, isPlanCompleted: true, isRecordComplete: true, hasVerificationPhoto: true });
    expect(r.totalXp).toBe(160);
  });
  it("95분 전보너스 = 180 (1회 최대)", () => {
    const r = calculateWorkoutXp({ ...base, durationMinutes: 95, isPlanCompleted: true, isRecordComplete: true, hasVerificationPhoto: true });
    expect(r.totalXp).toBe(180);
  });
  it("계획 XP 미지급(운영 RPC 현재 상태) 최대 = MAX_DAILY_WORKOUT_XP_NOW(160)", () => {
    // complete_workout_v2가 v_plan := 0으로 고정해 두어 실제 상한은 160이다.
    // 안내 문구가 180을 약속하지 않도록 이 상수를 기준으로 삼는다(修正17).
    const r = calculateWorkoutXp({ ...base, durationMinutes: 95, isPlanCompleted: false, isRecordComplete: true, hasVerificationPhoto: true });
    expect(r.planXp).toBe(0);
    expect(r.totalXp).toBe(MAX_DAILY_WORKOUT_XP_NOW);
  });
  it("무효 운동 = 0", () => {
    const r = calculateWorkoutXp({ ...base, isValidWorkout: false });
    expect(r.totalXp).toBe(0);
    expect(r.rejectionReason).toBe("INVALID_WORKOUT");
  });
  it("당일 이미 수령 = 0", () => {
    const r = calculateWorkoutXp({ ...base, hasReceivedDailyWorkoutXp: true });
    expect(r.totalXp).toBe(0);
    expect(r.rejectionReason).toBe("DAILY_XP_ALREADY_AWARDED");
  });
  it("타바타는 유효, 계획·기록 보너스 없음", () => {
    const r = calculateWorkoutXp({ ...base, isTabata: true, durationMinutes: 16, isPlanCompleted: true, isRecordComplete: true });
    expect(r.baseXp).toBe(100);
    expect(r.planXp).toBe(0);
    expect(r.recordXp).toBe(0);
    expect(r.durationXp).toBe(0); // 16분 < 20분
    expect(r.totalXp).toBe(100);
  });
});
