import { describe, expect, it } from "vitest";
import {
  COMPLETION_AUTO_FINISH_MS,
  overlayMode,
  shouldAutoFinishAfterRest,
  shouldRestAfterCompletion,
} from "./session-flow";

/**
 * ② 큰 팝업의 화면 전환 (2026-08-04, 사용자 신고로 수정).
 *
 * **버그**: 마지막 세트를 끝내고 휴식이 *끝나면* 입력 화면으로 되돌아가
 * 이미 완료한 세트(`현재 세트 1 / 1`)를 다시 보여줬다. 모드를 "휴식이 도는가"로만
 * 정했기 때문이다 — 남은 세트가 있는지도 같이 봐야 한다.
 */
describe("overlayMode", () => {
  it("휴식이 도는 동안은 휴식 화면", () => {
    expect(overlayMode({ resting: true, pendingSetCount: 3 })).toBe("rest");
  });

  it("휴식이 아니고 남은 세트가 있으면 입력 화면", () => {
    expect(overlayMode({ resting: false, pendingSetCount: 3 })).toBe("input");
  });

  it("남은 세트가 없으면 휴식이 끝나도 입력 화면으로 되돌아가지 않는다", () => {
    // 이 단언이 신고된 버그 자체다. 되돌아가면 완료한 세트를 다시 입력하는
    // 화면이 떠서 "운동이 안 끝났나?" 싶어진다.
    expect(overlayMode({ resting: false, pendingSetCount: 0 })).toBe("rest");
  });

  it("남은 세트가 없고 휴식 중이어도 휴식 화면", () => {
    expect(overlayMode({ resting: true, pendingSetCount: 0 })).toBe("rest");
  });
});

describe("shouldAutoFinishAfterRest", () => {
  it("휴식이 끝났고 남은 세트가 없으면 자동으로 마무리한다", () => {
    // 사용자 요청: "사진 찍는 화면으로 자연스럽게 전환이 되게".
    // 남은 세트가 0이면 종료 확인창도 안 뜨므로(미완료 0건) 자동 전환이 안전하다.
    expect(shouldAutoFinishAfterRest({ pendingSetCount: 0 })).toBe(true);
  });

  it("남은 세트가 있으면 자동으로 마무리하지 않는다", () => {
    expect(shouldAutoFinishAfterRest({ pendingSetCount: 1 })).toBe(false);
  });
});

/**
 * B안 — 마지막 세트에는 휴식을 걸지 않는다 (2026-08-04, 사용자 결정).
 *
 * 마지막 세트 뒤에 쉴 이유가 없는데 타이머를 돌리는 게 이상했다. 게다가
 * 유산소는 애초에 휴식이 안 걸려서(`shouldStartRestCountdown`), 타이머 종료에
 * 기대면 유산소로 끝낸 날은 자동 전환이 영영 안 왔다.
 */
describe("shouldRestAfterCompletion", () => {
  it("완료 뒤에도 남은 세트가 있으면 휴식을 건다", () => {
    expect(shouldRestAfterCompletion({ pendingSetCountAfter: 2 })).toBe(true);
  });

  it("이번이 마지막이면 휴식을 걸지 않는다", () => {
    expect(shouldRestAfterCompletion({ pendingSetCountAfter: 0 })).toBe(false);
  });
});

describe("COMPLETION_AUTO_FINISH_MS", () => {
  it("축하 화면을 3초 보여주고 넘어간다 (사용자 확정)", () => {
    expect(COMPLETION_AUTO_FINISH_MS).toBe(3000);
  });
});
