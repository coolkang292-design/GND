// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFICIAL_PROGRAMS,
  STRENGTH_PROGRAMS,
} from "@/lib/domain/official-programs";
import type { CatalogExercise } from "@/lib/types";
import type { ProgramEnrollment } from "@/lib/programs";
import { takeCalendarView } from "@/lib/record-view";
import { ProgramFlow } from "./program-flow";

afterEach(cleanup);

const catalog: CatalogExercise[] = [
  ...new Set(
    STRENGTH_PROGRAMS.flatMap((program) =>
      program.sessions.flatMap((session) =>
        session.exercises.map((exercise) => exercise.exerciseName),
      ),
    ),
  ),
].map((name, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  name,
  body_part: "어깨",
  exercise_type: "weight",
  measure: null,
  is_custom: false,
  created_by: null,
  created_at: "2026-08-12T00:00:00.000Z",
}));

function openSchedule() {
  fireEvent.click(screen.getByRole("button", { name: /시선이 머무는 어깨/ }));
  fireEvent.click(screen.getByRole("button", { name: "요일과 시간 정하기" }));
}

function finishSchedule() {
  openSchedule();
  fireEvent.click(screen.getByRole("button", { name: "다음 주 시작" }));
  fireEvent.click(screen.getByRole("button", { name: "월 · 수 · 금" }));
  fireEvent.change(screen.getByLabelText("세 요일 모두 같은 시간"), {
    target: { value: "19:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));
}

const activeShoulderEnrollment: ProgramEnrollment = {
  id: "00000000-0000-4000-8000-000000000999",
  programKey: "shoulder-frame-6w",
  programVersion: 1,
  title: "상체의 틀을 넓히는 6주",
  levelAtStart: "beginner",
  startDate: "2026-08-17",
  timeZone: "Asia/Seoul",
  preferredSlots: [
    { weekday: 1, time: "19:00" },
    { weekday: 3, time: "19:00" },
    { weekday: 5, time: "19:00" },
  ],
  status: "active",
};

describe("ProgramFlow", () => {
  it("프로그램 선택부터 18회 등록 완료까지 한 흐름으로 이어진다", async () => {
    const onCreate = vi.fn().mockResolvedValue({
      enrollmentId: "enrollment-1",
      nextPlan: { date: "2026-08-17", time: "19:00", title: "밀고 세우기" },
    });
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={catalog}
        occupiedPlans={[]}
        onCreate={onCreate}
        onCreateInterval={vi.fn()}
      />,
    );

    finishSchedule();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "18회 계획을 달력에 담기" }),
      );
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("6주 계획이 준비됐어요")).toBeTruthy();
    expect(screen.getByText(/8월 17일.*오후 7:00/)).toBeTruthy();
    expect(screen.getByText("다음 운동")).toBeTruthy();
    expect(screen.getByText("1주차 A회 · 밀고 세우기")).toBeTruthy();
    expect(document.querySelector('img[src*="finish.webp"]')).not.toBeNull();

    // 방금 담은 18회를 보러 가는 길이다 — 운동 탭이 아니라 달력으로 착지시킨다
    // (사용자 지적 2026-08-12)
    fireEvent.click(
      screen.getByRole("link", { name: "달력에서 계획 확인하기" }),
    );
    expect(takeCalendarView()).toBe(true);
  });

  it("같은 프로그램이 진행 중이면 새 등록 대신 진행 화면으로 안내한다", () => {
    const activeEnrollment: ProgramEnrollment = {
      id: "00000000-0000-4000-8000-000000000999",
      programKey: "shoulder-frame-6w",
      programVersion: 1,
      title: "상체의 틀을 넓히는 6주",
      levelAtStart: "beginner",
      startDate: "2026-08-17",
      timeZone: "Asia/Seoul",
      preferredSlots: [
        { weekday: 1, time: "19:00" },
        { weekday: 3, time: "19:00" },
        { weekday: 5, time: "19:00" },
      ],
      status: "active",
    };
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={catalog}
        occupiedPlans={[]}
        activeEnrollments={[activeEnrollment]}
        onCreate={vi.fn()}
        onCreateInterval={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /시선이 머무는 어깨/ }));
    expect(
      screen.getByRole("link", { name: "진행 중인 프로그램 보기" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "요일과 시간 정하기" }),
    ).toBeNull();

    // 진행 중인 회차는 달력에 있다 — 등록 완료 화면과 같은 착지점
    fireEvent.click(
      screen.getByRole("link", { name: "진행 중인 프로그램 보기" }),
    );
    expect(takeCalendarView()).toBe(true);
  });

  it("그만두기는 물어본 뒤에만 지우고, 취소하면 목록으로 돌아간다", async () => {
    // 되돌릴 수 없는 삭제다 (0071). 확인 없이 지우면 실수로 6주가 날아간다.
    const onCancel = vi.fn().mockResolvedValue(18);
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={catalog}
        occupiedPlans={[]}
        activeEnrollments={[activeShoulderEnrollment]}
        onCreate={vi.fn()}
        onCreateInterval={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /시선이 머무는 어깨/ }));
    const quit = screen.getByRole("button", { name: "이 프로그램 그만두기" });

    // ① 확인창에서 아니오 → 아무것도 안 지운다
    await act(async () => fireEvent.click(quit));
    expect(onCancel).not.toHaveBeenCalled();

    // ② 예 → 지우고 목록으로 돌아간다
    await act(async () => fireEvent.click(quit));
    expect(onCancel).toHaveBeenCalledWith(activeShoulderEnrollment.id);
    expect(
      screen.getByRole("heading", { name: "목표를 고르면 18회 계획이 완성돼요" }),
    ).toBeTruthy();

    confirmSpy.mockRestore();
  });

  it("그만두기가 실패하면 이유를 보여 주고 화면을 유지한다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={catalog}
        occupiedPlans={[]}
        activeEnrollments={[activeShoulderEnrollment]}
        onCreate={vi.fn()}
        onCreateInterval={vi.fn()}
        onCancel={vi.fn().mockRejectedValue({ message: "program_not_active" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /시선이 머무는 어깨/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "이 프로그램 그만두기" })),
    );

    expect(screen.getByRole("alert").textContent).toContain("program_not_active");
    expect(
      screen.getByRole("link", { name: "진행 중인 프로그램 보기" }),
    ).toBeTruthy();
    confirmSpy.mockRestore();
    consoleError.mockRestore();
  });

  it("그만두기를 안 넘기면 그 버튼이 없다", () => {
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={catalog}
        occupiedPlans={[]}
        activeEnrollments={[activeShoulderEnrollment]}
        onCreate={vi.fn()}
        onCreateInterval={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /시선이 머무는 어깨/ }));
    expect(
      screen.queryByRole("button", { name: "이 프로그램 그만두기" }),
    ).toBeNull();
  });

  it("등록 실패 뒤에는 완료 화면으로 가지 않고 일정과 오류를 유지한다", async () => {
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={catalog}
        occupiedPlans={[]}
        onCreate={vi.fn().mockRejectedValue(new Error("rpc failed"))}
        onCreateInterval={vi.fn()}
      />,
    );

    finishSchedule();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "18회 계획을 달력에 담기" }),
      );
    });

    expect(
      screen.getByText("저장하지 못했어요. 일정은 그대로 두었어요. (rpc failed)"),
    ).toBeTruthy();
    expect(screen.getByText("3/3 · 18회 미리보기")).toBeTruthy();
    expect(screen.queryByText("6주 계획이 준비됐어요")).toBeNull();
  });

  it("운동 카탈로그가 불완전하면 등록 단계에 진입하지 않는다", () => {
    render(
      <ProgramFlow
        today="2026-08-12"
        timeZone="Asia/Seoul"
        programs={OFFICIAL_PROGRAMS}
        catalog={[]}
        occupiedPlans={[]}
        onCreate={vi.fn()}
        onCreateInterval={vi.fn()}
      />,
    );

    openSchedule();
    expect(screen.getByText(/프로그램 운동 정보를 불러오지 못했어요/)).toBeTruthy();
    expect(screen.queryByText("1/3 · 시작일")).toBeNull();
  });
});
