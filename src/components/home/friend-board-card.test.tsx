// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FriendBoardBody,
  NoFriendsCard,
  pokeErrorMessage,
} from "./friend-board-card";
import {
  buildFriendRows,
  buildMyRow,
  foldFriendSessions,
  type FriendRow,
} from "@/lib/domain/friend-board";
import { SocialError } from "@/lib/social";

afterEach(cleanup);

const KST = "Asia/Seoul";
const NOW = new Date("2026-08-07T12:00:00Z"); // 2026-08-07(금) 21:00 KST

function rowsOf(
  crew: { id: string; nickname: string; totalXp?: number }[],
  options: {
    sessions?: { userId: string; completedAt: string; durationMinutes: number }[];
    active?: string[];
    /** [사용자, 총 배지 수, 썸네일 키들] */
    badges?: [string, number, string[]][];
  } = {},
): FriendRow[] {
  return buildFriendRows({
    crew: crew.map((c) => ({
      id: c.id,
      nickname: c.nickname,
      avatarUrl: null,
      totalXp: c.totalXp ?? 0,
    })),
    activity: foldFriendSessions(options.sessions ?? [], NOW, KST),
    badges: new Map(
      (options.badges ?? []).map(([id, total, keys]) => [
        id,
        { total, recentKeys: keys },
      ]),
    ),
    activeUserIds: new Set(options.active ?? []),
  });
}

/** 내 행 — 2026-08-07 사용자 지시로 목록 맨 위에 고정된다 */
function myRowOf(
  options: {
    nickname?: string;
    totalXp?: number;
    sessions?: { userId: string; completedAt: string; durationMinutes: number }[];
    badges?: [number, string[]];
    active?: boolean;
  } = {},
): FriendRow {
  return buildMyRow({
    me: {
      id: "me",
      nickname: options.nickname ?? "나야",
      avatarUrl: null,
      totalXp: options.totalXp ?? 0,
    },
    activity: foldFriendSessions(options.sessions ?? [], NOW, KST),
    badges: new Map(
      options.badges
        ? [["me", { total: options.badges[0], recentKeys: options.badges[1] }]]
        : [],
    ),
    activeUserIds: new Set(options.active ? ["me"] : []),
  });
}

function renderBody(
  rows: FriendRow[],
  overrides: Partial<Parameters<typeof FriendBoardBody>[0]> = {},
) {
  const props = {
    rows,
    myRow: null as FriendRow | null,
    poked: new Set<string>(),
    iWorkedOut: true,
    expanded: false,
    truncated: false,
    pokingId: null,
    onSelect: vi.fn(),
    onPoke: vi.fn(),
    onToggleExpand: vi.fn(),
    ...overrides,
  };
  render(<FriendBoardBody {...props} />);
  return props;
}

const FOUR = [
  { id: "u1", nickname: "친구하나" },
  { id: "u2", nickname: "친구둘" },
  { id: "u3", nickname: "친구셋" },
  { id: "u4", nickname: "친구넷" },
];

