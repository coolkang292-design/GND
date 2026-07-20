import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "@/lib/types";

import {
  TABATA_EXERCISE_COUNT,
  TABATA_TRACKS,
  tabataDraftExercises,
  tabataTrackForMinutes,
} from "./tabata";

const catalogItem = (name: string): CatalogExercise => ({
  id: `cat-${name}`,
  name,
  body_part: "코어",
  exercise_type: "bodyweight",
  measure: "reps",
  is_custom: false,
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
});

describe("tabataDraftExercises", () => {
  it("선택한 운동을 각 1세트(미완료) 임시운동으로 변환한다", () => {
    let n = 0;
    const result = tabataDraftExercises(
      [catalogItem("버피"), catalogItem("마운틴 클라이머")],
      () => `key-${n++}`,
    );
    expect(result).toEqual([
      {
        key: "key-0",
        name: "버피",
        bodyPart: "코어",
        exerciseType: "bodyweight",
        measure: "reps",
        isCustom: false,
        sets: [
          {
            key: "key-1",
            weightKg: 0,
            reps: 0,
            distanceKm: 0,
            durationMin: 0,
            done: false,
          },
        ],
      },
      {
        key: "key-2",
        name: "마운틴 클라이머",
        bodyPart: "코어",
        exerciseType: "bodyweight",
        measure: "reps",
        isCustom: false,
        sets: [
          {
            key: "key-3",
            weightKg: 0,
            reps: 0,
            distanceKm: 0,
            durationMin: 0,
            done: false,
          },
        ],
      },
    ]);
  });

  it("타바타 구성 운동 수는 4개다", () => {
    expect(TABATA_EXERCISE_COUNT).toBe(4);
  });
});

describe("타바타 코스", () => {
  it("4·8·16분 코스가 각자의 음원을 가진다", () => {
    expect(TABATA_TRACKS.map((t) => t.minutes)).toEqual([4, 8, 16]);
    expect(new Set(TABATA_TRACKS.map((t) => t.src)).size).toBe(3);
    for (const track of TABATA_TRACKS) {
      expect(track.src).toMatch(/^\/audio\/tabata-.*\.mp3$/);
    }
  });

  it("분수로 코스를 찾는다", () => {
    expect(tabataTrackForMinutes(8)?.src).toBe(
      "/audio/tabata-8min-total-body.mp3",
    );
    expect(tabataTrackForMinutes(5)).toBeNull();
  });
});
