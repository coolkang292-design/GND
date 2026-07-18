import { describe, expect, it } from "vitest";
import { LEVEL_NAMES, challengeLevel, levelLabel } from "./level";

const START = "2026-07-01"; // 7일 블록: 01~07 / 08~14 / 15~21 / 22~28
const END = "2026-07-28";

const addDaysForTest = (key: string, n: number): string => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

describe("levelLabel", () => {
  it("이름 5개와 라벨 형식", () => {
    expect(LEVEL_NAMES).toHaveLength(5);
    expect(levelLabel(1)).toBe("Lv.1 잠만보 불독");
    expect(levelLabel(5)).toBe("Lv.5 개노답 탈출");
  });
  it("범위 밖은 클램프", () => {
    expect(levelLabel(0)).toBe("Lv.1 잠만보 불독");
    expect(levelLabel(9)).toBe("Lv.5 개노답 탈출");
  });
});

describe("challengeLevel — 7일 블록 5일+ 업 / 5일 공백 다운 (스펙 §4.1)", () => {
  it("운동 없음 → Lv.1", () => {
    expect(challengeLevel([], START, END, "2026-07-10")).toBe(1);
  });
  it("첫 블록 5일 → Lv.2", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
        START,
        END,
        "2026-07-06",
      ),
    ).toBe(2);
  });
  it("블록 4일이면 업 없음", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
        START,
        END,
        "2026-07-07",
      ),
    ).toBe(1);
  });
  it("블록당 최대 1회 — 7일 전부 운동해도 +1", () => {
    expect(
      challengeLevel(
        [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
          "2026-07-05",
          "2026-07-06",
          "2026-07-07",
        ],
        START,
        END,
        "2026-07-08",
      ),
    ).toBe(2);
  });
  it("블록 경계에 걸친 4+1일은 업 없음 (공백도 5일 미만이라 다운 없음)", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-08"],
        START,
        END,
        "2026-07-09",
      ),
    ).toBe(1);
  });
  it("5개 블록 전부 5일 → Lv.5 캡 (1+5=6이 아니라 5)", () => {
    const keys: string[] = [];
    for (let b = 0; b < 5; b++)
      for (let d = 0; d < 5; d++)
        keys.push(addDaysForTest("2026-07-01", b * 7 + d));
    expect(challengeLevel(keys, "2026-07-01", "2026-08-04", "2026-08-04")).toBe(
      5,
    );
  });
  it("업 후 5일 공백 → 다운", () => {
    expect(
      challengeLevel(
        ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
        START,
        END,
        "2026-07-10", // 마지막 운동 07-05로부터 5일 경과
      ),
    ).toBe(1);
  });
  it("Lv.1에서 공백은 그대로 (floor)", () => {
    expect(challengeLevel(["2026-07-01"], START, END, "2026-07-06")).toBe(1);
  });
  it("시작~첫 운동 사이 공백은 다운 미적용", () => {
    expect(challengeLevel(["2026-07-10"], START, END, "2026-07-10")).toBe(1);
  });
  it("잘린 마지막 블록(3일)에선 5일 불가 → 업 없음", () => {
    expect(
      challengeLevel(
        ["2026-07-08", "2026-07-09", "2026-07-10"],
        "2026-07-01",
        "2026-07-10",
        "2026-07-10",
      ),
    ).toBe(1);
  });
  it("종료 후엔 endDate 기준 고정 — 종료 뒤 공백은 다운 아님", () => {
    expect(
      challengeLevel(
        ["2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28"],
        START,
        END,
        "2026-08-20",
      ),
    ).toBe(2);
  });
  it("다운 후 다른 블록에서 5일 채우면 다시 업 (2→1→2)", () => {
    expect(
      challengeLevel(
        [
          "2026-07-01",
          "2026-07-02",
          "2026-07-03",
          "2026-07-04",
          "2026-07-05", // 블록1 5일 → 2
          // 05→10 공백 5일 → 1
          "2026-07-10",
          "2026-07-11",
          "2026-07-12",
          "2026-07-13",
          "2026-07-14", // 블록2 5일 → 2
        ],
        START,
        END,
        "2026-07-14",
      ),
    ).toBe(2);
  });
  it("시작 전이면 Lv.1", () => {
    expect(challengeLevel([], START, END, "2026-06-30")).toBe(1);
  });
});
