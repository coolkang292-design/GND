import { describe, expect, it } from "vitest";
import {
  OFFICIAL_PROGRAMS,
  PROGRAM_LEVELS,
  intervalExerciseName,
  isIntervalProgram,
} from "./official-programs";
import {
  EXERCISE_GUIDES,
  GUIDE_SAFETY_NOTE,
  guideForExercise,
  isReviewedSource,
} from "./exercise-guides";

/** 첫 공식 프로그램(상체의 틀을 넓히는 6주)이 쓰는 종목 15개 */
const SHOULDER_PROGRAM_EXERCISES = [
  "바벨 백스쿼트",
  "벤치프레스",
  "시티드 로우",
  "숄더프레스",
  "사이드 레터럴 레이즈",
  "루마니안 데드리프트",
  "랫풀다운",
  "인클라인 벤치프레스",
  "페이스풀",
  "덤벨 컬",
  "레그프레스",
  "덤벨 벤치프레스",
  "바벨 로우",
  "덤벨 레터럴 레이즈",
  "케이블 푸시다운",
] as const;

describe("EXERCISE_GUIDES — GND 핵심 안내", () => {
  it("첫 공식 프로그램의 모든 운동은 다섯 영역을 다 가진다", () => {
    expect(SHOULDER_PROGRAM_EXERCISES.length).toBe(15);
    for (const name of SHOULDER_PROGRAM_EXERCISES) {
      const guide = guideForExercise(name);
      expect(guide, `${name} 안내가 없다`).not.toBeNull();
      expect(guide!.setup.length).toBeGreaterThan(0);
      expect(guide!.movement.length).toBeGreaterThan(0);
      expect(guide!.breathing.length).toBeGreaterThan(0);
      expect(guide!.mistakes.length).toBeGreaterThan(0);
      expect(guide!.caution.length).toBeGreaterThan(0);
    }
  });

  it("알 수 없는 운동은 빈 안내를 꾸며내지 않는다", () => {
    expect(guideForExercise("없는 운동")).toBeNull();
    expect(guideForExercise("")).toBeNull();
  });

  it("앞뒤 공백과 대소문자에 흔들리지 않는다 — 카탈로그 이름 비교 규칙과 같다", () => {
    expect(guideForExercise("  숄더프레스  ")?.exerciseName).toBe("숄더프레스");
  });

  /**
   * ⚠️ 오타 한 글자면 안내 버튼이 조용히 사라진다. 이름이 실제 프로그램 종목과
   *    일치하는지 여기서 못 박는다 — 화면을 열어 보지 않고 잡을 수 있는 유일한 곳이다.
   */
  it("등록된 안내 이름은 전부 실제 프로그램 종목이다 — 오타 방지", () => {
    /*
      인터벌 프로그램은 종목명이 **난이도별 객체**라 그냥 꺼내면 안 된다
      (2026-08-13). 세 난이도를 다 펼쳐야 실제 쓰이는 이름이 나온다.
    */
    const programNames = new Set(
      OFFICIAL_PROGRAMS.flatMap((program) =>
        isIntervalProgram(program)
          ? program.sessions.flatMap((session) =>
              session.exercises.flatMap((exercise) =>
                PROGRAM_LEVELS.map((level) =>
                  intervalExerciseName(exercise, level),
                ),
              ),
            )
          : program.sessions.flatMap((session) =>
              session.exercises.map((exercise) => exercise.exerciseName),
            ),
      ),
    );
    expect(programNames.size).toBeGreaterThanOrEqual(15);
    for (const guide of Object.values(EXERCISE_GUIDES)) {
      expect(
        programNames.has(guide.exerciseName),
        `${guide.exerciseName}은(는) 프로그램 종목이 아니다`,
      ).toBe(true);
    }
  });

  /**
   * GND는 의료 서비스가 아니다. 진단·치료·처방을 말하는 순간 성격이 달라진다.
   * 앞으로 카피를 손대는 사람도 이 선을 넘지 못하게 기계로 막는다.
   */
  it("진단·치료·처방 표현을 쓰지 않는다", () => {
    const banned = ["진단", "치료", "처방", "완치", "교정해 드립니다"];
    const guides = Object.values(EXERCISE_GUIDES);
    expect(guides.length).toBeGreaterThanOrEqual(15);
    for (const guide of guides) {
      const text = [
        ...guide.setup,
        ...guide.movement,
        guide.breathing,
        ...guide.mistakes,
        guide.caution,
      ].join(" ");
      for (const word of banned) {
        expect(text, `${guide.exerciseName}에 '${word}'가 있다`).not.toContain(
          word,
        );
      }
    }
  });

  it("공통 안전 안내는 통증이 있으면 멈추라고 말한다", () => {
    expect(GUIDE_SAFETY_NOTE).toContain("통증");
    expect(GUIDE_SAFETY_NOTE).toContain("중단");
  });
});

