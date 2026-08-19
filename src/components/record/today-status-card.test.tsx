import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayStatusCard } from "./today-status-card";
import { weeklyBars } from "@/lib/domain/today-status";

const TZ = "Asia/Seoul";
const TODAY = "2026-08-19";
const at = (day: number) => new Date(Date.UTC(2026, 7, day, 0, 0, 0));

const base = {
  streak: 3,
  gap: 0,
  todayKey: TODAY,
};

describe("TodayStatusCard — 미완료", () => {
  it("완료 문구도 막대도 그리지 않는다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard
        {...base}
        didWorkoutToday={false}
        stage="d4"
        gap={1}
        bars={weeklyBars([], TODAY, TZ)}
      />,
    );
    expect(html).toContain("오늘은 아직이에요");
    expect(html).not.toContain("오늘 운동 완료!");
    expect(html).not.toContain('role="img"'); // 막대 없음
  });

  it("오늘 할 일 한 줄을 보여준다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard
        {...base}
        didWorkoutToday={false}
        stage="d4"
        gap={1}
        bars={weeklyBars([], TODAY, TZ)}
        todayLine="4분 인터벌"
      />,
    );
    expect(html).toContain("오늘의 운동");
    expect(html).toContain("4분 인터벌");
  });

  it("할 일이 없으면 그 줄을 안 그린다 — 빈 칸을 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard
        {...base}
        didWorkoutToday={false}
        stage="d4"
        gap={1}
        bars={weeklyBars([], TODAY, TZ)}
      />,
    );
    expect(html).not.toContain("오늘의 운동");
  });

  it("응원 문구는 홈 스트릭 카드와 같은 원천을 쓴다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard
        {...base}
        didWorkoutToday={false}
        stage="d4"
        gap={1}
        streak={5}
        bars={weeklyBars([], TODAY, TZ)}
      />,
    );
    expect(html).toContain("어제 운동했어요");
    expect(html).toContain("6일째");
  });
});

describe("TodayStatusCard — 완료", () => {
  const bars = weeklyBars(
    [
      { completedAt: at(19), durationMinutes: 40 },
      { completedAt: at(18), durationMinutes: 20 },
      { completedAt: at(17), durationMinutes: null },
    ],
    TODAY,
    TZ,
  );

  it("완료 문구와 막대를 그린다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard {...base} didWorkoutToday stage="today_done" bars={bars} />,
    );
    expect(html).toContain("오늘 운동 완료!");
    expect(html).not.toContain("오늘은 아직이에요");
    expect(html).toContain('role="img"');
  });

  /** ⚠️ 막대 높이는 스크린리더에 아무 의미가 없다 — 글자로도 읽혀야 한다 */
  it("막대에 글자 설명이 붙는다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard {...base} didWorkoutToday stage="today_done" bars={bars} />,
    );
    expect(html).toContain("최근 7일 운동:");
    expect(html).toContain("40분");
    expect(html).toContain("쉼");
  });

  it("7일 합계를 시간·분으로 적는다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard {...base} didWorkoutToday stage="today_done" bars={bars} />,
    );
    // 40 + 20 + 0 = 60분 = 1시간, 운동한 날 3일
    expect(html).toContain("3일 · 1시간");
  });

  it("오늘 완료면 칭찬 문구가 나온다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard
        {...base}
        didWorkoutToday
        stage="today_done"
        streak={7}
        bars={bars}
      />,
    );
    expect(html).toContain("오늘 완료!");
    expect(html).toContain("7");
  });

  /**
   * ⚠️ 지난 운동을 나중에 적으면 `duration_minutes`가 0이다. 그 날이 빈칸으로
   * 그려지면 화면이 "안 했다"고 거짓말을 한다.
   */
  it("0분인 날도 막대가 보인다", () => {
    const html = renderToStaticMarkup(
      <TodayStatusCard {...base} didWorkoutToday stage="today_done" bars={bars} />,
    );
    // 8/17은 0분이지만 done이라 최소 높이가 붙는다
    expect(html).toContain("height:12%");
  });
});