describe("FriendBoardBody — 기본 3명, 전체 보기", () => {
  it("친구가 4명이어도 접힌 상태에선 3행만 그린다", () => {
    renderBody(rowsOf(FOUR));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("펼치면 4행이 전부 나온다", () => {
    renderBody(rowsOf(FOUR), { expanded: true });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("'전체 보기'를 누르면 토글을 호출한다", () => {
    const props = renderBody(rowsOf(FOUR));
    fireEvent.click(screen.getByText("전체 보기 ›"));
    expect(props.onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("펼친 상태의 버튼은 '접기'이고 aria-expanded가 true다", () => {
    renderBody(rowsOf(FOUR), { expanded: true });
    const toggle = screen.getByText("접기");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("친구가 3명이면 '전체 보기'가 아예 없다 — 누를 게 없는 링크를 만들지 않는다", () => {
    renderBody(rowsOf(FOUR.slice(0, 3)));
    expect(screen.queryByText("전체 보기 ›")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("FriendBoardBody — 순위를 그리지 않는다 (사용자 확정 2026-08-07)", () => {
  it("메달·등수 표기가 하나도 없다", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={null}
        rows={rowsOf([
          { id: "u1", nickname: "친구하나", totalXp: 9000 },
          { id: "u2", nickname: "친구둘", totalXp: 10 },
        ])}
        poked={new Set()}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("🥇");
    expect(html).not.toContain("🥈");
    expect(html).not.toContain("🥉");
    expect(html).not.toMatch(/\d+위/);
  });
});

describe("FriendBoardBody — 네 숫자와 상태", () => {
  /**
   * ⚠️ `28회 · 21분 · 🏅6 · 🔥5`처럼 이어 붙이면 각 숫자가 뭔지 알 수 없다
   * (2026-08-07 사용자 지적). 값마다 무엇을 센 것인지 글자가 붙어야 한다.
   */
  it("지표마다 무엇을 센 것인지 글자로 적는다", () => {
    renderBody(
      rowsOf([{ id: "u1", nickname: "친구하나" }], {
        sessions: [
          { userId: "u1", completedAt: "2026-08-06T02:00:00Z", durationMinutes: 70 },
          { userId: "u1", completedAt: "2026-08-05T02:00:00Z", durationMinutes: 50 },
        ],
        badges: [["u1", 7, ["streak_5"]]],
      }),
    );
    expect(screen.getByText("운동")).toBeTruthy();
    expect(screen.getByText("2회")).toBeTruthy();
    expect(screen.getByText("시간")).toBeTruthy();
    expect(screen.getByText("2시간")).toBeTruthy();
    expect(screen.getByText("연속")).toBeTruthy();
    expect(screen.getByText("2일")).toBeTruthy();
  });

  /**
   * ⚠️ 2026-08-07 사용자 요청 "일자로 고정". 값이 0이라고 칩을 빼면 그 행만
   * 칸이 밀려 친구끼리 세로가 안 맞는다. 세 칸은 **항상** 그린다.
   */
  it("연속이 0일인 친구도 칸 수가 같다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "기록없음" }]));
    expect(screen.getByText("운동")).toBeTruthy();
    expect(screen.getByText("시간")).toBeTruthy();
    expect(screen.getByText("연속")).toBeTruthy();
    expect(screen.getByText("0일")).toBeTruthy();
  });

  it("지표 줄은 줄바꿈 없이 3칸으로 고정한다", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={null}
        rows={rowsOf([
          { id: "u1", nickname: "아주아주긴닉네임을가진친구" },
          { id: "u2", nickname: "짧은" },
        ])}
        poked={new Set()}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    const grids = container.querySelectorAll(".grid-cols-3");
    expect(grids).toHaveLength(2); // 친구 수만큼, 닉네임 길이와 무관
    grids.forEach((g) => expect(g.children).toHaveLength(3));
    expect(container.innerHTML).not.toContain("flex-wrap");
  });

  /** 2026-08-07 사용자 지적 — 🏅 이모지 + 숫자가 아니라 실제 배지 그림 */
  it("배지를 이모지가 아니라 실제 그림으로 그린다", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={null}
        rows={rowsOf([{ id: "u1", nickname: "친구하나" }], {
          badges: [["u1", 7, ["streak_5", "volume_1t"]]],
        })}
        poked={new Set()}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    const srcs = [...container.querySelectorAll("img")].map((i) =>
      i.getAttribute("src"),
    );
    expect(srcs.some((s) => s?.includes("streak_5.png"))).toBe(true);
    expect(srcs.some((s) => s?.includes("volume_1t.png"))).toBe(true);
    expect(container.innerHTML).not.toContain("🏅");
    // 썸네일 2개 + 나머지 5개
    expect(screen.getByText("+5")).toBeTruthy();
    expect(screen.getByText("배지 7개")).toBeTruthy();
  });

  it("배지 수를 못 받으면 개수를 0으로 속이지 않는다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나" }]));
    expect(screen.getByText(/불러오는 중/)).toBeTruthy();
    expect(screen.queryByText("배지 0개")).toBeNull();
  });

  it("배지가 정말 0개면 그렇게 말한다", () => {
    renderBody(
      rowsOf([{ id: "u1", nickname: "친구하나" }], { badges: [["u1", 0, []]] }),
    );
    expect(screen.getByText("아직 배지가 없어요")).toBeTruthy();
  });

  it("레벨을 total_xp로 계산해 표시한다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나", totalXp: 0 }]));
    expect(screen.getByText("Lv.1")).toBeTruthy();
  });

  /** 2026-08-07 사용자 요청 — 프로필 이모지가 아니라 현재 레벨의 캐릭터 */
  it("아바타 자리에 현재 레벨의 캐릭터 이미지를 쓴다", () => {
    renderBody(
      rowsOf([{ id: "u1", nickname: "친구하나", totalXp: 0 }]),
    );
    const img = screen.getByAltText(/캐릭터$/) as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("char-");
  });

  it("프로필 이모지를 아바타로 쓰지 않는다", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={null}
        rows={rowsOf([{ id: "u1", nickname: "친구하나" }])}
        poked={new Set()}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.innerHTML).not.toContain("👤");
  });

  it("상태 3단계를 글자로 적는다", () => {
    renderBody(
      rowsOf(
        [
          { id: "done", nickname: "완료친구" },
          { id: "active", nickname: "운동중친구" },
          { id: "idle", nickname: "쉬는친구" },
        ],
        {
          sessions: [
            { userId: "done", completedAt: "2026-08-07T02:00:00Z", durationMinutes: 30 },
          ],
          active: ["active"],
        },
      ),
      { expanded: true },
    );
    expect(screen.getByText("오늘 완료")).toBeTruthy();
    expect(screen.getByText("운동 중")).toBeTruthy();
    expect(screen.getByText("운동 전")).toBeTruthy();
  });

  /** 색만으로 구별하면 색을 못 보는 사람에게 상태가 사라진다 */
  it("상태를 색 점만이 아니라 글자로도 적는다", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={null}
        rows={rowsOf([{ id: "idle", nickname: "쉬는친구" }])}
        poked={new Set()}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    // 점은 장식이라 스크린리더에서 빠진다
    expect(container.querySelector("[aria-hidden]")).toBeTruthy();
    expect(screen.getByText("운동 전")).toBeTruthy();
  });
});

