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
// 결과 설명은 최종 발표 화면이다 — 활동 점수를 더한다
const base = { startDate: "2026-11-01", endDate: "2026-11-28", timeZone: "Asia/Seoul", includeActivity: true } as const;

/** 사람마다 완료 세션 n개를 기간 안에 만든다 — 시간 기록은 없다(활동 점수는 날·횟수만 센다) */
function sessionRows(counts: Record<string, number>) {
  return Object.entries(counts).flatMap(([userId, n]) =>
    Array.from({ length: n }, () => ({ userId, completedAt: "2026-11-05T03:00:00.000Z", durationMinutes: 0, exercises: [] as never[] })),
  );
}

function renderFor(inputs: ParticipantInput[], sessions: Record<string, number> = {}, plannedDays = 10) {
  const ranked = rankForChallenge({ scoringVersion: 2, inputs, rows: sessionRows(sessions), ...base });
  const me = ranked.find((r) => r.userId === "A")!;
  render(
    <ScoreExplanation
      me={me}
      all={ranked}
      myGoals={[goal("workout_days"), goal("cardio_time")]}
      nameOf={(id) => (id === "A" ? "나" : id)}
      plannedDays={plannedDays}
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

  describe("참여 점수 설명은 실제 운동한 날을 그대로 말한다 (2026-11-20)", () => {
    // 계획 13일을 넘겨 17일 운동 → 참여율은 100%에서 멈춘다. 예전 코드는 참여율에서 거꾸로 계산해 13일로 보였다.
    const over = () =>
      renderFor(
        [
          { ...mk("A", ["workout_days", "cardio_time"]), workoutDays: 17, plannedDays: 13 },
          { ...mk("B", ["workout_days"]), workoutDays: 3, plannedDays: 13 },
        ],
        {},
        13,
      );

    it("17일 운동 · 계획 13일 → '실제 17일 / 계획 13일 · 참여점수 20점'", () => {
      over();
      const txt = screen.getByTestId("participation-detail").textContent ?? "";
      expect(txt).toContain("실제 17일 / 계획 13일");
      expect(txt).toContain("참여점수 20점");
      expect(screen.getByTestId("pts-participation").textContent).toContain("20.00점");
    });

    it("계획을 넘겨도 13일로 줄여 말하지 않는다 (부정 확인)", () => {
      over();
      const txt = screen.getByTestId("participation-detail").textContent ?? "";
      expect(txt).not.toContain("실제 13일");
      expect(txt).not.toContain("13일 운동했어요");
    });

    it("계획보다 적게 하면 실제 일수와 비율 점수가 그대로 나온다 (3일 / 13일 → 4.62점)", () => {
      renderFor(
        [
          { ...mk("A", ["workout_days"]), workoutDays: 3, plannedDays: 13 },
          { ...mk("B", ["workout_days"]), workoutDays: 17, plannedDays: 13 },
        ],
        {},
        13,
      );
      const txt = screen.getByTestId("participation-detail").textContent ?? "";
      expect(txt).toContain("실제 3일 / 계획 13일");
      expect(txt).toContain("참여점수 4.62점");
      expect(txt).not.toContain("만점"); // 못 채웠는데 만점이라고 하면 안 된다
    });
  });
});
