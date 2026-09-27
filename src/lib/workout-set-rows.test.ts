import { describe, expect, it } from "vitest";
import {
  isMissingClientCompletedAtColumn,
  newSet,
  toSetRows,
  type LocalExercise,
} from "@/lib/workout";

function exercise(partial: Partial<LocalExercise>): LocalExercise {
  return {
    key: "k",
    name: "벤치프레스",
    bodyPart: "가슴",
    exerciseType: "weight",
    measure: null,
    isCustom: false,
    sets: [],
    ...partial,
  };
}

describe("toSetRows — 세트 저장 행 (0112 client_completed_at)", () => {
  it("완료한 세트는 기기 완료 시각을 ISO로 싣는다", () => {
    const at = Date.parse("2026-09-28T10:01:16Z");
    const [row] = toSetRows(
      ["we-1"],
      [exercise({ sets: [newSet({ weightKg: 60, reps: 10, done: true, doneAtMs: at })] })],
    );
    expect(row).toMatchObject({
      workout_exercise_id: "we-1",
      set_number: 1,
      weight_kg: 60,
      reps: 10,
      is_completed: true,
      client_completed_at: "2026-09-28T10:01:16.000Z",
    });
  });

  it("미완료 세트·시각 없는 옛 세트는 null", () => {
    const rows = toSetRows(
      ["we-1"],
      [
        exercise({
          sets: [
            newSet({ done: false, doneAtMs: Date.now() }),
            { ...newSet({ done: true }), doneAtMs: undefined },
          ],
        }),
      ],
    );
    expect(rows.map((r) => r.client_completed_at)).toEqual([null, null]);
  });

  it("기존 칸의 규칙은 그대로다 (유산소 거리 m, 시간형 초, 체감)", () => {
    const rows = toSetRows(
      ["a", "b"],
      [
        exercise({
          exerciseType: "cardio",
          sets: [newSet({ distanceKm: 5.2, durationSec: 1800, done: true })],
        }),
        exercise({
          exerciseType: "bodyweight",
          measure: "time",
          sets: [newSet({ durationSec: 37, done: true, effortFeedback: "on_target" })],
        }),
      ],
    );
    expect(rows[0]).toMatchObject({
      workout_exercise_id: "a",
      distance_meters: 5200,
      duration_seconds: 1800,
      reps: null,
      weight_kg: null,
    });
    expect(rows[1]).toMatchObject({
      workout_exercise_id: "b",
      duration_seconds: 37,
      reps: null,
      effort_feedback: "on_target",
    });
  });
});

describe("isMissingClientCompletedAtColumn — 마이그레이션 전 배포 안전망", () => {
  it("그 칸이 없다는 PostgREST 오류만 잡는다", () => {
    expect(
      isMissingClientCompletedAtColumn({
        code: "PGRST204",
        message: "Could not find the 'client_completed_at' column of 'workout_sets' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingClientCompletedAtColumn({ code: "PGRST204", message: "Could not find the 'reps' column" }),
    ).toBe(false);
    expect(
      isMissingClientCompletedAtColumn({ code: "42501", message: "client_completed_at" }),
    ).toBe(false);
  });
});
