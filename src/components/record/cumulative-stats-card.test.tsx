// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CumulativeStatsCard } from "./cumulative-stats-card";

afterEach(cleanup);

/**
 * 기록 탭 누적 성과 (2026-08-21 사용자 요청 —
 * *"기록 탭에는 누적 운동일수, 누적 중량, 누적 Km, 누적 운동 시간을 같이"*).
 *
 * ⚠️ **숫자를 여기서 만들지 않는다.** 무게·거리·시간은 `get_my_badge_metrics`(0036)가
 * 서버에서 합산한 값이고, 운동일수는 이 화면이 이미 들고 있는 세션에서 센다.
 * 카드는 받은 값을 그리기만 한다 — 조회가 실패하면 부르는 쪽이 안 그린다.
 */
describe("CumulativeStatsCard", () => {
  function renderCard(
    over: Partial<Parameters<typeof CumulativeStatsCard>[0]> = {},
  ) {
    render(
      <CumulativeStatsCard
        workoutDays={132}
        totalMinutes={1873}
        volumeKg={12345}
        distanceMeters={12400}
        {...over}
      />,
    );
  }

  it("누적 넷을 라벨과 함께 적는다", () => {
    renderCard();
    expect(screen.getByText("운동한 날")).toBeTruthy();
    expect(screen.getByText("132일")).toBeTruthy();
    expect(screen.getByText("운동 시간")).toBeTruthy();
    expect(screen.getByText("31시간 13분")).toBeTruthy();
    expect(screen.getByText("든 무게")).toBeTruthy();
    expect(screen.getByText("12.3톤")).toBeTruthy();
    expect(screen.getByText("달린 거리")).toBeTruthy();
    expect(screen.getByText("12.4km")).toBeTruthy();
  });

  /**
   * ⚠️ **거리 칸을 지우지 않는다.** `formatCumulativeDistance`는 0이면 `null`을 주고
   * 프로필 시트는 그때 칸을 통째로 뺀다(짧은 요약이라 잡음을 줄이는 게 맞다).
   * 여기는 **사용자가 넷을 지정해 요청한 자리**라 빈 칸이 생기면 넷이 셋으로 보인다.
   * 0은 사실이므로 `0km`으로 적는다.
   */
  it("달린 적이 없어도 거리 칸은 남고 0으로 적는다", () => {
    renderCard({ distanceMeters: 0 });
    expect(screen.getByText("달린 거리")).toBeTruthy();
    expect(screen.getByText("0km")).toBeTruthy();
  });

  it("이제 막 시작한 사람의 무게는 kg으로 적는다 — 0.3톤이라 하지 않는다", () => {
    renderCard({ volumeKg: 284 });
    expect(screen.getByText("284kg")).toBeTruthy();
  });

  /** ⚠️ 한 시간이 안 되는 사람에게 `0시간`은 "아무것도 안 했다"로 읽힌다 */
  it("한 시간 미만은 분으로 적는다", () => {
    renderCard({ totalMinutes: 42 });
    expect(screen.getByText("42분")).toBeTruthy();
  });

  it("전부 0이어도 네 칸을 그린다", () => {
    renderCard({
      workoutDays: 0,
      totalMinutes: 0,
      volumeKg: 0,
      distanceMeters: 0,
    });
    expect(screen.getByText("0일")).toBeTruthy();
    expect(screen.getByText("0분")).toBeTruthy();
    expect(screen.getByText("0kg")).toBeTruthy();
    expect(screen.getByText("0km")).toBeTruthy();
  });
});
