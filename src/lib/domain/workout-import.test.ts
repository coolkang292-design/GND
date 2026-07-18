import { describe, expect, it } from "vitest";
import type { LocalExercise } from "@/lib/workout";
import {
  buildEffortMessage,
  mergeImportedExercises,
  replaceWithLastRecordedSets,
} from "./workout-import";

function exercise(
  input: Partial<LocalExercise> & Pick<LocalExercise, "name" | "exerciseType">,
): LocalExercise {
  return {
    key: input.key ?? input.name,
    name: input.name,
    bodyPart: input.bodyPart ?? "코어",
    exerciseType: input.exerciseType,
    measure: input.measure ?? null,
    isCustom: input.isCustom ?? false,
    sets: input.sets ?? [],
  };
}

describe("mergeImportedExercises", () => {
  it("기존 종목 이름과 겹치지 않는 지난 운동만 뒤에 추가한다", () => {
    const current = [exercise({ name: "벤치프레스", exerciseType: "weight" })];
    const imported = [
      exercise({ key: "new-bench", name: " 벤치프레스 ", exerciseType: "weight" }),
      exercise({ name: "랫풀다운", exerciseType: "weight" }),
    ];

    const result = mergeImportedExercises(current, imported);

    expect(result.exercises.map((item) => item.name)).toEqual([
      "벤치프레스",
      "랫풀다운",
    ]);
    expect(result.added).toEqual([imported[1]]);
    expect(result.skippedCount).toBe(1);
  });
});

describe("replaceWithLastRecordedSets", () => {
  it("기존 세트 대신 마지막 기록의 모든 세트를 완료 전 상태로 불러온다", () => {
    const currentExercise = exercise({
      key: "bench-press",
      name: "벤치 프레스",
      exerciseType: "weight",
      sets: [
        { key: "current-set", weightKg: 40, reps: 10, distanceKm: 0, durationMin: 0, done: true },
      ],
    });
    const recordedSets = [
      { key: "recorded-1", weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: true },
      { key: "recorded-2", weightKg: 65, reps: 6, distanceKm: 0, durationMin: 0, done: true },
    ];

    const result = replaceWithLastRecordedSets(currentExercise, recordedSets);

    expect(result).toEqual({
      ...currentExercise,
      sets: [
        { ...recordedSets[0], done: false },
        { ...recordedSets[1], done: false },
      ],
    });
    expect(recordedSets.every((set) => set.done)).toBe(true);
  });
});

describe("buildEffortMessage", () => {
  it("중량 운동은 마지막 세트의 같은 중량에서 1회 추가를 제안한다", () => {
    const message = buildEffortMessage([
      exercise({
        name: "벤치프레스",
        exerciseType: "weight",
        sets: [
          { key: "s1", weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: false },
        ],
      }),
    ]);

    expect(message).toBe(
      "벤치프레스 마지막 세트가 60kg × 8회였어요. 컨디션 괜찮으면 이번에는 1회만 더 들어봐요.",
    );
  });

  it("맨몸 횟수 운동은 마지막 세트에서 1회 추가를 제안한다", () => {
    const message = buildEffortMessage([
      exercise({
        name: "스쿼트",
        exerciseType: "bodyweight",
        measure: "reps",
        sets: [
          { key: "s1", weightKg: 0, reps: 15, distanceKm: 0, durationMin: 0, done: false },
        ],
      }),
    ]);

    expect(message).toBe(
      "스쿼트 마지막 세트에서 15회 했어요. 컨디션 괜찮으면 오늘은 1회만 더 도전해봐요.",
    );
  });

  it("시간 운동은 1분 추가를 제안한다", () => {
    const message = buildEffortMessage([
      exercise({
        name: "플랭크",
        exerciseType: "bodyweight",
        measure: "time",
        sets: [
          { key: "s1", weightKg: 0, reps: 0, distanceKm: 0, durationMin: 3, done: false },
        ],
      }),
    ]);

    expect(message).toBe(
      "플랭크를 지난번에는 3분 했어요. 컨디션 괜찮으면 오늘은 1분만 더 버텨봐요.",
    );
  });

  it("유산소는 지난 거리보다 0.1km 추가를 제안한다", () => {
    const message = buildEffortMessage([
      exercise({
        name: "러닝",
        exerciseType: "cardio",
        sets: [
          { key: "s1", weightKg: 0, reps: 0, distanceKm: 5, durationMin: 30, done: false },
        ],
      }),
    ]);

    expect(message).toBe(
      "러닝을 지난번에는 5km 했어요. 컨디션 괜찮으면 오늘은 0.1km만 더 가봐요.",
    );
  });

  it("사용할 수치가 없으면 일반적인 마지막 세트 도전을 제안한다", () => {
    expect(
      buildEffortMessage([
        exercise({ name: "새 운동", exerciseType: "bodyweight", measure: "reps" }),
      ]),
    ).toBe(
      "지난번 루틴을 불러왔어요. 컨디션 괜찮으면 오늘은 마지막 세트에서 1회만 더 도전해봐요.",
    );
  });
});
