import { describe, expect, it } from "vitest";
import {
  ROUTINE_BASE_SLOTS,
  nextRoutineSlotLevel,
  routineSlotLimit,
} from "./routines";

/** 0022가 심은 실제 배치 — routine_slot_1은 Lv.12, routine_slot_2는 Lv.27 */
const REWARDS = [
  { level: 2, rewardKey: "xp_history" },
  { level: 12, rewardKey: "routine_slot_1" },
  { level: 13, rewardKey: "copy_last_workout" },
  { level: 27, rewardKey: "routine_slot_2" },
];

describe("routineSlotLimit — 기본 3개 + 레벨 보상으로 각 +1", () => {
  it("레벨 1이면 3개", () => {
    expect(routineSlotLimit(1, REWARDS)).toBe(3);
  });

  it("레벨 11이면 아직 3개", () => {
    expect(routineSlotLimit(11, REWARDS)).toBe(3);
  });

  it("레벨 12에서 4개가 된다", () => {
    expect(routineSlotLimit(12, REWARDS)).toBe(4);
  });

  it("레벨 26이면 아직 4개", () => {
    expect(routineSlotLimit(26, REWARDS)).toBe(4);
  });

  it("레벨 27에서 5개가 된다", () => {
    expect(routineSlotLimit(27, REWARDS)).toBe(5);
  });

  it("최고 레벨에서도 5개를 넘지 않는다", () => {
    expect(routineSlotLimit(35, REWARDS)).toBe(5);
  });

  it("레벨 숫자를 코드에 박지 않는다 — 보상 배치가 바뀌면 결과도 바뀐다", () => {
    // level_definitions가 단일 진실이다. 12·27이 상수로 박혀 있으면
    // 이 단언이 실패한다.
    const moved = [
      { level: 5, rewardKey: "routine_slot_1" },
      { level: 9, rewardKey: "routine_slot_2" },
    ];
    expect(routineSlotLimit(5, moved)).toBe(4);
    expect(routineSlotLimit(9, moved)).toBe(5);
    expect(routineSlotLimit(12, REWARDS)).toBe(4); // 원래 표는 그대로
  });

  it("보상 표를 못 불러왔으면 기본값으로 버틴다", () => {
    expect(routineSlotLimit(30, [])).toBe(ROUTINE_BASE_SLOTS);
  });

  it("기본 슬롯은 3개다", () => {
    expect(ROUTINE_BASE_SLOTS).toBe(3);
  });
});

describe("nextRoutineSlotLevel — 다음 슬롯이 열리는 레벨", () => {
  it("레벨 1이면 12를 알려준다", () => {
    expect(nextRoutineSlotLevel(1, REWARDS)).toBe(12);
  });

  it("레벨 12면 다음은 27이다", () => {
    expect(nextRoutineSlotLevel(12, REWARDS)).toBe(27);
  });

  it("더 열릴 슬롯이 없으면 null", () => {
    expect(nextRoutineSlotLevel(27, REWARDS)).toBeNull();
    expect(nextRoutineSlotLevel(35, REWARDS)).toBeNull();
  });

  it("가장 가까운 레벨을 고른다 (표 순서가 뒤섞여 있어도)", () => {
    const shuffled = [
      { level: 27, rewardKey: "routine_slot_2" },
      { level: 12, rewardKey: "routine_slot_1" },
    ];
    expect(nextRoutineSlotLevel(1, shuffled)).toBe(12);
  });
});
