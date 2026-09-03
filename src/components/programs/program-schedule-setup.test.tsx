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
import {
  INTERVAL_PROGRAM,
  STRENGTH_PROGRAMS,
} from "@/lib/domain/official-programs";
import { ProgramScheduleSetup } from "./program-schedule-setup";

afterEach(cleanup);

const program = STRENGTH_PROGRAMS[0];

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

describe("ProgramScheduleSetup", () => {
  it("세 단계 진행 상태와 선택한 추천 요일을 분명히 표시한다", () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
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

  it("난이도 선택지는 프로그램이 정한다", () => {
    // 근력은 두 개(초보·운동 경험 있음), 인터벌은 세 개(입문·보통·높음).
    // 같은 `experienced`가 프로그램에 따라 다르게 읽힌다 (설계 §3.2).
    const strength = render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        onConfirm={vi.fn()}
      />,
    );
    openSlots();
    expect(screen.getByText("운동 경험")).toBeTruthy();
    expect(screen.getByLabelText("초보", { exact: false })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    strength.unmount();

    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={INTERVAL_PROGRAM}
        onConfirm={vi.fn()}
      />,
    );
    openSlots();
    expect(screen.getByText("난이도")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const label of ["입문", "보통", "높음"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("고른 난이도를 그대로 넘긴다", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={INTERVAL_PROGRAM}
        onConfirm={onConfirm}
      />,
    );
    openSlots();
    fireEvent.click(screen.getByRole("button", { name: "월 · 수 · 금" }));
    fireEvent.click(screen.getByText("높음"));
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "18회 계획을 달력에 담기" }),
      );
    });

    expect(onConfirm.mock.calls[0][0].levelAtStart).toBe("experienced");
  });

  it("연속 요일도 미리보기로 진행한다 (사용자 확정 2026-08-12)", () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
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
        onConfirm={vi.fn()}
      />,
    );
    openSlots();
    fireEvent.click(screen.getByRole("button", { name: "직접 선택" }));
    fireEvent.click(screen.getByLabelText("월요일"));
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

    expect(screen.queryByText("3/3 · 18회 미리보기")).toBeNull();
  });

  /*
    2026-09-04(0101)에 **동작이 뒤집혔다.**

    예전에는 그날 계획이 있으면 프로그램 회차를 가까운 빈 날로 밀고 "기존 계획
    유지 · 8월 17일 대신 …"이라고 알렸다. 하루에 계획을 하나만 담을 수 있었으니
    그럴 수밖에 없었다. 이제는 나란히 선다.

    ⚠️ 이 테스트는 **없어진 것을 확인한다.** 새 문구만 보면 옛 동작이 남아
       있어도 통과한다 — 밀어내기가 되살아나면 고른 요일이 조용히 어긋난다.
  */
  it("기존 계획이 있어도 피해 가지 않는다 — 옛 '기존 계획 유지'가 없어졌다", () => {
    render(
      <ProgramScheduleSetup
        today="2026-08-12"
        timeZone="Asia/Seoul"
        program={program}
        onConfirm={vi.fn()}
      />,
    );
    openPreview();

    expect(screen.queryByText(/기존 계획 유지/)).toBeNull();
    expect(screen.queryByText(/대신.*프로그램을 배치/)).toBeNull();
    expect(
      screen.getByText(/그날 이미 계획이 있어도 지우지 않고 나란히 담아요/),
    ).toBeTruthy();
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
        "8월 17일에 이미 다른 계획이 있어요. 그 계획을 지우거나 시작일을 바꿔 주세요.",
      ),
    ).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith(
      "[program] 일정 저장 실패",
      rejection,
    );
    consoleError.mockRestore();
  });
});
