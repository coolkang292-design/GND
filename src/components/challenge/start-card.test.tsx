// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeStartCard } from "./start-card";

afterEach(cleanup);

function setup(over: Partial<Parameters<typeof ChallengeStartCard>[0]> = {}) {
  const onInviteFirst = vi.fn();
  const onCreateAlone = vi.fn();
  render(
    <ChallengeStartCard
      busy={false}
      onInviteFirst={onInviteFirst}
      onCreateAlone={onCreateAlone}
      {...over}
    />,
  );
  return { onInviteFirst, onCreateAlone };
}

describe("첫 화면이 하는 말", () => {
  it("결과부터 말한다 — 무엇을 하면 무엇이 되는가", () => {
    setup();
    expect(screen.getByText("친구부터 부르면 시작돼요")).toBeTruthy();
  });

  it("다음 행동이 링크 하나뿐이라고 말한다", () => {
    setup();
    expect(document.body.textContent).toContain("링크 하나만 보내면");
  });

  it("폼이 사라진 게 아니라 **미뤄졌다는 약속**을 적는다", () => {
    // ⚠️ 이 문장을 빼지 마라. 이게 없으면 "기간·목표는 안 정해도 되나?"가 되고,
    //    나중에 목표 화면을 만났을 때 속았다고 느낀다.
    setup();
    expect(document.body.textContent).toContain("친구가 들어온 뒤");
  });
});

describe("옛 문구는 사라졌다 — 제거는 부정 확인이 증거다", () => {
  it("결핍으로 열지 않는다", () => {
    setup();
    expect(screen.queryByText("아직 진행 중인 챌린지가 없어요")).toBeNull();
  });

  it("행동 전에 KPI·전원 설정 게이트를 설명하지 않는다", () => {
    setup();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("KPI");
    expect(text).not.toContain("전원 설정 완료");
  });

  it("버튼이 작업량을 예고하지 않는다", () => {
    setup();
    expect(document.body.textContent).not.toContain("기간·목표 설정");
  });
});

describe("친구가 화면에 존재한다", () => {
  it("실측에서 0회였던 단어가 이제 나온다", () => {
    // 2026-08-17 실측: 옛 빈 화면의 단어 31개 중 `친구·초대·링크·카톡` 0회.
    setup();
    const text = document.body.textContent ?? "";
    expect(/친구/.test(text)).toBe(true);
    expect(/링크/.test(text)).toBe(true);
  });
});

describe("두 갈래", () => {
  it("주 버튼은 친구를 부른다", () => {
    const { onInviteFirst, onCreateAlone } = setup();
    fireEvent.click(screen.getByRole("button", { name: /친구 불러서 시작하기/ }));
    expect(onInviteFirst).toHaveBeenCalledTimes(1);
    expect(onCreateAlone).not.toHaveBeenCalled();
  });

  it("보조 버튼은 탈출구다 — 부를 친구가 지금 없는 사람을 막지 않는다", () => {
    const { onInviteFirst, onCreateAlone } = setup();
    fireEvent.click(screen.getByRole("button", { name: /혼자 먼저 만들어 둘게요/ }));
    expect(onCreateAlone).toHaveBeenCalledTimes(1);
    expect(onInviteFirst).not.toHaveBeenCalled();
  });

  it("주 버튼이 무엇을 하는지 라벨이 말한다 — 결과이지 작업량이 아니다", () => {
    setup();
    const btn = screen.getByRole("button", { name: /친구 불러서 시작하기/ });
    expect(btn.textContent).not.toContain("(");
  });
});

describe("만드는 중", () => {
  it("두 버튼 다 잠근다 — 두 번 누르면 빈 챌린지가 둘 생긴다", () => {
    setup({ busy: true });
    for (const b of screen.getAllByRole("button")) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("잠긴 동안 무슨 일이 일어나는지 말한다", () => {
    setup({ busy: true });
    expect(document.body.textContent).toContain("만드는 중");
  });
});
