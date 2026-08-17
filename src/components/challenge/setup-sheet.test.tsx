// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoalDraft } from "@/lib/challenge";
import { ChallengeSetupSheet } from "./setup-sheet";

afterEach(cleanup);

describe("ChallengeSetupSheet 챌린지 이름", () => {
  it("생성 화면은 빈 이름칸에 안내 문구를 표시하고 바로 포커스한다", () => {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 100 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("챌린지 이름을 입력하세요");
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
  });
});

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — 지표 선택의 짧은 분류명도
 * "타바타"가 아니라 "전신 인터벌"이다. 고르는 값(`tabata_count`)은 그대로다.
 */
describe("ChallengeSetupSheet — 전신 인터벌 명칭", () => {
  function renderSheet() {
    return render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "인터벌 챌린지",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "tabata_count", target: 12 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("맨몸 지표 목록에 '전신 인터벌'이 있고, 그 값은 tabata_count다", () => {
    renderSheet();

    const option = screen.getByRole("option", {
      name: "전신 인터벌",
    }) as HTMLOptionElement;
    // 화면 문구만 바뀐다 — 저장되는 값은 DB 호환을 위해 그대로여야 한다.
    expect(option.value).toBe("tabata_count");
  });

  it("옛 용어 '타바타'는 설정 화면에 남지 않는다", () => {
    // 제거 검증 — 새 문구가 있는지만 보면 옛 문구가 사라졌는지 확인한 게 아니다.
    const { container } = renderSheet();

    expect(container.textContent ?? "").not.toContain("타바타");
  });
});

/**
 * ⚠️⚠️ **이 describe를 지우지 마라** (2026-08-14).
 *
 * 한 화면에 `주 N일`이 두 개 있다 — 목표 카드 계산기의 것(달성률 재료)과
 * `② 참여 계획`의 것(참여율 분모)이다. 2026-08-14 이전에는 둘이 섞여 있어
 * 사람도 코드도 헷갈렸고, 다시 엉키면 **참여율이 조용히 틀린 값을 쓴다.**
 * 화면만 봐서는 안 잡히는 종류라 여기서 잡는다. 설계 §6.
 */
describe("ChallengeSetupSheet — 달성 세팅과 참여 세팅은 서로를 안 건드린다", () => {
  function renderSheet(onSubmit = vi.fn()) {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "분리 테스트",
          startDate: "2026-08-02",
          endDate: "2026-08-29", // 28일 = 4주
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    return onSubmit;
  }

  // ⚠️ CTA를 `getByText(/챌린지 만들기/)`로 잡으면 제목 "새 챌린지 만들기"까지
  //    걸려 getBy가 다중 매치로 던진다. 버튼 role + 개수 문구까지 포함해 잡는다.
  const submitCta = () =>
    screen.getByRole("button", { name: /챌린지 만들기 \(목표 \d+개 포함\)/ });

  it("② 참여 계획의 주 N일을 바꿔도 목표 카드의 기간 총 목표는 안 바뀐다", () => {
    renderSheet();
    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("300");

    fireEvent.click(screen.getByLabelText("계획 운동일 늘리기"));
    fireEvent.click(screen.getByLabelText("계획 운동일 늘리기"));

    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("300");
  });

  it("① 계산기의 주 며칠을 바꿔도 제출되는 plannedDays는 안 바뀐다", () => {
    const onSubmit = renderSheet();

    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));
    fireEvent.click(screen.getByLabelText("주 며칠 늘리기"));

    fireEvent.click(submitCta());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].plannedDays).toBe(3);
  });

  it("② 참여 계획의 값이 그대로 plannedDays로 나간다", () => {
    const onSubmit = renderSheet();

    fireEvent.click(screen.getByLabelText("계획 운동일 늘리기"));
    fireEvent.click(submitCta());

    expect(onSubmit.mock.calls[0][0].plannedDays).toBe(4);
  });

  it("총 목표를 직접 고치면 하루 목표가 역산돼 따라 바뀐다", () => {
    renderSheet();

    fireEvent.change(screen.getByLabelText("기간 총 목표 (회)"), {
      target: { value: "600" },
    });

    // 600 ÷ (주3일 × 4주) = 50
    expect((screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value).toBe(
      "50",
    );
  });

  it("요약과 CTA의 개수가 실제 카드 수를 따라간다", () => {
    renderSheet();
    expect(screen.getByText("목표 1개 · 참여 계획 주 3일")).toBeTruthy();
    expect(submitCta()).toBeTruthy();

    fireEvent.click(screen.getByText("+ 목표 추가하기"));

    expect(screen.getByText("목표 2개 · 참여 계획 주 3일")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "챌린지 만들기 (목표 2개 포함)" }),
    ).toBeTruthy();
  });

  /**
   * ⚠️ 사용자 신고 (2026-08-14, 배포 후) — *"목표를 세팅하고 챌린지 기간을
   * 수정하면 자동으로 목표가 계산이 안 됨"*.
   *
   * 처음 설계는 기간이 바뀌어도 **총 목표를 고정**하고 하루 목표를 다시
   * 파생시켰다. 하루 기준이 기본 입력이 된 이상 그건 거꾸로다 —
   * `하루 30회 × 주 3일`로 4주를 잡았다가 8주로 늘리면 총 목표는 720회가
   * 되어야 하는데, 옛 동작은 360회를 그대로 두고 **하루 목표를 15회로 조용히
   * 깎았다.** 사용자가 정한 것(하루 기준)이 사용자 몰래 바뀌는 쪽이 나쁘다.
   */
  it("기간을 늘리면 하루 기준을 유지한 채 총 목표가 다시 계산된다", () => {
    renderSheet(); // 08-02 ~ 08-29 = 28일(4주), 웨이트 300회, 계산기 주 3일 → 하루 25회
    expect(
      (screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value,
    ).toBe("25");

    // 종료일을 09-26으로 → 56일(8주)
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-09-26" },
    });

    // 하루 25회 × 주 3일 × 8주 = 600회
    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("600");
    expect(
      (screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value,
    ).toBe("25");
    expect(screen.getByText("기간 56일 (8.0주)")).toBeTruthy();
  });

  it("기간을 줄여도 같은 규칙 — 하루 기준이 남고 총 목표가 준다", () => {
    renderSheet();

    // 종료일을 08-15로 → 14일(2주)
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-08-15" },
    });

    // 하루 25회 × 주 3일 × 2주 = 150회
    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("150");
    expect(
      (screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value,
    ).toBe("25");
  });

  it("나누어떨어지지 않아도 횟수 목표는 정수로 나오고, 요약의 하루 기준이 카드와 같다", () => {
    renderSheet();

    // 08-02 ~ 08-17 = 16일 (2.286주). 하루 25회 × 주 3일 × 2.286주 = 171.43
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-08-17" },
    });

    // `171.4회`가 아니라 `171회`
    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("171");
    // ⚠️ 요약이 반올림된 총량에서 하루 기준을 역산하면 `24.9회`가 되어
    //    카드(`25`)와 갈린다. 같은 값을 보여야 한다 (2026-08-14 실측).
    expect(
      (screen.getByLabelText("하루 목표 (회)") as HTMLInputElement).value,
    ).toBe("25");
    expect(screen.getByText("하루 25회 × 주 3일")).toBeTruthy();
  });

  it("시작일을 바꿔도 다시 계산된다", () => {
    renderSheet();

    // 시작일을 08-16으로 → 08-16~08-29 = 14일(2주)
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-08-16" },
    });

    expect(
      (screen.getByLabelText("기간 총 목표 (회)") as HTMLInputElement).value,
    ).toBe("150");
  });

  it("일수형 목표도 기간을 따라 총 일수가 다시 계산된다", () => {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "일수형",
          startDate: "2026-08-02",
          endDate: "2026-08-29", // 28일 = 4주
          goals: [{ type: "weight_days", target: 12, qualifier: 3 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      (screen.getByLabelText("기간 총 목표 (일)") as HTMLInputElement).value,
    ).toBe("12");

    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-09-26" }, // 56일 = 8주
    });

    // 주 3일 × 8주 = 24일
    expect(
      (screen.getByLabelText("기간 총 목표 (일)") as HTMLInputElement).value,
    ).toBe("24");
  });

  /**
   * 사용자 지시 (2026-08-14) — *"하루 기준으로 설정하고 자동 계산이 되어서 설정
   * 요약에 표시되게"*. 총량만 있으면 300회가 많은지 적은지 알 수 없다.
   */
  it("요약이 하루 기준을 같이 보여준다", () => {
    renderSheet();
    // 300회 ÷ (주3일 × 4주) = 하루 25회
    expect(screen.getByText("하루 25회 × 주 3일")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("하루 목표 (회)"), {
      target: { value: "40" },
    });

    // 하루 40회 × 주3일 × 4주 = 480회. 요약이 즉시 따라온다
    expect(screen.getByText("하루 40회 × 주 3일")).toBeTruthy();
    // ⚠️ 요약 안에서만 찾는다 — 카드의 `→ 기간 목표 480회`가 같은 글자라
    //    전역 getByText는 다중 매치로 던진다.
    const summary = screen.getByLabelText("현재 설정 요약");
    expect(within(summary).getByText("480회")).toBeTruthy();
    expect(within(summary).getByText(/웨이트/)).toBeTruthy();
  });
});