/**
 * 외부 원문 링크 계약 (계획 2026-08-12 Task 4).
 *
 * ⚠️ **검증기를 직접 시험한다.** 등록된 링크만 훑으면 등록이 0건일 때 아무것도
 *    검사하지 않고 통과한다(CLAUDE.md §가짜 통과). 나쁜 입력을 실제로 거부하는지
 *    먼저 확인하고, 그 다음에 등록분 전체를 통과시킨다.
 */
describe("isReviewedSource — 외부 원문 링크 계약", () => {
  const good = {
    provider: "네이버 지식백과" as const,
    url: "https://terms.naver.com/entry.naver?docId=2099791&cid=51030&categoryId=51030",
    checkedAt: "2026-08-12",
  };

  it("https · terms.naver.com · 날짜 형식을 모두 갖추면 통과한다", () => {
    expect(isReviewedSource(good, "2026-08-12")).toBe(true);
  });

  it("http는 거부한다", () => {
    expect(isReviewedSource({ ...good, url: good.url.replace("https:", "http:") }, "2026-08-12")).toBe(false);
  });

  it("javascript: 스킴은 거부한다", () => {
    expect(
      isReviewedSource({ ...good, url: "javascript:alert(1)" }, "2026-08-12"),
    ).toBe(false);
  });

  it("네이버 지식백과가 아닌 호스트는 거부한다", () => {
    expect(
      isReviewedSource({ ...good, url: "https://example.com/a" }, "2026-08-12"),
    ).toBe(false);
    // 호스트 끝을 대충 보면 통과해 버리는 유사 도메인
    expect(
      isReviewedSource(
        { ...good, url: "https://terms.naver.com.evil.test/a" },
        "2026-08-12",
      ),
    ).toBe(false);
  });

  it("URL이 아니면 거부한다 — 예외로 터지지 않는다", () => {
    expect(isReviewedSource({ ...good, url: "그냥 글자" }, "2026-08-12")).toBe(
      false,
    );
  });

  it("checkedAt 형식이 틀리면 거부한다", () => {
    expect(isReviewedSource({ ...good, checkedAt: "2026-8-1" }, "2026-08-12")).toBe(
      false,
    );
  });

  it("미래에 검수했다는 날짜는 거부한다", () => {
    expect(isReviewedSource({ ...good, checkedAt: "2026-08-13" }, "2026-08-12")).toBe(
      false,
    );
  });
});

describe("EXERCISE_GUIDES — 등록된 출처", () => {
  const sources = Object.values(EXERCISE_GUIDES)
    .map((guide) => guide.source)
    .filter((source) => source !== undefined);

  it("등록된 출처는 전부 계약을 통과한다", () => {
    for (const source of sources) {
      expect(isReviewedSource(source, "2099-12-31"), source.url).toBe(true);
    }
  });

  it("같은 URL을 두 운동에 붙이지 않는다", () => {
    expect(new Set(sources.map((s) => s.url)).size).toBe(sources.length);
  });

  /**
   * 사람이 원문을 열어 운동을 대조하기 전에는 링크를 넣지 않는다.
   * 지금은 0건이 **정상 완료 조건**이다(계획 Task 1). 링크를 추가하는 사람은
   * 이 숫자를 함께 올려서, 검수 없이 슬며시 늘지 않게 한다.
   */
  it("검수된 링크는 현재 0건이다 — 늘리려면 이 단언도 같이 고친다", () => {
    expect(sources.length).toBe(0);
  });
});
