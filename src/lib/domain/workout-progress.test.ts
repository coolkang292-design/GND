import { describe, expect, it } from "vitest";

import { exerciseSetProgress, workoutProgress } from "./workout-progress";

const set = (done: boolean) => ({ done });
const ex = (...dones: boolean[]) => ({ sets: dones.map(set) });

describe("workoutProgress — 오늘 담은 세트 기준 진행률 (2026-08-07)", () => {
  it("완료한 세트 수와 전체 세트 수를 센다", () => {
    // 목업의 `3 / 8 완료 · 37%`가 이 계산이다
    const out = workoutProgress([ex(true, true, true, false), ex(false, false, false, false)]);
    expect(out.completed).toBe(3);
    expect(out.total).toBe(8);
    expect(out.percent).toBe(37);
  });

  it("종목이 아니라 **세트**를 센다", () => {
    // 종목 기준이면 2종목 중 1개 완료 = 50%가 되어 목업과 어긋난다
    expect(workoutProgress([ex(true, true), ex(false, false)]).percent).toBe(50);
    expect(workoutProgress([ex(true), ex(false, false, false)]).completed).toBe(1);
  });

  it("소수점은 버린다 — 다 안 했는데 100%로 보이면 안 된다", () => {
    const almost = workoutProgress([ex(...Array(99).fill(true), false)]);
    expect(almost.percent).toBe(99);
    expect(almost.percent).toBeLessThan(100);
  });

  it("하나도 안 했으면 0%, 다 했으면 100%", () => {
    expect(workoutProgress([ex(false, false)]).percent).toBe(0);
    expect(workoutProgress([ex(true, true)]).percent).toBe(100);
  });

  it("담은 세트가 없으면 0으로 나누지 않는다", () => {
    expect(workoutProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(workoutProgress([ex()])).toEqual({ completed: 0, total: 0, percent: 0 });
  });
});

describe("exerciseSetProgress — 휴식 화면의 '몇 세트 남았나' (2026-08-07)", () => {
  it("한 종목의 완료·전체·남은 세트를 센다", () => {
    // 목업: `3세트 / 4세트` · `1세트 남음`
    expect(exerciseSetProgress(ex(true, true, true, false))).toEqual({
      done: 3,
      total: 4,
      remaining: 1,
    });
  });

  it("다 했으면 남은 세트가 0이다", () => {
    expect(exerciseSetProgress(ex(true, true))).toEqual({
      done: 2,
      total: 2,
      remaining: 0,
    });
  });

  it("종목이 없으면 0으로 (휴식 화면이 종목을 못 찾을 때)", () => {
    expect(exerciseSetProgress(undefined)).toEqual({
      done: 0,
      total: 0,
      remaining: 0,
    });
  });
});
