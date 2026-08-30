import { describe, expect, it } from "vitest";

import {
  applyMyWeights,
  copySourceSessionId,
  referenceLabel,
  shouldApplyCopy,
} from "./workout-copy";
import type { LocalExercise, LocalSet } from "@/lib/workout";

const base = {
  requested: true,
  consumed: false,
  catalogReady: true,
  workoutStarted: false,
};

describe("shouldApplyCopy", () => {
  it("요청이 있고 준비가 끝났으면 담는다", () => {
    expect(shouldApplyCopy(base)).toBe(true);
  });

  it("주소에 표식이 없으면 담지 않는다", () => {
    expect(shouldApplyCopy({ ...base, requested: false })).toBe(false);
  });

  /**
   * ⚠️ 회귀 방어. 이게 없으면 새로고침할 때마다 같은 운동이 또 담긴다 —
   * 벤치프레스가 두 번, 세 번 쌓인다.
   */
  it("이미 담았으면 두 번 담지 않는다", () => {
    expect(shouldApplyCopy({ ...base, consumed: true })).toBe(false);
  });

  /**
   * ⚠️⚠️ 회귀 방어. 진행 중인 운동의 draft를 덮으면 **지금 하고 있던 세트가
   * 사라진다.** 사용자가 가장 화나는 종류의 버그다.
   */
  it("이미 운동을 시작했으면 담지 않는다", () => {
    expect(shouldApplyCopy({ ...base, workoutStarted: true })).toBe(false);
  });

  /**
   * 카탈로그가 없으면 이름→부위·커스텀 여부를 못 찾아 종목이 전부 "코어"로
   * 떨어진다. 준비될 때까지 기다렸다가 담는다(`?suggest`와 같은 두 단계).
   */
  it("카탈로그가 아직이면 기다린다", () => {
    expect(shouldApplyCopy({ ...base, catalogReady: false })).toBe(false);
  });
});

describe("copySourceSessionId", () => {
  /**
   * ⚠️⚠️ 회귀 방어. 남의 세션 id를 남기면 `workout_plans_insert_own`의
   * WITH CHECK — `(source_session_id is null) or owns_workout_session(...)` —
   * 에 걸려 **예정표 저장이 통째로 실패한다.** 게다가 남의 기록이 내 기록 갱신
   * 비교 기준이 되어 **내가 한 적 없는 무게가 내 최고 기록**이 된다.
   */
  it("남의 운동을 따라할 때는 null", () => {
    expect(
      copySourceSessionId({
        sessionId: "s1",
        sessionOwnerId: "friend",
        viewerId: "me",
      }),
    ).toBeNull();
  });

  it("내 과거 운동을 복사할 때는 그대로 남긴다", () => {
    expect(
      copySourceSessionId({
        sessionId: "s1",
        sessionOwnerId: "me",
        viewerId: "me",
      }),
    ).toBe("s1");
  });
});

// ── 무게는 내 것으로 (사용자 결정 2026-08-31) ────────────────

function set(weightKg: number, reps = 10): LocalSet {
  return {
    key: `k${weightKg}-${reps}`,
    weightKg,
    reps,
    distanceKm: 0,
    durationMin: 0,
    durationSec: 0,
    done: false,
  };
}

function ex(
  name: string,
  exerciseType: LocalExercise["exerciseType"],
  sets: LocalSet[],
): LocalExercise {
  return {
    key: `key-${name}`,
    name,
    bodyPart: "가슴",
    exerciseType,
    measure: null,
    isCustom: false,
    sets,
  };
}

describe("applyMyWeights", () => {
  /**
   * ⚠️⚠️ 이 기능의 존재 이유. 친구가 벤치 100kg을 들었다고 내 화면에 100kg이
   * 채워지면 그건 편의가 아니라 **다칠 수 있는 기본값**이다.
   */
  it("① 내 기록이 있으면 내 무게로 갈아 끼운다", () => {
    const out = applyMyWeights({
      imported: [ex("벤치프레스", "weight", [set(100), set(100), set(100)])],
      myLastByName: new Map([["벤치프레스", [set(40), set(45), set(45)]]]),
    });
    expect(out.exercises[0].sets.map((s) => s.weightKg)).toEqual([40, 45, 45]);
  });

  it("① 내 세트가 모자라면 내 마지막 무게를 이어 쓴다", () => {
    const out = applyMyWeights({
      imported: [ex("벤치프레스", "weight", [set(100), set(100), set(100)])],
      myLastByName: new Map([["벤치프레스", [set(40), set(45)]]]),
    });
    expect(out.exercises[0].sets.map((s) => s.weightKg)).toEqual([40, 45, 45]);
  });

  it("② 내 기록이 없으면 무게를 비운다 — 친구 무게가 남으면 안 된다", () => {
    const out = applyMyWeights({
      imported: [ex("벤치프레스", "weight", [set(100), set(100)])],
      myLastByName: new Map(),
    });
    expect(out.exercises[0].sets.map((s) => s.weightKg)).toEqual([0, 0]);
  });

  it("설계(세트 수·횟수)는 친구 것을 그대로 지킨다", () => {
    const out = applyMyWeights({
      imported: [ex("벤치프레스", "weight", [set(100, 8), set(100, 6)])],
      myLastByName: new Map([["벤치프레스", [set(40, 12)]]]),
    });
    expect(out.exercises[0].sets).toHaveLength(2);
    expect(out.exercises[0].sets.map((s) => s.reps)).toEqual([8, 6]);
  });

  it("③ 친구 무게를 참고로 남긴다", () => {
    const out = applyMyWeights({
      imported: [ex("벤치프레스", "weight", [set(100), set(105)])],
      myLastByName: new Map([["벤치프레스", [set(40)]]]),
    });
    expect(out.reference).toEqual([
      { exerciseKey: "key-벤치프레스", name: "벤치프레스", weights: [100, 105] },
    ]);
  });

  it("친구도 무게를 안 썼으면 참고가 없다", () => {
    const out = applyMyWeights({
      imported: [ex("벤치프레스", "weight", [set(0), set(0)])],
      myLastByName: new Map(),
    });
    expect(out.reference).toEqual([]);
  });

  /** 맨몸·유산소·시간형에는 갈아 끼울 무게가 없다. 횟수·거리·시간은 설계다 */
  it("무게가 없는 종목은 손대지 않는다", () => {
    const push = ex("푸시업", "bodyweight", [set(0, 30)]);
    const out = applyMyWeights({
      imported: [push],
      myLastByName: new Map([["푸시업", [set(0, 10)]]]),
    });
    expect(out.exercises[0]).toBe(push);
    expect(out.reference).toEqual([]);
  });

  it("빈 입력이면 빈 결과", () => {
    expect(applyMyWeights({ imported: [], myLastByName: new Map() })).toEqual({
      exercises: [],
      reference: [],
    });
  });
});

describe("referenceLabel", () => {
  it("무게를 가운뎃점으로 잇는다", () => {
    expect(referenceLabel([60, 60, 65])).toBe("60 · 60 · 65kg");
  });

  it("0은 빼고 보여준다", () => {
    expect(referenceLabel([60, 0])).toBe("60kg");
  });

  it("볼 것이 없으면 빈 문자열", () => {
    expect(referenceLabel([0, 0])).toBe("");
    expect(referenceLabel([])).toBe("");
  });
});
