// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 예시 화면 카드(`demo`) — 서버에 쓰는 길이 전부 닫혔는가 (2026-11-26).
 *
 * 쓰는 함수를 전부 가짜로 바꿔 두고 "한 번도 안 불렸다"를 본다. 일부러 `demo`를 빼면
 * 하트를 누르는 순간 `toggleReaction`이 불려 이 테스트가 실패한다.
 */
const mocks = vi.hoisted(() => ({
  toggleReaction: vi.fn(),
  postSessionComment: vi.fn(),
  editMyComment: vi.fn(),
  deleteMyComment: vi.fn(),
  getMergedSessionThread: vi.fn(),
}));
vi.mock("@/lib/social", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social")>()),
  ...mocks,
}));

import { buildExampleFeed } from "@/lib/domain/example-tour";
import { FeedItemCard } from "./feed-item";

afterEach(cleanup);
beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
});

const NOW = new Date("2026-11-26T12:00:00+09:00");

function minsu() {
  const item = buildExampleFeed(NOW).find((i) => i.sessionId === "example-session-minsu");
  if (!item) throw new Error("예시 대본에 민수 게시물이 없다");
  return item;
}

describe("FeedItemCard demo", () => {
  it("하트는 화면에서만 켜지고 서버에 보내지 않는다", () => {
    const item = minsu();
    render(<FeedItemCard item={item} userId="viewer" onProfileClick={() => {}} demo />);

    const heart = screen.getByRole("button", { name: `좋아요 ${item.likers.length}` });
    expect(heart.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(heart);

    const after = screen.getByRole("button", { name: `좋아요 ${item.likers.length + 1}` });
    expect(after.getAttribute("aria-pressed")).toBe("true");
    expect(mocks.toggleReaction).not.toHaveBeenCalled();
  });

  it("댓글은 읽기만 된다 — 입력칸·답글 달기가 없고 안내 문구가 있다", () => {
    const item = minsu();
    const { container } = render(
      <FeedItemCard item={item} userId="viewer" onProfileClick={() => {}} demo openComments />,
    );

    // 대본의 댓글 본문이 실제로 그려졌다
    expect(container.textContent).toContain("내일 계단 조심");
    expect(container.textContent).toContain("다 봉부터 시작함");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("답글 달기")).toBeNull();
    expect(screen.getByText(/예시 게시물이라 댓글은 달 수 없어요/)).toBeTruthy();
    expect(mocks.postSessionComment).not.toHaveBeenCalled();
  });

  it("접힌 카드에서 댓글 버튼을 누르면 펼쳐진다 (onItemChange 없이도)", () => {
    const item = minsu();
    render(<FeedItemCard item={item} userId="viewer" onProfileClick={() => {}} demo />);
    expect(screen.queryByText(/내일 계단 조심/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^댓글 \d+개$/ }));
    expect(screen.getByText(/내일 계단 조심/)).toBeTruthy();
  });

  it("'이 운동 따라하기'를 그리지 않는다 — 가짜 세션 id로 기록 화면에 가면 안 된다", () => {
    const item = minsu();
    render(<FeedItemCard item={item} userId="viewer" onProfileClick={() => {}} demo />);
    fireEvent.click(screen.getByRole("button", { name: `${item.nickname} 운동 상세` }));
    expect(screen.queryByText("이 운동 따라하기")).toBeNull();
  });

  it("사진 두 장짜리 게시물은 두 장 다 그린다", () => {
    const item = minsu();
    const { container } = render(
      <FeedItemCard item={item} userId="viewer" onProfileClick={() => {}} demo />,
    );
    const imgs = within(container).getAllByRole("img", { name: /인증사진/ });
    expect(imgs.length).toBe(2);
  });

  it("demo가 없으면(진짜 피드) 하트가 서버로 간다 — 위 단언이 진짜인지 확인", () => {
    mocks.toggleReaction.mockResolvedValue(undefined);
    const item = minsu();
    render(<FeedItemCard item={item} userId="viewer" onProfileClick={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: `좋아요 ${item.likers.length}` }));
    expect(mocks.toggleReaction).toHaveBeenCalledTimes(1);
  });
});
