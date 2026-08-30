// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

vi.mock("@/lib/social", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social")>()),
}));

import type { SessionThread, ThreadComment } from "@/lib/domain/session-comments";
import { CommentThread, type People } from "./comment-thread";
import { LikersSheet } from "./likers-sheet";

function comment(over: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: "c1",
    senderId: "author-1",
    body: "오늘 진짜 잘했네요",
    createdAt: new Date("2026-08-31T09:00:00+09:00"),
    fromCheer: false,
    parentId: null,
    editedAt: null,
    replies: [],
    ...over,
  };
}

const THREAD: SessionThread = {
  comments: [
    comment(),
    comment({
      id: "c2",
      senderId: "author-2",
      body: "저도요",
      replies: [
        comment({ id: "c3", senderId: "author-3", body: "ㅋㅋㅋ", parentId: "c2" }),
      ],
    }),
  ],
  cheerTally: [],
  cheerTotal: 0,
};

const PEOPLE: People = new Map([
  ["author-1", { nickname: "스칼레또", avatarUrl: null }],
  ["author-2", { nickname: "낭만송곳니", avatarUrl: "🙂" }],
  ["author-3", { nickname: "아라짱", avatarUrl: null }],
]);

function renderThread(onAuthorTap?: (a: unknown) => void) {
  return render(
    <CommentThread
      sessionId="s1"
      viewerId="me"
      thread={THREAD}
      people={PEOPLE}
      onThreadChange={() => {}}
      onAuthorTap={onAuthorTap as never}
    />,
  );
}

/**
 * 댓글 작성자 탭 (2026-08-31).
 *
 * 인수인계서 §3 D. `send_crew_request`는 원래부터 크루 여부를 요구하지 않고
 * (0038), 0084가 작성자의 id·닉네임을 이미 준다. 버튼만 붙이면 동작한다.
 */
describe("CommentThread — 작성자 탭", () => {
  it("작성자 이름이 버튼이 되고, 누르면 그 사람 정보를 넘긴다", () => {
    const onTap = vi.fn();
    renderThread(onTap);

    fireEvent.click(screen.getAllByLabelText("스칼레또 프로필 보기")[0]);
    expect(onTap).toHaveBeenCalledWith({
      userId: "author-1",
      nickname: "스칼레또",
      avatarUrl: null,
    });
  });

  /**
   * ⚠️ 이게 이 묶음에서 중요한 규칙이다. 눌리는데 아무 일도 안 일어나는 자리는
   *    "고장난 앱"으로 읽힌다. 콜백을 안 넘긴 호출부(읽기 전용 카드 등)에서는
   *    이름이 그냥 글자로 남아야 한다.
   */
  it("콜백이 없으면 이름을 버튼으로 만들지 않는다", () => {
    renderThread(undefined);
    expect(screen.queryByLabelText("스칼레또 프로필 보기")).toBeNull();
    // 이름 자체는 그대로 보인다
    expect(screen.getByText("스칼레또")).toBeTruthy();
  });

  it("답글 작성자도 누를 수 있다", () => {
    const onTap = vi.fn();
    renderThread(onTap);
    fireEvent.click(screen.getAllByLabelText("아라짱 프로필 보기")[0]);
    expect(onTap).toHaveBeenCalledWith({
      userId: "author-3",
      nickname: "아라짱",
      avatarUrl: null,
    });
  });

  // 아바타는 6px이다. 그것 하나만 열어 두면 손가락으로 못 맞힌다.
  it("아바타와 이름 둘 다 누를 수 있다", () => {
    const onTap = vi.fn();
    renderThread(onTap);
    const targets = screen.getAllByLabelText("스칼레또 프로필 보기");
    expect(targets.length).toBe(2);
    fireEvent.click(targets[1]);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  /**
   * `people`에 없는 사람은 "크루원"으로 그린다. 그 자리를 버튼으로 만들면
   * 누구인지 모르는 프로필을 열게 되고, 시트는 닉네임 칸이 빈 채로 뜬다.
   */
  it("이름을 모르는 작성자는 버튼이 아니다", () => {
    const onTap = vi.fn();
    render(
      <CommentThread
        sessionId="s1"
        viewerId="me"
        thread={{ ...THREAD, comments: [comment({ senderId: "모르는사람" })] }}
        people={new Map()}
        onThreadChange={() => {}}
        onAuthorTap={onTap}
      />,
    );
    expect(screen.getByText("크루원")).toBeTruthy();
    expect(screen.queryByLabelText(/프로필 보기/)).toBeNull();
  });
});

/**
 * 좋아요 명단에서 프로필 열기 (2026-08-31).
 *
 * ⚠️ 댓글 작성자는 눌리는데 **좋아요 누른 사람만 안 눌렸다** — 사용자가 잡았다.
 *    같은 "이 사람 누구지?"인데 한쪽만 되면 고장으로 읽힌다.
 */
describe("LikersSheet — 좋아요 누른 사람 탭", () => {
  const PEOPLE2: People = new Map([
    ["u1", { nickname: "스칼레또", avatarUrl: null }],
    ["me", { nickname: "나자신", avatarUrl: null }],
  ]);

  it("이름을 누르면 그 사람 정보를 넘긴다", () => {
    const onTap = vi.fn();
    render(
      <LikersSheet
        likers={["u1"]}
        people={PEOPLE2}
        viewerId="me"
        onClose={() => {}}
        onAuthorTap={onTap}
      />,
    );
    fireEvent.click(screen.getByLabelText("스칼레또 프로필 보기"));
    expect(onTap).toHaveBeenCalledWith({
      userId: "u1",
      nickname: "스칼레또",
      avatarUrl: null,
    });
  });

  // 열 프로필이 없는 자리는 버튼이 아니어야 한다 — 눌리는데 아무 일도
  // 안 일어나면 "고장난 앱"으로 읽힌다.
  it("나 자신과 이름 모르는 사람은 버튼이 아니다", () => {
    render(
      <LikersSheet
        likers={["me", "모르는사람"]}
        people={PEOPLE2}
        viewerId="me"
        onClose={() => {}}
        onAuthorTap={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/프로필 보기/)).toBeNull();
    expect(screen.getByText("나자신")).toBeTruthy();
    expect(screen.getByText("크루원")).toBeTruthy();
  });

  it("콜백이 없으면 아무것도 버튼이 아니다", () => {
    render(<LikersSheet likers={["u1"]} people={PEOPLE2} viewerId="me" onClose={() => {}} />);
    expect(screen.queryByLabelText(/프로필 보기/)).toBeNull();
  });
});
