// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutineSaveSheet } from "./routine-save-sheet";

afterEach(cleanup); // vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다

const ROUTINES = [
  { id: "r1", name: "데일리운동용", exerciseNames: ["스쿼트", "걷기"] },
  { id: "r2", name: "풀패키지", exerciseNames: ["매달리기"] },
];

function setup(
  over: Partial<{
    savedCount: number;
    slotLimit: number;
    nextSlotLevel: number | null;
    routines: { id: string; name: string; exerciseNames: string[] }[];
    onSave: (name: string) => Promise<boolean>;
    onOverwrite: (routineId: string) => Promise<boolean>;
  }> = {},
) {
  const onSave = over.onSave ?? vi.fn().mockResolvedValue(true);
  const onOverwrite = over.onOverwrite ?? vi.fn().mockResolvedValue(true);
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
      routines={over.routines ?? ROUTINES}
      onClose={onClose}
      onSave={onSave}
      onOverwrite={onOverwrite}
    />,
  );
  return { ...view, onSave, onOverwrite, onClose };
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

    // 꽉 차면 '기존 루틴 수정'이 먼저 열린다(2026-08-04) — 새 루틴 쪽을 본다
    fireEvent.click(getByText("새 루틴"));
    expect((getByText("저장") as HTMLButtonElement).disabled).toBe(true);
    expect(queryByLabelText("루틴 이름")).toBeNull();
    expect(getByText(/슬롯 3개를 모두 썼어요/)).toBeTruthy();
    expect(getByText(/Lv\.12을 달성하면 슬롯이 하나 늘어나요/)).toBeTruthy();
  });

  it("슬롯이 꽉 차도 덮어쓰기로 빠져나갈 길을 알려준다", () => {
    // 2026-08-03 신고(6d6bffac): 루틴 3개가 전부 잘못됐는데 한도가 3이라
    // 새로 만들 수도, 종목을 고칠 수도 없어 갇혔다. 막다른 길을 만들지 않는다.
    const { getByText } = setup({ savedCount: 3, slotLimit: 3 });
    expect(getByText(/기존 루틴 수정/)).toBeTruthy();
  });

  it("더 열릴 슬롯이 없으면 기존 루틴을 지우라고 안내한다", () => {
    const { getByText } = setup({
      savedCount: 5,
      slotLimit: 5,
      nextSlotLevel: null,
    });
    fireEvent.click(getByText("새 루틴"));
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
        routines={ROUTINES}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onOverwrite={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("RoutineSaveSheet — 기존 루틴 종목 수정 (2026-08-04)", () => {
  it("기존 루틴 탭에서 현재 종목 구성을 보여준다", () => {
    // 어느 루틴을 덮어쓸지 고르려면 지금 뭐가 들었는지 보여야 한다.
    const { getByText } = setup();
    fireEvent.click(getByText("기존 루틴 수정"));
    expect(getByText("스쿼트 · 걷기")).toBeTruthy();
    expect(getByText("매달리기")).toBeTruthy();
  });

  it("루틴을 고르고 덮어쓰면 그 id로 저장되고 시트가 닫힌다", async () => {
    const { getByText, getByLabelText, onOverwrite, onClose } = setup();

    fireEvent.click(getByText("기존 루틴 수정"));
    fireEvent.click(getByLabelText("'풀패키지' 루틴 고르기"));
    fireEvent.click(getByText("선택한 루틴 덮어쓰기"));

    await waitFor(() => expect(onOverwrite).toHaveBeenCalledWith("r2"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("루틴을 안 고르면 덮어쓰기 버튼이 잠긴다", () => {
    const { getByText } = setup();
    fireEvent.click(getByText("기존 루틴 수정"));
    expect(
      (getByText("선택한 루틴 덮어쓰기") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("슬롯이 꽉 차 있어도 덮어쓰기는 된다", async () => {
    // 덮어쓰기는 UPDATE라 0056의 slot 트리거(before insert)에 걸리지 않는다.
    // 한도에 막힌 사용자가 빠져나올 수 있는 유일한 길이므로 반드시 열려 있어야 한다.
    const { getByText, getByLabelText, onOverwrite } = setup({
      savedCount: 3,
      slotLimit: 3,
    });

    fireEvent.click(getByText("기존 루틴 수정"));
    fireEvent.click(getByLabelText("'데일리운동용' 루틴 고르기"));
    fireEvent.click(getByText("선택한 루틴 덮어쓰기"));

    await waitFor(() => expect(onOverwrite).toHaveBeenCalledWith("r1"));
  });

  it("덮어쓰기에 실패하면 시트를 닫지 않는다", async () => {
    const onOverwrite = vi.fn().mockResolvedValue(false);
    const { getByText, getByLabelText, onClose } = setup({ onOverwrite });

    fireEvent.click(getByText("기존 루틴 수정"));
    fireEvent.click(getByLabelText("'풀패키지' 루틴 고르기"));
    fireEvent.click(getByText("선택한 루틴 덮어쓰기"));

    await waitFor(() => expect(onOverwrite).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("저장된 루틴이 없으면 기존 루틴 탭 자체가 없다", () => {
    const { queryByText } = setup({ routines: [], savedCount: 0 });
    expect(queryByText("기존 루틴 수정")).toBeNull();
  });
});
