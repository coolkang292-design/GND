import { describe, expect, it } from "vitest";

import {
  CAPTION_CHIPS,
  CAPTION_MAX_LENGTH,
  isChipSelected,
  isValidCaption,
  normalizeCaption,
  toggleChip,
} from "./session-caption";

describe("normalizeCaption", () => {
  it("공백만 있으면 null — 빈 캡션 줄을 그리지 않게", () => {
    expect(normalizeCaption("   ")).toBeNull();
    expect(normalizeCaption("")).toBeNull();
    expect(normalizeCaption(null)).toBeNull();
    expect(normalizeCaption(undefined)).toBeNull();
  });

  it("앞뒤 공백을 떼고 돌려준다", () => {
    expect(normalizeCaption("  오늘 어깨 터짐 😇 ")).toBe("오늘 어깨 터짐 😇");
  });
});

describe("isValidCaption", () => {
  /**
   * ⚠️ 회귀 방어. `workout_sessions.title`의 CHECK가 60자라(0004:68) 넘기면
   * **UPDATE가 통째로 실패한다.** 화면에서 먼저 막지 않으면 사용자는 저장
   * 버튼이 왜 안 먹는지 알 길이 없다.
   */
  it("60자를 넘으면 거부한다", () => {
    expect(isValidCaption("가".repeat(CAPTION_MAX_LENGTH))).toBe(true);
    expect(isValidCaption("가".repeat(CAPTION_MAX_LENGTH + 1))).toBe(false);
  });

  it("빈 캡션은 유효하다 — 지우는 것도 정상 동작", () => {
    expect(isValidCaption(null)).toBe(true);
    expect(isValidCaption("   ")).toBe(true);
  });
});

describe("CAPTION_CHIPS", () => {
  /**
   * ⚠️ 칩 문구가 그대로 `title`에 저장된다. 60자를 넘는 칩이 하나라도 있으면
   * **누르는 순간 저장이 실패한다** — 개발 중에는 눌러 보기 전까지 안 보인다.
   */
  it("모든 칩이 저장 가능한 길이다", () => {
    for (const chip of CAPTION_CHIPS) {
      expect(isValidCaption(chip), chip).toBe(true);
    }
  });

  it("중복이 없다", () => {
    expect(new Set(CAPTION_CHIPS).size).toBe(CAPTION_CHIPS.length);
  });

  it("지친 사람이 훑을 수 있는 개수로 유지한다", () => {
    expect(CAPTION_CHIPS.length).toBeLessThanOrEqual(6);
  });
});

describe("isChipSelected / toggleChip", () => {
  const chip = CAPTION_CHIPS[0];

  it("같은 칩을 다시 누르면 해제된다 — 잘못 누른 것을 되돌릴 길", () => {
    expect(toggleChip(null, chip)).toBe(chip);
    expect(toggleChip(chip, chip)).toBeNull();
  });

  it("다른 칩을 누르면 갈아탄다", () => {
    expect(toggleChip(CAPTION_CHIPS[0], CAPTION_CHIPS[1])).toBe(
      CAPTION_CHIPS[1],
    );
  });

  it("직접 쓴 캡션이 있으면 어떤 칩도 선택 상태가 아니다", () => {
    expect(isChipSelected("오늘 어깨 터짐", chip)).toBe(false);
  });

  it("앞뒤 공백이 붙어 저장돼 있어도 같은 칩으로 본다", () => {
    expect(isChipSelected(`  ${chip} `, chip)).toBe(true);
  });
});
