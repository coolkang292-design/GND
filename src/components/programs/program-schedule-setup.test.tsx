// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFICIAL_PROGRAMS } from "@/lib/domain/official-programs";
import type { WorkoutPlan } from "@/lib/workout-plan";
import { ProgramScheduleSetup } from "./program-schedule-setup";

afterEach(cleanup);

const program = OFFICIAL_PROGRAMS[0];
const resolvedSessions = program.sessions.map((session) => ({
  key: session.key,
  title: session.title,
  exercises: [],
}));

function openSlots() {
  fireEvent.click(screen.getByRole("button", { name: "다음 주 시작" }));
}

function openPreview() {
  openSlots();
  fireEvent.click(screen.getByRole("button", { name: "월 · 수 · 금" }));
  fireEvent.change(screen.getByLabelText("세 요일 모두 같은 시간"), {
    target: { value: "19:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));
}

function occupiedPlan(date: string): WorkoutPlan {
  return {
    id: `plan-${date}`,
    userId: "user-1",
    planDate: date,
    sourceSessionId: null,
    exercises: [],
    tabataMinutes: null,
    title: "기존 운동 계획",
    scheduledAt: null,
    programEnrollmentId: null,
    programWeek: null,
    programSession: null,
    programTemplateVersion: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}

describe("ProgramScheduleSetup", () => {
  it("이번 주 시작은 오늘보다 과거인 계획을 만들지 않는다", () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[]}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이번 주 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "월 · 수 · 금" }));
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

    const dates = screen
      .getAllByTestId("program-plan-date")
      .map((node) => node.textContent ?? "");
    expect(dates[0]).toContain("8월 12일");
    expect(dates.join(" ")).not.toContain("8월 10일");
  });

  it("시작일, 요일·시간, 18회 미리보기 순서로 등록 입력을 만든다", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[]}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("1/3 · 시작일")).toBeTruthy();
    openPreview();
    expect(screen.getByText("3/3 · 18회 미리보기")).toBeTruthy();
    expect(screen.getAllByTestId("program-plan-date")).toHaveLength(18);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "18회 계획을 달력에 담기" }),
      );
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      program,
      startDate: "2026-08-17",
      timeZone: "Asia/Seoul",
      levelAtStart: "beginner",
      preferredSlots: [
        { weekday: 1, time: "19:00" },
        { weekday: 3, time: "19:00" },
        { weekday: 5, time: "19:00" },
      ],
    });
  });

  it("회복이 부족한 연속 요일은 미리보기로 진행하지 않는다", () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[]}
        onConfirm={vi.fn()}
      />,
    );
    openSlots();
    fireEvent.click(screen.getByRole("button", { name: "직접 선택" }));
    for (const name of ["월요일", "화요일", "수요일"]) {
      fireEvent.click(screen.getByLabelText(name));
    }
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

    expect(screen.getByText(/운동일 사이에는 하루 이상 쉬어야/)).toBeTruthy();
    expect(screen.queryByText("3/3 · 18회 미리보기")).toBeNull();
  });

  it("기존 계획 날짜는 유지하고 가까운 빈 날짜를 제안한다", () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[occupiedPlan("2026-08-17")]}
        onConfirm={vi.fn()}
      />,
    );
    openPreview();

    expect(screen.getByText(/기존 계획 유지/)).toBeTruthy();
    expect(screen.getByText(/8월 17일.*대신/)).toBeTruthy();
  });

  it("저장 중에는 이중 클릭을 막는다", async () => {
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => { resolveConfirm = resolve; }),
    );
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[]}
        onConfirm={onConfirm}
      />,
    );
    openPreview();
    const button = screen.getByRole("button", { name: "18회 계획을 달력에 담기" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolveConfirm());
  });

  it("저장 실패 뒤에도 미리보기와 입력을 유지한다", async () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[]}
        onConfirm={vi.fn().mockRejectedValue(new Error("network"))}
      />,
    );
    openPreview();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "18회 계획을 달력에 담기" }),
      );
    });

    expect(
      screen.getByText("저장하지 못했어요. 일정은 그대로 두었어요."),
    ).toBeTruthy();
    expect(screen.getByText("3/3 · 18회 미리보기")).toBeTruthy();
    expect(screen.getAllByTestId("program-plan-date")).toHaveLength(18);
  });
});
