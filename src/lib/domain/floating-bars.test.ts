import { describe, expect, it } from "vitest";
import {
  barsOverlap,
  bottomOffset,
  FLOATING_BAR_HEIGHT_PX,
  MINIMIZED_BAR,
  REST_BAR,
  TAB_BAR_HEIGHT_PX,
} from "./floating-bars";

/**
 * 2026-08-09 사용자 신고 "실 서버에 접어 두기 기능 작동 안함"의 회귀선.
 *
 * 휴식 바(z-30)와 복귀 버튼(z-20)이 **같은 자리**(`safe-area + 72px`)에 있었다.
 * 휴식 바는 `restRemaining !== null && !overlayOpen`, 즉 **접었을 때만** 뜨므로
 * 휴식 중에 접으면 복귀 버튼이 통째로 가려져 오버레이로 못 돌아왔다.
 */
describe("floating-bars — 휴식 바와 복귀 버튼", () => {
  it("둘은 겹치지 않는다 — 접은 동안 함께 떠야 한다", () => {
    expect(barsOverlap(REST_BAR, MINIMIZED_BAR)).toBe(false);
  });

  it("겹치는 배치는 겹친다고 말한다 — 단언이 늘 통과하지 않는다", () => {
    // 옛 배치: 둘 다 72px. 이 줄이 false가 되면 `barsOverlap`이 고장난 것이다.
    expect(barsOverlap({ bottomPx: 72, z: 20 }, { bottomPx: 72, z: 30 })).toBe(
      true,
    );
    // 1px만 벌어져도 여전히 겹친다 (막대 높이가 60px이므로)
    expect(barsOverlap({ bottomPx: 72, z: 20 }, { bottomPx: 73, z: 30 })).toBe(
      true,
    );
  });

  it("복귀 버튼이 휴식 바보다 위에 있다 — 겹치더라도 문이 먼저다", () => {
    expect(MINIMIZED_BAR.z).toBeGreaterThan(REST_BAR.z);
  });

  it("복귀 버튼은 휴식 바 한 칸 위다", () => {
    expect(REST_BAR.bottomPx).toBe(TAB_BAR_HEIGHT_PX);
    expect(MINIMIZED_BAR.bottomPx).toBe(
      TAB_BAR_HEIGHT_PX + FLOATING_BAR_HEIGHT_PX,
    );
  });

  it("bottom 값은 홈 인디케이터를 피한다", () => {
    expect(bottomOffset(72)).toBe("calc(env(safe-area-inset-bottom) + 72px)");
  });
});
