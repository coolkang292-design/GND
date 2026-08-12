import { describe, expect, it } from "vitest";
import type { CatalogExercise } from "../types";
import {
  INTERVAL_PROGRAM,
  INTERVAL_SLOTS,
  PROGRAM_LEVELS,
  OFFICIAL_PROGRAMS,
  intervalExerciseName,
  intervalMinutesForWeek,
  isIntervalProgram,
  resolveIntervalProgram,
  type ProgramLevel,
} from "./official-programs";

/**
 * 고강도 인터벌 프로그램 (설계 2026-08-12 §7).
 *
 * 조합 36칸이 실재하는 이름인지는 `pnpm programs:check-catalog`가 운영 DB로
 * 확인한다. 여기서는 DB 없이 확인할 수 있는 것 — 슬롯 균형·난이도 해석·주차별
 * 길이·기존 5종 무영향 — 을 본다.
 */

/** 2026-08-12 운영 `exercise_catalog` 실측(맨몸 44종)에서 인터벌이 쓰는 것만 */
const BODYWEIGHT_NAMES = [
  "니 푸시업", "데드버그", "라잉 Y 레이즈", "러시안 트위스트", "런지",
  "레그 레이즈", "리버스 런지", "마운틴 클라이머", "맨몸 스쿼트",
  "바이시클 크런치", "버드독", "버피", "브이 업", "사이드 런지",
  "슈퍼맨 로우", "와이드 스쿼트", "와이드 푸시업", "인치웜 푸시업",
  "점프 스쿼트", "점핑잭", "타이슨 푸시업", "파이크 푸시업", "푸시업",
  "플러터 킥", "피스톨 스쿼트", "하이 니",
] as const;

function catalog(): CatalogExercise[] {
  return BODYWEIGHT_NAMES.map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name,
    body_part: "코어",
    exercise_type: "bodyweight",
    measure: null,
    is_custom: false,
    created_by: null,
    created_at: "2026-08-12T00:00:00.000Z",
  }));
}

describe("인터벌 프로그램 정의", () => {
  it("6주 · 주 3회 · A/B/C 세 회차다", () => {
    expect(isIntervalProgram(INTERVAL_PROGRAM)).toBe(true);
    expect(INTERVAL_PROGRAM.weeks).toBe(6);
    expect(INTERVAL_PROGRAM.sessionsPerWeek).toBe(3);
    expect(INTERVAL_PROGRAM.sessions.map((s) => s.key)).toEqual(["A", "B", "C"]);
  });

  it("회차마다 4슬롯을 하나씩 채운다", () => {
    // 한 라운드에 같은 부위를 연속으로 때리면 자세가 먼저 무너진다 (§3.3)
    for (const session of INTERVAL_PROGRAM.sessions) {
      expect(session.exercises.map((e) => e.slot)).toEqual([...INTERVAL_SLOTS]);
    }
  });

  it("9조합 36칸이 모두 채워져 있다", () => {
    const filled = INTERVAL_PROGRAM.sessions.flatMap((session) =>
      session.exercises.flatMap((exercise) =>
        PROGRAM_LEVELS.map((level) => intervalExerciseName(exercise, level)),
      ),
    );
    expect(filled).toHaveLength(36);
    expect(filled.every((name) => name.trim().length > 0)).toBe(true);
  });

  it("한 회차 안에서 같은 종목을 두 번 쓰지 않는다", () => {
    for (const level of PROGRAM_LEVELS) {
      for (const session of INTERVAL_PROGRAM.sessions) {
        const names = session.exercises.map((e) =>
          intervalExerciseName(e, level),
        );
        expect(new Set(names).size).toBe(4);
      }
    }
  });

  it("당기기 종목은 넣지 않는다 — 철봉이 있어야 한다", () => {
    const all = INTERVAL_PROGRAM.sessions.flatMap((session) =>
      session.exercises.flatMap((exercise) =>
        PROGRAM_LEVELS.map((level) => intervalExerciseName(exercise, level)),
      ),
    );
    for (const banned of ["풀업", "친업", "인버티드 로우", "매달리기"]) {
      expect(all).not.toContain(banned);
    }
  });

  it("시간형 종목을 넣지 않는다 — 기록이 횟수로 저장된다", () => {
    const all = INTERVAL_PROGRAM.sessions.flatMap((session) =>
      session.exercises.flatMap((exercise) =>
        PROGRAM_LEVELS.map((level) => intervalExerciseName(exercise, level)),
      ),
    );
    // 2026-08-12 실측 시간형 5종
    for (const timed of ["플랭크", "사이드 플랭크", "월 싯", "핸드스탠드", "매달리기"]) {
      expect(all).not.toContain(timed);
    }
  });
});

