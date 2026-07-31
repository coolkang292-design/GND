// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeSetupSheet } from "./setup-sheet";

afterEach(cleanup);

describe("ChallengeSetupSheet 챌린지 이름", () => {
  it("생성 화면은 빈 이름칸에 안내 문구를 표시하고 바로 포커스한다", () => {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 100 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("챌린지 이름을 입력하세요");
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
  });
});
