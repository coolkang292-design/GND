import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTERVAL_BLOCK_SECONDS,
  INTERVAL_PREP_SECONDS,
  INTERVAL_REST_SECONDS,
  INTERVAL_ROUNDS_PER_BLOCK,
  INTERVAL_WORK_SECONDS,
  intervalCueAt,
  intervalExerciseIndexForRound,
  intervalTotalRounds,
  intervalTotalSeconds,
} from "./interval-cue";
import { TABATA_ROUND_SECONDS, TABATA_TRACKS } from "./tabata";

describe("인터벌 진행 판정", () => {
  it("한 블록은 13초 준비 + 8라운드 × 30초이고 파일은 250초다", () => {
    expect(INTERVAL_PREP_SECONDS).toBe(13);
    expect(INTERVAL_WORK_SECONDS).toBe(20);
    expect(INTERVAL_REST_SECONDS).toBe(10);
    expect(INTERVAL_WORK_SECONDS + INTERVAL_REST_SECONDS).toBe(
      TABATA_ROUND_SECONDS,
    );
    expect(INTERVAL_BLOCK_SECONDS).toBe(250);
  });

  it("코스마다 라운드 수와 길이가 정해진다", () => {
    expect(intervalTotalRounds(4)).toBe(8);
    expect(intervalTotalRounds(8)).toBe(16);
    expect(intervalTotalRounds(16)).toBe(32);
    expect(intervalTotalSeconds(4)).toBe(250);
    expect(intervalTotalSeconds(8)).toBe(500);
    expect(intervalTotalSeconds(16)).toBe(1000);
  });

  it("종목 4개를 순서대로 돈다", () => {
    expect([0, 1, 2, 3, 4, 5].map(intervalExerciseIndexForRound)).toEqual([
      0, 1, 2, 3, 0, 1,
    ]);
  });

  describe("4분 코스", () => {
    it("시작 13초는 준비다", () => {
      const cue = intervalCueAt(0, 4);
      expect(cue).toMatchObject({
        phase: "prep",
        secondsLeft: 13,
        nextExerciseIndex: 0,
        round: 0,
      });
      expect(intervalCueAt(12.5, 4)).toMatchObject({
        phase: "prep",
        secondsLeft: 1,
      });
    });

    it("13초부터 첫 종목 20초를 한다", () => {
      expect(intervalCueAt(13, 4)).toMatchObject({
        phase: "work",
        exerciseIndex: 0,
        secondsLeft: 20,
        round: 0,
        nextExerciseIndex: 1,
      });
      expect(intervalCueAt(32.5, 4)).toMatchObject({
        phase: "work",
        exerciseIndex: 0,
        secondsLeft: 1,
      });
    });

    it("20초가 지나면 10초 쉬고 다음 종목을 예고한다", () => {
      expect(intervalCueAt(33, 4)).toMatchObject({
        phase: "rest",
        secondsLeft: 10,
        nextExerciseIndex: 1,
        round: 0,
      });
    });

    it("43초에 두 번째 종목으로 **자동으로** 넘어간다", () => {
      // 사용자가 아무것도 안 눌러도 넘어가야 한다 (사용자 지시 2026-08-13)
      expect(intervalCueAt(43, 4)).toMatchObject({
        phase: "work",
        exerciseIndex: 1,
        round: 1,
      });
      expect(intervalCueAt(73, 4)).toMatchObject({
        phase: "work",
        exerciseIndex: 2,
        round: 2,
      });
      expect(intervalCueAt(103, 4)).toMatchObject({
        phase: "work",
        exerciseIndex: 3,
        round: 3,
      });
      // 5라운드는 다시 첫 종목
      expect(intervalCueAt(133, 4)).toMatchObject({
        phase: "work",
        exerciseIndex: 0,
        round: 4,
      });
    });

    it("마지막 라운드에는 다음 종목이 없다", () => {
      const last = intervalCueAt(13 + 7 * TABATA_ROUND_SECONDS, 4);
      expect(last).toMatchObject({
        phase: "work",
        round: 7,
        exerciseIndex: 3,
        nextExerciseIndex: null,
      });
    });

    it("250초에 끝난다", () => {
      expect(intervalCueAt(249.9, 4).phase).not.toBe("done");
      expect(intervalCueAt(250, 4)).toEqual({ phase: "done", totalRounds: 8 });
      expect(intervalCueAt(999, 4).phase).toBe("done");
    });
  });

  describe("8·16분 코스 — 블록 이음매", () => {
    it("두 번째 블록도 10초 준비로 시작한다", () => {
      // 음원을 이어 붙였으므로 준비 구간이 블록마다 다시 온다
      expect(intervalCueAt(250, 8)).toMatchObject({
        phase: "prep",
        secondsLeft: 13,
        round: 8,
      });
      expect(intervalCueAt(263, 8)).toMatchObject({
        phase: "work",
        round: 8,
        exerciseIndex: 0,
      });
    });

    it("라운드 번호가 블록을 넘어 이어진다", () => {
      expect(intervalCueAt(263, 8)).toMatchObject({ round: INTERVAL_ROUNDS_PER_BLOCK });
      expect(intervalCueAt(763, 16)).toMatchObject({ round: 24 });
      expect(intervalCueAt(763, 16)).toMatchObject({ exerciseIndex: 0 });
    });

    it("16분은 32라운드를 채우고 1000초에 끝난다", () => {
      expect(intervalCueAt(999.9, 16).phase).not.toBe("done");
      expect(intervalCueAt(1000, 16)).toEqual({
        phase: "done",
        totalRounds: 32,
      });
    });
  });

  it("재생이 안 붙은 순간에도 준비를 그린다", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      expect(intervalCueAt(bad, 4).phase).toBe("prep");
    }
  });

  /**
   * ⚠️ 이 판정은 **음원 파일 구조에 묶여 있다.**
   *
   * 2026-08-13에 8·16분 음원을 다시 만들었다. 예전 파일은 이음매마다 4.98초가
   * 빠져 있어서 두 번째 블록부터 화면이 음악보다 5초씩 앞서 갔다. 파일을 다시
   * 건드리면 이 테스트가 먼저 깨져야 한다.
   */
  it("음원 파일 길이가 블록 계산과 맞는다", () => {
    const dir = join(process.cwd(), "public", "audio");
    for (const track of TABATA_TRACKS) {
      const bytes = statSync(join(dir, track.src.replace("/audio/", ""))).size;
      const expected = intervalTotalSeconds(track.minutes);
      // 262kbps 기준 초당 약 32.8KB. 길이가 절반이나 두 배로 어긋나면 잡힌다.
      const approxSeconds = bytes / 32_800;
      expect(Math.abs(approxSeconds - expected)).toBeLessThan(expected * 0.05);
    }
  });
});
