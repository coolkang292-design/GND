// @vitest-environment jsdom

/**
 * 새 챌린지 만들기 (2026-09-18).
 *
 * 옛 `setup-sheet.test.tsx`의 만들기 부분과 `start-card.test.tsx`(챌린지가 없을 때의
 * 첫 화면)를 대체한다. 옛 두 화면이 지키던 것 중 여전히 참인 것:
 *   · 이름칸은 비어 있고 바로 포커스된다
 *   · 오늘 시작은 못 만든다 — 막을 때 **이유**를 말한다(초대가 닫힌다)
 *   · 경고문은 스크롤 밖·버튼 옆
 *   · 행동 전에 KPI·전원 설정 게이트를 설명하지 않는다
 *   · `친구`가 화면에 있다 / 혼자 시작하는 탈출구가 있다
 *   · 만드는 중에는 버튼을 잠근다(두 번 누르면 빈 챌린지가 둘 생긴다)
 * 옛 "친구부터 부르기"(방을 기본값으로 만들고 곧바로 공유 시트)는 **대체됐다** —
 * 이제 `아는 사람끼리`를 고르면 완료 화면의 대표 버튼이 공유다. 곧바로 공유하면
 * `await` 뒤라 브라우저가 제스처가 끝났다고 보고 공유 시트를 거절할 수 있다.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChallengeRoom: vi.fn(),
  setChallengeDiscoverable: vi.fn(),
  setChallengeRecruitImage: vi.fn(),
  uploadRecruitPhoto: vi.fn(),
  recordFunnelEvent: vi.fn(),
  shareChallengeInvite: vi.fn(),
}));

vi.mock("@/lib/challenge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challenge")>();
  return {
    ...actual,
    createChallengeRoom: mocks.createChallengeRoom,
    setChallengeDiscoverable: mocks.setChallengeDiscoverable,
    setChallengeRecruitImage: mocks.setChallengeRecruitImage,
  };
});
vi.mock("@/lib/avatar", () => ({ uploadRecruitPhoto: mocks.uploadRecruitPhoto }));
vi.mock("@/lib/analytics-events", () => ({ recordFunnelEvent: mocks.recordFunnelEvent }));
vi.mock("@/lib/challenge-share", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/challenge-share")>();
  return { ...actual, shareChallengeInvite: mocks.shareChallengeInvite };
});

import { CreateChallengeFlow } from "./create-challenge-flow";

const ROOM = {
  id: "room-1",
  group_id: "grp",
  name: "30일 아침 운동",
  start_date: "2026-09-21",
  end_date: "2026-10-18",
  photo_required: true,
  status: "setup",
  created_by: "me",
  created_at: "2026-09-18T00:00:00Z",
  invite_code: "GND-ABCDE",
  discoverable: false,
  recruit_note: null,
  recruit_image_url: null,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createChallengeRoom.mockResolvedValue(ROOM);
  mocks.setChallengeDiscoverable.mockResolvedValue(undefined);
  mocks.setChallengeRecruitImage.mockResolvedValue(undefined);
  mocks.uploadRecruitPhoto.mockResolvedValue("https://cdn.test/me/1.jpg");
  mocks.shareChallengeInvite.mockResolvedValue({ outcome: "copied", url: "https://x.app/challenge?join=GND-ABCDE&by=me" });
});

function renderFlow() {
  const props = {
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onSetGoal: vi.fn(),
  };
  render(<CreateChallengeFlow userId="me" todayKey="2026-09-18" {...props} />);
  return props;
}

const nameInput = () => screen.getByLabelText("챌린지 이름") as HTMLInputElement;
const createButton = () => screen.getByRole("button", { name: "챌린지 만들기" });

function fillName(v = "30일 아침 운동") {
  fireEvent.change(nameInput(), { target: { value: v } });
}

describe("입력 — 이름 · 기간 · 누구와, 셋뿐이다", () => {
  it("이름칸은 비어 있고 바로 포커스된다", () => {
    renderFlow();
    expect(nameInput().value).toBe("");
    expect(document.activeElement).toBe(nameInput());
  });

  it("기본은 4주, 3일 뒤 시작, 누구나 참여", () => {
    renderFlow();
    expect(screen.getByRole("radio", { name: "4주" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/9월 21일 ~ 10월 18일/)).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: /누구나 참여/ }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("목표는 여기서 묻지 않는다 — 생성과 개인 목표는 따로다", () => {
    renderFlow();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("KPI");
    expect(text).not.toContain("목표 추가");
    expect(text).not.toContain("전원");
    expect(screen.queryByLabelText("주간 목표")).toBeNull();
  });

  it("'친구'가 화면에 있고, 혼자 시작하는 탈출구도 있다", () => {
    renderFlow();
    expect(document.body.textContent).toContain("친구");
    expect(screen.getByRole("radio", { name: /나 혼자 먼저/ })).toBeTruthy();
  });

  it("이름이 없으면 막고, 경고는 스크롤 밖·버튼 옆에 뜬다", () => {
    renderFlow();
    fireEvent.click(createButton());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("챌린지 이름을 입력하세요");
    expect(alert.closest(".overflow-y-auto")).toBeNull();
    expect(alert.parentElement).toBe(createButton().parentElement);
    expect(mocks.createChallengeRoom).not.toHaveBeenCalled();
  });

  it("이름은 20자까지다", () => {
    renderFlow();
    expect(nameInput().maxLength).toBe(20);
  });

  it("만들기 화면을 열었다는 퍼널 이벤트를 남긴다 (0109)", () => {
    renderFlow();
    expect(mocks.recordFunnelEvent).toHaveBeenCalledWith("challenge_create_started", "me");
  });
});

describe("기간 — 오늘 시작은 만들 수 없다", () => {
  it("2주를 고르면 14일, 시작일을 내일로 바꿀 수 있다", async () => {
    renderFlow();
    fillName();
    fireEvent.click(screen.getByRole("radio", { name: "2주" }));
    fireEvent.click(screen.getByRole("button", { name: "시작일 바꾸기" }));
    fireEvent.click(screen.getByRole("radio", { name: "내일 시작" }));
    await act(async () => fireEvent.click(createButton()));
    expect(mocks.createChallengeRoom).toHaveBeenCalledWith({
      name: "30일 아침 운동",
      startDate: "2026-09-19",
      endDate: "2026-10-02",
    });
  });

  it("직접 날짜로 오늘을 넣으면 막고 **이유**를 말한다", () => {
    renderFlow();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: "시작일 바꾸기" }));
    fireEvent.click(screen.getByRole("button", { name: "직접 날짜 설정" }));
    const start = screen.getByLabelText("시작일") as HTMLInputElement;
    expect(start.min).toBe("2026-09-19");
    fireEvent.change(start, { target: { value: "2026-09-18" } });
    fireEvent.click(createButton());
    expect(screen.getByRole("alert").textContent).toContain("초대가 닫혀서");
    expect(mocks.createChallengeRoom).not.toHaveBeenCalled();
  });
});

describe("누구와 — 기존 기능에 옮겨 담는다", () => {
  it("누구나 참여 → 방을 만들고 공개 모집을 켠다 (discoverable = true)", async () => {
    const props = renderFlow();
    fillName();
    await act(async () => fireEvent.click(createButton()));
    expect(mocks.setChallengeDiscoverable).toHaveBeenCalledWith("room-1", true);
    expect(props.onCreated).toHaveBeenCalled();
    expect(screen.getByText("챌린지가 만들어졌어요")).toBeTruthy();
    expect(screen.getByText(/모집 시작됨/)).toBeTruthy();
    // 대표 버튼은 내 목표 정하기
    fireEvent.click(screen.getByRole("button", { name: "내 목표 정하기" }));
    expect(props.onSetGoal).toHaveBeenCalledWith("room-1");
  });

  it("공개 모집이 이미 하나 열려 있으면 방은 두고 이유를 말한다 — 되돌리지 않는다", async () => {
    mocks.setChallengeDiscoverable.mockRejectedValue(new Error("recruit_already_open"));
    renderFlow();
    fillName();
    await act(async () => fireEvent.click(createButton()));
    expect(screen.getByText("챌린지가 만들어졌어요")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("이미 공개 모집 중인 챌린지가 있어서");
    expect(screen.queryByText(/모집 시작됨/)).toBeNull();
  });

  it("아는 사람끼리 → 비공개, 완료 화면의 대표 버튼이 친구 초대(링크 공유)다", async () => {
    renderFlow();
    fillName();
    fireEvent.click(screen.getByRole("radio", { name: /아는 사람끼리/ }));
    await act(async () => fireEvent.click(createButton()));
    expect(mocks.setChallengeDiscoverable).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "친구 초대하기" })));
    expect(mocks.shareChallengeInvite).toHaveBeenCalledWith({
      challengeId: "room-1",
      challengeName: "30일 아침 운동",
      inviteCode: "GND-ABCDE",
      userId: "me",
    });
    expect(screen.getByText(/초대 링크를 복사했어요/)).toBeTruthy();
  });

  it("나 혼자 먼저 → 비공개로 바로 끝난다", async () => {
    renderFlow();
    fillName();
    fireEvent.click(screen.getByRole("radio", { name: /나 혼자 먼저/ }));
    await act(async () => fireEvent.click(createButton()));
    expect(mocks.setChallengeDiscoverable).not.toHaveBeenCalled();
    expect(screen.getByText("챌린지가 만들어졌어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "내 목표 정하기" })).toBeTruthy();
  });

  it("완료 화면은 시작일과 알림을 말한다 (D4)", async () => {
    renderFlow();
    fillName();
    await act(async () => fireEvent.click(createButton()));
    expect(screen.getByText(/모집 기간 3일 · 9월 21일에 자동으로 시작해요/)).toBeTruthy();
    expect(screen.getByText(/시작일을 알림으로 알려드려요/)).toBeTruthy();
  });
});

describe("만드는 중", () => {
  it("버튼을 잠그고 무슨 일이 일어나는지 말한다 — 두 번 누르면 빈 챌린지가 둘 생긴다", async () => {
    let finish!: (v: typeof ROOM) => void;
    mocks.createChallengeRoom.mockReturnValue(new Promise((r) => (finish = r)));
    renderFlow();
    fillName();
    fireEvent.click(createButton());
    const busy = screen.getByRole("button", { name: "만드는 중…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(mocks.createChallengeRoom).toHaveBeenCalledTimes(1);
    await act(async () => finish(ROOM));
    await waitFor(() => expect(screen.getByText("챌린지가 만들어졌어요")).toBeTruthy());
  });
});


/*
  챌린지 사진 (2026-09-18 사용자 지시 — "챌린지 만들 때도 사진을 추가하게 해야지").

  시안은 목록 카드·상세가 전부 사진인데, 넣을 자리가 `⋯ 관리` 안에만 있었다.
*/
describe("챌린지 사진 — 만들 때 넣는다", () => {
  const photoInput = () =>
    document.querySelector('input[type="file"]') as HTMLInputElement;

  function pick() {
    const file = new File(["x"], "hero.jpg", { type: "image/jpeg" });
    Object.defineProperty(photoInput(), "files", { value: [file], configurable: true });
    fireEvent.change(photoInput());
  }

  it("사진 칸이 있고, 안 넣어도 만들 수 있다 — 선택이다", async () => {
    renderFlow();
    expect(screen.getByText("챌린지 사진 넣기")).toBeTruthy();
    expect(photoInput()).toBeTruthy();
    fillName();
    await act(async () => {
      fireEvent.click(createButton());
    });
    expect(mocks.createChallengeRoom).toHaveBeenCalledTimes(1);
    expect(mocks.setChallengeRecruitImage).not.toHaveBeenCalled();
  });

  it("고르면 **그 자리에서 올린다** — 저장 버튼을 기다리지 않는다", async () => {
    renderFlow();
    await act(async () => {
      pick();
    });
    expect(mocks.uploadRecruitPhoto).toHaveBeenCalledTimes(1);
    // 올라간 실제 URL만 그린다. createObjectURL로 앞당기면 업로드가 실패했는데
    // 성공한 것처럼 보인다.
    await waitFor(() => {
      expect(document.querySelector('img[src="https://cdn.test/me/1.jpg"]')).toBeTruthy();
    });
  });

  it("방을 만든 **뒤에** 사진을 적는다 — 그 전에는 챌린지 id가 없다", async () => {
    renderFlow();
    await act(async () => {
      pick();
    });
    fillName();
    await act(async () => {
      fireEvent.click(createButton());
    });
    expect(mocks.setChallengeRecruitImage).toHaveBeenCalledWith(
      ROOM.id,
      "https://cdn.test/me/1.jpg",
    );
    expect(mocks.createChallengeRoom.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setChallengeRecruitImage.mock.invocationCallOrder[0],
    );
  });

  it("⚠️ 사진 저장이 실패해도 방은 되돌리지 않는다 — 이유만 말한다", async () => {
    mocks.setChallengeRecruitImage.mockRejectedValue(new Error("42501"));
    const props = renderFlow();
    await act(async () => {
      pick();
    });
    fillName();
    await act(async () => {
      fireEvent.click(createButton());
    });
    expect(props.onCreated).toHaveBeenCalledTimes(1);
    // ⚠️ `notice`가 아니라 **완료 화면**에서 말해야 한다 — 만들자마자 화면이
    //    넘어가고 그 화면은 notice를 그리지 않는다.
    expect(screen.getByText(/사진은 저장하지 못했어요/)).toBeTruthy();
  });

  it("업로드가 실패하면 말하고, 사진 없이 계속 갈 수 있다", async () => {
    mocks.uploadRecruitPhoto.mockRejectedValue(new Error("사진이 너무 커요 (20MB 이하)"));
    renderFlow();
    await act(async () => {
      pick();
    });
    expect(screen.getByText(/사진이 너무 커요/)).toBeTruthy();
    fillName();
    await act(async () => {
      fireEvent.click(createButton());
    });
    expect(mocks.createChallengeRoom).toHaveBeenCalledTimes(1);
    expect(mocks.setChallengeRecruitImage).not.toHaveBeenCalled();
  });
});
