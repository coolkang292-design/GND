import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExercisePicker } from "./exercise-picker";

describe("ExercisePicker", () => {
  it("운동 찾기와 지난 기록 탭을 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <ExercisePicker
        open
        catalog={[]}
        pastSessions={[
          {
            id: "past-session",
            completedAt: new Date("2026-07-17T10:00:00+09:00"),
            verification: "none",
            durationSeconds: 2_700,
            exerciseNames: ["벤치프레스", "랫풀다운"],
            recordNote: null,
          },
        ]}
        pastLoading={false}
        onClose={vi.fn()}
        onPickMany={vi.fn()}
        onPickPast={vi.fn()}
        onCreateCustom={vi.fn()}
      />,
    );

    expect(html).toContain("운동 찾기");
    expect(html).toContain("지난 기록");
  });
});
