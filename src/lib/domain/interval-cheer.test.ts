import { describe, expect, it } from "vitest";
import { intervalCheer } from "./interval-cheer";
import { intervalCueAt } from "./interval-cue";

describe("인터벌 응원 문구", () => {
  /**
   * 이 파일에서 가장 중요한 단언이다 (사용자 지시 2026-08-13).
   *
   * 실행 화면은 음원 위치가 바뀔 때마다 다시 그려진다 — 초당 네 번쯤. 문구를
   * 렌더마다 뽑으면 깜빡여서 읽을 수가 없다.
   */
  it("같은 라운드 안에서는 문구가 바뀌지 않는다", () => {
    // 1라운드 운동 구간을 0.25초 간격으로 훑는다
    const seen = new Set<string | null>();
    for (let t = 13; t < 33; t += 0.25) {
      seen.add(intervalCheer(intervalCueAt(t, 4)));
    }
    expect(seen.size).toBe(1);
  });

  it("라운드가 바뀌면 문구도 바뀐다", () => {
    const first = intervalCheer(intervalCueAt(15, 4));
    const second = intervalCheer(intervalCueAt(45, 4));
    expect(first).not.toBe(second);
  });

  it("운동과 휴식의 문구가 다르다", () => {
    const work = intervalCueAt(15, 4);
    const rest = intervalCueAt(35, 4);
    expect(work.phase).toBe("work");
    expect(rest.phase).toBe("rest");
    expect(intervalCheer(work)).not.toBe(intervalCheer(rest));
  });

  it("마지막 라운드는 끝이 보인다고 말한다", () => {
    const last = intervalCueAt(13 + 7 * 30 + 5, 4);
    expect(last).toMatchObject({ phase: "work", round: 7 });
    expect(intervalCheer(last)).toContain("마지막 라운드");
  });

  it("마지막 운동을 앞둔 휴식은 끝이 가깝다고 말한다", () => {
    const rest = intervalCueAt(13 + 6 * 30 + 25, 4);
    expect(rest).toMatchObject({ phase: "rest", round: 6 });
    expect(intervalCheer(rest)).toContain("마지막");
  });

  /**
   * 사용자 지적 2026-08-13 — 문구가 구간에 안 맞았다.
   *
   * 운동 20초는 **힘을 쓰는 구간**이라 쉬라는 말이 들어가면 안 되고, 휴식
   * 10초에는 그 안에 할 수 없는 일을 시키면 안 된다.
   */
  it("운동 문구가 쉬라고 하지 않는다", () => {
    for (let round = 0; round < 8; round += 1) {
      const cue = intervalCueAt(13 + round * 30 + 5, 4);
      const text = intervalCheer(cue) ?? "";
      for (const banned of ["편하게", "쉬어", "천천히", "힘 빼"]) {
        expect(text).not.toContain(banned);
      }
    }
  });

  it("휴식 문구가 10초에 못 할 일을 시키지 않는다", () => {
    for (let round = 0; round < 8; round += 1) {
      const cue = intervalCueAt(13 + round * 30 + 25, 4);
      const text = intervalCheer(cue) ?? "";
      for (const banned of ["물", "스트레칭", "마시"]) {
        expect(text).not.toContain(banned);
      }
    }
  });

  it("운동 문구는 한눈에 읽히게 짧다", () => {
    // 숨이 차고 자세를 잡는 중이라 긴 문장은 읽히지 않는다
    for (let round = 0; round < 8; round += 1) {
      const text = intervalCheer(intervalCueAt(13 + round * 30 + 5, 4)) ?? "";
      expect(text.length).toBeLessThanOrEqual(14);
    }
  });

  it("시작 준비와 블록 사이 준비의 말이 다르다", () => {
    // 8분은 250초에 두 번째 블록이 시작한다 — 처음 시작하는 게 아니다
    expect(intervalCheer(intervalCueAt(0, 8))).toContain("곧 시작");
    expect(intervalCheer(intervalCueAt(252, 8))).toContain("이어서");
  });

  it("끝나면 마무리를 말한다", () => {
    expect(intervalCheer(intervalCueAt(250, 4))).toBe("끝까지 해냈어요");
  });

  it("어떤 순간에도 빈 문자열을 주지 않는다", () => {
    for (const minutes of [4, 8, 16] as const) {
      for (let t = 0; t <= minutes * 62.5; t += 1) {
        const text = intervalCheer(intervalCueAt(t, minutes));
        expect(text).toBeTruthy();
        expect((text ?? "").trim().length).toBeGreaterThan(3);
      }
    }
  });

  it("숫자를 세지 않는다 — 그건 음악이 한다", () => {
    // 화면에서 카운트다운을 뺀 이유와 같다. 문구가 초를 세면 같은 실수다.
    for (let t = 0; t <= 250; t += 1) {
      expect(intervalCheer(intervalCueAt(t, 4))).not.toMatch(/\d+\s*초/);
    }
  });
});
