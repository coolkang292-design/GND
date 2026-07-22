import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreakCard } from "./streak-card";

// KST 기준 2026-07-23 07:10 — 사용자 신고 시점과 같은 조건.
const NOW = new Date("2026-07-22T22:10:00Z");
const kst = (day: string) => new Date(`${day}T03:00:00Z`); // KST 정오

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("StreakCard — 어제 운동한 사용자(d4)", () => {
  // 어제(7/22)와 그제(7/21) 운동 → 스트릭 2일, 오늘(7/23)은 아직.
  const yesterdayStreak = [kst("2026-07-21"), kst("2026-07-22")];

  it("어제 운동했는데 '쉬었다'고 말하지 않는다", () => {
    const html = renderToStaticMarkup(
      <StreakCard completedAts={yesterdayStreak} />,
    );
    expect(html).toContain("스트릭 2일 유지 중");
    // 어제를 쉰 날로 단정하는 표현이 있으면 안 된다 (2026-07-23 신고 건)
    expect(html).not.toContain("어제 쉬셨");
    expect(html).not.toContain("하루 걸렀");
    expect(html).not.toContain("어제 뭐 하셨");
  });

  it("카드 부제는 어제 운동을 인정하고 오늘을 안내한다", () => {
    const html = renderToStaticMarkup(
      <StreakCard completedAts={yesterdayStreak} />,
    );
    expect(html).toContain("어제 운동했어요");
    expect(html).toContain("오늘 하면 3일째");
    expect(html).not.toContain("1일째 쉬는 중");
  });

  it("카드 부제와 경고 배너가 같은 문장을 반복하지 않는다", () => {
    const html = renderToStaticMarkup(
      <StreakCard completedAts={yesterdayStreak} />,
    );
    const warning = html.match(/⚠️ ([^<]+)</)?.[1];
    expect(warning).toBeTruthy();
    // 경고 문구가 카드 부제로도 쓰이면 화면에 같은 말이 두 번 나온다
    const occurrences = html.split(warning as string).length - 1;
    expect(occurrences).toBe(1);
    expect(warning).toContain("소멸 D-4");
  });
});

describe("StreakCard — 실제로 쉰 경우엔 쉬었다고 말한다", () => {
  it("어제 쉬고 그제가 마지막이면 '2일째 쉬는 중'", () => {
    const html = renderToStaticMarkup(
      <StreakCard completedAts={[kst("2026-07-21")]} />,
    );
    expect(html).toContain("2일째 쉬는 중");
    expect(html).toContain("소멸 D-3");
  });

  it("오늘 완료했으면 경고 배너가 없다", () => {
    const html = renderToStaticMarkup(
      <StreakCard completedAts={[kst("2026-07-22"), kst("2026-07-23")]} />,
    );
    expect(html).toContain("오늘 완료!");
    expect(html).not.toContain("⚠️");
  });

  it("기록이 없으면 불꽃 없음 안내", () => {
    const html = renderToStaticMarkup(<StreakCard completedAts={[]} />);
    expect(html).toContain("스트릭 없음");
    expect(html).toContain("운동을 시작하면 불꽃이 켜져요");
    expect(html).not.toContain("⚠️");
  });
});
