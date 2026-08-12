import { describe, expect, it } from "vitest";
import { requestCalendarView, takeCalendarView } from "./record-view";

describe("달력 탭으로 열기 요청", () => {
  it("남긴 요청을 한 번만 꺼낸다", () => {
    requestCalendarView();
    expect(takeCalendarView()).toBe(true);
    // 두 번째는 false — 이후 기록 화면을 열 때마다 달력으로 튀면 안 된다
    expect(takeCalendarView()).toBe(false);
  });

  it("아무도 안 남겼으면 false다", () => {
    expect(takeCalendarView()).toBe(false);
  });
});
