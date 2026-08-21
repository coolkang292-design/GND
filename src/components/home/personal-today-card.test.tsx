// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PersonalTodayCard,
  PersonalTodayCardSkeleton,
} from "./personal-today-card";
import { MAX_DAILY_WORKOUT_XP_NOW } from "@/lib/domain/xp";
import type { ProgressSummary } from "@/lib/progression";

afterEach(cleanup);

/**
 * 기준 시각 — **2026-08-21(금) 12:00 KST**. 주 한가운데라 하루씩 거슬러도 같은
 * 주(월~일) 안에 머문다(`weekly-stats.test.tsx`가 월요일에 깨진 사고 참조).
 *
 * ⚠️ 카드는 `now`를 **prop으로 받는다** — 여기서 `vi.useFakeTimers()`가 필요 없다.
 * 홈이 한 번 만든 시각을 내려보내야 헤더·내 카드·크루 행이 같은 "오늘"을 쓴다.
 */
const NOW = new Date("2026-08-21T03:00:00Z");
/** 2026-08-20(목) 12:00 KST — 어제 하루 운동 */
const YESTERDAY = new Date("2026-08-20T03:00:00Z");

/** 640 XP = Lv.4(개노답). 다음 레벨까지 남은 XP가 0이 아니라 진행바가 보인다. */
const SUMMARY: ProgressSummary = {
  totalXp: 640,
  currentLevel: 4,
  currentStage: 0,
  stageName: "개노답",
  characterPath: "/characters/char-04.png",
  nextLevelRequiredXp: 800,
  xpToNextLevel: 160,
  levelProgressPercent: 60,
  streakShieldCount: 0,
  hasReceivedTodayWorkoutXp: false,
};

function renderCard(
  overrides: Partial<Parameters<typeof PersonalTodayCard>[0]> = {},
) {
  const props = {
    profile: { nickname: "dev-테스터A", avatarUrl: null as string | null },
    summary: SUMMARY,
    completedAts: [YESTERDAY],
    weeklyGoal: 5 as number | null,
    status: "idle" as const,
    badgeCount: 9 as number | null,
    now: NOW,
    ...overrides,
  };
  render(<PersonalTodayCard {...props} />);
  return props;
}

