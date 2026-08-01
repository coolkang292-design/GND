// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutineSaveSheet } from "./routine-save-sheet";

afterEach(cleanup); // vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다

function setup(
  over: Partial<{
    savedCount: number;
    slotLimit: number;
    nextSlotLevel: number | null;
    onSave: (name: string) => Promise<boolean>;
  }> = {},
) {
  const onSave = over.onSave ?? vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  const view = render(
    <RoutineSaveSheet
      open
      exerciseNames={["벤치프레스", "덤벨 플라이"]}
      savedCount={over.savedCount ?? 0}
      slotLimit={over.slotLimit ?? 3}
      nextSlotLevel={
        over.nextSlotLevel === undefined ? 12 : over.nextSlotLevel
      }
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { ...view, onSave, onClose };
}

describe("RoutineSaveSheet — 루틴으로 저장 (0056)", () => {
  it("현재 슬롯 사용량을 보여준다", () => {
    const { getByText } = setup({ savedCount: 2, slotLimit: 3 });
    expect(getByText("2 / 3")).toBeTruthy();
  });

  it("이름이 비면 저장할 수 없다", () => {
    const { getByText } = setup();
    expect((getByText("저장") as HTMLButtonElement).disabled).toBe(true);
  });

  it("이름을 넣으면 저장되고 시트가 닫힌다", async () => {
    const { getByLabelText, getByText, onSave, onClose } = setup();

    fireEvent.change(getByLabelText("루틴 이름"), {
      target: { value: "  가슴날  " },
    });
    fireEvent.click(getByText("저장"));

    // 앞뒤 공백은 떼고 넘긴다 — 안 그러면 '가슴날'과 ' 가슴날'이 다른 루틴이 된다
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("가슴날"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("저장에 실패하면 시트를 닫지 않는다", async () => {
    // 이름 중복이면 사용자가 이름을 고쳐야 한다. 닫아 버리면 입력한 것이 날아간다.
    const onSave = vi.fn().mockResolvedValue(false);
    const { getByLabelText, getByText, onClose } = setup({ onSave });

    fireEvent.change(getByLabelText("루틴 이름"), {
      target: { value: "가슴날" },
    });
    fireEvent.click(getByText("저장"));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("슬롯이 꽉 차면 저장 버튼이 잠기고 다음 레벨을 알려준다", () => {
    // "저장 안 됨"만 알리지 않는다 — 왜 안 되는지, 언제 풀리는지 같이 말한다.
    const { getByText, queryByLabelText } = setup({
      savedCount: 3,
      slotLimit: 3,
      nextSlotLevel: 12,
    });

    expect((getByText("저장") as HTMLButtonElement).disabled).toBe(true);
    expect(queryByLabelText("루틴 이름")).toBeNull();
    expect(getByText(/슬롯 3개를 모두 썼어요/)).toBeTruthy();
    expect(getByText(/Lv\.12을 달성하면 슬롯이 하나 늘어나요/)).toBeTruthy();
  });

  it("더 열릴 슬롯이 없으면 기존 루틴을 지우라고 안내한다", () => {
    const { getByText } = setup({
      savedCount: 5,
      slotLimit: 5,
      nextSlotLevel: null,
    });
    expect(getByText(/기존 루틴을 지우면/)).toBeTruthy();
  });

  it("open이 false면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <RoutineSaveSheet
        open={false}
        exerciseNames={["벤치프레스"]}
        savedCount={0}
        slotLimit={3}
        nextSlotLevel={12}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
