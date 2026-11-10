import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayFeedNotice } from "./today-feed-notice";

describe("TodayFeedNotice — 추가 운동은 오늘 피드에 합쳐진다는 안내", () => {
  it("오늘 올린 운동이 있으면 합쳐진다고 말한다", () => {
    const html = renderToStaticMarkup(<TodayFeedNotice count={1} />);
    expect(html).toContain("오늘 올린 피드가 있어요");
    expect(html).toContain("그 피드에 합쳐져요");
  });

  it("오늘 올린 운동이 없으면 아무것도 그리지 않는다 (부정 확인)", () => {
    expect(renderToStaticMarkup(<TodayFeedNotice count={0} />)).toBe("");
  });
});
