import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * 유니온과 배열이 갈라지는 것을 막는다 (0089).
 *
 * 이 함정은 **세 번 반복됐다** — 0038·0082·0084가 각자 주석으로 "유니온만
 * 고치면 코드가 null로 떨어진다"고 경고를 남겼는데도 다음 사람이 또 밟았다.
 * 주석은 읽는 사람에게만 효과가 있고, 급한 사람은 주석을 안 읽는다.
 *
 * 그래서 소스를 직접 읽어 두 목록을 대조한다. 한쪽만 늘리면 여기서 실패한다.
 */
describe("SocialErrorCode 유니온 ↔ SOCIAL_ERROR_CODES 배열", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/social.ts"), "utf8");

  /** `export type SocialErrorCode =` 부터 `;` 까지에서 "따옴표 안"만 모은다 */
  function unionMembers(): string[] {
    const start = source.indexOf("export type SocialErrorCode");
    expect(start, "SocialErrorCode 유니온을 못 찾았다").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf(";", start));
    return [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  }

  /** `const SOCIAL_ERROR_CODES ... = [` 부터 `];` 까지 */
  function arrayMembers(): string[] {
    const start = source.indexOf("const SOCIAL_ERROR_CODES");
    expect(start, "SOCIAL_ERROR_CODES 배열을 못 찾았다").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("];", start));
    return [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  }

  it("두 목록이 정확히 같은 집합이다", () => {
    const union = unionMembers();
    const array = arrayMembers();
    expect(union.length).toBeGreaterThan(20);

    const missingFromArray = union.filter((c) => !array.includes(c));
    const missingFromUnion = array.filter((c) => !union.includes(c));

    expect(
      missingFromArray,
      "유니온에만 있다 — 런타임에 코드가 null로 떨어져 화면엔 '알 수 없는 오류'만 뜬다",
    ).toEqual([]);
    expect(missingFromUnion, "배열에만 있다 — 타입에 없는 코드다").toEqual([]);
  });

  it("배열에 중복이 없다", () => {
    const array = arrayMembers();
    const dup = array.filter((c, i) => array.indexOf(c) !== i);
    expect(dup).toEqual([]);
  });

  /**
   * toSocialError는 `message.includes(code)`로 **처음 맞는 것**을 고른다.
   * 짧은 코드가 앞에 있고 긴 코드가 뒤에 있으면, 긴 코드의 오류가 짧은 쪽
   * 이름으로 잡혀 엉뚱한 문구가 뜬다. 배열 순서까지 포함해 못 박는다.
   */
  it("어떤 코드도 자기보다 앞선 코드를 부분문자열로 품지 않는다", () => {
    const array = arrayMembers();
    const bad: string[] = [];
    array.forEach((code, i) => {
      const shadowedBy = array.slice(0, i).find((earlier) => code.includes(earlier));
      if (shadowedBy) bad.push(`${code} ← ${shadowedBy}가 먼저 잡힌다`);
    });
    expect(bad).toEqual([]);
  });

  it("0089가 더한 코드가 제 이름으로 잡힌다", () => {
    // 신고 관련 코드(self_report·invalid_reason·note_too_long)는 2026-08-31에
    // 신고 기능을 걷어내면서 같이 지웠다 — report_user를 부르는 곳이 없다.
    for (const code of ["self_block", "blocked_by_me"]) {
      expect(toSocialError({ message: `${code}` }).code, `${code}가 다른 코드로 잡힌다`).toBe(code);
    }
  });

  /**
   * 상대가 나를 차단한 경우 서버는 일부러 request_exists를 던진다(0089).
   * 여기에 blocked_by_them 같은 코드가 생기면 은폐가 무너진다.
   */
  it("차단당한 쪽을 드러내는 코드를 만들지 않았다", () => {
    const array = arrayMembers();
    expect(array.filter((c) => /blocked_by_them|blocked_by_target|is_blocked/.test(c))).toEqual([]);
  });
});
