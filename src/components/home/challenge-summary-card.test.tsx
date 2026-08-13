// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengeSummaryCard } from "./challenge-summary-card";
import type { MyChallenge, MyChallengeScore } from "@/lib/challenge";

const KST = "Asia/Seoul";
/** 2026-08-13(목) 21:00 KST */
const NOW = new Date("2026-08-13T12:00:00Z");

/**
 * ⚠️ **시계를 고정한다.** 이 카드는 안에서 `new Date()`를 부른다 — 고정하지 않으면
 * D-day 단언이 오늘만 맞고 내일 깨지는 테스트가 된다(첫 작성 때 실제로 그랬다).
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function challengeOf(over: Partial<MyChallenge> = {}): MyChallenge {
  return {
    id: "ch-1",
    name: "8월 챌린지",
    status: "active",
    start_date: "2026-08-01",
    end_date: "2026-08-28",
    created_at: "2026-08-01T00:00:00Z",
    myRole: "host",
    myStatus: "joined",
    ...over,
  } as MyChallenge;
}

const SCORE: MyChallengeScore = {
  achievement: 40.4,
  participation: 20,
  overall: 10.74,
  goalCount: 2,
};

function renderCard(
  challenges: MyChallenge[] | null,
  score: MyChallengeScore | null = null,
) {
  return render(
    <ChallengeSummaryCard
      challenges={challenges}
      timeZone={KST}
      score={score}
    />,
  );
}

describe("ChallengeSummaryCard — 진행 중 챌린지 요약", () => {
  it("조회 전에는 아무것도 그리지 않는다 — 빈 상태가 번쩍이지 않게", () => {
    const { container } = renderCard(null);
    expect(container.innerHTML).toBe("");
  });

  it("이름과 D-day를 적고 그 챌린지로 링크한다", () => {
    renderCard([challengeOf()]);
    expect(screen.getByText("8월 챌린지")).toBeTruthy();
    // 08-13 → 08-28 = 15일 남음. 챌린지 탭의 D-day와 같은 함수로 잰다.
    expect(screen.getByText(/D-15/)).toBeTruthy();
    // ⚠️ `?open=`이 있어야 홈에서 본 챌린지가 탭에서 그대로 열린다.
    //    없으면 탭이 스스로 대표를 골라 **다른 방**이 열릴 수 있다.
    expect(screen.getByText("챌린지 보기 ›").getAttribute("href")).toBe(
      "/challenge?open=ch-1",
    );
  });

  it("종료 당일은 D-0이다", () => {
    renderCard([challengeOf({ end_date: "2026-08-13" })]);
    expect(screen.getByText(/D-0/)).toBeTruthy();
  });

  /**
   * ⚠️ 종료일이 지났는데 아직 `active`인 것은 **결과 발표를 기다리는 중**이다.
   * `D-0`으로 뭉개면 종료 당일과 구별이 안 돼 할 일이 안 보인다.
   */
  it("종료일이 지난 진행 중 챌린지는 '종료'로 적는다", () => {
    renderCard([challengeOf({ end_date: "2026-08-12" })]);
    expect(screen.getByText(/종료/)).toBeTruthy();
    expect(screen.queryByText(/D-0/)).toBeNull();
  });

  it("아직 수락하지 않은 초대는 내 챌린지가 아니다", () => {
    renderCard([challengeOf({ myStatus: "invited" })]);
    expect(screen.queryByText("8월 챌린지")).toBeNull();
    expect(screen.getByText("혼자보다 같이가 더 오래 갑니다")).toBeTruthy();
  });

  it("setup·ended는 진행 중이 아니다", () => {
    renderCard([
      challengeOf({ id: "a", status: "setup" }),
      challengeOf({ id: "b", status: "ended" }),
    ]);
    expect(screen.queryByText("8월 챌린지")).toBeNull();
  });

  it("여러 개면 종료일이 가장 임박한 것을 고른다 — 챌린지 탭과 같은 규칙", () => {
    renderCard([
      challengeOf({ id: "far", name: "먼 챌린지", end_date: "2026-09-30" }),
      challengeOf({ id: "near", name: "가까운 챌린지", end_date: "2026-08-20" }),
    ]);
    expect(screen.getByText("가까운 챌린지")).toBeTruthy();
    expect(screen.queryByText("먼 챌린지")).toBeNull();
  });
});

/**
 * 2026-08-13 사용자 확정 — "한 개 + 외 N개 표시".
 *
 * ⚠️ **카드를 쌓지 않는다.** 진행 중 챌린지 수만큼 늘리면 3개일 때 351px라
 * 성장·스트릭·주간 통계가 접힘선 밖으로 밀린다. 그렇다고 아무 말도 안 하면
 * 사용자는 나머지 챌린지를 못 찾는다.
 */
