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

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — 지표 선택의 짧은 분류명도
 * "타바타"가 아니라 "전신 인터벌"이다. 고르는 값(`tabata_count`)은 그대로다.
 */
describe("ChallengeSetupSheet — 전신 인터벌 명칭", () => {
  function renderSheet() {
    return render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "인터벌 챌린지",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "tabata_count", target: 12 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("맨몸 지표 목록에 '전신 인터벌'이 있고, 그 값은 tabata_count다", () => {
    renderSheet();

    const option = screen.getByRole("option", {
      name: "전신 인터벌",
    }) as HTMLOptionElement;
    // 화면 문구만 바뀐다 — 저장되는 값은 DB 호환을 위해 그대로여야 한다.
    expect(option.value).toBe("tabata_count");
  });

  it("옛 용어 '타바타'는 설정 화면에 남지 않는다", () => {
    // 제거 검증 — 새 문구가 있는지만 보면 옛 문구가 사라졌는지 확인한 게 아니다.
    const { container } = renderSheet();

    expect(container.textContent ?? "").not.toContain("타바타");
  });
});
