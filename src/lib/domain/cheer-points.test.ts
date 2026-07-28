import { describe, expect, it } from "vitest";
import { cheerToastMessage, CHEER_POINT_AMOUNT } from "./cheer-points";

describe("cheerToastMessage", () => {
  it("지급됐으면 포인트를 함께 보여준다", () => {
    expect(cheerToastMessage(10)).toBe("응원을 보냈어요! 📣 +10P");
  });

  it("지급이 0이면 포인트 문구를 붙이지 않는다", () => {
    expect(cheerToastMessage(0)).toBe("응원을 보냈어요! 📣");
  });

  it("지급액이 바뀌어도 문구가 그 값을 따라간다", () => {
    expect(cheerToastMessage(25)).toBe("응원을 보냈어요! 📣 +25P");
  });

  it("음수는 지급 없음으로 다룬다 (서버가 보내면 안 되는 값이지만 표시가 깨지면 안 된다)", () => {
    expect(cheerToastMessage(-5)).toBe("응원을 보냈어요! 📣");
  });

  it("지급액 상수는 10이다 — SQL의 award_points 호출과 같아야 한다", () => {
    expect(CHEER_POINT_AMOUNT).toBe(10);
  });
});
