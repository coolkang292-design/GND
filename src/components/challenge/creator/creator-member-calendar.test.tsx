import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PeriodSessionRow } from "@/lib/challenge";
import { buildMemberWorkoutDays, summarizeMemberWorkouts } from "@/lib/domain/creator-member-workouts";
import { CreatorMemberCalendar } from "./creator-member-calendar";

const set = { weightKg: 50, reps: 10, distanceMeters: null, durationSeconds: null, isCompleted: true };
const rows: PeriodSessionRow[] = [
  { userId: "m", completedAt: "2026-10-06T10:00:00Z", durationMinutes: 40,
    exercises: [{ exerciseType: "weight", exerciseName: "스쿼트", bodyPart: "하체", sets: [set, set] }] },
  { userId: "m", completedAt: "2026-10-08T10:00:00Z", durationMinutes: 30,
    exercises: [{ exerciseType: "cardio", exerciseName: "러닝", bodyPart: null,
      sets: [{ ...set, weightKg: null, reps: null, distanceMeters: 5000, durationSeconds: 1800 }] }] },
];

function render() {
  const days = buildMemberWorkoutDays(rows, "m", "Asia/Seoul");
  return renderToStaticMarkup(
    <CreatorMemberCalendar days={days} summary={summarizeMemberWorkouts(days)}
      startDate="2026-10-05" endDate="2026-11-01" todayKey="2026-10-12" />,
  );
}

describe("creator member calendar (app stamp calendar + day detail)", () => {
  it("opens on the most recent workout day with what was done", () => {
    const html = render();
    expect(html).toContain("10월 8일 (목)");
    expect(html).toContain("러닝");
    expect(html).toContain("5km · 30분");
    expect(html).toContain("2일</strong> 동안");
    // 날짜 상세는 피드 카드의 운동 요약 블록 그 자체다(사용자 지시 2026-10-25)
    expect(html).toContain("운동 상세\"");
    expect(html).toContain("전체 세트");
  });

  it("uses creator wording, not the crew profile's", () => {
    const html = render();
    expect(html).toContain("챌린지에 반영된 운동 완료일");
    expect(html).not.toContain("크루에게 공개된");
    expect(html).not.toContain("운동 완료 캘린더"); // 카드 제목 "운동 기록"과 겹치지 않게
  });
});
