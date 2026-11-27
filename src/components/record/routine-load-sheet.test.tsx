// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutineLoadSheet } from "./routine-load-sheet";

afterEach(cleanup); // vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다

function setup(routineName: string | null = "데일리운동용") {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <RoutineLoadSheet routineName={routineName} onConfirm={onConfirm} onCancel={onCancel} />,
  );
  return { ...view, onConfirm, onCancel };
}

describe("RoutineLoadSheet", () => {
  it("이름이 없으면 그리지 않는다", () => {
    const { queryByRole } = setup(null);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("작업지시서 문구 그대로 — 제목·두 선택지·안내", () => {
    const { getByRole, getByText } = setup();
    expect(getByRole("dialog", { name: "루틴 불러오기" })).toBeTruthy();
    expect(getByText("저장된 루틴 그대로 불러오기")).toBeTruthy();
    expect(getByText("현재 준비 목록을 선택한 루틴으로 교체해요.")).toBeTruthy();
    expect(getByText("현재 목록에 추가하기")).toBeTruthy();
    expect(getByText("기존 운동을 유지하고 새로운 운동만 추가해요.")).toBeTruthy();
    expect(getByText("오늘 운동을 수정해도 저장된 루틴은 변경되지 않아요.")).toBeTruthy();
  });

  it("기본 선택은 '그대로 불러오기'다", () => {
    const { getAllByRole, getByText, onConfirm } = setup();
    const radios = getAllByRole("radio");
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].getAttribute("aria-checked")).toBe("false");

    fireEvent.click(getByText("불러오기"));
    expect(onConfirm).toHaveBeenCalledWith("replace");
  });

  it("'추가하기'를 고르면 add로 확인한다", () => {
    const { getByText, onConfirm } = setup();
    fireEvent.click(getByText("현재 목록에 추가하기"));
    fireEvent.click(getByText("불러오기"));
    expect(onConfirm).toHaveBeenCalledWith("add");
  });

  it("다시 열면 지난번 선택이 아니라 기본값부터 시작한다", () => {
    const { getByText, getAllByRole, rerender, onConfirm, onCancel } = setup();
    fireEvent.click(getByText("현재 목록에 추가하기"));
    rerender(<RoutineLoadSheet routineName={null} onConfirm={onConfirm} onCancel={onCancel} />);
    rerender(<RoutineLoadSheet routineName="풀패키지" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(getAllByRole("radio")[0].getAttribute("aria-checked")).toBe("true");
  });

  it("열리면 초점을 받고 Escape는 루틴 확인만 취소한다", () => {
    const { getByRole, onCancel, onConfirm } = setup();
    const dialog = getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("전체 화면의 브라우저 뒤로가기 신호로 취소한다", () => {
    const { onCancel, onConfirm } = setup();
    window.dispatchEvent(new Event("gnd-fullscreen-back"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("취소·바깥 누르기는 아무것도 바꾸지 않고 닫는다", () => {
    const { getByText, getByLabelText, onCancel, onConfirm } = setup();
    fireEvent.click(getByText("취소"));
    fireEvent.click(getByLabelText("닫기"));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
