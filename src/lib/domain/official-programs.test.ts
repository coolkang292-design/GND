import { describe, expect, it } from "vitest";
import { OFFICIAL_PROGRAMS } from "./official-programs";

const EXPECTED = [
  ["shoulder-frame-6w", "시선이 머무는 어깨", "상체의 틀을 넓히는 6주"],
  ["chest-frame-6w", "옷태를 세우는 가슴", "상체 앞면을 단단하게 만드는 6주"],
  ["arm-outline-6w", "소매를 채우는 팔", "팔의 두께와 윤곽을 만드는 6주"],
  ["lower-balance-6w", "실루엣을 완성하는 하체", "하체의 힘과 균형을 세우는 6주"],
  ["lean-body-6w", "몸은 가볍게, 인상은 선명하게", "근육을 지키는 체지방 관리 6주"],
];

describe("GND 공식 프로그램 카탈로그", () => {
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
});
