// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LadderProgramDetail, ProgramCatalog } from "./program-catalog";
import { ProgramScheduleSetup } from "./program-schedule-setup";
import {
  OFFICIAL_PROGRAMS,
  PULLUP_LADDER_PROGRAM,
} from "@/lib/domain/official-programs";
import {
  LADDER_MAX_REPS_MIN,
  LADDER_SESSIONS,
} from "@/lib/domain/pullup-ladder";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

describe("사다리 프로그램 — 카탈로그 (2026-09-04)", () => {
  it("카탈로그에 카드로 서고 누르면 그 키를 준다", () => {
    const onPick = vi.fn();
    render(<ProgramCatalog programs={OFFICIAL_PROGRAMS} onPick={onPick} />);

    fireEvent.click(screen.getByText(PULLUP_LADDER_PROGRAM.eyebrow));
    expect(onPick).toHaveBeenCalledWith("pullup-ladder-18");
  });

  /*
    사다리는 표지 사진이 없다. `next/image`가 없는 파일을 물면 화면에 빈
    회색 칸이 남는다 — 숫자 표지로 갈라지는지 여기서 못 박는다.
  */
  it("표지에 사진 대신 5·4·3·2·1을 세운다", () => {
    render(
      <LadderProgramDetail
        program={PULLUP_LADDER_PROGRAM}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );
    expect(screen.getAllByText("5·4·3·2·1").length).toBeGreaterThan(0);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("사다리 상세 — 내 숫자로 미리보기", () => {
  function renderDetail() {
    return render(
      <LadderProgramDetail
        program={PULLUP_LADDER_PROGRAM}
        onBack={vi.fn()}
        onSchedule={vi.fn()}
      />,
    );
  }

  it("기본값은 출처 그대로 5개 기준이다", () => {
    renderDetail();
    const input = screen.getByLabelText(/지금 최대 몇 개까지 되나요\?|개/, {
      selector: "input",
    }) as HTMLInputElement;
    expect(input.value).toBe(String(LADDER_MAX_REPS_MIN));
    const rows = screen.getAllByTestId("ladder-preview-row");
    expect(rows[0].textContent).toContain("5·4·3·2·1");
  });

  it("최대 개수를 바꾸면 미리보기가 그 숫자로 다시 만들어진다", () => {
    renderDetail();
    const input = document.getElementById(
      "ladder-preview-max",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "10" } });

    const rows = screen.getAllByTestId("ladder-preview-row");
    expect(rows[0].textContent).toContain("10·9·8·7·6");
    // 6일차에 사다리 전체가 한 칸 오른다 — 원문 규칙이 화면까지 오는지
    expect(rows[3].textContent).toContain("11·10·9·8·7");
    // 마지막 줄은 24일차 — 회차 수가 바뀌면 여기서 먼저 걸린다
    expect(rows.at(-1)?.textContent).toContain(`${LADDER_SESSIONS}일차`);
  });

  it("5개 미만을 넣으면 무엇을 하라고 알려 준다", () => {
    renderDetail();
    const input = document.getElementById(
      "ladder-preview-max",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("인버티드 로우");
  });
});

describe("사다리 일정 — 난이도 대신 숫자를 받는다", () => {
  function renderSetup(onConfirm = vi.fn()) {
    render(
      <ProgramScheduleSetup
        today="2026-09-04"
        timeZone="Asia/Seoul"
        program={PULLUP_LADDER_PROGRAM}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "다음 주 시작" }));
  }

  it("난이도 라디오를 그리지 않는다", () => {
    renderSetup();
    /*
      사다리에 난이도 라디오가 서면 사용자는 그것이 무언가를 바꾼다고 믿는다.
      실제로는 최대 개수만 사다리를 정한다 — 아무것도 안 하는 선택지를 두지
      않는다.
    */
    expect(document.querySelectorAll('input[name="program-level"]')).toHaveLength(
      0,
    );
    expect(document.getElementById("ladder-max-reps")).not.toBeNull();
  });

  it("입력한 숫자로 1일차 사다리를 그 자리에서 보여 준다", () => {
    renderSetup();
    const input = document.getElementById(
      "ladder-max-reps",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8" } });
    expect(screen.getByText("8·7·6·5·4")).toBeTruthy();
  });

  /*
    사다리는 **요일을 고르지 않는다** (사장님 지시 2026-09-04). 요일 목록은
    7일마다 돌아와서 "5일 훈련 1일 휴식"(6일 주기)을 담을 수 없다 — 요일
    칸을 남겨 두면 사용자가 고른 것과 실제 배치가 갈라진다.
  */
  it("요일 고르기를 아예 내지 않는다", () => {
    renderSetup();
    for (const day of ["월요일", "화요일", "토요일", "일요일"]) {
      expect(screen.queryByLabelText(day)).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "월 · 수 · 금" })).toBeNull();
    expect(screen.getByText(/5일 하고 하루 쉬는 주기/)).toBeTruthy();
  });

  it("미리보기가 24회차와 휴식일을 함께 보여 준다", () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

    expect(screen.getAllByTestId("ladder-row-session")).toHaveLength(
      LADDER_SESSIONS,
    );
    // 24회를 5일씩 끊으면 쉬는 날이 네 번이다
    expect(screen.getAllByTestId("ladder-row-rest")).toHaveLength(4);
    expect(screen.getByText("4주 일정을 확인하세요")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "24회 계획을 달력에 담기" }),
    ).toBeTruthy();
  });

  /*
    ⚠️ 옛 문구가 없어졌는지도 본다. "18회"·"6주"는 사다리에서 **거짓**이다 —
       사장님이 화면에서 직접 잡아낸 것이 이 문구였다.
  */
  it("옛 '18회 · 6주' 문구가 남아 있지 않다", () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

    expect(screen.queryByText(/18회/)).toBeNull();
    expect(screen.queryByText(/6주 계획을 확인하세요/)).toBeNull();
  });

  it("5개 미만이면 미리보기로 넘어가지 않고 이유를 알린다", () => {
    renderSetup();
    const input = document.getElementById(
      "ladder-max-reps",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "일정 미리보기" }));

    expect(screen.getByRole("alert").textContent).toContain("지금 최대 개수");
    // 넘어갔으면 3단계 제목이 떠 있다
    expect(screen.queryByText(/18회 미리보기/)).toBeNull();
  });
});