describe("ChallengeSetupSheet — 목표 개수", () => {
  function renderWithPrev(prevGoals: GoalDraft[] | null) {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "개수 테스트",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={prevGoals}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("3개가 되면 추가 버튼이 잠기고 4번째 카드가 안 생긴다", () => {
    renderWithPrev(null);
    const add = screen.getByText("+ 목표 추가하기");

    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByLabelText(/^목표 \d+ 지표$/)).toHaveLength(3);

    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(add);
    expect(screen.getAllByLabelText(/^목표 \d+ 지표$/)).toHaveLength(3);
    expect(screen.getByText("최대 3개까지 추가할 수 있어요")).toBeTruthy();
  });

  it("새 목표는 안 쓴 분류부터 고른다 — 누르자마자 중복이 되지 않는다", () => {
    renderWithPrev(null); // 목표 1 = 웨이트 횟수
    fireEvent.click(screen.getByText("+ 목표 추가하기"));

    const selects = screen.getAllByLabelText(
      /^목표 \d+ 지표$/,
    ) as HTMLSelectElement[];
    expect(selects[0].value).toBe("weight_reps");
    // 웨이트가 이미 있으니 유산소로 간다. 옛 동작(무조건 weight_reps)이면
    // 바로 "같은 지표의 목표가 두 개 있어요"에 막힌다.
    expect(selects[1].value).toBe("cardio_distance");
  });

  it("지난 목표가 5개여도 3개만 불러오고 그 사실을 말해 준다", () => {
    renderWithPrev([
      { type: "weight_reps", target: 100 },
      { type: "cardio_distance", target: 20 },
      { type: "bodyweight_reps", target: 200 },
      { type: "cardio_time", target: 300 },
      { type: "bodyweight_time", target: 60 },
    ]);

    fireEvent.click(screen.getByText("↺ 지난 목표"));

    expect(screen.getAllByLabelText(/^목표 \d+ 지표$/)).toHaveLength(3);
    expect(screen.getByText("지난 목표 중 3개만 불러왔어요 ↺")).toBeTruthy();
  });
});

