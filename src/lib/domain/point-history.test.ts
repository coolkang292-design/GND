import { describe, expect, it } from "vitest";
import { pointAmountText, pointReasonLabel } from "./point-history";

describe("pointReasonLabel", () => {
  it("아는 사유는 우리말로", () => {
    expect(pointReasonLabel("workout_completed")).toBe("운동 완료");
    expect(pointReasonLabel("badge_earned")).toBe("배지 획득");
    expect(pointReasonLabel("cheer_sent")).toBe("응원 보내기");
    expect(pointReasonLabel("item_purchase")).toBe("아이템 구매");
    expect(pointReasonLabel("admin_adjustment")).toBe("관리자 조정");
    expect(pointReasonLabel("refund")).toBe("환불");
  });

  // 사유는 DB의 CHECK 제약으로 늘어난다(0041이 cheer_sent를 더했다).
  // 라벨을 안 더한 채 새 사유가 들어와도 화면이 빈칸이 되면 안 된다.
  it("모르는 사유는 원문을 그대로 보여준다", () => {
    expect(pointReasonLabel("brand_new_reason")).toBe("brand_new_reason");
  });
});

describe("pointAmountText", () => {
  it("획득은 +", () => {
    expect(pointAmountText(10, "earn")).toBe("+10 P");
  });

  it("사용은 − (아이템 구매)", () => {
    expect(pointAmountText(500, "spend")).toBe("−500 P");
  });

  it("천 단위 구분", () => {
    expect(pointAmountText(2650, "earn")).toBe("+2,650 P");
  });

  // amount는 항상 양수로 저장되고 방향은 transaction_type이 정한다(0031).
  // 부호를 amount에서 읽으려 하면 사용 내역이 +로 보인다.
  it("사용 금액이 양수로 저장돼 있어도 −로 보여준다", () => {
    expect(pointAmountText(300, "spend")).toBe("−300 P");
  });

  it("관리자 조정은 획득으로 다룬다", () => {
    expect(pointAmountText(100, "admin_adjustment")).toBe("+100 P");
  });
});
