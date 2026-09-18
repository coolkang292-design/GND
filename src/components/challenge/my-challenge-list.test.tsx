// @vitest-environment jsdom

/**
 * 내 챌린지 목록 (2026-09-18).
 *
 * 옛 `challenge-picker.test.tsx`(가로 칩)를 대체한다. 칩이 지키던 것 중 여전히
 * 참인 것: 여러 챌린지를 **전부** 보여준다 · 초대받은 챌린지는 상태 대신 초대
 * 표시가 붙는다 · 0개여도 터지지 않는다. "선택된 칩 하나에만 aria-current"는
 * **의미가 없어졌다** — 고르는 대신 카드마다 상세로 들어간다.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyChallenge } from "@/lib/challenge";
import { MyChallengeList } from "./my-challenge-list";

afterEach(cleanup);

function ch(over: Partial<MyChallenge> & { id: string; name: string }): MyChallenge {
  return {
    group_id: "grp",
    start_date: "2026-09-21",
    end_date: "2026-10-18",
    photo_required: true,
    status: "setup",
    created_by: "me",
    created_at: "2026-09-18T00:00:00Z",
    invite_code: "GND-AAAAA",
    discoverable: false,
    recruit_note: null,
    recruit_image_url: null,
    myRole: "host",
    myStatus: "joined",
    ...over,
  };
}

function renderList(list: MyChallenge[], goalIds: string[] = []) {
  const onOpen = vi.fn();
  const onSetGoal = vi.fn();
  render(
    <MyChallengeList
      challenges={list}
      goalChallengeIds={new Set(goalIds)}
      todayKey="2026-09-27"
      onOpen={onOpen}
      onSetGoal={onSetGoal}
    />,
  );
  return { onOpen, onSetGoal };
}

describe("MyChallengeList", () => {
  const list = [
    ch({ id: "a", name: "30일 아침 운동", status: "active", start_date: "2026-09-21" }),
    ch({ id: "s1", name: "매일 1만 걸음", status: "setup", start_date: "2026-10-01" }),
    ch({ id: "s2", name: "주 3회 헬스", status: "setup", start_date: "2026-10-03" }),
    ch({ id: "i", name: "초대 챌린지", status: "setup", myStatus: "invited", myRole: "member" }),
    ch({ id: "e", name: "지난 챌린지", status: "ended", end_date: "2026-09-10" }),
  ];

  it("상태별 칸에 전부 보여준다 — 칩으로 하나만 고르게 하지 않는다", () => {
    renderList(list, ["s2"]);
    for (const name of ["진행 중", "준비 중", "초대받음", "종료"]) {
      expect(screen.getByRole("region", { name })).toBeTruthy();
    }
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("진행 중 카드: DAY 7 / 28, 대표 버튼은 기록 화면으로 가는 링크", () => {
    renderList(list);
    const card = screen.getByRole("region", { name: "진행 중" });
    expect(within(card).getByText("DAY 7 / 28")).toBeTruthy();
    const link = within(card).getByText("오늘 운동하기");
    expect(link.getAttribute("href")).toBe("/record");
  });

  it("준비 중: 목표가 없으면 '내 목표 정하기', 있으면 '시작 준비 보기'", () => {
    const { onSetGoal, onOpen } = renderList(list, ["s2"]);
    const setup = screen.getByRole("region", { name: "준비 중" });
    fireEvent.click(within(setup).getByRole("button", { name: "내 목표 정하기" }));
    expect(onSetGoal).toHaveBeenCalledWith("s1");
    fireEvent.click(within(setup).getByRole("button", { name: "시작 준비 보기" }));
    expect(onOpen).toHaveBeenCalledWith("s2");
  });

  it("초대받은 챌린지는 초대 표시와 '초대 확인'이 붙는다", () => {
    const { onOpen } = renderList(list);
    const inv = screen.getByRole("region", { name: "초대받음" });
    expect(within(inv).getByText(/초대받았어요/)).toBeTruthy();
    fireEvent.click(within(inv).getByRole("button", { name: "초대 확인" }));
    expect(onOpen).toHaveBeenCalledWith("i");
  });

  it("종료: 결과 보기", () => {
    renderList(list);
    const ended = screen.getByRole("region", { name: "종료" });
    expect(within(ended).getByRole("button", { name: "결과 보기" })).toBeTruthy();
  });

  it("카드를 누르면 상세가 열린다", () => {
    const { onOpen } = renderList(list);
    fireEvent.click(screen.getByRole("button", { name: "30일 아침 운동 열기" }));
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("0개여도 터지지 않는다", () => {
    renderList([]);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});
