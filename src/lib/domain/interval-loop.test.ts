import { describe, expect, it } from "vitest";
import {
  advanceLoopBlock,
  cumulativeIntervalElapsed,
  intervalBlockCount,
  shouldLoopAudio,
} from "@/lib/domain/interval-loop";
import { intervalCueAt, intervalTotalSeconds } from "@/lib/domain/interval-cue";

describe("인터벌 반복 재생", () => {
  it("코스 분수 → 블록 수", () => {
    expect(intervalBlockCount(4)).toBe(1);
    expect(intervalBlockCount(8)).toBe(2);
    expect(intervalBlockCount(16)).toBe(4);
  });

  it("마지막 블록에서만 loop를 끈다", () => {
    expect(shouldLoopAudio(0, 1)).toBe(false); // 4분: 반복 없음
    expect(shouldLoopAudio(0, 2)).toBe(true);
    expect(shouldLoopAudio(1, 2)).toBe(false);
    expect(shouldLoopAudio(2, 4)).toBe(true);
    expect(shouldLoopAudio(3, 4)).toBe(false);
  });

  describe("되감김으로 블록을 센다", () => {
    const base = { block: 0, totalBlocks: 4 };

    it("정상 진행·같은 값은 그대로", () => {
      expect(advanceLoopBlock({ ...base, prevTime: 10, currentTime: 10.25 })).toBe(0);
      expect(advanceLoopBlock({ ...base, prevTime: 10, currentTime: 10 })).toBe(0);
    });

    it("끝에서 처음으로 되감기면 +1", () => {
      expect(advanceLoopBlock({ ...base, prevTime: 249.9, currentTime: 0.05 })).toBe(1);
      expect(advanceLoopBlock({ ...base, block: 2, prevTime: 250, currentTime: 0.2 })).toBe(3);
    });

    it("1초 이하로 뒷걸음하는 흔들림은 되감김이 아니다", () => {
      expect(advanceLoopBlock({ ...base, prevTime: 100, currentTime: 99.5 })).toBe(0);
    });

    it("마지막 블록을 넘어 세지 않는다", () => {
      expect(advanceLoopBlock({ ...base, block: 3, prevTime: 249, currentTime: 0 })).toBe(3);
      expect(advanceLoopBlock({ block: 0, totalBlocks: 1, prevTime: 249, currentTime: 0 })).toBe(0);
    });

    it("NaN은 무시한다", () => {
      expect(advanceLoopBlock({ ...base, prevTime: Number.NaN, currentTime: 0 })).toBe(0);
      expect(advanceLoopBlock({ ...base, prevTime: 5, currentTime: Number.NaN })).toBe(0);
    });
  });

  it("누적 경과 = 블록 × 250 + 파일 위치", () => {
    expect(cumulativeIntervalElapsed(0, 12.5)).toBe(12.5);
    expect(cumulativeIntervalElapsed(1, 0)).toBe(250);
    expect(cumulativeIntervalElapsed(3, 100)).toBe(850);
    expect(cumulativeIntervalElapsed(1, Number.NaN)).toBe(250);
  });

  /**
   * 이 테스트가 반복 재생의 핵심 보증이다: 8·16분 화면은 두 번째 블록부터도
   * 첫 블록과 **똑같이** 준비 → 운동 → 휴식을 그려야 한다.
   */
  it("두 번째 블록도 같은 구조로 시작한다 (준비 13초 → 라운드)", () => {
    const first = intervalCueAt(cumulativeIntervalElapsed(0, 0), 8);
    const second = intervalCueAt(cumulativeIntervalElapsed(1, 0), 8);
    expect(first).toMatchObject({ phase: "prep", secondsLeft: 13, round: 0 });
    expect(second).toMatchObject({ phase: "prep", secondsLeft: 13, round: 8 });
    // 두 번째 블록 첫 운동 (파일 위치 13초)
    expect(intervalCueAt(cumulativeIntervalElapsed(1, 13), 8)).toMatchObject({
      phase: "work",
      round: 8,
    });
  });

  it("마지막 블록이 끝나면 done", () => {
    expect(intervalCueAt(intervalTotalSeconds(8), 8).phase).toBe("done");
    expect(intervalCueAt(cumulativeIntervalElapsed(1, 249.9), 8).phase).not.toBe("done");
  });
});
