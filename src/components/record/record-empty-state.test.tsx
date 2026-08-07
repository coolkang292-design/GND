// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordEmptyState } from "./record-empty-state";

afterEach(cleanup);

describe("RecordEmptyState — 등록 0개 화면 (사용자 지시 2026-08-06)", () => {
  it("첫 운동 추가하기를 핵심 CTA로 보여준다", () => {
    const { getByText } = render(
      <RecordEmptyState hasHistory={false} onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    expect(getByText("아직 추가된 운동이 없어요")).toBeTruthy();
    expect(getByText("＋ 첫 운동 추가하기")).toBeTruthy();
  });

  it("이력이 없으면 '최근 운동 불러오기'가 아예 없다", () => {
    // ⚠️ 눌러도 빈 목록이 나오는 막다른 길을 주지 않는다.
    const { queryByText } = render(
      <RecordEmptyState hasHistory={false} onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    expect(queryByText("🕘 최근 운동 불러오기")).toBeNull();
  });

  it("이력이 있으면 보조 CTA로 나온다", () => {
    const { getByText } = render(
      <RecordEmptyState hasHistory onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    expect(getByText("🕘 최근 운동 불러오기")).toBeTruthy();
  });

  it("두 버튼이 서로 다른 핸들러로 간다", () => {
    const onAdd = vi.fn();
    const onLoadRecent = vi.fn();
    const { getByText } = render(
      <RecordEmptyState hasHistory onAdd={onAdd} onLoadRecent={onLoadRecent} />,
    );

    fireEvent.click(getByText("＋ 첫 운동 추가하기"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onLoadRecent).not.toHaveBeenCalled();

    fireEvent.click(getByText("🕘 최근 운동 불러오기"));
    expect(onLoadRecent).toHaveBeenCalledTimes(1);
  });

  it("볼륨·휴식·타바타·복구 안내를 하나도 안 그린다", () => {
    // 제거 검증 — 새 문구가 있는지만 보면 제거를 확인한 게 아니다.
    const { container } = render(
      <RecordEmptyState hasHistory onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    for (const gone of ["완료 볼륨", "이전 대비", "세트 사이 휴식", "타바타", "복구됩니다", "운동 시작"]) {
      expect(text).not.toContain(gone);
    }
  });

  it("추가 버튼이 하나뿐이다", () => {
    // ⚠️ 2026-08-06 화면 확인에서 사용자가 잡았다: 빈 상태에도 목록용
    // '+ 운동 추가' 줄이 같이 렌더돼, 같은 일을 하는 버튼이 두 개였다.
    const { container } = render(
      <RecordEmptyState hasHistory onAdd={vi.fn()} onLoadRecent={vi.fn()} />,
    );
    const adders = [...container.querySelectorAll("button")].filter((b) =>
      (b.textContent ?? "").includes("운동 추가"),
    );
    expect(adders).toHaveLength(1);
  });
});
