// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rankForChallenge } from "@/lib/domain/challenge-ranking";
import type { ParticipantInput } from "@/lib/domain/goal-score";
import type { UserGoal } from "@/lib/types";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));

import { ScoreExplanation } from "./score-explanation";

afterEach(cleanup);

const mk = (userId: string, types: ParticipantInput["goals"][number]["type"][]): ParticipantInput => ({
  userId,
  goals: types.map((type) => ({ type, target: 10, actual: 8 })),
  workoutDays: 5,
  plannedDays: 10,
});
const goal = (t: UserGoal["goal_type"]): UserGoal =>
  ({ id: t, user_id: "A", challenge_id: "c", group_id: "g", goal_type: t, target_value: 10, unit: "회", planned_days: 3, qualifier: null, created_at: "", updated_at: "" }) as UserGoal;
const base = { startDate: "2026-11-01", endDate: "2026-11-28", timeZone: "Asia/Seoul" } as const;

function renderFor(inputs: ParticipantInput[]) {
  const ranked = rankForChallenge({ scoringVersion: 2, inputs, rows: [], ...base });
  const me = ranked.find((r) => r.userId === "A")!;
  render(
    <ScoreExplanation
      me={me}
      all={ranked}
      myGoals={[goal("workout_days"), goal("cardio_time")]}
      nameOf={(id) => (id === "A" ? "나" : id)}
      plannedDays={10}
    />,
  );
  return me;
}

describe("ScoreExplanation", () => {
  it("세 점수의 합이 화면의 기본 점수와 같다", () => {
    const me = renderFor([mk("A", ["workout_days", "cardio_time", "cardio_days"]), mk("B", ["workout_days"])]);
    const get = (id: string) => Number(screen.getByTestId(id).textContent!.replace(/[^\d.]/g, ""));
    const sum = get("pts-achievement") + get("pts-participation") + get("pts-bonus");
    expect(Math.round(sum * 100)).toBe(Math.round(me.v2!.baseScore * 100));
  });

  it("동점이 아니면 동점 카드가 없다", () => {
    renderFor([mk("A", ["workout_days", "cardio_time"]), { ...mk("B", ["workout_days"]), workoutDays: 0 }]);
    expect(screen.queryByTestId("tie-break-card")).toBeNull();
  });

  it("동점이면 실제 개수가 든 사유 카드가 뜬다", () => {
    renderFor([mk("A", ["workout_days", "cardio_time"]), mk("B", ["workout_days"])]);
    const card = screen.getByTestId("tie-break-card");
    expect(card.textContent).toContain("2개");
    expect(card.textContent).toContain("1개");
  });

  it("목표별 점수는 눌러야 펼쳐지고, 자동 유산소 줄을 따로 안내한다", () => {
    renderFor([mk("A", ["workout_days", "cardio_time", "cardio_days"]), mk("B", ["workout_days"])]);
    expect(screen.queryByTestId("goal-breakdown")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /내 목표별 점수 확인하기/ }));
    const list = screen.getByTestId("goal-breakdown");
    expect(list.querySelectorAll("li").length).toBe(4); // 목표 3 + 안내 1
    expect(list.textContent).toContain("추가 평가 항목");
    expect(list.textContent).toContain("설정한 목표는 2개");
  });
});
