// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeActivityItem } from "@/lib/challenge";

const mocks = vi.hoisted(() => ({
  getChallengeActivity: vi.fn(),
  sendCheer: vi.fn(),
}));

vi.mock("@/lib/challenge", () => ({
  getChallengeActivity: mocks.getChallengeActivity,
}));
vi.mock("@/lib/social", () => ({ sendCheer: mocks.sendCheer }));
vi.mock("@/components/avatar", () => ({
  Avatar: ({ src }: { src: string | null }) => <span>{src}</span>,
}));

import { ChallengeActivity } from "./challenge-activity";

function item(over: Partial<ChallengeActivityItem> = {}): ChallengeActivityItem {
  return {
    session_id: "s1",
    user_id: "u1",
    nickname: "철수",
    avatar_url: "🦍",
    status: "active",
    title: null,
    workout_type: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    has_photo: false,
    cheer_count: 0,
    my_cheers: 0,
    is_mine: false,
    ...over,
  };
}

beforeEach(() => {
  mocks.getChallengeActivity.mockReset();
  mocks.sendCheer.mockReset();
});

// ⚠️ 안 지우면 앞 테스트의 DOM이 남아 findByText가 엉뚱한 것을 잡는다
afterEach(cleanup);

describe("ChallengeActivity", () => {
  it("참가자의 운동을 그리고 응원 버튼을 준다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([item()]);
    render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText("철수")).toBeTruthy();
    expect(screen.getByLabelText("철수님 응원하기")).toBeTruthy();
  });

  it("⚠️ 자기 운동에는 응원 버튼을 그리지 않는다 — 눌러서 실패하는 버튼 금지", async () => {
    mocks.getChallengeActivity.mockResolvedValue([
      item({ is_mine: true, nickname: "내운동주인" }),
    ]);
    render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText("내운동주인")).toBeTruthy();
    expect(screen.queryByLabelText("내운동주인님 응원하기")).toBeNull();
  });

  it("⚠️ 완료된 운동에는 응원 버튼이 없다 — 서버가 not_active로 막는다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([
      item({ status: "completed", completed_at: new Date().toISOString() }),
    ]);
    render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText(/운동 완료/)).toBeTruthy();
    expect(screen.queryByLabelText("철수님 응원하기")).toBeNull();
  });

  it("응원을 3번 다 보냈으면 버튼이 잠긴다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([item({ my_cheers: 3 })]);
    render(<ChallengeActivity challengeId="c1" />);
    const btn = (await screen.findByLabelText(
      "철수님 응원하기",
    )) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("아무 운동도 없으면 빈 상태를 말한다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([]);
    render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText(/아직 이 챌린지에서 올라온 운동이 없어요/)).toBeTruthy();
  });

  it("⚠️ 챌린지가 끝나면 닫힌다는 것과 크루 신청 경로를 안내한다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([item()]);
    render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText(/챌린지가 끝나면/)).toBeTruthy();
    expect(screen.getByText(/크루로 신청/)).toBeTruthy();
  });

  it("서버가 막으면(빈 배열) 화면이 죽지 않는다", async () => {
    // get_challenge_activity는 ended면 challenge_not_found를 던지고,
    // 클라이언트 래퍼가 그걸 빈 배열로 눕힌다 — 챌린지 화면 전체가 죽으면 안 된다.
    mocks.getChallengeActivity.mockResolvedValue([]);
    expect(() => render(<ChallengeActivity challengeId="c1" />)).not.toThrow();
  });
});

/** n명의 운동 중 행 — 응원 버튼이 있어 펼침 상태 테스트에 쓴다 */
function activeRows(n: number): ChallengeActivityItem[] {
  return Array.from({ length: n }, (_, i) =>
    item({ session_id: `s${i + 1}`, user_id: `u${i + 1}`, nickname: `사람${i + 1}` }),
  );
}

/** 한 사람의 완료 운동 n개 */
function doneRows(
  n: number,
  over: Partial<ChallengeActivityItem>,
): ChallengeActivityItem[] {
  return Array.from({ length: n }, (_, i) =>
    item({
      session_id: `${over.user_id}-${i}`,
      // 아바타 목(mock)이 src를 글자로 그린다 — 줄 글자 비교가 흐려지지 않게 비운다
      avatar_url: null,
      status: "completed",
      completed_at: new Date().toISOString(),
      ...over,
    }),
  );
}

/** 활동 목록(ul)의 줄 수 — TOP 3(ol)의 줄은 세지 않는다 */
function listRows(container: HTMLElement) {
  return container.querySelectorAll("ul > li").length;
}

