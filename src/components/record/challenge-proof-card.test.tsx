// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChallengeProofCard } from "./challenge-proof-card";
import type { GoalContribution } from "@/lib/challenge";

afterEach(cleanup);

/**
 * 이슈 #16 P0-B (2026-10-19) — 챌린지 반영이 **확정인지 예정인지** 문장으로 갈라 말한다.
 * 확정형("반영됐어요")은 반영 조건을 채운 뒤에만 쓴다.
 */
const days: GoalContribution = { type: "workout_days", label: "운동한 날", delta: 1, unit: "일", target: 24 };
const reps: GoalContribution = { type: "bodyweight_reps", label: "맨몸 횟수", delta: 0, unit: "회", target: 500 };

describe("ChallengeProofCard", () => {
  it("인증 대기는 예정형으로 말하고 '인증 대기' 표시를 단다", () => {
    render(<ChallengeProofCard state="pending" photoRequired gains={[days]} />);
    expect(screen.getByText("인증 대기")).toBeTruthy();
    expect(screen.getByText(/사진을 올리면/).textContent).toContain("반영돼요");
    expect(screen.queryByText(/반영됐어요/)).toBeNull();
  });

  it("인증 완료는 확정형으로 말한다", () => {
    render(<ChallengeProofCard state="confirmed" photoRequired gains={[days]} />);
    expect(screen.getByText(/챌린지 인증 완료/)).toBeTruthy();
    expect(screen.getByText(/반영됐어요/)).toBeTruthy();
    expect(screen.queryByText("인증 대기")).toBeNull();
  });

  it("사진이 필요 없는 챌린지는 인증이라는 말을 쓰지 않는다", () => {
    render(<ChallengeProofCard state="confirmed" photoRequired={false} gains={[days]} />);
    expect(screen.queryByText(/인증/)).toBeNull();
    expect(screen.getByText(/챌린지 목표에 쌓였어요/)).toBeTruthy();
  });

  it("목표가 여럿이면 보탠 목표만 각자의 양으로 보여준다 — 하나의 +1일로 뭉개지 않는다", () => {
    render(<ChallengeProofCard state="confirmed" photoRequired gains={[days, reps]} />);
    expect(screen.getByText("운동한 날")).toBeTruthy();
    expect(screen.queryByText("맨몸 횟수")).toBeNull();
  });

  it("보탠 몫이 0이면 반영됐다고 말하지 않고 사유를 말한다", () => {
    render(<ChallengeProofCard state="no_gain" photoRequired gains={[reps]} />);
    expect(screen.getByText(/챌린지 성과에 안 잡혔어요/)).toBeTruthy();
    expect(screen.queryByText(/반영됐어요|쌓였어요/)).toBeNull();
    expect(screen.getByText(/맨몸 횟수/)).toBeTruthy();
  });
});
