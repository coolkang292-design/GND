import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TodayCompletedList,
  exerciseSummary,
} from "./today-completed-list";

const TZ = "Asia/Seoul";
const session = (id: string, iso: string, names: string[], min: number | null) => ({
  id,
  completedAt: new Date(iso),
  durationMinutes: min,
  title: null,
  exerciseNames: names,
});

describe("TodayCompletedList — 같은 날 여러 운동이 시간순으로 남는다", () => {
  it("세션 수만큼 줄을 그리고 개수를 헤더에 적는다", () => {
    const html = renderToStaticMarkup(
      <TodayCompletedList
        timeZone={TZ}
        sessions={[
          session("a", "2026-11-11T22:20:00Z", ["벤치프레스", "스쿼트"], 42), // KST 7:20
          session("b", "2026-11-12T10:05:00Z", ["러닝"], 30), // KST 19:05
        ]}
      />,
    );
    expect(html.match(/data-testid="today-completed-item"/g)?.length).toBe(2);
    expect(html).toContain("오늘 한 운동 · 2회");
    expect(html).toContain("벤치프레스 · 스쿼트");
    expect(html).toContain("42분");
    // 사용자 시간대(KST)로 읽는다 — UTC로 읽으면 오전·오후가 뒤바뀐다
    expect(html).toContain("7:20");
    expect(html).toContain("7:05");
  });

  it("오늘 한 운동이 없으면 아무것도 그리지 않는다 (부정 확인)", () => {
    expect(
      renderToStaticMarkup(<TodayCompletedList timeZone={TZ} sessions={[]} />),
    ).toBe("");
  });

  it("종목이 3개 이상이면 앞 2개 + 외 N", () => {
    expect(exerciseSummary(["a", "b", "c", "d"])).toBe("a · b 외 2");
    expect(exerciseSummary([])).toBe("운동 기록");
  });
});
