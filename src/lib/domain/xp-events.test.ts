import { describe, expect, it } from "vitest";
import { buildXpEvents, type XpEvent } from "./xp-events";
import type { WorkoutXpResult } from "@/lib/workout";

const awarded: WorkoutXpResult = {
  idempotentReplay: false,
  awarded: true,
  xpAwarded: 160,
  breakdown: { baseXp: 100, durationXp: 40, planXp: 0, recordXp: 10, photoXp: 10 },
  newTotalXp: 160,
  previousLevel: 1,
  newLevel: 1,
  previousStage: 1,
  newStage: 1,
  levelUp: false,
  stageUp: false,
  unlockedRewards: [],
};

describe("buildXpEvents", () => {
  it("XP만 받으면 1단계(xp)로 끝난다", () => {
    const events = buildXpEvents(awarded);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "xp", amount: 160 });
  });

  it("breakdown은 0인 항목을 빼고 순서대로 담는다", () => {
    const [e] = buildXpEvents(awarded);
    if (e.type !== "xp") throw new Error("first event must be xp");
    expect(e.breakdown).toEqual([
      { label: "운동 완료", amount: 100 },
      { label: "시간 보너스", amount: 40 },
      { label: "기록 완성", amount: 10 },
      { label: "인증 사진", amount: 10 },
    ]);
  });

  it("순서는 xp → level_up → stage_up → reward", () => {
    const events = buildXpEvents({
      ...awarded,
      previousLevel: 5,
      newLevel: 6,
      previousStage: 1,
      newStage: 2,
      levelUp: true,
      stageUp: true,
      unlockedRewards: [{ key: "stage_evolve_2", label: "눈떴개 캐릭터 진화" }],
    });
    expect(events.map((e) => e.type)).toEqual([
      "xp",
      "level_up",
      "stage_up",
      "reward",
    ]);
    expect(events[1]).toMatchObject({ type: "level_up", from: 5, to: 6 });
    expect(events[2]).toMatchObject({ type: "stage_up", from: 1, to: 2 });
  });

  it("멱등 재생이면 모달을 띄우지 않는다(빈 배열)", () => {
    expect(
      buildXpEvents({
        idempotentReplay: true,
        awarded: false,
        originalXpAwarded: 160,
        currentTotalXp: 160,
        currentLevel: 1,
        currentStage: 1,
        rejectionReason: "XP_ALREADY_AWARDED",
      }),
    ).toEqual([]);
  });

  it("당일 2번째 운동(XP 0·변화 없음)이면 빈 배열", () => {
    expect(
      buildXpEvents({
        ...awarded,
        awarded: false,
        xpAwarded: 0,
        breakdown: { baseXp: 0, durationXp: 0, planXp: 0, recordXp: 0, photoXp: 0 },
      }),
    ).toEqual([]);
  });

  it("levelUp이지만 레벨 값이 없으면 이벤트를 만들지 않는다", () => {
    const events = buildXpEvents({
      ...awarded,
      levelUp: true,
      previousLevel: undefined,
      newLevel: undefined,
    });
    expect(events.map((e) => e.type)).toEqual(["xp"]);
  });
});

describe("buildXpEvents — 포인트·배지 (0032)", () => {
  it("포인트를 받으면 point 이벤트가 xp 다음에 온다", () => {
    const events = buildXpEvents({
      idempotentReplay: false, awarded: true, xpAwarded: 140,
      pointsAwarded: 150, pointMultiplier: 1.5, streakDays: 5,
    });
    expect(events.map((e) => e.type)).toEqual(["xp", "point"]);
    const point = events[1] as Extract<XpEvent, { type: "point" }>;
    expect(point.amount).toBe(150);
    expect(point.multiplier).toBe(1.5);
  });

  it("신규 배지가 있으면 badge 이벤트가 마지막에 온다", () => {
    const events = buildXpEvents({
      idempotentReplay: false, awarded: true, xpAwarded: 100,
      pointsAwarded: 100, pointMultiplier: 1,
      newBadges: [
        { badgeKey: "workout_1", emoji: "🐣", name: "첫 발", tier: "bronze", points: 300 },
      ],
    });
    expect(events.at(-1)?.type).toBe("badge");
  });

  it("포인트가 0이면 point 이벤트를 만들지 않는다", () => {
    const events = buildXpEvents({
      idempotentReplay: false, awarded: false, xpAwarded: 0, pointsAwarded: 0,
    });
    expect(events).toEqual([]);
  });
});
