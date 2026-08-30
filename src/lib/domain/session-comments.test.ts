import { describe, expect, it } from "vitest";

import {
  foldSessionThread,
  threadPreview,
  totalCommentCount,
  type SessionCheerRow,
} from "./session-comments";

function row(over: Partial<SessionCheerRow> & { id: string }): SessionCheerRow {
  return {
    sessionId: "s1",
    senderId: "u1",
    cheerType: "comment",
    message: "좋았어요",
    createdAt: new Date("2026-08-30T10:00:00Z"),
    parentId: null,
    editedAt: null,
    ...over,
  };
}

describe("foldSessionThread", () => {
  it("말이 있는 행은 댓글 줄로, 말이 없는 응원은 머리줄 집계로 간다", () => {
    const thread = foldSessionThread([
      row({ id: "c1", cheerType: "fire", message: null }),
      row({ id: "c2", cheerType: "comment", message: "고생했다" }),
      row({ id: "c3", cheerType: "fire", message: null }),
      row({ id: "c4", cheerType: "power", message: null }),
    ]);

    expect(thread.comments).toHaveLength(1);
    expect(thread.comments[0].body).toBe("고생했다");
    expect(thread.cheerTally).toEqual([
      { type: "fire", count: 2 },
      { type: "power", count: 1 },
    ]);
    expect(thread.cheerTotal).toBe(3);
  });

  it("운동 중 응원으로 온 말도 같은 줄에 서되 fromCheer로 갈린다", () => {
    const thread = foldSessionThread([
      row({ id: "c1", cheerType: "custom", message: "힘내!!" }),
      row({ id: "c2", cheerType: "comment", message: "수고!" }),
    ]);

    expect(thread.comments.map((c) => c.fromCheer)).toEqual([true, false]);
    // 말이 있으므로 집계로 새면 안 된다
    expect(thread.cheerTotal).toBe(0);
  });

  it("시간순으로 세운다 — DB 순서에 기대지 않는다", () => {
    const thread = foldSessionThread([
      row({
        id: "late",
        message: "나중",
        createdAt: new Date("2026-08-30T12:00:00Z"),
      }),
      row({
        id: "early",
        message: "먼저",
        createdAt: new Date("2026-08-30T09:00:00Z"),
      }),
    ]);

    expect(thread.comments.map((c) => c.id)).toEqual(["early", "late"]);
  });

  it("공백만 있는 말은 댓글이 아니다", () => {
    const thread = foldSessionThread([
      row({ id: "c1", cheerType: "clap", message: "   " }),
    ]);

    expect(thread.comments).toHaveLength(0);
    expect(thread.cheerTally).toEqual([{ type: "clap", count: 1 }]);
  });

  it("빈 입력이면 빈 스레드", () => {
    expect(foldSessionThread([])).toEqual({
      comments: [],
      cheerTally: [],
      cheerTotal: 0,
    });
  });
});

