// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachResponse } from "@/lib/coach";
import { analyzeWorkout } from "@/lib/domain/workout-analysis";

const coach = vi.hoisted(() => ({
  loadTrainingProfile: vi.fn(),
  loadSessionFeedback: vi.fn(),
  requestCoachFeedback: vi.fn(),
  saveSessionFeedback: vi.fn(),
  saveTrainingProfile: vi.fn(),
}));
vi.mock("@/lib/coach", () => coach);
vi.mock("@/lib/analytics-events", () => ({ recordFunnelEvent: vi.fn(async () => true) }));

import { CoachCard } from "./coach-card";

const PROFILE = {
  primaryGoal: "hypertrophy",
  experienceLevel: "beginner",
  sessionsPerWeek: 3,
  sessionMinutes: 45,
  trainingLocation: "gym",
  priorityBodyParts: [],
  limitationBodyParts: [],
  currentWeightKg: null,
  targetWeightKg: null,
};

const bench = (reps: number[]) => ({
  name: "벤치프레스",
  type: "weight" as const,
  measure: null,
  sets: reps.map((r) => ({
    weightKg: 60,
    reps: r,
    durationSec: 0,
    distanceM: 0,
    done: true,
    effort: null,
    clientCompletedAtMs: null,
  })),
});

const METRICS = analyzeWorkout({
  session: { durationMinutes: 40, exercises: [bench([10, 10, 10])] },
  history: [{ completedAtMs: 1, exercises: [bench([10, 10, 8])] }],
  goal: "hypertrophy",
  sessionEffort: "on_target",
  flags: [],
});

const COMPLETED: CoachResponse = {
  status: "completed",
  metrics: METRICS,
  feedback: {
    summary: "같은 무게에서 반복이 2회 늘었어요.",
    primary_result: { type: "progress", message: "벤치프레스 총 반복 +2회" },
    wins: [{ exercise: "벤치프레스", message: "60kg 유지하며 30회" }],
    cautions: [],
    next_actions: [{ exercise: "벤치프레스", action: "maintain", message: "60kg로 36회를 노려요" }],
    coach_message: "흐름이 좋아요.",
  },
};

function renderCard() {
  return render(<CoachCard userId="u1" sessionId="s1" />);
}

