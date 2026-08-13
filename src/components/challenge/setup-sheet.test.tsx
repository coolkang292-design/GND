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