describe("threadPreview", () => {
  /**
   * ⚠️ 회귀 방어. `slice(0, limit)`으로 앞에서 자르면 **가장 오래된 댓글**이
   * 남는다 — 인스타처럼 최신이 보여야 하는데 정반대가 된다. 이 단언이 그걸 잡는다.
   */
  it("최신 N개를 읽는 순서(오래된 → 최신)로 돌려준다", () => {
    const thread = foldSessionThread([
      row({ id: "a", message: "1번", createdAt: new Date("2026-08-30T01:00:00Z") }),
      row({ id: "b", message: "2번", createdAt: new Date("2026-08-30T02:00:00Z") }),
      row({ id: "c", message: "3번", createdAt: new Date("2026-08-30T03:00:00Z") }),
    ]);

    expect(threadPreview(thread, 2).map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("댓글이 limit보다 적으면 전부", () => {
    const thread = foldSessionThread([row({ id: "a", message: "하나" })]);
    expect(threadPreview(thread, 2)).toHaveLength(1);
  });

  it("limit이 0 이하면 빈 배열", () => {
    const thread = foldSessionThread([row({ id: "a", message: "하나" })]);
    expect(threadPreview(thread, 0)).toEqual([]);
  });
});

/** 대댓글 (0084) — 서버가 2단계로 눕히고, 접기는 그걸 그대로 그린다 */
describe("foldSessionThread — 대댓글", () => {
  it("답글을 부모 밑으로 옮긴다", () => {
    const thread = foldSessionThread([
      row({ id: "p", message: "부모" }),
      row({ id: "r1", message: "답글1", parentId: "p" }),
      row({ id: "r2", message: "답글2", parentId: "p" }),
    ]);

    expect(thread.comments.map((c) => c.id)).toEqual(["p"]);
    expect(thread.comments[0].replies.map((c) => c.id)).toEqual(["r1", "r2"]);
  });

  it("답글도 시간순으로 세운다", () => {
    const thread = foldSessionThread([
      row({ id: "p", message: "부모", createdAt: new Date("2026-08-30T01:00:00Z") }),
      row({
        id: "late",
        message: "나중",
        parentId: "p",
        createdAt: new Date("2026-08-30T05:00:00Z"),
      }),
      row({
        id: "early",
        message: "먼저",
        parentId: "p",
        createdAt: new Date("2026-08-30T02:00:00Z"),
      }),
    ]);
    expect(thread.comments[0].replies.map((c) => c.id)).toEqual([
      "early",
      "late",
    ]);
  });

  /**
   * ⚠️⚠️ 회귀 방어. 부모가 THREAD_FETCH_CAP에 잘려 안 왔을 때 답글을 버리면
   * **사용자가 쓴 말이 화면에서 사라진다.** 자리를 잃더라도 보여야 한다.
   */
  it("부모를 못 찾은 답글은 버리지 않고 최상위로 올린다", () => {
    const thread = foldSessionThread([
      row({ id: "orphan", message: "고아", parentId: "없는-부모" }),
    ]);
    expect(thread.comments.map((c) => c.id)).toEqual(["orphan"]);
  });

  it("자기 자신을 부모로 가리켜도 무한루프에 빠지지 않는다", () => {
    const thread = foldSessionThread([
      row({ id: "self", message: "나", parentId: "self" }),
    ]);
    expect(thread.comments.map((c) => c.id)).toEqual(["self"]);
    expect(thread.comments[0].replies).toEqual([]);
  });

  it("미리보기는 최상위 댓글만 센다 — 답글은 부모를 따라간다", () => {
    const thread = foldSessionThread([
      row({ id: "a", message: "1", createdAt: new Date("2026-08-30T01:00:00Z") }),
      row({ id: "b", message: "2", createdAt: new Date("2026-08-30T02:00:00Z") }),
      row({ id: "c", message: "3", createdAt: new Date("2026-08-30T03:00:00Z") }),
      row({ id: "ra", message: "답", parentId: "a" }),
    ]);
    expect(threadPreview(thread, 2).map((c) => c.id)).toEqual(["b", "c"]);
  });
});

describe("totalCommentCount", () => {
  /** ⚠️ 답글을 빼먹으면 스레드에 5줄인데 💬 2로 떠서 안 맞는다 */
  it("답글까지 센다", () => {
    const thread = foldSessionThread([
      row({ id: "p", message: "부모" }),
      row({ id: "r1", message: "답1", parentId: "p" }),
      row({ id: "r2", message: "답2", parentId: "p" }),
      row({ id: "q", message: "다른 댓글" }),
    ]);
    expect(totalCommentCount(thread)).toBe(4);
  });

  it("이모지 응원은 세지 않는다 — 그건 머리줄 집계다", () => {
    const thread = foldSessionThread([
      row({ id: "c1", cheerType: "fire", message: null }),
    ]);
    expect(totalCommentCount(thread)).toBe(0);
  });
});
