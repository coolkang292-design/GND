// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { BreakdownExercise } from "@/components/workout/set-breakdown";
import type { FeedItem } from "@/lib/social";
import { FeedItemCard } from "./feed-item";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

/** 세트 상세 — getCrewFeed가 이미 받아 오던 것을 버리지 않고 남긴 값 (2026-08-04) */
const BREAKDOWN: BreakdownExercise[] = [
  {
    name: "벤치프레스",
    exerciseType: "weight",
    measure: null,
    sets: [
      { weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: true },
      { weightKg: 60, reps: 4, distanceKm: 0, durationMin: 0, done: false },
    ],
  },
  {
    name: "랫풀다운",
    exerciseType: "weight",
    measure: null,
    sets: [
      { weightKg: 45, reps: 12, distanceKm: 0, durationMin: 0, done: true },
    ],
  },
];

function feedItem(
  photoUrl: string | null,
  breakdown: BreakdownExercise[] = BREAKDOWN,
): FeedItem {
  return {
    breakdown,
    sessionId: "session-1",
    userId: "friend-1",
    nickname: "오빙크",
    avatarUrl: "🙂",
    title: null,
    completedAt: new Date("2026-07-18T21:20:00+09:00"),
    durationMinutes: 45,
    exerciseNames: ["벤치프레스", "랫풀다운"],
    volume: {
      weightVolumeKg: 1_200,
      bodyweightReps: 0,
      cardioDistanceMeters: 0,
      cardioDurationSeconds: 0,
      completedSetCount: 3,
    },
    photoUrl,
    streak: 3,
    recordNote: null,
    tabataMinutes: null,
    reactions: { fire: 1, clap: 0, like: 0 },
    myReactions: new Set(),
  };
}

describe("FeedItemCard", () => {
  it("사진 기록은 날짜를 위에, 사용자와 완료 시간을 사진 아래쪽에 겹쳐 표시한다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={feedItem("https://example.com/workout.jpg")}
        userId="me"
        onProfileClick={() => {}}
      />,
    );

    expect(html).toContain("absolute inset-x-0 top-0");
    expect(html).toContain("absolute inset-x-0 bottom-0");
    expect(html).toContain("오빙크");
    expect(html).toContain("운동 완료");
  });

  it("사진 카드에서 닉네임을 프로필 버튼으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={feedItem("https://example.com/workout.jpg")}
        userId="me"
        onProfileClick={() => {}}
      />,
    );
    expect(html).toContain('aria-label="오빙크 프로필 보기"');
  });

  it("일반 카드에서도 닉네임을 프로필 버튼으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard item={feedItem(null)} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).toContain('aria-label="오빙크 프로필 보기"');
  });
});

/**
 * ④ 지난 운동 기록 상세보기 — 피드 경로 (2026-08-04).
 *
 * 세트는 이미 손에 있다. 카드를 눌러 펼치기만 하면 되고 새 질의가 없다.
 */
describe("FeedItemCard — 기록 상세 펼치기", () => {
  const renderCard = (photoUrl: string | null = null, breakdown?: BreakdownExercise[]) =>
    render(
      <FeedItemCard
        item={feedItem(photoUrl, breakdown)}
        userId="me"
        onProfileClick={() => {}}
      />,
    );

  const toggle = () => screen.getByRole("button", { name: /운동 상세/ });

  it("펼치기 전에는 세트가 보이지 않는다", () => {
    renderCard();

    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("요약을 누르면 종목별 세트가 펼쳐진다", () => {
    renderCard();

    fireEvent.click(toggle());

    expect(screen.getByText("60kg 8회")).toBeTruthy();
    expect(screen.getByText("45kg 12회")).toBeTruthy();
  });

  it("완료·미완료를 구분해 보여준다 — done이 실제로 전달돼야 한다", () => {
    renderCard();

    fireEvent.click(toggle());

    // 종목 2개가 각각 1세트를 완료했고, 벤치프레스만 2세트를 남겼다.
    expect(screen.getAllByLabelText("1세트 완료")).toHaveLength(2);
    expect(screen.getAllByLabelText("2세트 미완료")).toHaveLength(1);
    expect(screen.queryByLabelText("2세트 완료")).toBeNull();
  });

  it("다시 누르면 접힌다", () => {
    renderCard();

    fireEvent.click(toggle());
    expect(screen.getByText("60kg 8회")).toBeTruthy();

    fireEvent.click(toggle());
    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("사진 카드에서도 펼칠 수 있다 — 두 변형이 같은 요약 블록을 쓴다", () => {
    renderCard("https://example.com/workout.jpg");

    fireEvent.click(toggle());

    expect(screen.getByText("60kg 8회")).toBeTruthy();
  });

  it("저장된 세트가 없으면 없다고 알린다 — 빈 칸을 남기지 않는다", () => {
    renderCard(null, []);

    fireEvent.click(toggle());

    expect(screen.getByText(/세트 기록이 없어요/)).toBeTruthy();
  });

  it("기존 종목 요약 줄은 그대로 남는다", () => {
    renderCard();

    expect(screen.getByText("벤치프레스 · 랫풀다운")).toBeTruthy();
  });
});

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — 피드 배지도 "타바타" 대신
 * "전신 인터벌"로 부른다. 내부 필드명(`tabataMinutes`)은 그대로다.
 */
describe("FeedItemCard — 전신 인터벌 배지", () => {
  const intervalItem = (): FeedItem => ({ ...feedItem(null), tabataMinutes: 8 });

  it("인터벌 세션이면 코스 분수를 전신 인터벌로 적는다", () => {
    render(
      <FeedItemCard item={intervalItem()} userId="me" onProfileClick={() => {}} />,
    );

    expect(screen.getByText(/🔥 전신 인터벌 8분/)).toBeTruthy();
  });

  it("옛 용어 '타바타'는 남지 않는다", () => {
    // 제거 검증 — 새 문구만 찾으면 옛 문구가 사라졌는지 확인한 게 아니다.
    render(
      <FeedItemCard item={intervalItem()} userId="me" onProfileClick={() => {}} />,
    );

    expect(screen.queryByText(/타바타/)).toBeNull();
  });

  it("일반 세션에는 인터벌 배지를 그리지 않는다", () => {
    render(
      <FeedItemCard item={feedItem(null)} userId="me" onProfileClick={() => {}} />,
    );

    expect(screen.queryByText(/전신 인터벌/)).toBeNull();
  });
});
