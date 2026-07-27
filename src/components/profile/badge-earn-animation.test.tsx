import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeEarnAnimation } from "./badge-earn-animation";

describe("BadgeEarnAnimation", () => {
  it("배지 이름과 보상을 보여준다(정적)", () => {
    const html = renderToStaticMarkup(
      <BadgeEarnAnimation badgeKey="workout_10" name="열 번 찍었개" points={300} />,
    );
    expect(html).toContain("열 번 찍었개");
    expect(html).toContain("+300");
  });
});
