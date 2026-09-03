import { describe, expect, it } from "vitest";
import {
  PRESET_ROUTINES,
  PULLUP_EXERCISE_NAME,
  PULLUP_LADDER_DAY1,
  buildPresetRoutineExercises,
  visiblePresetRoutines,
} from "./preset-routines";
import type { CatalogExercise } from "@/lib/types";

/** 운영 카탈로그의 풀업 행과 같은 모양 (2026-09-03 실측) */
const PULLUP: CatalogExercise = {
  id: "pullup-id",
  name: "풀업",
  body_part: "등",
  exercise_type: "bodyweight",
  measure: "reps",
  is_custom: false,
  created_by: null,
} as CatalogExercise;

describe("추천 루틴 — 풀업 사다리", () => {
  it("1일차가 출처의 숫자 그대로다 (5·4·3·2·1)", () => {
    // ⚠️ 이 단언이 깨지면 출처와 갈라진 것이다. 숫자를 고치지 말고 출처를 다시 봐라.
    expect(PULLUP_LADDER_DAY1).toEqual([5, 4, 3, 2, 1]);
  });

  it("세트마다 횟수가 다르게 담긴다 — 균등 세트가 아니다", () => {
    // 사다리의 핵심. 3세트 10회 같은 균등 기본값으로 바뀌면 루틴이 아니게 된다.
    const [exercise] = buildPresetRoutineExercises(PRESET_ROUTINES[0], [
      PULLUP,
    ])!;
    expect(exercise.sets.map((s) => s.reps)).toEqual([5, 4, 3, 2, 1]);
    expect(exercise.sets).toHaveLength(5);
  });

  it("부위·유형·measure를 카탈로그 행에서 읽는다 (상수에 안 박는다)", () => {
    const [exercise] = buildPresetRoutineExercises(PRESET_ROUTINES[0], [
      PULLUP,
    ])!;
    expect(exercise.name).toBe(PULLUP_EXERCISE_NAME);
    expect(exercise.bodyPart).toBe("등");
    expect(exercise.exerciseType).toBe("bodyweight");
    expect(exercise.measure).toBe("reps");
    expect(exercise.isCustom).toBe(false);
  });

  it("무게·거리·시간은 0이다 — 맨몸이라 운동 중에도 안 묻는다", () => {
    const [exercise] = buildPresetRoutineExercises(PRESET_ROUTINES[0], [
      PULLUP,
    ])!;
    for (const set of exercise.sets) {
      expect(set.weightKg).toBe(0);
      expect(set.distanceKm).toBe(0);
      expect(set.durationMin).toBe(0);
    }
  });

  it("카탈로그에 종목이 없으면 null — 눌러도 안 되는 카드를 안 만든다", () => {
    expect(buildPresetRoutineExercises(PRESET_ROUTINES[0], [])).toBeNull();
    expect(visiblePresetRoutines([])).toHaveLength(0);
  });

  it("커스텀 종목(같은 이름)은 쓰지 않는다 — 공식 시드만", () => {
    // 남이 만든 '풀업'을 집으면 부위·유형이 제각각이라 사다리가 엉뚱해진다.
    const custom = { ...PULLUP, created_by: "someone", is_custom: true };
    expect(
      buildPresetRoutineExercises(PRESET_ROUTINES[0], [
        custom as CatalogExercise,
      ]),
    ).toBeNull();
  });

  it("카탈로그에 풀업이 있으면 목록에 나온다", () => {
    const visible = visiblePresetRoutines([PULLUP]);
    expect(visible).toHaveLength(1);
    expect(visible[0].key).toBe("pullup-ladder");
  });

  it("안내 문구가 '앱이 자동으로 올려준다'고 말하지 않는다", () => {
    // 진행은 사용자가 '지난 기록 불러오기'로 한다. 자동이라고 읽히면 안 된다.
    const preset = PRESET_ROUTINES[0];
    expect(preset.howTo).toContain("올려요");
    expect(preset.howTo).not.toContain("자동");
  });
});
