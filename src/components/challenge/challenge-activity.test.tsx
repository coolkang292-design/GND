// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
