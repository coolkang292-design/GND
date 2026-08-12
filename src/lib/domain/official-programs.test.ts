import { describe, expect, expectTypeOf, it } from "vitest";
import type { CatalogExercise } from "../types";
import {
  OFFICIAL_PROGRAMS,
  resolveProgram,
  type OfficialProgramRestSeconds,
} from "./official-programs";

const EXPECTED = [
  ["shoulder-frame-6w", "시선이 머무는 어깨", "상체의 틀을 넓히는 6주"],
  ["chest-frame-6w", "옷태를 세우는 가슴", "상체 앞면을 단단하게 만드는 6주"],
  ["arm-outline-6w", "소매를 채우는 팔", "팔의 두께와 윤곽을 만드는 6주"],
  ["lower-balance-6w", "실루엣을 완성하는 하체", "하체의 힘과 균형을 세우는 6주"],
  ["lean-body-6w", "몸은 가볍게, 인상은 선명하게", "근육을 지키는 체지방 관리 6주"],
];

describe("GND 공식 프로그램 카탈로그", () => {
  it("카탈로그에 없는 종목을 중복 없이 프로그램 최초 등장 순서로 모두 알린다", () => {
    expect(() => resolveProgram(OFFICIAL_PROGRAMS[0], [])).toThrowError(
      "program_exercise_missing:바벨 백스쿼트,벤치프레스,시티드 로우,숄더프레스,사이드 레터럴 레이즈,루마니안 데드리프트,랫풀다운,인클라인 벤치프레스,페이스풀,덤벨 컬,레그프레스,덤벨 벤치프레스,바벨 로우,덤벨 레터럴 레이즈,케이블 푸시다운",
    );
  });

  it("필요한 모든 카탈로그 종목을 원래 처방과 결합한다", () => {
    const program = OFFICIAL_PROGRAMS[0];
    const names = [
      ...new Set(
        program.sessions.flatMap((session) =>
          session.exercises.map((exercise) => exercise.exerciseName),
        ),
      ),
    ];
    const catalog: CatalogExercise[] = names.map((name, index) => ({
      id: `catalog-${index}`,
      name,
      body_part: "가슴",
      exercise_type: "weight",
      measure: null,
      is_custom: false,
      created_by: null,
      created_at: "2026-08-12T00:00:00.000Z",
    }));

    const resolved = resolveProgram(program, catalog);

    expect(resolved).toHaveLength(program.sessions.length);
    for (const [sessionIndex, session] of program.sessions.entries()) {
      expect(resolved[sessionIndex]).toEqual({
        key: session.key,
        title: session.title,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          item: catalog.find(
            (item) => item.name === exercise.exerciseName,
          ),
        })),
      });
    }
  });

  it("해석 후에도 프로그램과 카탈로그 입력을 변경하지 않는다", () => {
    const program = structuredClone(OFFICIAL_PROGRAMS[0]);
    const names = [
      ...new Set(
        program.sessions.flatMap((session) =>
          session.exercises.map((exercise) => exercise.exerciseName),
        ),
      ),
    ];
    const catalog: CatalogExercise[] = names.map((name, index) => ({
      id: `catalog-${index}`,
      name,
      body_part: "가슴",
      exercise_type: "weight",
      measure: null,
      is_custom: false,
      created_by: null,
      created_at: "2026-08-12T00:00:00.000Z",
    }));
    const programBefore = structuredClone(program);
    const catalogBefore = structuredClone(catalog);

    resolveProgram(program, catalog);

    expect(program).toEqual(programBefore);
    expect(catalog).toEqual(catalogBefore);
  });

  it("승인된 5종을 정해진 순서와 문구로 제공한다", () => {
    expect(
      OFFICIAL_PROGRAMS.map((program) => [
        program.key,
        program.eyebrow,
        program.title,
      ]),
    ).toEqual(EXPECTED);
  });

  it("모두 주 3회 6주 A/B/C 구조다", () => {
    for (const program of OFFICIAL_PROGRAMS) {
      expect(program.weeks).toBe(6);
      expect(program.sessionsPerWeek).toBe(3);
      expect(program.sessions.map((session) => session.key)).toEqual([
        "A",
        "B",
        "C",
      ]);
    }
  });

  it("모든 프로그램의 메타데이터 버전은 1이다", () => {
    expect(OFFICIAL_PROGRAMS.map((program) => program.version)).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });

  it("프로그램 순서에 맞는 표지 이미지 경로를 제공한다", () => {
    expect(OFFICIAL_PROGRAMS.map((program) => program.coverImage)).toEqual([
      "/program-assets/shoulder.webp",
      "/program-assets/chest.webp",
      "/program-assets/arms.webp",
      "/program-assets/lower.webp",
      "/program-assets/lean.webp",
    ]);
  });

  it("공식 프로그램의 휴식시간은 승인된 다섯 값으로 제한한다", () => {
    expectTypeOf<OfficialProgramRestSeconds>().toEqualTypeOf<
      60 | 75 | 90 | 120 | 150
    >();
  });

  it("설명과 예상 운동시간 범위가 유효하다", () => {
    for (const program of OFFICIAL_PROGRAMS) {
      expect(program.description.trim()).not.toBe("");
      const [minMinutes, maxMinutes] = program.durationMinutes;
      expect(minMinutes).toBeLessThan(maxMinutes);
      expect(minMinutes).toBeGreaterThanOrEqual(40);
      expect(maxMinutes).toBeLessThanOrEqual(65);
    }
  });

  it("모든 회차는 운동 5~6개로 구성한다", () => {
    for (const program of OFFICIAL_PROGRAMS) {
      for (const session of program.sessions) {
        expect(session.exercises.length).toBeGreaterThanOrEqual(5);
        expect(session.exercises.length).toBeLessThanOrEqual(6);
      }
    }
  });

  it("모든 운동에 유효한 세트·반복·여유·휴식·증량 단위가 있다", () => {
    for (const program of OFFICIAL_PROGRAMS) {
      for (const session of program.sessions) {
        for (const exercise of session.exercises) {
          expect(exercise.beginnerSets).toBeGreaterThanOrEqual(2);
          expect(exercise.experiencedSets).toBeGreaterThanOrEqual(
            exercise.beginnerSets,
          );
          expect(exercise.repsMin).toBeLessThanOrEqual(exercise.repsMax);
          expect([1, 2, 3]).toContain(exercise.targetRir);
          expect([60, 75, 90, 120, 150]).toContain(exercise.restSeconds);
          expect([1, 2.5, 5]).toContain(exercise.loadStepKg);
        }
      }
    }
  });

  it("다섯 프로그램의 회차별 종목 이름이 승인 표와 같다", () => {
    expect(
      OFFICIAL_PROGRAMS.map((program) =>
        program.sessions.map((session) =>
          session.exercises.map((exercise) => exercise.exerciseName),
        ),
      ),
    ).toMatchSnapshot();
  });

  it("다섯 프로그램의 회차별 전체 처방이 승인 표와 같다", () => {
    expect(
      OFFICIAL_PROGRAMS.map((program) => ({
        key: program.key,
        sessions: program.sessions.map((session) => ({
          key: session.key,
          title: session.title,
          exercises: session.exercises,
        })),
      })),
    ).toMatchSnapshot();
  });
});
