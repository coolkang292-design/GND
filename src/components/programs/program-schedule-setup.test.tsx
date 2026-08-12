// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  it("세 단계 진행 상태와 선택한 추천 요일을 분명히 표시한다", () => {
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

    const progress = screen.getByRole("list", { name: "일정 등록 진행" });
    expect(progress).toBeTruthy();
    expect(within(progress).getByText(/시작일$/).closest("li")?.getAttribute("aria-current")).toBe(
      "step",
    );

    openSlots();
    expect(
      within(screen.getByRole("list", { name: "일정 등록 진행" }))
        .getByText(/요일·시간$/)
        .closest("li")
        ?.getAttribute("aria-current"),
    ).toBe("step");
    expect(
      screen.getByRole("button", { name: "월 · 수 · 금" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "화 · 목 · 토" }));
    expect(
      screen.getByRole("button", { name: "화 · 목 · 토" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "월 · 수 · 금" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

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
    expect(screen.getAllByTestId("program-week")).toHaveLength(6);

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

  it("연속 요일도 미리보기로 진행한다 (사용자 확정 2026-08-12)", () => {
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

    // 금·토·일처럼 몰아서 하는 사람을 막고 있었다. 주 3회는 유지하되
    // 언제 하는지는 사용자가 정한다.
    expect(screen.queryByText(/운동일 사이에는 하루 이상 쉬어야/)).toBeNull();
    expect(screen.getByText("3/3 · 18회 미리보기")).toBeTruthy();
  });

  it("같은 요일을 세 번 고르는 것은 여전히 막는다", () => {
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
    fireEvent.click(screen.getByLabelText("월요일"));
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

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

    // 모르는 오류는 **원문을 붙여** 보여 준다 — 삼키면 진단이 불가능하다
    expect(
      screen.getByText("저장하지 못했어요. 일정은 그대로 두었어요. (network)"),
    ).toBeTruthy();
    expect(screen.getByText("3/3 · 18회 미리보기")).toBeTruthy();
    expect(screen.getAllByTestId("program-plan-date")).toHaveLength(18);
  });

  /**
   * 2026-08-12 회귀 방지. `catch {}`가 오류를 통째로 삼켜서, 연속 3일 등록이
   * 왜 실패하는지 화면에도 콘솔에도 안 남았다.
   */
  it("서버가 거절한 이유를 화면과 콘솔 양쪽에 남긴다", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const rejection = {
      message: "program_plan_date_taken:2026-08-17",
      code: "P0001",
    };
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        resolvedSessions={resolvedSessions}
        occupiedPlans={[]}
        onConfirm={vi.fn().mockRejectedValue(rejection)}
      />,
    );
    openPreview();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "18회 계획을 달력에 담기" }),
      );
    });

    expect(
      screen.getByText(
        "8월 17일에 이미 다른 계획이 있어요. 시작일이나 요일을 바꿔 주세요.",
      ),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith(
      "[program] 일정 저장 실패",
      rejection,
    );
    consoleError.mockRestore();
  });
});
