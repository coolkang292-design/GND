// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FriendBoardBody, pokeErrorMessage } from "./friend-board-card";
import { StartWorkoutCta } from "./start-workout-cta";
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
        { total, showcaseKeys: keys },
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
        ? [["me", { total: options.badges[0], showcaseKeys: options.badges[1] }]]
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
    // ⚠️ 가짜 노드가 아니라 **진짜 CTA**를 넘긴다. 스텁으로 두면 실제 버튼의
    //    링크가 깨져도 이 파일의 단언이 전부 초록으로 남는다.
    cta: <StartWorkoutCta />,
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
    fireEvent.click(screen.getByText("전체 크루 보기 ›"));
    expect(props.onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("펼친 상태의 버튼은 '접기'이고 aria-expanded가 true다", () => {
    renderBody(rowsOf(FOUR), { expanded: true });
    const toggle = screen.getByText("접기");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("친구가 3명이면 '전체 보기'가 아예 없다 — 누를 게 없는 링크를 만들지 않는다", () => {
    renderBody(rowsOf(FOUR.slice(0, 3)));
    expect(screen.queryByText("전체 크루 보기 ›")).toBeNull();
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
        cta={<StartWorkoutCta />}
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

  it("지표 줄은 줄바꿈 없이 4칸으로 고정한다 — 상태·운동·시간·연속", () => {
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
        cta={<StartWorkoutCta />}
      />,
    );
    const grids = container.querySelectorAll("div.grid");
    expect(grids).toHaveLength(2); // 친구 수만큼, 닉네임 길이와 무관
    grids.forEach((g) => expect(g.children).toHaveLength(4));
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
        cta={<StartWorkoutCta />}
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
    expect(screen.getByText("개노답 Lv.1")).toBeTruthy();
  });

  /**
   * 2026-08-08 사용자 지시 — "친구 리스트에 지금 단계 즉 개노답 단계인지
   * 눈떴개 단계인지도 표시해줘". 설계 §6.
   *
   * ⚠️ 단계명을 **문자열 그대로** 단언한다. `getLevelProgress(...).stageName`으로
   * 기대값을 만들면 그 함수가 빈 문자열을 돌려줘도 통과한다 — 화면에서 단계가
   * 사라진 것을 잡지 못한다.
   *
   * ⚠️ 순서는 **단계명 → 레벨**이다 (사용자 지시 "개노답 LV2 이 순으로").
   */
  it("단계명을 앞, 레벨을 뒤에 한 알약으로 적는다 — 단계는 레벨과 따로 움직인다", () => {
    // 1000 XP = Lv.6 → 6~10레벨은 2단계 '눈떴개'. Lv.5까지가 '개노답'이다.
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나", totalXp: 1000 }]));
    expect(screen.getByText("눈떴개 Lv.6")).toBeTruthy();
    // 레벨만 있던 옛 표기가 남아 있으면 실패한다
    expect(screen.queryByText("Lv.6")).toBeNull();
  });

  /**
   * 2026-08-08 실측으로 확정한 **레이아웃 불변식**.
   *
   * 이름 줄은 `flex`이고 닉네임만 `flex-1`이라, 같은 줄에 무엇을 더 놓든 닉네임이
   * 그만큼 양보한다. 375px 실측(닉네임이 온전하려면 내 행 82px, 친구 행 81px):
   *
   * | 이름 줄 구성 | 내 행 | 친구 행 |
   * |---|---|---|
   * | 닉네임+단계+상태+콕 | 46 | **0** ← 닉네임이 사라진다 |
   * | 닉네임+단계+상태    | 50 | 68 |
   * | 닉네임+단계+콕+`›`  | 82 | 75 |
   * | 닉네임+단계+콕      | 82 | **81** ← 지금 |
   *
   * jsdom에는 레이아웃이 없어 폭을 직접 잴 수 없다. 대신 **원인이 되는 구조**를
   * 고정한다 — 상태가 이름 줄로 돌아오거나 `›`가 되살아나면 실패한다.
   */
  it("이름 줄에는 닉네임·나·단계·콕만 둔다 — 상태와 › 를 넣지 않는다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "아주아주긴닉네임입니다" }]));
    const nameRow = screen.getByLabelText("아주아주긴닉네임입니다 성과 보기")
      .parentElement!;
    // 상태는 지표 줄로 갔다
    expect(nameRow.contains(screen.getByText("운동 전"))).toBe(false);
    // 콕은 이름 줄에 **있다** (2026-08-08 사용자 지시 "찌름은 상단으로")
    expect(
      nameRow.contains(screen.getByLabelText("아주아주긴닉네임입니다 찌르기")),
    ).toBe(true);
    // 단계 알약도 이름 줄에 있다
    expect(nameRow.contains(screen.getByText("개노답 Lv.1"))).toBe(true);
    // 장식용 `›`는 없다 — 그 8px이 닉네임 마지막 글자 몫이다
    expect(nameRow.textContent).not.toContain("›");
  });

  /**
   * 콕은 **버튼의 형제**여야 한다. 이름 줄 안(`<button>` 내부)에 넣으면 버튼이
   * 중첩되고, 콕을 눌러도 성과 시트가 함께 열린다.
   */
  it("콕 버튼을 성과 보기 버튼 안에 넣지 않는다 — 버튼 중첩 금지", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나" }]));
    const selectBtn = screen.getByLabelText("친구하나 성과 보기");
    expect(selectBtn.contains(screen.getByLabelText("친구하나 찌르기"))).toBe(
      false,
    );
  });

  /**
   * 상태는 **지표 줄의 첫 칸**이다 (2026-08-08 사용자 지시 "운동 상태는 위로 올리고").
   *
   * ⚠️ 문구가 `완료`다. `오늘 완료`는 이 칸에서 18px 잘렸고 사용자가 화면을 보고
   * 줄이라고 지시했다. 되살리면 다시 잘린다.
   */
  it("상태를 지표 줄 첫 칸에 넣는다 — 4칸 고정, 문구는 '완료'", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={null}
        rows={rowsOf([{ id: "u1", nickname: "친구하나" }], {
          sessions: [
            {
              userId: "u1",
              completedAt: "2026-08-07T02:00:00Z",
              durationMinutes: 30,
            },
          ],
        })}
        poked={new Set()}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
        cta={<StartWorkoutCta />}
      />,
    );
    const grid = container.querySelector("div.grid")!;
    expect(grid.children).toHaveLength(4);
    // 첫 칸이 상태다 — 순서가 바뀌면 실패한다
    expect(grid.children[0].textContent).toBe("상태완료");
    // 잘리던 옛 문구가 남아 있으면 실패
    expect(container.textContent).not.toContain("오늘 완료");
  });

  /**
   * 콕은 **친구 행에만** 있고, 내 행에는 어떤 모양으로도 없다.
   * 별도 줄을 두지 않으므로(2026-08-08) 내 행과 친구 행의 높이가 서로 같다 —
   * 실측 152px / 152px.
   */
  it("내 행에는 콕이 아무 모양으로도 없다 — 자기 자신은 찌를 수 없다", () => {
    const { container } = render(
      <FriendBoardBody
        myRow={myRowOf({ nickname: "나야" })}
        rows={rowsOf([
          { id: "u1", nickname: "찔렀음" },
          { id: "u2", nickname: "아직" },
        ])}
        poked={new Set(["u1"])}
        iWorkedOut
        expanded
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
        cta={<StartWorkoutCta />}
      />,
    );
    expect(screen.getByLabelText("찔렀음 찌름 완료")).toBeTruthy();
    expect(screen.getByLabelText("아직 찌르기")).toBeTruthy();
    expect(screen.queryByLabelText("나야 찌르기")).toBeNull();
    expect(screen.queryByLabelText("나야 찌름 완료")).toBeNull();
    // 행은 3개(나 + 친구 2), 콕 요소는 **2개**
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      container.querySelectorAll('[aria-label$="찌르기"], [aria-label$="찌름 완료"]'),
    ).toHaveLength(2);
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
        cta={<StartWorkoutCta />}
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
    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.getByText("운동 중")).toBeTruthy();
    expect(screen.getByText("운동 전")).toBeTruthy();
  });

  /**
   * 색만으로 구별하면 색을 못 보는 사람에게 상태가 사라진다.
   *
   * ⚠️ 2026-08-08에 **색 점을 없앴다.** 상태가 지표 줄로 옮겨 가면서 `상태` 라벨 +
   * 값이라는 다른 세 칸과 같은 모양이 됐고, 좁은 칸에 점까지 넣으면 값이 잘린다.
   * 접근성 요구(색 말고 글자로도 말한다)는 **`상태` 라벨과 값 글자**가 충족한다 —
   * 점은 그 요구를 만족시키는 유일한 수단이 아니었다.
   */
  it("상태를 색만이 아니라 라벨+글자로 적는다", () => {
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
        cta={<StartWorkoutCta />}
      />,
    );
    const statusCell = container.querySelector("div.grid")!.children[0];
    // 무엇에 대한 값인지(`상태`)와 값 자체(`운동 전`)가 **둘 다 글자**로 있다
    expect(statusCell.textContent).toBe("상태운동 전");
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

/**
 * 2026-08-13 개편 — 홈의 유일한 `운동 시작하기`가 이 카드 안으로 들어왔다.
 *
 * ⚠️ **이 describe가 이번 개편의 회귀선이다.** 옛 구현은 조회 전 `return null`,
 * 실패 시 문구 한 줄, 친구 0명이면 `NoFriendsCard`로 카드를 통째로 갈아치웠다.
 * 그 구조를 되살리면 **친구 조회가 느리거나 실패했다는 이유로 운동 시작 버튼이
 * 사라진다.** 네 갈래를 각각 단언하는 이유가 그것이다.
 *
 * 가짜 통과 점검(2026-08-13 실행): `FriendBoardBody`에서 `{cta}` 한 줄을 지우면
 * 아래 네 건이 모두 빨개지는 것을 확인하고 되돌렸다.
 */
describe("운동 시작 버튼 — 네 갈래 전부에서 살아 있다", () => {
  const ctaHref = () =>
    screen.getByText("운동 시작하기").closest("a")?.getAttribute("href");

  it("정상 목록에서 보인다", () => {
    renderBody(rowsOf(FOUR));
    expect(ctaHref()).toBe("/record");
  });

  it("조회 중에도 보인다 — 빈 화면 대신 자리를 잡는다", () => {
    renderBody([], { status: "loading" });
    expect(ctaHref()).toBe("/record");
    // 목록 자리는 스켈레톤이 먼저 잡는다(레이아웃 점프 방지)
    expect(screen.getAllByRole("listitem", { hidden: true })).toHaveLength(1);
  });

  it("친구 조회가 실패해도 보인다", () => {
    renderBody([], { status: "failed" });
    expect(ctaHref()).toBe("/record");
    expect(screen.getByText(/불러오지 못했어요/)).toBeTruthy();
  });

  it("친구가 0명이어도 보인다", () => {
    renderBody([]);
    expect(ctaHref()).toBe("/record");
  });
});

describe("친구가 0명일 때 — 카드를 갈아치우지 않고 안에서 안내한다", () => {
  it("크루 찾기로 보낸다", () => {
    renderBody([]);
    expect(screen.getByText("크루 찾으러 가기 ›").getAttribute("href")).toBe(
      "/crew",
    );
  });

  it("숫자 대신 초대를 권하는 헤딩을 쓴다 — '나의 크루 0명'이 아니다", () => {
    renderBody([]);
    expect(screen.getByText("크루와 함께하면 더 강해져요")).toBeTruthy();
    expect(screen.queryByText("나의 크루 0명")).toBeNull();
  });

  it("조회 중에는 친구 수를 적지 않는다 — 0이었다가 3이 되면 없어졌다 생긴 것처럼 읽힌다", () => {
    renderBody([], { status: "loading" });
    expect(screen.getByText("나의 크루")).toBeTruthy();
    expect(screen.queryByText("나의 크루 0명")).toBeNull();
    expect(screen.queryByText("크루와 함께하면 더 강해져요")).toBeNull();
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

  it("헤딩의 '나의 크루 N명'에 나를 세지 않는다", () => {
    renderBody(rowsOf(FOUR), { myRow: myRowOf() });
    // 2026-08-13에 `친구 4명` → `나의 크루 4명`으로 바뀌었다(통합 카드 헤딩).
    // 세는 대상은 그대로 친구뿐이다 — 내 행은 `rows` 밖에 있다.
    expect(screen.getByText("나의 크루 4명")).toBeTruthy();
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
    expect(screen.getByText("개노답 Lv.4")).toBeTruthy();
    expect(screen.getByText("1회")).toBeTruthy();
    expect(screen.getByText("30분")).toBeTruthy();
    expect(screen.getByText("배지 6개")).toBeTruthy();
    expect(screen.getByText("완료")).toBeTruthy();
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
