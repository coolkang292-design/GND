// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { requestIntervalStart, takeIntervalStart } from "./interval-entry";

beforeEach(() => sessionStorage.clear());

describe("인터벌 진입 넘김", () => {
  it("남긴 요청을 한 번만 꺼낸다", () => {
    requestIntervalStart();
    expect(takeIntervalStart()).toBe(true);
    // 두 번째는 false — 새로고침마다 시트가 다시 뜨면 안 된다
    expect(takeIntervalStart()).toBe(false);
  });

  it("아무도 안 남겼으면 false다", () => {
    expect(takeIntervalStart()).toBe(false);
  });

  it("꺼낸 뒤에는 저장소에 남지 않는다", () => {
    requestIntervalStart();
    takeIntervalStart();
    expect(sessionStorage.getItem("gnd-start-interval")).toBeNull();
  });
});