describe("ChallengeSetupSheet — 없어진 것들 (제거 검증)", () => {
  it("'총량 직접 입력' 모드 토글과 'KPI' 표기가 없다", () => {
    const { container } = render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "제거 검증",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("총량 직접 입력");
    expect(text).not.toContain("KPI");
  });
});

/**
 * 시작일 하한 (2026-08-17).
 *
 * `autostart_due_challenges`가 `start_date <= 오늘`인 `setup` 방을 전부 시작시키고,
 * 시작한 뒤에는 초대 RPC가 전부 `invalid_status`로 막힌다. **오늘 시작하는 방은
 * 초대 창이 0이다** — 참가자 1명짜리 챌린지 14개가 그렇게 만들어졌다.
 */
describe("ChallengeSetupSheet — 시작일 하한", () => {
  const base = {
    name: "하한 검증",
    startDate: "2026-08-18",
    endDate: "2026-09-14",
    goals: [{ type: "weight_reps", target: 300 }] as GoalDraft[],
    plannedDays: 3,
  };

  function renderSheet(over: {
    minStartDate?: string;
    startDate?: string;
    onSubmit?: () => void;
  } = {}) {
    const onSubmit = over.onSubmit ?? vi.fn();
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{ ...base, startDate: over.startDate ?? base.startDate }}
        prevGoals={null}
        minStartDate={over.minStartDate ?? "2026-08-18"}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    return onSubmit;
  }

  it("시작일 칸이 오늘 이전을 못 고르게 막는다", () => {
    renderSheet();
    expect(screen.getByLabelText("시작일").getAttribute("min")).toBe("2026-08-18");
  });

  it("종료일에는 하한을 걸지 않는다 — 시작일보다 뒤이기만 하면 된다", () => {
    renderSheet();
    expect(screen.getByLabelText("종료일").getAttribute("min")).toBeNull();
  });

  it("그래도 이른 날짜가 들어오면 저장을 막고 **이유**를 적는다", () => {
    // 날짜 입력은 손으로 칠 수 있어서 min만으로는 못 막는다.
    const onSubmit = renderSheet({ startDate: "2026-08-17" });
    fireEvent.click(screen.getByRole("button", { name: /챌린지 만들기 \(목표/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    // ⚠️ "안 됩니다"로 끝내지 마라 — 왜 안 되는지가 있어야 사용자가 고칠 수 있다.
    expect(document.body.textContent).toContain("초대");
  });

  it("하한 이후면 통과한다", () => {
    const onSubmit = renderSheet({ startDate: "2026-08-18" });
    fireEvent.click(screen.getByRole("button", { name: /챌린지 만들기 \(목표/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("`minStartDate`를 안 주면 아무것도 막지 않는다 — 목표 수정 시트가 그렇다", () => {
    const onSubmit = vi.fn();
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{ ...base, startDate: "2020-01-01" }}
        prevGoals={null}
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /챌린지 만들기 \(목표/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

/**
 * 경고문의 자리 (2026-08-17 개발 서버 실측으로 잡음).
 *
 * 옛 자리는 **스크롤 영역 안**이었다. 저장 버튼은 시트 바닥에 고정돼 있어서,
 * 목표 카드가 길어지면 경고가 접힘선 밖으로 밀려난다 — 사용자는 버튼을 눌렀는데
 * **아무 일도 안 일어난 것처럼** 보고, 왜 저장이 안 되는지 알 수 없다.
 * 시작일 하한을 넣으면서 화면에서 처음 보였고, 이름·기간·중복 지표 경고도
 * 전부 같은 자리에 있었다.
 */
describe("ChallengeSetupSheet — 경고문은 버튼 옆에 붙어 있다", () => {
  function submitEmpty() {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "",
          startDate: "2026-08-18",
          endDate: "2026-09-14",
          goals: [{ type: "weight_reps", target: 300 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /챌린지 만들기 \(목표/ }));
    return screen.getByText("챌린지 이름을 입력하세요");
  }

  it("경고가 스크롤 영역 **밖에** 있다 — 안에 있으면 밀려나서 안 보인다", () => {
    const notice = submitEmpty();
    expect(notice.closest(".overflow-y-auto")).toBeNull();
  });

  it("경고와 저장 버튼이 같은 부모에 있다 — 늘 같이 보인다", () => {
    const notice = submitEmpty();
    const button = screen.getByRole("button", { name: /챌린지 만들기 \(목표/ });
    expect(notice.parentElement).toBe(button.parentElement);
  });
});
