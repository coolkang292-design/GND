// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetricRow } from "@/lib/domain/challenge-metrics";
import { CompetitionTab } from "./competition-tab";

afterEach(cleanup);

const session = (userId: string, day: number, o: { min?: number | "none"; km?: number } = {}): MetricRow => ({
  userId,
  completedAt: `2026-10-${String(day).padStart(2, "0")}T01:00:00Z`,
  ...(o.min === "none" ? {} : { durationMinutes: o.min ?? 30 }),
  exercises: [
    {
      exerciseType: "cardio",
      sets: [{ weightKg: null, reps: null, distanceMeters: (o.km ?? 0) * 1000, isCompleted: true }],
    },
  ],
});

function members(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "me" : `p${i}`,
    nickname: i === 0 ? "나" : `참가자${i}`,
    avatar_url: null,
  }));
}

function setup(rows: MetricRow[], n: number, extra: Partial<Parameters<typeof CompetitionTab>[0]> = {}) {
  const onOpenRanking = vi.fn();
  render(
    <CompetitionTab
      rows={rows}
      members={members(n)}
      myUserId="me"
      startDate="2026-10-01"
      endKey="2026-10-07"
      todayKey="2026-10-07"
      timeZone="Asia/Seoul"
      todayDone
      streak={3}
      liveRanking={false}
      onOpenRanking={onOpenRanking}
      {...extra}
    />,
  );
  return { onOpenRanking };
}

describe("진행 중 랭킹 탭", () => {
  it("2명 — 내가 1위면 시안 문구와 TOP 2줄, 내 줄 강조", () => {
    setup([session("me", 1), session("me", 2), session("p1", 1)], 2);
    expect(screen.getByText("1위")).toBeTruthy();
    expect(screen.getByText("운동 횟수 기준")).toBeTruthy();
    expect(screen.getByTestId("gap-message").textContent).toContain("2위와 +1회 차이예요!");
    const lines = screen.getAllByTestId("ranking-line");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("data-mine")).toBe("true");
  });

  it("12명 — TOP 5 + 밖에 있는 내 줄", () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, i) => Array.from({ length: 12 - i }, (_, d) => session(`p${i + 1}`, d + 1))).flat(),
      session("me", 1),
    ];
    setup(rows, 12);
    const lines = screen.getAllByTestId("ranking-line");
    expect(lines).toHaveLength(6);
    expect(lines[5].getAttribute("data-mine")).toBe("true");
    expect(within(lines[5]).getByText("나")).toBeTruthy();
  });

  it("40명도 TOP 5 + 내 줄로 줄 수가 묶인다", () => {
    const rows = Array.from({ length: 40 }, (_, i) => session(i === 0 ? "me" : `p${i}`, (i % 7) + 1));
    setup(rows, 40);
    expect(screen.getAllByTestId("ranking-line").length).toBeLessThanOrEqual(6);
  });

  it("지표를 바꾸면 목록·내 기록이 바뀐다", () => {
    setup([session("me", 1, { km: 5 }), session("p1", 1, { km: 2 }), session("p1", 2)], 2);
    fireEvent.click(screen.getByRole("tab", { name: /유산소 거리/ }));
    expect(screen.getByText("유산소 거리 랭킹")).toBeTruthy();
    expect(screen.getByTestId("gap-message").textContent).toContain("2위와 +3km 차이예요!");
  });

  it("0117 전(운동 시간 키 없음) — 운동 시간은 준비 중, 대표 순위에서 빠진다", () => {
    setup([session("me", 1, { min: "none" }), session("p1", 1, { min: "none" }), session("p1", 2, { min: "none" })], 2);
    expect(screen.getByText("준비 중")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /운동 시간/ }));
    expect(screen.getByText(/운동 시간 집계를 준비 중이에요/)).toBeTruthy();
    expect(screen.queryAllByTestId("ranking-line")).toHaveLength(0);
  });

  it("종합 점수는 잠겨 있다 / live_ranking 방은 열린다", () => {
    setup([session("me", 1)], 2);
    expect(screen.getByTestId("overall-locked")).toBeTruthy();
    expect(screen.getByText("종합 점수는 종료일 공개")).toBeTruthy();
    cleanup();
    const { onOpenRanking } = setup([session("me", 1)], 2, { liveRanking: true });
    expect(screen.queryByTestId("overall-locked")).toBeNull();
    fireEvent.click(screen.getByText("종합 점수 실시간 공개 방"));
    expect(onOpenRanking).toHaveBeenCalledWith("overall");
  });

  it("오늘 운동 전이면 오늘 운동하기 링크", () => {
    setup([session("me", 1)], 2, { todayDone: false });
    expect(screen.getByRole("link", { name: /오늘 운동하기/ }).getAttribute("href")).toBe("/record");
  });

  it("이번 주 1위 칩 — 이번 챌린지 주에 내가 대표 지표 1위일 때", () => {
    setup([session("me", 6), session("me", 7), session("p1", 6)], 2);
    expect(screen.getByText("이번 주 1위")).toBeTruthy();
  });
});
