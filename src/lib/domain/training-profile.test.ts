import { describe, expect, it } from "vitest";
import {
  completeProfile,
  emptyProfileDraft,
  parseBodyWeight,
  profileFromRow,
  profileToRow,
  togglePart,
} from "./training-profile";

describe("training-profile", () => {
  it("필수 다섯 칸이 비면 저장할 수 없다", () => {
    expect(completeProfile(emptyProfileDraft())).toBeNull();
    expect(
      completeProfile({
        ...emptyProfileDraft(),
        primaryGoal: "strength",
        experienceLevel: "beginner",
        sessionsPerWeek: 3,
        sessionMinutes: 45,
      }),
    ).toBeNull();
  });

  it("우선 부위 0개도 저장 가능하고, 3개를 넘으면 자른다", () => {
    const base = {
      ...emptyProfileDraft(),
      primaryGoal: "strength" as const,
      experienceLevel: "beginner" as const,
      sessionsPerWeek: 3,
      sessionMinutes: 45,
      trainingLocation: "gym" as const,
    };
    expect(completeProfile(base)?.priorityBodyParts).toEqual([]);
    expect(
      completeProfile({ ...base, priorityBodyParts: ["가슴", "등", "하체", "어깨"] })
        ?.priorityBodyParts,
    ).toEqual(["가슴", "등", "하체"]);
  });

  it("부위 토글 — 최대치를 넘는 새 선택은 무시한다", () => {
    expect(togglePart(["가슴"], "가슴")).toEqual([]);
    expect(togglePart(["가슴", "등", "팔"], "하체", 3)).toEqual(["가슴", "등", "팔"]);
    expect(togglePart([], "하체", 3)).toEqual(["하체"]);
  });

  it("체중은 0112 범위(20~300)만, 소수 첫째 자리로", () => {
    expect(parseBodyWeight("72,46")).toBe(72.5);
    expect(parseBodyWeight("5")).toBeNull();
    expect(parseBodyWeight("abc")).toBeNull();
    expect(parseBodyWeight("")).toBeNull();
  });

  it("행 ↔ 도메인 왕복, 모르는 값은 프로필 없음으로 본다", () => {
    const row = {
      primary_goal: "fat_loss",
      experience_level: "advanced",
      sessions_per_week: 5,
      session_minutes: 60,
      training_location: "home",
      priority_body_parts: ["하체", "엉덩이"],
      limitation_body_parts: ["어깨"],
      current_weight_kg: "80.5",
      target_weight_kg: null,
    };
    const profile = profileFromRow(row)!;
    expect(profile.priorityBodyParts).toEqual(["하체"]);
    expect(profile.currentWeightKg).toBe(80.5);
    expect(profileToRow(profile)).toMatchObject({
      primary_goal: "fat_loss",
      priority_body_parts: ["하체"],
      current_weight_kg: 80.5,
    });
    expect(profileFromRow({ ...row, primary_goal: "bulk" })).toBeNull();
  });
});