beforeEach(() => {
  vi.resetAllMocks();
  coach.loadTrainingProfile.mockResolvedValue(PROFILE);
  coach.loadSessionFeedback.mockResolvedValue({ effort: "on_target", flags: [] });
  coach.requestCoachFeedback.mockResolvedValue(COMPLETED);
  coach.saveSessionFeedback.mockResolvedValue(undefined);
  coach.saveTrainingProfile.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CoachCard", () => {
  it("프로필·체감이 있으면 바로 분석해 성과와 코칭을 보여 준다", async () => {
    renderCard();
    expect(await screen.findByText("같은 무게에서 반복이 2회 늘었어요.")).toBeTruthy();
    expect(screen.getByText("성장 신호")).toBeTruthy();
    expect(screen.getByText("오늘의 성과")).toBeTruthy();
    expect(screen.getByText("60kg · 총 30회 · 지난번 +2회")).toBeTruthy();
    expect(screen.getByText("60kg로 36회를 노려요")).toBeTruthy();
    expect(coach.requestCoachFeedback).toHaveBeenCalledWith("s1", false);
  });

  it("목표 프로필이 없으면 AI를 부르지 않고 목표 설정을 먼저 보여 준다", async () => {
    coach.loadTrainingProfile.mockResolvedValue(null);
    renderCard();
    expect(await screen.findByText("목표 알려 주고 분석 받기")).toBeTruthy();
    expect(coach.requestCoachFeedback).not.toHaveBeenCalled();
  });

  it("체감을 아직 안 받았으면 이모지 한 탭이 저장과 분석을 함께 시작한다", async () => {
    coach.loadSessionFeedback.mockResolvedValue(null);
    renderCard();
    fireEvent.click(await screen.findByText("통증 있었음"));
    fireEvent.click(screen.getByText("힘듦"));
    await screen.findByText("같은 무게에서 반복이 2회 늘었어요.");
    expect(coach.saveSessionFeedback).toHaveBeenCalledWith("u1", "s1", {
      effort: "heavy",
      flags: ["pain"],
    });
    // 통증 안내는 AI가 아니라 코드가 붙인다
    expect(screen.getByText(/전문가와 상담하세요/)).toBeTruthy();
  });

  it("강도를 누르면 페이지에 알린다 — 크루 피드 한마디를 채우는 데 쓴다 (2026-09-29)", async () => {
    coach.loadSessionFeedback.mockResolvedValue(null);
    const onEffortChosen = vi.fn();
    render(<CoachCard userId="u1" sessionId="s1" onEffortChosen={onEffortChosen} />);
    fireEvent.click(await screen.findByText("너무 힘듦"));
    await screen.findByText("같은 무게에서 반복이 2회 늘었어요.");
    expect(onEffortChosen).toHaveBeenCalledWith("too_heavy");
  });

  it("체감 없이 분석하면 null로 알린다 — 한마디를 지어내지 않는다", async () => {
    coach.loadSessionFeedback.mockResolvedValue(null);
    const onEffortChosen = vi.fn();
    render(<CoachCard userId="u1" sessionId="s1" onEffortChosen={onEffortChosen} />);
    fireEvent.click(await screen.findByText("체감 없이 기록만으로 분석"));
    await screen.findByText("같은 무게에서 반복이 2회 늘었어요.");
    expect(onEffortChosen).toHaveBeenCalledWith(null);
  });

  it("한마디 줄은 강도를 고른 뒤에만 보인다", async () => {
    coach.loadSessionFeedback.mockResolvedValue(null);
    render(
      <CoachCard userId="u1" sessionId="s1" captionSlot={<p>한마디줄</p>} />,
    );
    await screen.findByText("적당");
    expect(screen.queryByText("한마디줄")).toBeNull();
    fireEvent.click(screen.getByText("적당"));
    await screen.findByText("같은 무게에서 반복이 2회 늘었어요.");
    expect(screen.getByText("한마디줄")).toBeTruthy();
  });

  it("\"다음에\"로 닫으면 사라졌다고 알린다 — 페이지가 한마디 칸을 되살린다", async () => {
    coach.loadTrainingProfile.mockResolvedValue(null);
    const onHidden = vi.fn();
    render(<CoachCard userId="u1" sessionId="s1" onHidden={onHidden} />);
    fireEvent.click(await screen.findByText("다음에"));
    await waitFor(() => expect(onHidden).toHaveBeenCalled());
  });

  it("테이블이 없어 칸을 숨겨도 사라졌다고 알린다", async () => {
    coach.loadTrainingProfile.mockRejectedValue(new Error("42P01"));
    const onHidden = vi.fn();
    render(<CoachCard userId="u1" sessionId="s1" onHidden={onHidden} />);
    await waitFor(() => expect(onHidden).toHaveBeenCalled());
  });

  it("체감 저장이 실패해도 분석은 받는다", async () => {
    coach.loadSessionFeedback.mockResolvedValue(null);
    coach.saveSessionFeedback.mockRejectedValue(new Error("x"));
    renderCard();
    fireEvent.click(await screen.findByText("체감 없이 기록만으로 분석"));
    expect(await screen.findByText("같은 무게에서 반복이 2회 늘었어요.")).toBeTruthy();
  });

  it("AI 실패 — 계산한 성과는 남기고 '다시 분석'은 명시적 재시도로 부른다", async () => {
    coach.requestCoachFeedback.mockResolvedValueOnce({
      status: "failed",
      metrics: METRICS,
      errorCode: "timeout",
      retryable: true,
    });
    renderCard();
    expect(await screen.findByText(/리포트를 불러오지 못했어요/)).toBeTruthy();
    expect(screen.getByText("오늘의 성과")).toBeTruthy();
    fireEvent.click(screen.getByText("다시 분석"));
    await screen.findByText("같은 무게에서 반복이 2회 늘었어요.");
    expect(coach.requestCoachFeedback).toHaveBeenLastCalledWith("s1", true);
  });

  it("재시도가 소진되면 '다시 분석' 버튼이 없다", async () => {
    coach.requestCoachFeedback.mockResolvedValue({
      status: "failed",
      metrics: null,
      errorCode: "timeout",
      retryable: false,
    });
    renderCard();
    await screen.findByText(/리포트를 불러오지 못했어요/);
    expect(screen.queryByText("다시 분석")).toBeNull();
  });

  it("다른 요청이 생성 중(pending)이면 기다렸다가 다시 묻는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    coach.requestCoachFeedback
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce(COMPLETED);
    renderCard();
    await waitFor(() => expect(coach.requestCoachFeedback).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(await screen.findByText("같은 무게에서 반복이 2회 늘었어요.")).toBeTruthy();
    expect(coach.requestCoachFeedback).toHaveBeenCalledTimes(2);
  });

  it("0112 미적용 등으로 조회가 실패하면 칸 자체를 숨긴다", async () => {
    coach.loadTrainingProfile.mockRejectedValue(new Error("relation does not exist"));
    const { container } = renderCard();
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("AI 미설정은 재시도 버튼 없이 준비 중이라고만 한다", async () => {
    coach.requestCoachFeedback.mockResolvedValue({
      status: "failed",
      metrics: METRICS,
      errorCode: "not_configured",
      retryable: true,
    });
    renderCard();
    expect(await screen.findByText(/리포트를 준비하고 있어요/)).toBeTruthy();
    expect(screen.queryByText("다시 분석")).toBeNull();
  });
});
