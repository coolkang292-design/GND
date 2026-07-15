import { describe, expect, it } from "vitest";
import { setVolumeKg, summarizeVolume, type VolumeSet } from "./volume";

const weightSet = (
  weightKg: number,
  reps: number,
  isCompleted: boolean,
): VolumeSet => ({ exerciseType: "weight", weightKg, reps, isCompleted });

describe("setVolumeKg — 세트 볼륨 (완료 세트만)", () => {
  it("완료된 웨이트 세트 = 중량 × 횟수", () => {
    expect(setVolumeKg(weightSet(50, 10, true))).toBe(500);
  });

  it("미완료 세트는 0", () => {
    expect(setVolumeKg(weightSet(50, 10, false))).toBe(0);
  });

  it("맨몸·유산소 세트는 kg 볼륨에 포함하지 않는다 (단위 혼합 금지)", () => {
    expect(
      setVolumeKg({ exerciseType: "bodyweight", reps: 12, isCompleted: true }),
    ).toBe(0);
    expect(
      setVolumeKg({
        exerciseType: "cardio",
        distanceMeters: 5000,
        durationSeconds: 1800,
        isCompleted: true,
      }),
    ).toBe(0);
  });

  it("중량·횟수 누락은 0으로 취급", () => {
    expect(
      setVolumeKg({ exerciseType: "weight", isCompleted: true }),
    ).toBe(0);
    expect(
      setVolumeKg({ exerciseType: "weight", weightKg: null, reps: 10, isCompleted: true }),
    ).toBe(0);
  });
});

describe("summarizeVolume — 유형별 분리 집계 (완료 세트만)", () => {
  it("빈 목록은 전부 0", () => {
    expect(summarizeVolume([])).toEqual({
      weightVolumeKg: 0,
      bodyweightReps: 0,
      cardioDistanceMeters: 0,
      cardioDurationSeconds: 0,
      completedSetCount: 0,
    });
  });

  it("웨이트는 kg, 맨몸은 회, 유산소는 거리·시간으로 분리 집계한다", () => {
    const sets: VolumeSet[] = [
      weightSet(45, 10, true),
      weightSet(45, 8, true),
      weightSet(45, 8, false), // 미완료 → 제외
      { exerciseType: "bodyweight", reps: 15, isCompleted: true },
      { exerciseType: "bodyweight", reps: 12, isCompleted: false },
      {
        exerciseType: "cardio",
        distanceMeters: 3000,
        durationSeconds: 1200,
        isCompleted: true,
      },
    ];
    expect(summarizeVolume(sets)).toEqual({
      weightVolumeKg: 450 + 360,
      bodyweightReps: 15,
      cardioDistanceMeters: 3000,
      cardioDurationSeconds: 1200,
      completedSetCount: 4,
    });
  });

  it("소수 중량도 정확히 합산한다", () => {
    const sets: VolumeSet[] = [weightSet(2.5, 10, true), weightSet(7.5, 10, true)];
    expect(summarizeVolume(sets).weightVolumeKg).toBe(100);
  });
});
