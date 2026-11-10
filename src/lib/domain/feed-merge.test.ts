import { describe, expect, it } from "vitest";
import { mergeSameDayFeed } from "./feed-merge";
import { EMPTY_SESSION_THREAD } from "./session-comments";
import type { FeedItem } from "@/lib/social";

const TZ = "Asia/Seoul";
const item = (
  id: string,
  userId: string,
  iso: string,
  over: Partial<FeedItem> = {},
): FeedItem => ({
  sessionId: id,
  sessionIds: [id],
  cursorAt: new Date(iso),
  userId,
  nickname: userId,
  avatarUrl: null,
  title: null,
  completedAt: new Date(iso),
  durationMinutes: 10,
  exerciseNames: [`ex-${id}`],
  volume: {
    weightVolumeKg: 100,
    bodyweightReps: 5,
    cardioDistanceMeters: 0,
    cardioDurationSeconds: 0,
    completedSetCount: 3,
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
  ...over,
});

// KST 11/11 07:00 · 19:00, 11/10 20:00
const A_MORNING = "2026-11-10T22:00:00Z";
const A_EVENING = "2026-11-11T10:00:00Z";
const A_YESTERDAY = "2026-11-10T11:00:00Z";

describe("mergeSameDayFeed — 같은 사람·같은 날은 카드 하나", () => {
  it("오늘 추가 운동은 첫 운동 카드에 합쳐진다 (대표 = 첫 운동)", () => {
    const merged = mergeSameDayFeed(
      [item("late", "a", A_EVENING), item("early", "a", A_MORNING)],
      TZ,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].sessionId).toBe("early");
    expect(merged[0].sessionIds).toEqual(["early", "late"]);
    expect(merged[0].durationMinutes).toBe(20);
    expect(merged[0].volume.completedSetCount).toBe(6);
    expect(merged[0].exerciseNames).toEqual(["ex-early", "ex-late"]);
    // 가장 늦은 운동이 카드의 시각 — 피드에서 위로 올라온다
    expect(merged[0].completedAt.toISOString()).toBe(new Date(A_EVENING).toISOString());
    // 무한 스크롤 커서는 가장 이른 시각이다
    expect(merged[0].cursorAt.toISOString()).toBe(new Date(A_MORNING).toISOString());
  });

  it("다른 사람이나 다른 날은 합치지 않는다 (부정 확인)", () => {
    const merged = mergeSameDayFeed(
      [
        item("a-today", "a", A_EVENING),
        item("b-today", "b", A_MORNING),
        item("a-yday", "a", A_YESTERDAY),
      ],
      TZ,
    );
    expect(merged.map((m) => m.sessionId)).toEqual([
      "a-today",
      "b-today",
      "a-yday",
    ]);
  });

  it("묶인 카드의 자리는 가장 늦은 운동의 자리다", () => {
    const merged = mergeSameDayFeed(
      [
        item("a-late", "a", A_EVENING),
        item("b", "b", "2026-11-11T05:00:00Z"),
        item("a-early", "a", A_MORNING),
      ],
      TZ,
    );
    expect(merged.map((m) => m.userId)).toEqual(["a", "b"]);
  });

  it("둘째 운동에 달린 좋아요·사진·댓글도 합쳐서 보인다", () => {
    const photo = (id: string) => ({
      id,
      url: id,
      source: "album" as const,
      sortOrder: 0,
    });
    const comment = (id: string, iso: string) => ({
      id,
      senderId: "x",
      body: id,
      createdAt: new Date(iso),
      fromCheer: false,
      parentId: null,
      editedAt: null,
      replies: [],
    });
    const merged = mergeSameDayFeed(
      [
        item("late", "a", A_EVENING, {
          photos: [photo("p2")],
          likers: ["x", "y"],
          reactions: { fire: 1, clap: 0, like: 2 },
          thread: {
            comments: [comment("c-late", "2026-11-11T11:00:00Z")],
            cheerTally: [{ type: "fire", count: 1 }],
            cheerTotal: 1,
          },
        }),
        item("early", "a", A_MORNING, {
          photos: [photo("p1")],
          likers: ["y", "z"],
          reactions: { fire: 0, clap: 1, like: 1 },
          thread: {
            comments: [comment("c-early", "2026-11-10T23:00:00Z")],
            cheerTally: [{ type: "fire", count: 2 }],
            cheerTotal: 2,
          },
        }),
      ],
      TZ,
    );
    const m = merged[0];
    expect(m.photos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect([...m.likers].sort()).toEqual(["x", "y", "z"]);
    expect(m.reactions).toEqual({ fire: 1, clap: 1, like: 3 });
    expect(m.thread.comments.map((c) => c.id)).toEqual(["c-early", "c-late"]);
    expect(m.thread.cheerTotal).toBe(3);
    expect(m.thread.cheerTally).toEqual([{ type: "fire", count: 3 }]);
  });

  it("한마디는 대표(첫 운동) 것이 우선, 없으면 다른 운동 것을 보인다", () => {
    const onlyLate = mergeSameDayFeed(
      [
        item("late", "a", A_EVENING, { title: "🎯 목표 채웠다" }),
        item("early", "a", A_MORNING),
      ],
      TZ,
    );
    expect(onlyLate[0].title).toBe("🎯 목표 채웠다");
    const both = mergeSameDayFeed(
      [
        item("late", "a", A_EVENING, { title: "뒤" }),
        item("early", "a", A_MORNING, { title: "앞" }),
      ],
      TZ,
    );
    expect(both[0].title).toBe("앞");
  });

  it("이미 묶인 카드에 새 페이지를 이어 붙여도 같은 결과다 (멱등)", () => {
    const once = mergeSameDayFeed(
      [item("late", "a", A_EVENING), item("early", "a", A_MORNING)],
      TZ,
    );
    const again = mergeSameDayFeed(
      [...once, item("mid", "a", "2026-11-11T01:00:00Z")],
      TZ,
    );
    expect(again).toHaveLength(1);
    expect([...again[0].sessionIds].sort()).toEqual(["early", "late", "mid"]);
    expect(again[0].sessionId).toBe("early");
  });
});
