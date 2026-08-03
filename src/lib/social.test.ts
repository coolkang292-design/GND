import { describe, expect, it } from "vitest";
import { toFeedBreakdown, toSocialError } from "./social";

/**
 * toSocialError는 SOCIAL_ERROR_CODES를 순서대로 훑으며 message.includes(code)로
 * 고른다. 배열이 커질수록 "먼저 나온 짧은 코드가 나중 코드의 부분문자열이라
 * 엉뚱한 게 먼저 잡히는" 사고가 나기 쉬운 구조다. 0038이 7개를 더했으므로
 * 새 코드가 제 이름으로 잡히는지 여기서 못 박는다.
 */
describe("toSocialError — 0038 크루 연결 에러 코드", () => {
  const codes = [
    "self_request",
    "already_crew",
    "request_exists",
    "target_not_found",
    "not_addressee",
    "not_pending",
    "not_requester",
    "not_crew",
  ] as const;

  it.each(codes)("%s 는 자기 이름으로 잡힌다", (code) => {
    expect(toSocialError({ message: code }).code).toBe(code);
  });

  it("모르는 메시지는 code가 null이다", () => {
    expect(toSocialError({ message: "42501: permission denied" }).code).toBe(
      null,
    );
  });

  it("기존 코드가 새 코드에 밀리지 않는다", () => {
    expect(toSocialError({ message: "self_poke" }).code).toBe("self_poke");
    expect(toSocialError({ message: "session_not_found" }).code).toBe(
      "session_not_found",
    );
  });
});

/**
 * ④ 지난 기록 상세 — 피드 경로 (2026-08-04).
 *
 * `getCrewFeed`는 세트를 **이미 select하고** 볼륨 요약만 남긴 채 버렸다.
 * 버리지 않고 표시용 모양으로 접는다 — 새 질의가 없다.
 */
describe("toFeedBreakdown — 피드 행 → 세트 표시 모양", () => {
  const set = (partial: Record<string, unknown> = {}) => ({
    set_number: 1,
    weight_kg: 60,
    reps: 8,
    duration_seconds: null,
    distance_meters: null,
    is_completed: true,
    ...partial,
  });

  it("종목이 없으면 빈 배열", () => {
    expect(toFeedBreakdown(null)).toEqual([]);
    expect(toFeedBreakdown([])).toEqual([]);
  });

  it("sort_order 순으로 종목을 정렬한다 — DB 결과 순서에 기대지 않는다", () => {
    const result = toFeedBreakdown([
      { exercise_name: "나중", exercise_type: "weight", measure: null, sort_order: 2, workout_sets: [set()] },
      { exercise_name: "먼저", exercise_type: "weight", measure: null, sort_order: 1, workout_sets: [set()] },
    ]);

    expect(result.map((e) => e.name)).toEqual(["먼저", "나중"]);
  });

  it("set_number 순으로 세트를 정렬한다", () => {
    const [exercise] = toFeedBreakdown([
      {
        exercise_name: "벤치",
        exercise_type: "weight",
        measure: null,
        sort_order: 1,
        workout_sets: [set({ set_number: 2, reps: 5 }), set({ set_number: 1, reps: 8 })],
      },
    ]);

    expect(exercise.sets.map((s) => s.reps)).toEqual([8, 5]);
  });

  it("완료 여부를 done으로 옮긴다 — 기록이므로 계획과 달리 반드시 있어야 한다", () => {
    const [exercise] = toFeedBreakdown([
      {
        exercise_name: "벤치",
        exercise_type: "weight",
        measure: null,
        sort_order: 1,
        workout_sets: [set({ is_completed: false })],
      },
    ]);

    expect(exercise.sets[0].done).toBe(false);
  });

  it("measure를 그대로 넘긴다 — 없으면 맨몸 시간형이 '0회'로 그려진다", () => {
    const [exercise] = toFeedBreakdown([
      {
        exercise_name: "플랭크",
        exercise_type: "bodyweight",
        measure: "time",
        sort_order: 1,
        workout_sets: [set({ weight_kg: null, reps: null, duration_seconds: 120 })],
      },
    ]);

    expect(exercise.measure).toBe("time");
    expect(exercise.sets[0].durationMin).toBe(2);
  });

  it("거리는 m → km, 시간은 초 → 분으로 바꾼다", () => {
    const [exercise] = toFeedBreakdown([
      {
        exercise_name: "러닝",
        exercise_type: "cardio",
        measure: null,
        sort_order: 1,
        workout_sets: [set({ weight_kg: null, reps: null, distance_meters: 3500, duration_seconds: 1800 })],
      },
    ]);

    expect(exercise.sets[0].distanceKm).toBe(3.5);
    expect(exercise.sets[0].durationMin).toBe(30);
  });

  it("null 수치는 0으로 채운다", () => {
    const [exercise] = toFeedBreakdown([
      {
        exercise_name: "풀업",
        exercise_type: "bodyweight",
        measure: "reps",
        sort_order: 1,
        workout_sets: [set({ weight_kg: null, reps: null, duration_seconds: null, distance_meters: null })],
      },
    ]);

    expect(exercise.sets[0]).toMatchObject({
      weightKg: 0,
      reps: 0,
      distanceKm: 0,
      durationMin: 0,
    });
  });
});