describe("FriendBoardBody — 콕 찌르기", () => {
  const idleAndDone = () =>
    rowsOf(
      [
        { id: "idle", nickname: "쉬는친구" },
        { id: "done", nickname: "완료친구" },
      ],
      {
        sessions: [
          { userId: "done", completedAt: "2026-08-07T02:00:00Z", durationMinutes: 30 },
        ],
      },
    );

  /**
   * ⚠️ 2026-08-07 사용자 화면 확인에서 잡힌 실버그의 회귀 방어.
   * 옛 크루 카드는 "상대가 오늘 운동 안 했을 때만" 콕을 보여 줬고 그 규칙을
   * 그대로 옮겼는데, **서버 `poke_user`에는 그런 조건이 없다**(0028은 *내가*
   * 오늘 했는지만 본다). 그 탓에 오늘 운동을 마친 친구는 영영 못 찔렀다.
   */
  it("오늘 운동을 마친 친구도 찌를 수 있다", () => {
    renderBody(idleAndDone(), { expanded: true });
    expect(screen.getByLabelText("쉬는친구 찌르기")).toBeTruthy();
    expect(screen.getByLabelText("완료친구 찌르기")).toBeTruthy();
  });

  it("운동 중인 친구도 찌를 수 있다", () => {
    renderBody(
      rowsOf([{ id: "a", nickname: "운동중친구" }], { active: ["a"] }),
      { expanded: true },
    );
    expect(screen.getByLabelText("운동중친구 찌르기")).toBeTruthy();
  });

  it("내가 오늘 운동 전이면 콕이 잠기고 안내가 뜬다", () => {
    renderBody(idleAndDone(), { iWorkedOut: false, expanded: true });
    const button = screen.getByLabelText("쉬는친구 찌르기") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/오늘 운동을 마치면/)).toBeTruthy();
  });

  it("내가 오늘 운동을 마쳤으면 콕이 눌리고 안내가 사라진다", () => {
    const props = renderBody(idleAndDone(), { expanded: true });
    const button = screen.getByLabelText("쉬는친구 찌르기") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText(/오늘 운동을 마치면/)).toBeNull();
    fireEvent.click(button);
    expect(props.onPoke).toHaveBeenCalledTimes(1);
  });

  it("이미 찌른 친구는 '✅ 찌름'으로 잠긴다", () => {
    renderBody(idleAndDone(), { expanded: true, poked: new Set(["idle"]) });
    expect(screen.getByLabelText("쉬는친구 찌름 완료")).toBeTruthy();
    expect(screen.queryByLabelText("쉬는친구 찌르기")).toBeNull();
  });

  it("행을 누르면 성과 시트를 연다 — 콕 버튼과 형제라 중첩되지 않는다", () => {
    const props = renderBody(idleAndDone(), { expanded: true });
    const open = screen.getByLabelText("쉬는친구 성과 보기");
    expect(open.querySelector("button")).toBeNull(); // 버튼 안에 버튼이 없다
    fireEvent.click(open);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("FriendBoardBody — 잘린 집계", () => {
  it("행 상한에 닿으면 숫자가 일부만 반영됐다고 말한다", () => {
    renderBody(rowsOf(FOUR), { truncated: true });
    expect(screen.getByText(/일부만 반영된 수치/)).toBeTruthy();
  });

  it("평소에는 그 문구가 없다", () => {
    renderBody(rowsOf(FOUR));
    expect(screen.queryByText(/일부만 반영된 수치/)).toBeNull();
  });
});

describe("NoFriendsCard", () => {
  it("친구가 없으면 크루 찾기로 보낸다", () => {
    render(<NoFriendsCard />);
    expect(screen.getByText("크루 찾으러 가기 ›").getAttribute("href")).toBe(
      "/crew",
    );
  });
});

/**
 * 내 행 (2026-08-07 사용자 지시 — "친구리스트 최상단에 각 유저 본인의 정보도
 * 표시해줘 다만 본인 계정에는 콕 찌르기가 없겟찌?").
 */
describe("내 행 — 맨 위에 고정, 콕은 없다", () => {
  it("친구들보다 먼저 그려진다", () => {
    renderBody(rowsOf(FOUR), { myRow: myRowOf({ nickname: "나야" }) });
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("나야");
    expect(items[1].textContent).toContain("친구");
  });

  /**
   * ⚠️ 접힌 상태에서 내 행이 친구 자리를 뺏으면 안 된다. 내 행은 `rows` 배열
   * **밖**에 있어서 3명 미리보기에 영향을 주지 않는다 — 그래서 li는 1 + 3 = 4개다.
   * 내 행을 `rows`에 섞었다면 여기서 3개가 되어 친구 하나가 사라졌을 것이다.
   */
  it("접힌 목록의 친구 3자리를 뺏지 않는다 — 내 행 1 + 친구 3", () => {
    renderBody(rowsOf(FOUR), { myRow: myRowOf() });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("헤딩의 '친구 N명'에 나를 세지 않는다", () => {
    renderBody(rowsOf(FOUR), { myRow: myRowOf() });
    expect(screen.getByText("친구 4명")).toBeTruthy();
  });

  /**
   * ⚠️ **부정 확인이 이 지시의 핵심이다.** 자기 자신은 찌를 수 없다 —
   * 서버 `poke_user`도 막지만, 누를 수 없는 버튼을 그려 놓고 에러 토스트로
   * 알리는 것은 화면이 거짓말을 하는 것이다.
   */
  it("내 행에는 콕 버튼이 없다", () => {
    renderBody([], { myRow: myRowOf({ nickname: "나야" }) });
    expect(screen.queryByLabelText("나야 찌르기")).toBeNull();
    expect(screen.queryByText("👉 콕")).toBeNull();
  });

  it("내 행에는 '✅ 찌름' 잠금 표시도 없다", () => {
    renderBody([], {
      myRow: myRowOf({ nickname: "나야" }),
      // 서버가 실수로 나를 찌른 목록에 넣어 보내도 화면은 흔들리지 않아야 한다
      poked: new Set(["me"]),
    });
    expect(screen.queryByText("✅ 찌름")).toBeNull();
  });

  it("내 행이라는 것을 글자로 말한다 — 아바타만으로는 모른다", () => {
    renderBody([], { myRow: myRowOf({ nickname: "나야" }) });
    expect(screen.getByText("나")).toBeTruthy();
  });

  it("친구와 같은 지표·배지·레벨을 같은 모양으로 그린다", () => {
    renderBody([], {
      myRow: myRowOf({
        totalXp: 640, // 진짜 레벨은 4다 (캐시 컬럼을 쓰면 3으로 보인다)
        sessions: [
          { userId: "me", completedAt: "2026-08-07T02:00:00Z", durationMinutes: 30 },
        ],
        badges: [6, ["streak_3"]],
      }),
    });
    expect(screen.getByText("Lv.4")).toBeTruthy();
    expect(screen.getByText("1회")).toBeTruthy();
    expect(screen.getByText("30분")).toBeTruthy();
    expect(screen.getByText("배지 6개")).toBeTruthy();
    expect(screen.getByText("오늘 완료")).toBeTruthy();
  });

  it("내 행을 누르면 성과 시트가 열린다 — 친구 행과 같다", () => {
    const props = renderBody([], { myRow: myRowOf({ nickname: "나야" }) });
    fireEvent.click(screen.getByLabelText("나야 성과 보기"));
    expect(props.onSelect).toHaveBeenCalledOnce();
  });

  it("내 행이 없으면(조회 전) 친구 목록만 그린다", () => {
    renderBody(rowsOf(FOUR), { myRow: null });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("pokeErrorMessage — 서버만 아는 실패를 문구로 옮긴다", () => {
  it("찌르기를 꺼 둔 상대는 미리 알 수 없어 서버 응답으로만 안다", () => {
    expect(pokeErrorMessage(new SocialError("pokes_disabled", "pokes_disabled"))).toBe(
      "상대가 찌르기 알림을 꺼 뒀어요",
    );
  });

  it("쿨다운·미운동·크루 아님에 각각 다른 문구를 준다", () => {
    expect(
      pokeErrorMessage(new SocialError("poke_cooldown", "poke_cooldown")),
    ).toContain("24시간");
    expect(
      pokeErrorMessage(
        new SocialError("poke_requires_workout", "poke_requires_workout"),
      ),
    ).toContain("오늘 운동을 마쳐야");
    expect(pokeErrorMessage(new SocialError("not_crew", "not_crew"))).toBe(
      "크루가 아니에요",
    );
  });

  it("모르는 오류는 뭉뚱그린다", () => {
    expect(pokeErrorMessage(new Error("boom"))).toBe(
      "찌르기를 보내지 못했어요",
    );
  });
});
