import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_THREAD } from "@/lib/domain/session-comments";
import type { FeedItem } from "@/lib/social";
import { FeedPhotoEditor } from "./feed-photo-editor";

function item(completedAt: Date): FeedItem {
  return {
    sessionId: "s1",
    sessionIds: ["s1"],
    cursorAt: completedAt,
    userId: "me",
    nickname: "나",
    avatarUrl: null,
    title: null,
    completedAt,
    durationMinutes: 10,
    exerciseNames: ["풀업"],
    volume: {
      weightVolumeKg: 0,
      bodyweightReps: 10,
      cardioDistanceMeters: 0,
      cardioDurationSeconds: 0,
      completedSetCount: 1,
    },
    photos: [],
    streak: 1,
    recordNote: null,
    tabataMinutes: null,
    breakdown: [],
    reactions: { fire: 0, clap: 0, like: 0 },
    myReactions: new Set(),
    thread: EMPTY_SESSION_THREAD,
    likers: [],
    people: new Map(),
  };
}

describe("FeedPhotoEditor — 오늘 올린 내 카드만 사진을 고친다", () => {
  it("오늘 카드에는 사진 추가·삭제 버튼이 있다", () => {
    const html = renderToStaticMarkup(
      <FeedPhotoEditor
        item={item(new Date())}
        userId="me"
        onItemChange={() => {}}
      />,
    );
    expect(html).toContain("사진 추가·삭제");
  });

  it("지난 날짜 카드에는 버튼이 없다 (소급 수정 방지, 부정 확인)", () => {
    const html = renderToStaticMarkup(
      <FeedPhotoEditor
        item={item(new Date("2020-01-02T03:00:00Z"))}
        userId="me"
        onItemChange={() => {}}
      />,
    );
    expect(html).toBe("");
  });
});