describe("PersonalTodayCard — 승인된 지표만 그린다", () => {
  it("제목·이번 주·연속·비교 문구·주 행동을 한 카드에 담는다", () => {
    renderCard();
    expect(screen.getByText("나의 오늘")).toBeTruthy();
    expect(screen.getByText("dev-테스터A")).toBeTruthy();
    expect(screen.getByText("이번 주")).toBeTruthy();
    expect(screen.getByText("1 / 5")).toBeTruthy();
    expect(screen.getByText("연속")).toBeTruthy();
    expect(screen.getByText("1일")).toBeTruthy();
    expect(screen.getByText("배지")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
  });

  /**
   * ⚠️ **부정 확인.** `크루 2명 중 1명 완료 · 나는 아직` 한 줄이 2026-08-21에
   * 사용자 지시로 지워졌다 — 완료 인원은 크루 카드 헤더 칩이, 내 상태는 위
   * `운동 전` 알약이 이미 말한다. 되살리면 화면이 같은 말을 두 번 한다.
   */
  it("크루 완료 인원을 다시 문장으로 적지 않는다", () => {
    const { container } = render(
      <PersonalTodayCard
        profile={{ nickname: "dev-테스터A", avatarUrl: null }}
        summary={SUMMARY}
        completedAts={[YESTERDAY]}
        weeklyGoal={5}
        status="idle"
        badgeCount={9}
        now={NOW}
      />,
    );
    expect(container.textContent).not.toMatch(/크루 \d+명 중/);
    expect(container.textContent).not.toContain("나는 아직");
    expect(container.textContent).not.toContain("크루 현황을 불러오는 중");
  });

  /**
   * ⚠️ **부정 확인이 이 카드의 절반이다.**
   *
   * 배지 타일은 2026-08-21 설계 검토에서 한 번 빠졌다가, 같은 날 사용자가 목업을
   * 보고 **되살리라고 지시했다**(보완 기준 1 철회). 되살린 것은 배지 **개수 한 칸**
   * 뿐이다 — 옛 홈 행의 배지 썸네일 줄·누적 운동 횟수·누적 시간·목표 달성률은
   * 그대로 빠져 있어야 한다. 셋 중 하나라도 돌아오면 330px 목표가 깨진다.
   */
  it("배지 개수는 그리되 달성률·누적 수치·썸네일은 그리지 않는다", () => {
    const { container } = render(
      <PersonalTodayCard
        profile={{ nickname: "dev-테스터A", avatarUrl: null }}
        summary={SUMMARY}
        completedAts={[YESTERDAY]}
        weeklyGoal={5}
        status="idle"
        badgeCount={9}
        now={NOW}
      />,
    );
    expect(screen.getByText("배지")).toBeTruthy();
    expect(screen.queryByText("목표 달성률")).toBeNull();
    expect(container.textContent).not.toContain("🏅");
    expect(container.querySelectorAll('img[src*="/badges/"]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/\d+회/); // 누적 운동 횟수
    expect(container.textContent).not.toMatch(/\d+시간/); // 누적 운동 시간
  });

  /**
   * ⚠️ **`null`과 `0`을 구별한다** — "아직 안 왔다/실패했다"와 "정말 0개"는 다른
   * 화면이다(`FriendRow.badgeCount`가 같은 규약). 조회가 늦다고 `0개`로 속이면
   * 도착하는 순간 숫자가 튀어 배지가 생긴 것처럼 읽힌다.
   */
  it("배지 수를 못 받으면 0으로 속이지 않는다", () => {
    renderCard({ badgeCount: null });
    expect(screen.getByText("배지")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("배지가 정말 0개면 0을 적는다", () => {
    renderCard({ badgeCount: 0 });
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("레벨 진행을 단계명·레벨·진행바·남은 XP로 적는다", () => {
    const { container } = render(
      <PersonalTodayCard
        profile={{ nickname: "dev-테스터A", avatarUrl: null }}
        summary={SUMMARY}
        completedAts={[YESTERDAY]}
        weeklyGoal={5}
        status="idle"
        badgeCount={9}
        now={NOW}
      />,
    );
    // ⚠️ 단계명이 앞, 레벨이 뒤 — 크루 행과 같은 표기다(2026-08-08 사용자 지시)
    expect(screen.getByText("개노답 Lv.4")).toBeTruthy();
    expect(screen.getByText("다음 레벨까지 160 XP")).toBeTruthy();
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("60");
  });

  it("최고 레벨이면 남은 XP 대신 그렇게 말한다", () => {
    renderCard({
      summary: {
        ...SUMMARY,
        nextLevelRequiredXp: null,
        xpToNextLevel: 0,
        levelProgressPercent: 100,
      },
    });
    expect(screen.getByText("최고 레벨 달성")).toBeTruthy();
    expect(screen.queryByText(/다음 레벨까지/)).toBeNull();
  });
});

describe("PersonalTodayCard — 상태별 주 행동", () => {
  it("운동 전에는 XP를 약속하는 링크다", () => {
    renderCard();
    const cta = screen.getByRole("link", {
      name: `오늘 운동하고 +${MAX_DAILY_WORKOUT_XP_NOW} XP`,
    });
    expect(cta.getAttribute("href")).toBe("/record");
    expect(screen.getByText("운동 전")).toBeTruthy();
  });

  it("운동 중에는 이어가기 링크다", () => {
    renderCard({ status: "active" });
    const cta = screen.getByRole("link", { name: "운동 이어가기" });
    expect(cta.getAttribute("href")).toBe("/record");
    expect(screen.getByText("운동 중")).toBeTruthy();
  });

  /**
   * ⚠️ **완료 뒤에는 링크가 아니다** (설계 §6.2, 사용자 확정 9번 요구).
   * 오늘 마친 사람에게 다음 운동을 재촉하지 않는다 — 같은 면적을 칭찬에 쓴다.
   * 문구만 바꾸고 `<Link>`로 그리면 이 결정이 화면에서 사라지므로 링크의
   * **부재**를 함께 단언한다.
   */
  it("완료 뒤에는 누를 수 없는 칭찬 배너로 바뀐다", () => {
    renderCard({ status: "done" });
    expect(screen.getByRole("status").textContent).toContain(
      "오늘 운동 완료! 오늘도 해냈어요 🔥",
    );
    expect(screen.queryByRole("link", { name: /오늘 운동 완료/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /오늘 운동하고/ })).toBeNull();
    expect(screen.getByText("오늘 완료")).toBeTruthy();
  });

  it("완료 배너에 스트릭·주간 숫자를 다시 적지 않는다 — 위 지표가 이미 말한다", () => {
    renderCard({ status: "done" });
    const banner = screen.getByRole("status");
    expect(banner.textContent).not.toMatch(/\d/);
  });
});

describe("PersonalTodayCard — 주간 목표가 없을 때", () => {
  /**
   * ⚠️ `0%`로 채우지 않는다 (설계 §9). 목표를 안 정했을 뿐인데 실패한 것처럼
   * 읽힌다 — `weekly-stats.tsx`가 2026-08-08에 같은 이유로 분모를 지웠다.
   */
  it("가짜 달성률 대신 목표를 정하러 보낸다", () => {
    const { container } = render(
      <PersonalTodayCard
        profile={{ nickname: "dev-테스터A", avatarUrl: null }}
        summary={SUMMARY}
        completedAts={[YESTERDAY]}
        weeklyGoal={null}
        status="idle"
        badgeCount={9}
        now={NOW}
      />,
    );
    const link = screen.getByRole("link", { name: /목표 정하기/ });
    expect(link.getAttribute("href")).toBe("/challenge");
    // 분모 없이 일수만. 옆 `연속` 칸도 `1일`이라 **어느 칸의 값인지**까지 짚는다
    expect(link.textContent).toContain("이번 주");
    expect(link.textContent).toContain("1일");
    expect(container.textContent).not.toContain("0%");
    expect(container.textContent).not.toContain("/ 0");
  });

  it("목표가 0이어도 분모로 쓰지 않는다", () => {
    renderCard({ weeklyGoal: 0 });
    expect(screen.getByRole("link", { name: /목표 정하기/ })).toBeTruthy();
  });
});

describe("PersonalTodayCard — 성장 조회 실패", () => {
  /**
   * 설계 §9 — 성장 요약이 실패해도 **오늘 상태와 주 행동은 유지한다.**
   * 레벨을 못 받았다는 이유로 오늘 운동할 이유와 수단을 같이 지우면 안 된다.
   */
  it("성장 조회가 실패해도 오늘 상태·이번 주·연속·CTA는 남는다", () => {
    renderCard({ summary: null });
    expect(screen.getByText("성장 정보를 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("운동 전")).toBeTruthy();
    expect(screen.getByText("1 / 5")).toBeTruthy();
    expect(screen.getByText("1일")).toBeTruthy();
    expect(screen.getByRole("link", { name: /오늘 운동하고/ })).toBeTruthy();
  });
});

describe("PersonalTodayCard — 프로필로 가는 길과 아바타", () => {
  /**
   * ⚠️ 카드 전체를 링크로 감싸지 않는다 (설계 §6.3). 주 행동 버튼과 중첩되기
   * 때문이다 — 링크 안의 링크는 HTML상 무효이고, 운동하러 가려다 프로필이 열린다.
   */
  it("아바타·이름 영역만 /profile 링크이고 CTA는 그 형제다", () => {
    renderCard();
    const profileLink = screen.getByRole("link", { name: /dev-테스터A 프로필/ });
    expect(profileLink.getAttribute("href")).toBe("/profile");
    const cta = screen.getByRole("link", { name: /오늘 운동하고/ });
    expect(profileLink.contains(cta)).toBe(false);
    expect(cta.contains(profileLink)).toBe(false);
  });

  /**
   * ⚠️ 판정은 `isPhotoAvatar` 한 곳이다. `avatarUrl != null`로 가르면 이모지를
   * 쓰는 사람 전원이 캐릭터를 잃는다(`friend-board-card.tsx`가 같은 이유로 이렇게 한다).
   */
  it("사진이 없으면 현재 레벨의 캐릭터를 그린다", () => {
    renderCard();
    const img = screen.getByAltText(/캐릭터$/) as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("char-");
  });

  it("이모지 아바타는 사진으로 취급하지 않는다", () => {
    renderCard({ profile: { nickname: "dev-테스터A", avatarUrl: "🐵" } });
    expect(screen.getByAltText(/캐릭터$/)).toBeTruthy();
  });

  it("사진을 올렸으면 사진을 그린다", () => {
    renderCard({
      profile: {
        nickname: "dev-테스터A",
        avatarUrl: "https://example.supabase.co/avatars/a.jpg",
      },
    });
    const img = screen.getByAltText("dev-테스터A님 프로필 사진");
    expect(img.getAttribute("src")).toContain("a.jpg");
    expect(screen.queryByAltText(/캐릭터$/)).toBeNull();
  });
});

/**
 * 스켈레톤 — 조회가 끝나기 전 **첫 자리를 비우지 않는다**(설계 §9).
 *
 * ⚠️ 주 행동은 스켈레톤에도 있다. 홈의 유일한 운동 버튼이 이 카드로 들어왔으므로
 * 조회가 느리다는 이유로 사라지면 안 된다 — 크루 카드가 2026-08-13에 같은 사고를
 * 겪고 네 갈래 전부에 CTA를 그리게 바뀌었다.
 */
describe("PersonalTodayCardSkeleton — 조회 전에도 운동은 시작할 수 있다", () => {
  it("운동 시작하기 링크가 살아 있다", () => {
    render(<PersonalTodayCardSkeleton />);
    expect(
      screen.getByRole("link", { name: /운동 시작하기/ }).getAttribute("href"),
    ).toBe("/record");
  });

  it("숫자를 지어내지 않는다 — 0일·0%로 채우지 않는다", () => {
    const { container } = render(<PersonalTodayCardSkeleton />);
    expect(container.textContent).not.toContain("0일");
    expect(container.textContent).not.toContain("0%");
  });
});