describe("ChallengeActivity — 최근 5개 + 펼쳐보기", () => {
  it("7개면 5개만 보이고, 더 보기로 전부 펼치고, 접기로 다시 5개가 된다", async () => {
    mocks.getChallengeActivity.mockResolvedValue(activeRows(7));
    const { container } = render(<ChallengeActivity challengeId="c1" />);

    const more = await screen.findByRole("button", { name: "활동 2개 더 보기 ▼" });
    expect(listRows(container)).toBe(5);
    expect(screen.queryByText("사람6")).toBeNull();
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);
    expect(listRows(container)).toBe(7);
    expect(screen.getByText("사람7")).toBeTruthy();
    const fold = screen.getByRole("button", { name: "접기 ▲" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(fold);
    expect(listRows(container)).toBe(5);
  });

  it("5개 이하면 전부 보이고 '더 보기'가 없다", async () => {
    mocks.getChallengeActivity.mockResolvedValue(activeRows(5));
    const { container } = render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText("사람5")).toBeTruthy();
    expect(listRows(container)).toBe(5);
    expect(screen.queryByText(/더 보기/)).toBeNull();
  });

  it("⚠️ 펼친 채 응원을 보내면 목록이 다시 접히지 않는다", async () => {
    mocks.getChallengeActivity.mockResolvedValue(activeRows(7));
    mocks.sendCheer.mockResolvedValue(undefined);
    const { container } = render(<ChallengeActivity challengeId="c1" />);

    fireEvent.click(await screen.findByRole("button", { name: /더 보기/ }));
    // 펼쳐야만 보이는 7번째 줄을 응원한다
    fireEvent.click(screen.getByLabelText("사람7님 응원하기"));

    expect(await screen.findByText(/사람7님에게 응원을 보냈어요/)).toBeTruthy();
    // 초기 조회 1번 + 응원 뒤 재조회 1번
    await waitFor(() => expect(mocks.getChallengeActivity).toHaveBeenCalledTimes(2));
    expect(listRows(container)).toBe(7);
    expect(screen.getByRole("button", { name: "접기 ▲" })).toBeTruthy();
  });
});

describe("ChallengeActivity — 활동 TOP 3", () => {
  async function top3() {
    const heading = await screen.findByText("활동 TOP 3");
    return within(heading.closest("div")!.parentElement!);
  }

  it("등수와 완료 운동 횟수를 같이 보여준다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([
      ...doneRows(1, { user_id: "c", nickname: "민수" }),
      ...doneRows(3, { user_id: "a", nickname: "철수" }),
      ...doneRows(2, { user_id: "b", nickname: "영희", is_mine: true }),
    ]);
    render(<ChallengeActivity challengeId="c1" />);
    const box = await top3();

    const rows = box.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["1위철수3회", "2위영희나2회", "3위민수1회"]);
    expect(box.getByText("공개한 완료 운동 기준")).toBeTruthy();
  });

  it("⚠️ 접힌 목록이 아니라 받은 목록 전체로 센다", async () => {
    // 철수 완료 6개 → 접으면 목록엔 5줄뿐이지만 횟수는 6이어야 한다
    mocks.getChallengeActivity.mockResolvedValue(
      doneRows(6, { user_id: "a", nickname: "철수" }),
    );
    const { container } = render(<ChallengeActivity challengeId="c1" />);
    const box = await top3();
    expect(listRows(container)).toBe(5);
    expect(box.getByText("6회")).toBeTruthy();
  });

  it("⚠️ 운동 중인 행은 세지 않는다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([
      ...doneRows(1, { user_id: "a", nickname: "철수" }),
      item({ session_id: "live", user_id: "a", nickname: "철수" }),
    ]);
    render(<ChallengeActivity challengeId="c1" />);
    const box = await top3();
    expect(box.getByText("1회")).toBeTruthy();
    expect(box.queryByText("2회")).toBeNull();
  });

  it("횟수가 같으면 '공동 N위'로 적는다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([
      ...doneRows(2, { user_id: "a", nickname: "철수" }),
      ...doneRows(2, { user_id: "b", nickname: "영희" }),
    ]);
    render(<ChallengeActivity challengeId="c1" />);
    const box = await top3();
    expect(box.getAllByText("공동 1위")).toHaveLength(2);
  });

  it("완료한 운동이 없으면 TOP 3를 그리지 않는다", async () => {
    mocks.getChallengeActivity.mockResolvedValue([item()]);
    render(<ChallengeActivity challengeId="c1" />);
    expect(await screen.findByText("철수")).toBeTruthy();
    expect(screen.queryByText("활동 TOP 3")).toBeNull();
  });

  it("서버 상한(200개)에 닿으면 최근 200개 안에서 셌다고 말한다", async () => {
    mocks.getChallengeActivity.mockResolvedValue(
      doneRows(200, { user_id: "a", nickname: "철수" }),
    );
    render(<ChallengeActivity challengeId="c1" />);
    const box = await top3();
    expect(box.getByText(/최근 200개 안에서 셌어요/)).toBeTruthy();
  });

  it("200개 미만이면 그 말을 하지 않는다", async () => {
    mocks.getChallengeActivity.mockResolvedValue(
      doneRows(199, { user_id: "a", nickname: "철수" }),
    );
    render(<ChallengeActivity challengeId="c1" />);
    await top3();
    expect(screen.queryByText(/안에서 셌어요/)).toBeNull();
  });
});
