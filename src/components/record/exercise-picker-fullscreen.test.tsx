// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExercisePicker } from "./exercise-picker";
import { PlanEditSheet } from "./plan-edit-sheet";
import type { CatalogExercise } from "@/lib/types";

const catalog: CatalogExercise[] = [
  { id: "no-picture", name: "자주 하는 벤치", body_part: "가슴", exercise_type: "weight", measure: null, is_custom: false, created_by: null, created_at: "2026-01-01" },
  { id: "5f00e9f0-8b12-4746-b59b-df6e7529f94f", name: "랫풀다운", body_part: "등", exercise_type: "weight", measure: null, is_custom: false, created_by: null, created_at: "2026-01-01" },
];
const base = { open: true, catalog, pastSessions: [], pastLoading: false, onClose: vi.fn(), onPickMany: vi.fn(), onPickConfigured: vi.fn(), onPickPast: vi.fn(), onCreateCustom: vi.fn() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("전체 화면 운동 선택", () => {
  it("처음부터 목록을 보여주고 검색 키보드는 자동으로 열지 않는다", () => {
    render(<ExercisePicker {...base} />);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    const search = screen.getByPlaceholderText("🔍 운동 검색 (예: 스쿼트, 벤치)");
    expect(document.activeElement).not.toBe(search);
    expect(screen.getByText("자주 하는 벤치")).toBeTruthy();
    expect(screen.queryByText("⭐ 자주 한 운동")).toBeNull();
    expect(screen.getByRole("button", { name: "맨몸" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "전신" })).toBeNull();
  });

  it("그림이 없어도 사용 횟수가 더 많은 운동이 먼저다", () => {
    render(<ExercisePicker {...base} initialMode="search" pastSessions={[{ id: "s", completedAt: new Date(), durationSeconds: 60, exerciseNames: ["자주 하는 벤치"], tabataMinutes: null, photoCount: 0, verification: "none", recordNote: null }]} />);
    const rows = [...document.querySelectorAll("[data-exercise-row]")];
    expect(rows[0]?.textContent).toContain("자주 하는 벤치");
  });

  it("부위와 탭을 바꿔도 선택 순서와 조절한 세트가 유지된다", () => {
    const onPickConfigured = vi.fn();
    render(<ExercisePicker {...base} onPickConfigured={onPickConfigured} />);
    fireEvent.click(screen.getByRole("button", { name: "가슴" }));
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.click(screen.getByText("세트 조절"));
    fireEvent.click(screen.getByText("조절"));
    fireEvent.click(screen.getByLabelText("세트 늘리기"));
    fireEvent.click(screen.getByLabelText("고르던 화면으로 돌아가기"));
    fireEvent.click(screen.getByText("지난 운동"));
    fireEvent.click(screen.getByText("직접 고르기"));
    fireEvent.click(screen.getByRole("button", { name: "등" }));
    fireEvent.click(screen.getByText("랫풀다운"));
    fireEvent.click(screen.getByText("운동 2개 바로 추가"));
    expect(onPickConfigured.mock.calls[0][0].map((p: { item: CatalogExercise }) => p.item.name)).toEqual(["자주 하는 벤치", "랫풀다운"]);
    expect(onPickConfigured.mock.calls[0][0].map((p: { sets: unknown[] }) => p.sets.length)).toEqual([4, 3]);
  });

  it("선택 후 닫기는 앱 안에서 확인하고 취소하면 선택을 유지한다", () => {
    const onClose = vi.fn();
    render(<ExercisePicker {...base} onClose={onClose} />);
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.click(screen.getByLabelText("운동 선택 닫기"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByText("계속 고르기"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("운동 1개 바로 추가")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("운동 선택 닫기"));
    fireEvent.click(screen.getByText("담지 않고 닫기"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("저장 실패 후 선택을 유지해서 다시 시도할 수 있다", async () => {
    const onPickConfigured = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
    render(<ExercisePicker {...base} onPickConfigured={onPickConfigured} />);
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.click(screen.getByText("운동 1개 바로 추가"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByText("운동 1개 바로 추가"));
    expect(onPickConfigured).toHaveBeenCalledTimes(2);
  });

  it("겹친 선택 창을 닫아도 편집 창이 남으면 배경 스크롤을 풀지 않는다", () => {
    const editProps = { open: true, dateLabel: "11월 28일", exercises: [], catalog, onUpdateSet: vi.fn(), onAddSet: vi.fn(), onRemoveSet: vi.fn(), onRemoveExercise: vi.fn(), onLoadLast: vi.fn(), onAdd: vi.fn(), onCancel: vi.fn(), onSave: vi.fn() };
    const view = render(<><PlanEditSheet {...editProps} /><ExercisePicker {...base} /></>);
    expect(document.body.style.overflow).toBe("hidden");
    view.rerender(<><PlanEditSheet {...editProps} /><ExercisePicker {...base} open={false} /></>);
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("뒤로가기 키는 세트 조절에서 선택 목록으로 돌아간다", () => {
    render(<ExercisePicker {...base} />);
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.click(screen.getByText("세트 조절"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("운동 1개 바로 추가")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("직접 만드는 단계는 검색과 필터를 걷어내고 기존 선택을 유지한다", async () => {
    const created = { ...catalog[0], id: "custom-created", name: "새 운동", is_custom: true };
    const onCreateCustom = vi.fn().mockResolvedValue(created);
    const onPickConfigured = vi.fn();
    render(<ExercisePicker {...base} onCreateCustom={onCreateCustom} onPickConfigured={onPickConfigured} />);
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.change(screen.getByLabelText("운동 검색"), { target: { value: "없는 운동" } });
    fireEvent.click(screen.getByRole("button", { name: /직접 만들기/ }));
    expect(screen.getByText("운동 직접 만들기")).toBeTruthy();
    expect(screen.queryByLabelText("운동 검색")).toBeNull();
    expect(screen.queryByRole("button", { name: "가슴" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("예: 케이블 크로스오버"), { target: { value: "새 운동" } });
    fireEvent.click(screen.getByText("만들고 추가"));
    await waitFor(() => expect(screen.getByText("운동 2개 바로 추가")).toBeTruthy());
    expect(onCreateCustom.mock.calls[0][0].name).toBe("새 운동");
    fireEvent.click(screen.getByText("운동 2개 바로 추가"));
    expect(onPickConfigured.mock.calls[0][0].map((pick: { item: CatalogExercise }) => pick.item.id)).toEqual(["no-picture", "custom-created"]);
  });

  it("저장 응답을 기다리는 동안 추가와 닫기를 잠가 중복 실행을 막는다", async () => {
    let finish!: () => void;
    const onPickConfigured = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ExercisePicker {...base} onPickConfigured={onPickConfigured} />);
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.click(screen.getByText("운동 1개 바로 추가"));
    const save = screen.getByText("저장하는 중…") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((screen.getByLabelText("운동 선택 닫기") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(onPickConfigured).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByText("운동 1개 바로 추가")).toBeTruthy());
  });

});

describe("작은 화면의 추천·프로그램 입구", () => {
  const pullup: CatalogExercise = { ...catalog[1], id: "pullup", name: "풀업", exercise_type: "bodyweight", measure: "reps" };
  function compact() {
    vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), { height: 460, offsetTop: 0 }));
  }

  it("같은 작은 메뉴에서 추천 세 종류를 열고 돌아와도 고른 운동은 남는다", () => {
    compact();
    const onPickPreset = vi.fn();
    render(<ExercisePicker {...base} catalog={[...catalog, pullup]} onPickPreset={onPickPreset} onOpenPrograms={vi.fn()} />);
    expect(screen.getByRole("dialog").dataset.compact).toBe("true");
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    const menu = () => screen.getByLabelText("운동을 담는 방법 선택");
    expect([...menu().querySelectorAll("option")].map((option) => option.value)).toEqual(expect.arrayContaining(["situation", "part", "preset", "program"]));
    for (const [value, heading] of [["part", "부위별 추천"], ["situation", "상황별 추천"], ["preset", "추천 루틴"]]) {
      fireEvent.change(menu(), { target: { value } });
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      fireEvent.click(screen.getByLabelText("이전 화면으로 돌아가기"));
      expect(screen.getByText("운동 1개 바로 추가")).toBeTruthy();
    }
    expect(onPickPreset).not.toHaveBeenCalled();
    expect(document.querySelector("[data-compact-toolbar]")?.children).toHaveLength(2);
  });

  it("작은 메뉴의 프로그램도 선택 취소를 확인한 뒤 기존 이동 처리를 호출한다", async () => {
    compact();
    const onOpenPrograms = vi.fn();
    render(<ExercisePicker {...base} onOpenPrograms={onOpenPrograms} />);
    fireEvent.click(screen.getByText("자주 하는 벤치"));
    fireEvent.change(screen.getByLabelText("운동을 담는 방법 선택"), { target: { value: "program" } });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByText("계속 고르기"));
    expect(onOpenPrograms).not.toHaveBeenCalled();
    expect(screen.getByText("운동 1개 바로 추가")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("운동을 담는 방법 선택"), { target: { value: "program" } });
    fireEvent.click(screen.getByText("다른 운동 불러오기"));
    await waitFor(() => expect(onOpenPrograms).toHaveBeenCalledTimes(1));
  });

  it("바꾸기에서는 작은 메뉴에도 지난 운동·루틴·프로그램 입구를 만들지 않는다", () => {
    compact();
    render(<ExercisePicker {...base} catalog={[...catalog, pullup]} replacing="기존 운동" onOpenPrograms={vi.fn()} onPickPreset={vi.fn()} onStartInterval={vi.fn()} />);
    const values = [...screen.getByLabelText("운동을 담는 방법 선택").querySelectorAll("option")].map((option) => option.value);
    expect(values).toEqual(["search", "situation", "part"]);
    fireEvent.change(screen.getByLabelText("운동을 담는 방법 선택"), { target: { value: "part" } });
    expect(screen.queryByText("세트 조절")).toBeNull();
    expect(screen.queryByText("전신 인터벌 고르러 가기")).toBeNull();
  });
});
