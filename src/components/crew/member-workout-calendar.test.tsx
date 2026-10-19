import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrewCalendarMonthView } from "./member-workout-calendar";
import type { PublicCrewCalendarMonth } from "@/lib/crew-calendar";

const SAMPLE: PublicCrewCalendarMonth = {
  timeZone: "Asia/Seoul",
  workoutDays: 1,
  sessionCount: 2,
  totalDurationSeconds: 65 * 60,
  stamps: [{
    dateKey: "2026-10-05",
    count: 2,
    totalDurationSeconds: 65 * 60,
    verification: "camera_verified",
  }],
};

function render(data = SAMPLE, selected: string | null = null) {
  return renderToStaticMarkup(
    <CrewCalendarMonthView
      view={{ year: 2026, month: 10 }}
      data={data}
      selected={selected}
      onSelect={() => {}}
      onPrevious={() => {}}
      onNext={() => {}}
      onToday={() => {}}
      nextDisabled={true}
    />,
  );
}

describe("크루 프로필 공개 운동 달력", () => {
  it("기존 WORKOUT 스탬프와 월별 공개 성과를 표시한다", () => {
    const html = render();
    expect(html).toContain("운동 완료 캘린더");
    expect(html).toContain("2026년");
    expect(html).toContain("공개 운동한 날");
    expect(html).toContain("1일");
    expect(html).toContain("1시간 5분");
    expect(html).toContain("WORKOUT");
    expect(html).toContain('aria-label="10월 5일, 운동 완료 2회"');
    expect(html).not.toContain("운동 계획 만들기");
    expect(html).not.toContain("예정");
  });

  it("선택한 공개 운동일의 횟수와 시간을 보여준다", () => {
    const html = render(SAMPLE, "2026-10-05");
    expect(html).toContain("운동 2회");
    expect(html).toContain('aria-pressed="true"');
  });

  it("공개 완료가 없는 달은 0일과 안내를 표시하고 도장은 범례에만 남는다", () => {
    const html = render({
      timeZone: "Asia/Seoul",
      workoutDays: 0,
      sessionCount: 0,
      totalDurationSeconds: 0,
      stamps: [],
    });
    expect(html).toContain("공개된 완료 운동이 없어요");
    expect(html).not.toContain("10월 5일, 운동 완료");
    expect(html).toContain("누적 성과에는 비공개 운동이 포함될 수 있어요");
  });

  it("날짜 선택은 공개 완료일에만 가능하고 다음 달은 비활성이다", () => {
    const html = render();
    expect(html).toContain('aria-label="10월 6일, 공개 운동 없음"');
    expect(html).toContain('aria-label="다음 달" disabled');
    expect(html).toContain('aria-label="이전 달"');
  });
});

describe("본인 프로필 운동 달력", () => {
  it("기존 WORKOUT 표시와 운동일을 유지하며 비공개 기록 포함을 명확히 알린다", () => {
    const html = renderToStaticMarkup(
      <CrewCalendarMonthView
        view={{ year: 2026, month: 10 }}
        data={SAMPLE}
        selected={null}
        onSelect={() => {}}
        onPrevious={() => {}}
        onNext={() => {}}
        onToday={() => {}}
        nextDisabled={true}
        includePrivate
      />,
    );
    expect(html).toContain('aria-label="내 운동 완료 캘린더"');
    expect(html).toContain("운동 완료 캘린더");
    expect(html).toContain("WORKOUT");
    expect(html).toContain("운동한 날");
    expect(html).toContain("내 운동 완료일 (비공개 포함)");
    expect(html).toContain("본인에게는 공개·비공개 완료 운동이 모두 표시됩니다.");
    expect(html).not.toContain("공개한 완료 운동만 표시됩니다.");
  });
});
