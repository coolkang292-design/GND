import { describe, expect, it } from "vitest";
import { cheerToastMessage, pointsAwardedFrom } from "./cheer-points";

describe("cheerToastMessage", () => {
  it("지급됐으면 포인트를 함께 보여준다", () => {
    expect(cheerToastMessage(10)).toBe("응원을 보냈어요! 📣 +10 P");
  });

  it("지급이 0이면 포인트 문구를 붙이지 않는다", () => {
    expect(cheerToastMessage(0)).toBe("응원을 보냈어요! 📣");
  });

  it("지급액이 바뀌어도 문구가 그 값을 따라간다", () => {
    expect(cheerToastMessage(25)).toBe("응원을 보냈어요! 📣 +25 P");
  });

  it("음수는 지급 없음으로 다룬다 (서버가 보내면 안 되는 값이지만 표시가 깨지면 안 된다)", () => {
    expect(cheerToastMessage(-5)).toBe("응원을 보냈어요! 📣");
  });
});

describe("pointsAwardedFrom", () => {
  it("0041 반환 모양에서 지급액을 꺼낸다", () => {
    expect(
      pointsAwardedFrom({ cheer: { id: "c1", cheer_type: "fire" }, points_awarded: 10 }),
    ).toBe(10);
  });

  it("하루 1회 상한에 걸려 0이면 0이다", () => {
    expect(
      pointsAwardedFrom({ cheer: { id: "c1", cheer_type: "fire" }, points_awarded: 0 }),
    ).toBe(0);
  });

  // 배포 순서 안전장치: 0041 적용 전에는 send_cheer가 cheers 행을 그대로
  // 돌려준다. 그 응답에는 points_awarded가 없으므로 0으로 떨어져야 하고,
  // 그러면 토스트가 포인트 문구 없이 나온다 — 화면이 깨지지 않는다.
  it("0041 이전 응답(cheers 행)은 0이다", () => {
    expect(
      pointsAwardedFrom({
        id: "c1",
        session_id: "s1",
        sender_id: "u1",
        receiver_id: "u2",
        cheer_type: "fire",
        message: null,
      }),
    ).toBe(0);
  });

  it("null이면 0이다", () => {
    expect(pointsAwardedFrom(null)).toBe(0);
  });

  it("undefined면 0이다", () => {
    expect(pointsAwardedFrom(undefined)).toBe(0);
  });

  it("숫자가 아닌 값이 와도 0이다", () => {
    expect(pointsAwardedFrom({ points_awarded: "10" })).toBe(0);
  });
});