describe("난이도별 종목 해석", () => {
  it("난이도마다 다른 종목을 준다", () => {
    const [sessionA] = INTERVAL_PROGRAM.sessions;
    const lower = sessionA.exercises[0];
    expect(intervalExerciseName(lower, "beginner")).toBe("맨몸 스쿼트");
    expect(intervalExerciseName(lower, "moderate")).toBe("리버스 런지");
    expect(intervalExerciseName(lower, "experienced")).toBe("점프 스쿼트");
  });

  it("문자열이면 세 난이도가 같은 종목을 쓴다", () => {
    const shared = { slot: "total" as const, exerciseName: "버피" };
    for (const level of PROGRAM_LEVELS) {
      expect(intervalExerciseName(shared, level)).toBe("버피");
    }
  });

  it("고른 난이도의 종목만 카탈로그 항목으로 합친다", () => {
    const resolved = resolveIntervalProgram(
      INTERVAL_PROGRAM,
      "experienced",
      catalog(),
    );

    expect(resolved).toHaveLength(3);
    expect(resolved[0].exercises.map((e) => e.exerciseName)).toEqual([
      "점프 스쿼트",
      "와이드 푸시업",
      "브이 업",
      "버피",
    ]);
    for (const exercise of resolved.flatMap((s) => s.exercises)) {
      expect(exercise.item.name).toBe(exercise.exerciseName);
      expect(exercise.item.created_by).toBeNull();
    }
  });

  it("없는 종목은 이름을 모아 보고한다", () => {
    const short = catalog().filter((item) => item.name !== "버피");
    expect(() =>
      resolveIntervalProgram(INTERVAL_PROGRAM, "experienced", short),
    ).toThrow("program_exercise_missing:버피");
  });

  it("사용자가 만든 종목은 쓰지 않는다", () => {
    const custom = catalog().map((item) =>
      item.name === "버피" ? { ...item, created_by: "user-1" } : item,
    );
    expect(() =>
      resolveIntervalProgram(INTERVAL_PROGRAM, "experienced", custom),
    ).toThrow("program_exercise_missing:버피");
  });

  it("세 난이도 모두 실제 카탈로그로 합쳐진다", () => {
    for (const level of PROGRAM_LEVELS) {
      expect(() =>
        resolveIntervalProgram(INTERVAL_PROGRAM, level, catalog()),
      ).not.toThrow();
    }
  });
});

describe("주차별 회차 길이", () => {
  it("난이도마다 6주치를 준다", () => {
    for (const level of PROGRAM_LEVELS) {
      expect(INTERVAL_PROGRAM.minutesByWeek[level]).toHaveLength(6);
    }
  });

  /** 이 파일에서 가장 중요한 단언이다 — 설계 §3.4 */
  it("입문은 16분에 가지 않는다", () => {
    expect(INTERVAL_PROGRAM.minutesByWeek.beginner).not.toContain(16);
    for (let week = 1; week <= 6; week += 1) {
      expect(
        intervalMinutesForWeek(INTERVAL_PROGRAM, "beginner", week),
      ).toBeLessThanOrEqual(8);
    }
  });

  it("주차가 지나며 줄어들지 않는다", () => {
    for (const level of PROGRAM_LEVELS) {
      const weeks = INTERVAL_PROGRAM.minutesByWeek[level];
      for (let index = 1; index < weeks.length; index += 1) {
        expect(weeks[index]).toBeGreaterThanOrEqual(weeks[index - 1]);
      }
    }
  });

  it("음원이 있는 길이만 쓴다", () => {
    for (const level of PROGRAM_LEVELS) {
      for (const minutes of INTERVAL_PROGRAM.minutesByWeek[level]) {
        expect([4, 8, 16]).toContain(minutes);
      }
    }
  });

  it("1주차보다 6주차가 길거나 같다", () => {
    for (const level of PROGRAM_LEVELS) {
      expect(intervalMinutesForWeek(INTERVAL_PROGRAM, level, 6)).toBeGreaterThanOrEqual(
        intervalMinutesForWeek(INTERVAL_PROGRAM, level, 1),
      );
    }
  });

  it("6주 밖의 주차는 거부한다", () => {
    for (const week of [0, 7, 1.5, Number.NaN]) {
      expect(() =>
        intervalMinutesForWeek(INTERVAL_PROGRAM, "beginner", week),
      ).toThrow(/program_invalid_week/);
    }
  });

  it("난이도가 높을수록 6주차가 짧지 않다", () => {
    const last = (level: ProgramLevel) =>
      intervalMinutesForWeek(INTERVAL_PROGRAM, level, 6);
    expect(last("moderate")).toBeGreaterThanOrEqual(last("beginner"));
    expect(last("experienced")).toBeGreaterThanOrEqual(last("moderate"));
  });
});

describe("기존 5종 무영향", () => {
  it("공식 프로그램 목록은 아직 근력 5종 그대로다", () => {
    // 인터벌은 등록 흐름(2단계·0070)이 끝난 뒤에 목록에 세운다. 먼저 세우면
    // 사용자가 고를 수 있는데 서버가 등록을 거절한다.
    expect(OFFICIAL_PROGRAMS).toHaveLength(5);
    expect(OFFICIAL_PROGRAMS.map((program) => program.key)).not.toContain(
      "interval-burn-6w",
    );
  });

  it("근력 5종은 인터벌이 아니다", () => {
    for (const program of OFFICIAL_PROGRAMS) {
      expect(isIntervalProgram(program)).toBe(false);
      expect("kind" in program).toBe(false);
    }
  });
});
