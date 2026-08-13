// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalCard, type GoalRow } from "./goal-card";

afterEach(cleanup);

// 300회 ÷ (주3일 × 4주) = 하루 25회
const WEIGHT_ROW: GoalRow = {
  category: "weight",
  type: "weight_reps",
  total: 300,
  perDay: 25,
  calcDaysPerWeek: 3,
  qualifier: 0,
};

const DAYS_ROW: GoalRow = {
  category: "weight",
  type: "weight_days",
  total: 12,
  perDay: 0,
  calcDaysPerWeek: 3,
  qualifier: 3,
};

function renderCard(row: GoalRow, onChange = vi.fn()) {
  render(
    <GoalCard
      index={0}
      row={row}
      periodDays={28}
      canRemove
      onChange={onChange}
      onRemove={vi.fn()}
    />,
  );
  return onChange;
}

describe("GoalCard — 기간 총 목표", () => {
  it("총 목표를 주인공 입력칸으로 보여준다", () => {
    renderCard(WEIGHT_ROW);
    const input = screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement;
    expect(input.value).toBe("300");
  });

  it("총 목표를 고치면 그 값이 그대로 올라간다", () => {
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.change(screen.getByLabelText("기간 총 목표 (회)"), {
      target: { value: "500" },
    });
    // 500 ÷ (주3일 × 4주) = 41.7
    expect(onChange).toHaveBeenCalledWith({ total: 500, perDay: 41.7 });
  });
});

describe("GoalCard — 하루 기준 계산기", () => {
  // ⚠️ 토글 버튼은 `getByText`로 잡히지 않는다. 안에 "▸"와 문구가 **별개 텍스트
  //    노드**라 textContent가 "▾ 하루 기준으로 계산하기"다. aria-label로 잡는다.
  const toggleCalc = () =>
    fireEvent.click(screen.getByLabelText("하루 기준으로 계산하기"));

  it("기본은 펼쳐져 있다 — 하루 기준이 기본 입력 방식이다", () => {
    renderCard(WEIGHT_ROW);
    expect(screen.getByLabelText("하루 목표 (회)")).toBeTruthy();
  });

  it("토글을 누르면 접힌다", () => {
    renderCard(WEIGHT_ROW);
    toggleCalc();
    expect(screen.queryByLabelText("하루 목표 (회)")).toBeNull();
  });

  it("하루 목표는 총 목표에서 역산돼 보인다 — 300 ÷ (주3일 × 4주) = 25", () => {
    renderCard(WEIGHT_ROW);
    expect((screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value).toBe(
      "25",
    );
  });

  it("총 목표를 직접 고치면 하루 기준을 역산해 함께 올린다 — 600 ÷ (주3일 × 4주) = 50", () => {
    // 기간이 나중에 바뀌어도 방금 정한 강도가 유지되려면 perDay가 같이 갱신돼야 한다
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.change(screen.getByLabelText("기간 총 목표 (회)"), {
      target: { value: "600" },
    });
    expect(onChange).toHaveBeenCalledWith({ total: 600, perDay: 50 });
  });

  it("하루 목표를 바꾸면 총 목표가 다시 계산된다 — 30 × 주3일 × 4주 = 360", () => {
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.change(screen.getByLabelText("하루 목표 (회)"), {
      target: { value: "30" },
    });
    expect(onChange).toHaveBeenCalledWith({ perDay: 30, total: 360 });
  });

  it("주 며칠을 올리면 총 목표가 다시 계산된다 — 25 × 주4일 × 4주 = 400", () => {
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));
    expect(onChange).toHaveBeenCalledWith({ calcDaysPerWeek: 4, total: 400 });
  });
});

describe("GoalCard — 일수형 목표", () => {
  it("하루 목표 칸이 없다 — '주 며칠'만으로 총 일수가 정해진다", () => {
    renderCard(DAYS_ROW);
    expect(screen.queryByLabelText("하루 목표 (일)")).toBeNull();
    expect(screen.getByLabelText("주 며칠 늘리기")).toBeTruthy();
  });

  it("주 며칠을 올리면 총 일수가 다시 계산된다 — 주4일 × 4주 = 16일", () => {
    const onChange = renderCard(DAYS_ROW);
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));
    expect(onChange).toHaveBeenCalledWith({ calcDaysPerWeek: 4, total: 16 });
  });

  it("하루 최소 종목 수 스테퍼가 보인다 — 달성률 정의라 남는다", () => {
    renderCard(DAYS_ROW);
    expect(screen.getByText(/하루 최소 종목 수/)).toBeTruthy();
  });
});

describe("GoalCard — 카테고리·지표", () => {
  it("카테고리를 바꾸면 그 분류의 첫 지표와 기본 목표값으로 갈아탄다", () => {
    const onChange = renderCard(WEIGHT_ROW);
    fireEvent.click(screen.getByRole("button", { name: "유산소" }));
    expect(onChange).toHaveBeenCalledWith({
      category: "cardio",
      type: "cardio_distance",
      total: 20,
      perDay: 1.7, // 20km ÷ (주3일 × 4주)
      qualifier: 0,
    });
  });
});
