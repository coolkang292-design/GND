import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildMyRecordReport } from "@/lib/domain/challenge-record-analysis";
import { RecordAnalysis } from "./record-analysis";

function makeReport(finalized: boolean) {
  return buildMyRecordReport({
    userId: "member",
    participant: { userId: "member", goals: [], workoutDays: 1, plannedDays: 3 },
    goals: [],
    rows: [
      {
        userId: "member",
        completedAt: "2026-10-02T03:00:00Z",
        durationMinutes: 30,
        exercises: [],
      },
    ],
    plans: [{ planDate: "2026-10-02", setCount: 4 }],
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    timeZone: "Asia/Seoul",
    finalized,
  });
}

describe("personal challenge record analysis presentation", () => {
  it("shows only previously missing daily and weekly activity in live mode", () => {
    const html = renderToStaticMarkup(
      <RecordAnalysis me={makeReport(false)} rewards={null} mode="live" />,
    );
    expect(html).toContain("일별 활동");
    expect(html).toContain("주간 달성");
    expect(html).not.toContain("목표 달성률");
    expect(html).not.toContain("주요 기록");
    expect(html).not.toContain("나의 성장");
    expect(html).not.toContain("종합점수");
    expect(html).not.toContain("획득한 보상");
    // 진행 중에는 결과 문구가 아니라 진행 중임을 말한다
    expect(html).not.toContain("꾸준함이 만든 결과예요!");
    expect(html).toContain("이번 주는 진행 중이에요");
  });

  it("preserves the existing complete analysis in ended mode", () => {
    const html = renderToStaticMarkup(
      <RecordAnalysis me={makeReport(true)} rewards={null} mode="ended" />,
    );
    expect(html).toContain("목표 달성률");
    expect(html).toContain("일별 활동");
    expect(html).toContain("주간 달성");
    expect(html).toContain("주요 기록");
    expect(html).toContain("나의 성장");
  });
});
