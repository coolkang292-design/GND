import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/lib/social";
import { FeedItemCard } from "./feed-item";

function feedItem(photoUrl: string | null): FeedItem {
  return {
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