describe("ChallengeSummaryCard — 진행 중이 여러 개일 때", () => {
  it("카드는 하나만 그린다", () => {
    const { container } = renderCard([
      challengeOf({ id: "a", name: "챌린지A", end_date: "2026-08-20" }),
      challengeOf({ id: "b", name: "챌린지B", end_date: "2026-08-25" }),
      challengeOf({ id: "c", name: "챌린지C", end_date: "2026-08-27" }),
    ]);
    expect(container.querySelectorAll("section")).toHaveLength(1);
  });

  it("나머지가 몇 개인지 말한다", () => {
    renderCard([
      challengeOf({ id: "a", name: "챌린지A", end_date: "2026-08-20" }),
      challengeOf({ id: "b", name: "챌린지B", end_date: "2026-08-25" }),
      challengeOf({ id: "c", name: "챌린지C", end_date: "2026-08-27" }),
    ]);
    expect(screen.getByText("외 2개 ›")).toBeTruthy();
  });

  it("하나뿐이면 '외 0개'가 아니라 평소 문구다", () => {
    renderCard([challengeOf()]);
    expect(screen.getByText("챌린지 보기 ›")).toBeTruthy();
    expect(screen.queryByText(/외 0개/)).toBeNull();
  });

  it("진행 중이 아닌 것은 세지 않는다", () => {
    renderCard([
      challengeOf({ id: "a", end_date: "2026-08-20" }),
      challengeOf({ id: "b", status: "ended" }),
      challengeOf({ id: "c", myStatus: "invited" }),
    ]);
    expect(screen.getByText("챌린지 보기 ›")).toBeTruthy();
  });
});

/**
 * 2026-08-13 사용자 지시(시안 첨부) — 홈 카드에 목표 진행률과 내 종합점수를 적는다.
 *
 * ⚠️ **두 숫자는 반드시 `getMyChallengeScore`가 준 값이어야 한다.** 카드가 스스로
 * 계산하면 같은 챌린지가 홈에서 40%, 탭에서 38%로 보인다 — 이 저장소가 반복해서
 * 당한 종류의 사고다. 그래서 이 카드는 prop으로만 숫자를 받는다.
 */
describe("ChallengeSummaryCard — 진행률·종합점수", () => {
  it("받은 값을 그대로 적는다 (달성률은 반올림, 점수는 소수 한 자리)", () => {
    renderCard([challengeOf()], SCORE);
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByText("10.7")).toBeTruthy();
  });

  it("무엇을 센 숫자인지 글자로 적는다", () => {
    renderCard([challengeOf()], SCORE);
    expect(screen.getByText(/목표 진행률/)).toBeTruthy();
    expect(screen.getByText(/종합점수/)).toBeTruthy();
  });

  /**
   * ⚠️ 아직 안 온 값을 `0%`·`0.0`으로 채우면 **실패한 성적처럼** 읽힌다.
   * 주간 통계가 같은 이유로 `—`를 쓴다(`weekly-stats.tsx`).
   */
  it("점수가 아직 안 왔으면 0으로 채우지 않고 —를 그린다", () => {
    renderCard([challengeOf()], null);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("점수를 못 받아도 이름·기한은 그대로 그린다", () => {
    renderCard([challengeOf()], null);
    expect(screen.getByText("8월 챌린지")).toBeTruthy();
    expect(screen.getByText(/D-15/)).toBeTruthy();
  });

  it("잠금 안내는 열람권 규칙의 실제 일수를 쓴다", () => {
    renderCard([challengeOf()], SCORE);
    expect(screen.getByText(/5일 연속 시 성과 공개/)).toBeTruthy();
  });
});

/**
 * 2026-08-13 사용자 지시 — "챌린지가 없으면 함께 하면 운동을 지속하는 확률이
 * 올라간다는 마케팅 문구로 표시".
 */
describe("ChallengeSummaryCard — 챌린지가 없을 때", () => {
  it("함께하기를 권하고 챌린지 탭으로 보낸다", () => {
    renderCard([]);
    expect(screen.getByText("혼자보다 같이가 더 오래 갑니다")).toBeTruthy();
    expect(screen.getByText("챌린지 시작하기 ›").getAttribute("href")).toBe(
      "/challenge",
    );
  });

  /**
   * ⚠️ **출처 없는 수치를 쓰지 않는다.** `3배`·`87%` 같은 숫자는 근거가 있어야
   * 한다. 이 앱은 운동 처방 근거를 인용과 함께 적는 규약이 있어서, 앱이 스스로
   * 만든 통계는 그 규약을 무너뜨린다.
   */
  it("지어낸 통계를 적지 않는다", () => {
    const { container } = renderCard([]);
    expect(container.textContent ?? "").not.toMatch(/\d+\s*(배|%)/);
  });
});
