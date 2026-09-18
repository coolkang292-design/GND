// @vitest-environment jsdom

/**
 * 목표 설정 흐름 (2026-09-18 목표 단순화).
 *
 * 옛 `setup-sheet.test.tsx`(ChallengeSetupSheet)를 대체한다. 옛 시트는 만들기와
 * 목표를 한 화면에서 받았고 `① 달성 · 80%`, `② 참여 · 20%`를 나눠 보여줬다.
 * 새 흐름은 **주 N회 하나**가 기본이고 세부 목표는 선택이다. 옛 테스트 중 여전히
 * 참인 불변식은 여기(목표)와 `create-challenge-flow.test.tsx`(만들기)로 옮겼다:
 *   · '인터벌' 명칭, '타바타' 부재            → 여기
 *   · 'KPI' 부재(제거 검증)                   → 여기 (더 넓게: 80%·20%·동의·종합점수)
 *   · 목표 개수 상한, 지난 목표 불러오기        → 여기 (상한은 세부 2개)
 *   · 경고문은 스크롤 밖·버튼 옆              → 여기와 만들기 둘 다
 *   · 달성·참여 세팅 분리                     → `challenge-simple-goal.test.ts`
 *     (세부 목표의 주간 값은 planned_days를 안 건드린다)
 *   · 시작일 하한·이름칸 포커스               → 만들기
 * 옛 "기간을 바꾸면 총 목표 재계산" 테스트들은 **의미가 없어졌다** — 새 흐름은
 * 기간을 묻지 않고, 저장할 때 주간 값 × 기간으로 한 번 계산한다(`buildGoalDrafts`).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserGoal } from "@/lib/types";

const mocks = vi.hoisted(() => ({ recordFunnelEvent: vi.fn() }));
vi.mock("@/lib/analytics-events", () => ({
  recordFunnelEvent: mocks.recordFunnelEvent,
}));

import { GoalSetupFlow } from "./goal-setup-flow";

afterEach(cleanup);
beforeEach(() => mocks.recordFunnelEvent.mockReset());

function goal(over: Partial<UserGoal>): UserGoal {
  return {
    id: `g-${over.goal_type}`,
    user_id: "me",
    challenge_id: "c1",
    group_id: "grp",
    goal_type: "workout_days",
    target_value: 12,
    unit: "일",
    planned_days: 3,
    qualifier: null,
    created_at: "2026-09-18T00:00:00Z",
    updated_at: "2026-09-18T00:00:00Z",
    ...over,
  };
}

function renderFlow(over: Partial<Parameters<typeof GoalSetupFlow>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <GoalSetupFlow
      userId="me"
      challengeName="30일 아침 운동"
      startDate="2026-09-21"
      endDate="2026-10-18" // 28일
      todayKey="2026-09-18"
      photoRequired
      myGoals={[]}
      prevGoals={null}
      busy={false}
      onSubmit={onSubmit}
      onClose={vi.fn()}
      {...over}
    />,
  );
  return { onSubmit };
}

const cta = () => screen.getByRole("button", { name: "이 목표로 시작하기" });

describe("기본 목표 — 주 N회만으로 참여", () => {
  it("주 3회가 기본으로 골라져 있고, 그대로 저장하면 workout_days 한 줄이다", () => {
    const { onSubmit } = renderFlow();
    expect(screen.getByRole("radio", { name: /주 3회/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledWith({
      goals: [{ type: "workout_days", target: 12, qualifier: null }],
      plannedDays: 3,
    });
  });

  it("주 4회를 고르면 4주 동안 16일이 목표다 — 사용자가 계산하지 않는다", () => {
    const { onSubmit } = renderFlow();
    fireEvent.click(screen.getByRole("radio", { name: /주 4회/ }));
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledWith({
      goals: [{ type: "workout_days", target: 16, qualifier: null }],
      plannedDays: 4,
    });
  });

  it("직접 설정은 주 1~7회 사이만 된다", () => {
    const { onSubmit } = renderFlow();
    fireEvent.click(screen.getByRole("radio", { name: "직접 설정" }));
    const down = screen.getByRole("button", { name: "주 운동 횟수 줄이기" });
    for (let i = 0; i < 10; i++) fireEvent.click(down);
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0][0].plannedDays).toBe(1);

    const up = screen.getByRole("button", { name: "주 운동 횟수 늘리기" });
    for (let i = 0; i < 10; i++) fireEvent.click(up);
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[1][0].plannedDays).toBe(7);
  });

  it("시작일을 알려준다 — 목표를 정하면 그날 자동으로 시작한다", () => {
    renderFlow();
    expect(screen.getByText(/9월 21일에 자동으로 시작해요/)).toBeTruthy();
  });

  it("방금 참가했으면 '참여 완료!'로 연다 (시안 ⑤)", () => {
    renderFlow({ justJoined: true });
    expect(screen.getByText("참여 완료!")).toBeTruthy();
    expect(screen.getByText(/좋은 선택이에요/)).toBeTruthy();
  });

  it("색종이는 낭독하지 않는다 — 읽을 것은 '참여 완료!' 한 줄이다", () => {
    renderFlow({ justJoined: true });
    const banner = screen.getByText("참여 완료!").closest("div");
    const confetti = banner?.querySelector('[aria-hidden="true"].pointer-events-none');
    expect(confetti).toBeTruthy();
    // ⚠️ 조각 위치는 고정이다. Math.random으로 뿌리면 리렌더마다 튀고
    //    서버·클라이언트 마크업이 갈려 hydration 경고가 난다.
    expect(confetti?.children.length).toBe(8);
  });

  it("참가하지 않았으면 축하가 없다", () => {
    renderFlow();
    expect(screen.queryByText("참여 완료!")).toBeNull();
  });

  it("목표 화면을 열었다는 퍼널 이벤트를 남긴다 (0109)", () => {
    renderFlow();
    expect(mocks.recordFunnelEvent).toHaveBeenCalledWith("challenge_goal_started", "me");
  });
});

describe("세부 목표 — 완전히 선택이다", () => {
  function addCardioDistance() {
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    fireEvent.click(screen.getByRole("radio", { name: /유산소/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    // 거리가 첫 지표, 기본 주 10km
    expect(screen.getByRole("radio", { name: "거리" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "목표 추가하기" }));
  }

  it("주 3회 + 유산소 거리(주 10km) → workout_days 12일 + cardio_distance 40km", () => {
    const { onSubmit } = renderFlow();
    addCardioDistance();
    // 확인 화면
    expect(screen.getByText("주 3회 운동")).toBeTruthy();
    expect(screen.getByText("유산소 거리")).toBeTruthy();
    expect(screen.getByText("주 10km")).toBeTruthy();
    fireEvent.click(cta());
    expect(onSubmit).toHaveBeenCalledWith({
      goals: [
        { type: "workout_days", target: 12, qualifier: null },
        { type: "cardio_distance", target: 40, qualifier: null },
      ],
      plannedDays: 3,
    });
  });

  it("웨이트 총 운동량 — 주 12,000kg를 1회 기준으로도 알려준다", () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    fireEvent.click(screen.getByRole("radio", { name: /웨이트/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("radio", { name: "총 운동량" }));
    const field = screen.getByLabelText("주간 목표") as HTMLInputElement;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "12000" } });
    fireEvent.blur(field);
    expect(screen.getByText(/주 3회 기준 1회 약 4,000kg/)).toBeTruthy();
  });

  it("세부 목표는 2개까지 — 기본 1 + 세부 2 = 완료 보너스 상한 3", () => {
    renderFlow();
    addCardioDistance();
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    fireEvent.click(screen.getByRole("radio", { name: /웨이트/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "목표 추가하기" }));
    // 두 개가 차면 추가 줄이 사라진다(확인 화면)
    expect(screen.queryByRole("button", { name: /세부 목표 추가/ })).toBeNull();
  });

  it("이미 쓴 지표는 다시 고를 수 없다 — 같은 지표 두 줄은 DB가 거부한다", () => {
    renderFlow();
    addCardioDistance();
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    fireEvent.click(screen.getByRole("radio", { name: /유산소/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect((screen.getByRole("radio", { name: "거리" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: "시간" }).getAttribute("aria-checked")).toBe("true");
  });

  it("세부 목표를 빼면 기본 목표만 남는다", () => {
    const { onSubmit } = renderFlow();
    addCardioDistance();
    fireEvent.click(screen.getByRole("button", { name: "유산소 거리 빼기" }));
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0][0].goals).toEqual([
      { type: "workout_days", target: 12, qualifier: null },
    ]);
  });

  it("인터벌은 '인터벌'이라 부르고 값은 tabata_count다 — '타바타'는 없다", () => {
    const { onSubmit } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    fireEvent.click(screen.getByRole("radio", { name: /인터벌/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("radio", { name: "인터벌 횟수" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("타바타");
    fireEvent.click(screen.getByRole("button", { name: "목표 추가하기" }));
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0][0].goals[1].type).toBe("tabata_count");
  });
});

describe("편집 — 저장된 목표를 그대로 보여준다", () => {
  it("기본 주 4회 + 웨이트 총 운동량을 확인 화면으로 연다", () => {
    renderFlow({
      myGoals: [
        goal({ goal_type: "workout_days", target_value: 16, planned_days: 4 }),
        goal({ goal_type: "volume", target_value: 48000, unit: "kg", planned_days: 4 }),
      ],
    });
    expect(screen.getByText("주 4회 운동")).toBeTruthy();
    expect(screen.getByText("웨이트 총 운동량")).toBeTruthy();
    expect(screen.getByText("주 12,000kg")).toBeTruthy();
  });

  it("옛 목표(workout_days 없음)도 버리지 않고 세부 목표로 보여준다", () => {
    const { onSubmit } = renderFlow({
      myGoals: [goal({ goal_type: "weight_days", target_value: 12, planned_days: 5, qualifier: 3 })],
    });
    expect(screen.getByText("웨이트 운동 일수")).toBeTruthy();
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      goals: [
        { type: "workout_days", target: 20, qualifier: null },
        { type: "weight_days", target: 12, qualifier: 3 },
      ],
      plannedDays: 5,
    });
  });

  it("지난 챌린지 목표를 불러올 수 있다 — 세부는 2개까지만, 그 사실을 말한다", () => {
    const { onSubmit } = renderFlow({
      prevGoals: [
        goal({ goal_type: "weight_reps", target_value: 400, unit: "회", planned_days: 4 }),
        goal({ goal_type: "cardio_distance", target_value: 40, unit: "km", planned_days: 4 }),
        goal({ goal_type: "bodyweight_reps", target_value: 400, unit: "회", planned_days: 4 }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /지난 챌린지 목표 불러오기/ }));
    expect(screen.getByRole("alert").textContent).toContain("2개만");
    fireEvent.click(cta());
    expect(onSubmit.mock.calls[0][0].plannedDays).toBe(4);
    expect(onSubmit.mock.calls[0][0].goals).toHaveLength(3);
  });
});

describe("없어진 것들 — 제거는 부정 확인이 증거다", () => {
  const BANNED = ["KPI", "80%", "20%", "종합점수", "동의", "계산식", "총량 직접 입력", "언제든지"];

  function allStepsText(): string {
    const texts: string[] = [];
    texts.push(document.body.textContent ?? "");
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    texts.push(document.body.textContent ?? "");
    fireEvent.click(screen.getByRole("radio", { name: /웨이트/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    texts.push(document.body.textContent ?? "");
    fireEvent.click(screen.getByRole("button", { name: "목표 추가하기" }));
    texts.push(document.body.textContent ?? "");
    return texts.join("\n");
  }

  it("어느 단계에도 계산 용어·내부 용어가 없다", () => {
    renderFlow();
    const text = allStepsText();
    for (const w of BANNED) expect(text).not.toContain(w);
  });

  it("'시작 전까지 바꿀 수 있어요' — 시작하면 올리기만 된다(0090)", () => {
    renderFlow();
    expect(screen.getByText("시작 전까지 바꿀 수 있어요")).toBeTruthy();
  });

  it("사진 필수 챌린지는 사진 인증을 말한다 — 지우면 '3번 했는데 0회'가 된다", () => {
    renderFlow();
    expect(screen.getByText(/사진을 올린 운동만 세요/)).toBeTruthy();
  });

  it("사진 필수가 아니면 그 줄이 없다", () => {
    renderFlow({ photoRequired: false });
    expect(screen.queryByText(/사진을 올린 운동만 세요/)).toBeNull();
  });
});

describe("경고문은 버튼 옆, 스크롤 밖 (2026-08-17 옛 시트에서 옮긴 규칙)", () => {
  function triggerNotice() {
    renderFlow({
      prevGoals: [
        goal({ goal_type: "weight_reps", target_value: 400, unit: "회" }),
        goal({ goal_type: "cardio_distance", target_value: 40, unit: "km" }),
        goal({ goal_type: "bodyweight_reps", target_value: 400, unit: "회" }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /지난 챌린지 목표 불러오기/ }));
    return screen.getByRole("alert");
  }

  it("경고가 스크롤 영역 밖에 있다", () => {
    expect(triggerNotice().closest(".overflow-y-auto")).toBeNull();
  });

  it("경고와 대표 버튼이 같은 부모에 있다", () => {
    const notice = triggerNotice();
    const dialog = screen.getByRole("dialog");
    const button = within(dialog).getByRole("button", { name: "이 목표로 시작하기" });
    expect(notice.parentElement).toBe(button.parentElement);
  });
});

describe("진행 예시 — 시안 ④ (2026-09-18 추가)", () => {
  /** 시안대로 **확인 화면(④)에만** 있다. ①은 주 N회를 고르는 자리다. */
  function openReview(weekly: number) {
    renderFlow({
      myGoals: [
        goal({ goal_type: "workout_days", target_value: weekly * 4, planned_days: weekly }),
        goal({ goal_type: "cardio_distance", target_value: 40, unit: "km", planned_days: weekly }),
      ],
    });
  }

  it("확인 화면에 주 N회가 한 주로 보인다 — 주 3회면 2 / 3 완료", () => {
    openReview(3);
    expect(screen.getByText("진행 예시")).toBeTruthy();
    expect(screen.getByText("2 / 3 완료")).toBeTruthy();
  });

  it("세부 목표를 더해 확인 화면으로 와도 보인다", () => {
    renderFlow();
    expect(screen.queryByText("진행 예시")).toBeNull(); // ①에는 없다 (시안 그대로)
    fireEvent.click(screen.getByRole("button", { name: /세부 목표 추가/ }));
    fireEvent.click(screen.getByRole("radio", { name: /유산소/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "목표 추가하기" }));
    expect(screen.getByText("2 / 3 완료")).toBeTruthy();
  });

  it("주 N회가 다르면 같이 달라진다", () => {
    openReview(4);
    expect(screen.getByText("3 / 4 완료")).toBeTruthy();
  });

  it("주 1회는 0 / 1이고 '한 번만 하면' — '더'가 붙으면 거짓말이다", () => {
    openReview(1);
    expect(screen.getByText("0 / 1 완료")).toBeTruthy();
    expect(screen.getByText("한 번만 하면 이번 주 목표 달성!")).toBeTruthy();
  });

  it("그 밖에는 '한 번만 더 하면'", () => {
    openReview(3);
    expect(screen.getByText("한 번만 더 하면 이번 주 목표 달성!")).toBeTruthy();
  });

  it("⚠️ 실적이 아니라 예시다 — 이번 챌린지 기록을 끌어오지 않는다", () => {
    // 여기는 목표를 **세우는** 자리라 이번 챌린지 기록이 아직 없다. 실적을 끌어오면
    // 시트가 저장 전에 네트워크를 한 번 더 때리고, 늦으면 카드가 빈 채로 깜빡인다.
    // 이 단언을 지우려면 그 조회를 어디서 할지부터 정하라.
    openReview(3);
    expect(screen.getByText("진행 예시")).toBeTruthy();
    expect(screen.queryByText(/이번 주 내 기록|내 진행률|지금까지/)).toBeNull();
  });

  it("동그라미는 스크린 리더가 읽지 않는다 — '2 / 3 완료'와 아래 한 줄이면 된다", () => {
    openReview(3);
    const card = screen.getByText("진행 예시").closest("section");
    expect(card?.querySelector("ul")?.getAttribute("aria-hidden")).toBe("true");
    expect(card?.querySelectorAll("li")).toHaveLength(7);
  });
});
