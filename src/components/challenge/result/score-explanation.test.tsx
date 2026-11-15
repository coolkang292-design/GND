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

/** 사람마다 완료 세션 n개를 기간 안에 만든다 — 시간 기록은 없다(활동 점수는 날·횟수만 센다) */
function sessionRows(counts: Record<string, number>) {
  return Object.entries(counts).flatMap(([userId, n]) =>
    Array.from({ length: n }, () => ({ userId, completedAt: "2026-11-05T03:00:00.000Z", durationMinutes: 0, exercises: [] as never[] })),
  );
}

function renderFor(inputs: ParticipantInput[], sessions: Record<string, number> = {}) {
  const ranked = rankForChallenge({ scoringVersion: 2, inputs, rows: sessionRows(sessions), ...base });
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

  it("활동 점수와 총점이 따로 보인다", () => {
    const me = renderFor([
      { ...mk("A", ["workout_days", "cardio_time"]), workoutDays: 12 },
      { ...mk("B", ["workout_days", "cardio_time"]), workoutDays: 11 },
    ]);
    expect(screen.getByTestId("pts-activity").textContent).toContain("12.00점");
    expect(screen.getByTestId("activity-detail").textContent).toContain("운동한 날 12일 +12");
    expect(screen.getByTestId("total-sum").textContent).toContain(`총점 ${me.v2!.totalScore.toFixed(2)}점`);
  });

  it("총점이 같으면 실제 운동한 날 수가 든 사유 카드가 뜬다", () => {
    // 날 12 + 횟수 8 = 날 11 + 횟수 9 = 20점 — 총점이 같아야 동점 카드가 뜬다
    renderFor([
      { ...mk("A", ["workout_days", "cardio_time"]), workoutDays: 12 },
      { ...mk("B", ["workout_days", "cardio_time"]), workoutDays: 11 },
    ], { A: 8, B: 9 });
    const card = screen.getByTestId("tie-break-card");
    expect(card.textContent).toContain("12일");
    expect(card.textContent).toContain("11일");
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
