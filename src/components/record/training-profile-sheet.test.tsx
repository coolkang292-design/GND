// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingProfileSheet } from "./training-profile-sheet";

afterEach(cleanup);

function pickRequired() {
  fireEvent.click(screen.getByText("근육 키우기"));
  fireEvent.click(screen.getByText("꾸준히 · 1~3년"));
  fireEvent.click(screen.getByText("주 4회"));
  fireEvent.click(screen.getByText("60분"));
  fireEvent.click(screen.getByText("헬스장"));
}

describe("TrainingProfileSheet", () => {
  it("필수를 다 고르기 전에는 저장 버튼이 잠겨 있다", () => {
    render(<TrainingProfileSheet onSave={vi.fn()} onClose={vi.fn()} />);
    const button = screen.getByText("위 다섯 가지를 골라 주세요") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("칩 여섯 번으로 저장한다 — 우선 부위는 최대 3개", async () => {
    const onSave = vi.fn(async () => {});
    render(<TrainingProfileSheet onSave={onSave} onClose={vi.fn()} />);
    pickRequired();
    for (const part of ["어깨", "등", "팔", "하체"]) {
      fireEvent.click(screen.getByText(part));
    }
    fireEvent.click(screen.getByText("저장하고 분석 받기"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      primaryGoal: "hypertrophy",
      experienceLevel: "intermediate",
      sessionsPerWeek: 4,
      sessionMinutes: 60,
      trainingLocation: "gym",
      priorityBodyParts: ["어깨", "등", "팔"],
      limitationBodyParts: [],
      currentWeightKg: null,
      targetWeightKg: null,
    });
  });

  it("저장이 실패하면 시트를 닫지 않고 오류를 보여 준다", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("x");
    });
    render(<TrainingProfileSheet onSave={onSave} onClose={vi.fn()} />);
    pickRequired();
    fireEvent.click(screen.getByText("저장하고 분석 받기"));
    expect(await screen.findByText(/저장하지 못했어요/)).toBeTruthy();
  });

  it("선택 항목(체중·불편 부위)은 접혀 있다", () => {
    render(<TrainingProfileSheet onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("지금 체중 (kg)")).toBeNull();
    fireEvent.click(screen.getByText(/더 알려주기/));
    expect(screen.getByText("지금 체중 (kg)")).toBeTruthy();
  });
});
