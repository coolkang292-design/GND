// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FriendBoardBody, pokeErrorMessage } from "./friend-board-card";
import {
  buildFriendRows,
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
    sessions?: {
      userId: string;
      completedAt: string;
      durationMinutes: number;
    }[];
    active?: string[];
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
    badges: new Map(),
    activeUserIds: new Set(options.active ?? []),
  });
}

function renderBody(
  rows: FriendRow[],
  overrides: Partial<Parameters<typeof FriendBoardBody>[0]> = {},
) {
  const props = {
    rows,
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

describe("FriendBoardBody — 접힌 2명과 전체 보기 (2026-08-21)", () => {
  /**
   * ⚠️ 2명은 2026-08-21 사용자 승인값이다(설계 §7.1). 같은 날 내 정보가
   * `PersonalTodayCard`로 분리돼 첫 화면 위쪽을 차지했고, 3명이면 375×812에서
   * 셋째 행이 하단 탭 아래로 밀린다.
   */
  it("접힌 상태에서는 최근 운동한 크루 2명만 보인다", () => {
    renderBody(rowsOf(FOUR));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("전체 크루 보기 ›")).toBeTruthy();
  });

  it("펼치면 4행이 전부 나온다", () => {
    renderBody(rowsOf(FOUR), { expanded: true });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("'전체 크루 보기'를 누르면 토글을 호출한다", () => {
    const props = renderBody(rowsOf(FOUR));
    fireEvent.click(screen.getByText("전체 크루 보기 ›"));
    expect(props.onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("펼친 상태의 버튼은 '접기'이고 aria-expanded가 true다", () => {
    renderBody(rowsOf(FOUR), { expanded: true });
    expect(screen.getByText("접기").getAttribute("aria-expanded")).toBe("true");
  });

  it("크루가 2명이면 '전체 보기'가 아예 없다 — 누를 게 없는 링크를 만들지 않는다", () => {
    renderBody(rowsOf(FOUR.slice(0, 2)));
    expect(screen.queryByText("전체 크루 보기 ›")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  /**
   * ⚠️ 정렬은 **최근 완료 운동순**이지 성과 순위가 아니다(설계 §7.2).
   * 접힌 자리가 2개뿐이라 정렬이 곧 "누가 보이는가"다.
   */
  it("접힌 2명은 가장 최근에 운동한 두 사람이다", () => {
    renderBody(
      rowsOf(
        [
          { id: "old", nickname: "옛날사람" },
          { id: "new", nickname: "최근사람" },
          { id: "mid", nickname: "중간사람" },
        ],
        {
          sessions: [
            {
              userId: "old",
              completedAt: "2026-08-01T02:00:00Z",
              durationMinutes: 30,
            },
            {
              userId: "mid",
              completedAt: "2026-08-05T02:00:00Z",
              durationMinutes: 30,
            },
            {
              userId: "new",
              completedAt: "2026-08-07T02:00:00Z",
              durationMinutes: 30,
            },
          ],
        },
      ),
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("최근사람");
    expect(items[1].textContent).toContain("중간사람");
  });
});

/**
 * 2026-08-21 개편의 **부정 확인**. 내 행과 홈 CTA는 이 카드를 떠나
 * `PersonalTodayCard`로 갔고, 누적 지표와 배지는 프로필 상세로 갔다.
 *
 * ⚠️ 제거를 검증하려면 새 화면이 있는지가 아니라 **옛 것이 없어졌는지**를 봐야 한다
 * (`CLAUDE.md` — "기능을 제거했으면 옛 문구가 없어졌는지를 확인한다").
 */
describe("FriendBoardBody — 크루 전용으로 줄었다", () => {
  it("내 행과 홈 CTA를 크루 카드 안에 그리지 않는다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나" }]));
    expect(screen.queryByText("나")).toBeNull();
    expect(screen.queryByText("운동 시작하기")).toBeNull();
    expect(screen.queryByText(/오늘 운동하고/)).toBeNull();
  });

  it("누적 운동·시간·배지 대신 이번 주·연속만 표시한다", () => {
    const { container } = render(
      <FriendBoardBody
        rows={rowsOf([{ id: "u1", nickname: "친구하나" }], {
          sessions: [
            {
              userId: "u1",
              completedAt: "2026-08-06T02:00:00Z",
              durationMinutes: 70,
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
      />,
    );
    expect(screen.getByText("이번 주")).toBeTruthy();
    expect(screen.getByText("연속")).toBeTruthy();
    // 옛 4칸 그리드의 라벨들 — 하나라도 남으면 행이 다시 152px로 자란다
    expect(screen.queryByText("배지")).toBeNull();
    expect(screen.queryByText("시간")).toBeNull();
    expect(screen.queryByText("운동")).toBeNull();
    expect(screen.queryByText("상태")).toBeNull();
    expect(container.textContent).not.toContain("배지 ");
    expect(container.textContent).not.toContain("불러오는 중");
    expect(container.textContent).not.toContain("1시간");
    expect(container.querySelectorAll('img[src*="/badges/"]')).toHaveLength(0);
  });

  /**
   * 헤더의 완료 요약 칩 — 2026-08-21 설계 검토에서 한 번 빠졌다가 같은 날 사용자가
   * 목업을 보고 **되살리라고 지시했다**(보완 기준 2 철회).
   *
   * ⚠️ 이 칩은 **추가 조회를 만들지 않는다.** 이미 손에 든 행에서 센다 —
   * `crewTodaySummary`와 같은 정의라 내 카드의 비교 문구와 숫자가 어긋날 수 없다.
   */
  it("헤더에 오늘 완료 인원을 칩으로 적는다", () => {
    render(
      <FriendBoardBody
        rows={rowsOf(FOUR, {
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
        expanded={false}
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByText("오늘의 크루")).toBeTruthy();
    // 크루 4명 중 u1만 오늘 완료 — 분모는 **크루 수**이지 접힌 2명이 아니다
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("/ 4명 완료")).toBeTruthy();
    expect(screen.queryByText(/나의 크루/)).toBeNull();
  });

  it("크루가 0명이거나 조회 중이면 완료 칩을 그리지 않는다", () => {
    const { container } = render(
      <FriendBoardBody
        rows={[]}
        poked={new Set()}
        iWorkedOut
        expanded={false}
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/명 완료/);
    cleanup();

    const loading = render(
      <FriendBoardBody
        rows={[]}
        status="loading"
        poked={new Set()}
        iWorkedOut
        expanded={false}
        truncated={false}
        pokingId={null}
        onSelect={vi.fn()}
        onPoke={vi.fn()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(loading.container.textContent).not.toMatch(/명 완료/);
  });

  it("순위·등수를 그리지 않는다 — 순위표가 아니다", () => {
    const { container } = render(
      <FriendBoardBody
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

describe("FriendBoardBody — 한 행이 말하는 것", () => {
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
            {
              userId: "done",
              completedAt: "2026-08-07T02:00:00Z",
              durationMinutes: 30,
            },
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

  it("단계명을 앞, 레벨을 뒤에 한 알약으로 적는다", () => {
    // 1000 XP = Lv.6 → 6~10레벨은 2단계 '눈떴개'
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나", totalXp: 1000 }]));
    expect(screen.getByText("눈떴개 Lv.6")).toBeTruthy();
    expect(screen.queryByText("Lv.6")).toBeNull();
  });

  it("이번 주 운동일과 연속일을 숫자로 적는다", () => {
    renderBody(
      rowsOf([{ id: "u1", nickname: "친구하나" }], {
        sessions: [
          {
            userId: "u1",
            completedAt: "2026-08-06T02:00:00Z",
            durationMinutes: 30,
          },
          {
            userId: "u1",
            completedAt: "2026-08-05T02:00:00Z",
            durationMinutes: 30,
          },
        ],
      }),
    );
    // 8/5·8/6은 같은 주(월~일) — 이번 주 2일, 연속 2일
    expect(screen.getAllByText("2일")).toHaveLength(2);
  });

  /** 2026-08-07 사용자 요청 — 프로필 이모지가 아니라 현재 레벨의 캐릭터 */
  it("아바타 자리에 현재 레벨의 캐릭터 이미지를 쓴다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "친구하나", totalXp: 0 }]));
    const img = screen.getByAltText(/캐릭터$/) as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("char-");
  });

  /**
   * 2026-08-08 실측으로 확정한 **레이아웃 불변식** — 이름 줄이 넓어지면 375px에서
   * 닉네임이 잘린다. 상태가 이름 줄로 돌아오거나 장식용 `›`가 되살아나면 실패한다.
   */
  it("이름 줄에는 닉네임·단계·콕만 둔다 — 상태와 › 를 넣지 않는다", () => {
    renderBody(rowsOf([{ id: "u1", nickname: "아주아주긴닉네임입니다" }]));
    const nameRow = screen.getByLabelText("아주아주긴닉네임입니다 성과 보기")
      .parentElement!;
    expect(nameRow.contains(screen.getByText("운동 전"))).toBe(false);
    expect(
      nameRow.contains(screen.getByLabelText("아주아주긴닉네임입니다 찌르기")),
    ).toBe(true);
    expect(nameRow.contains(screen.getByText("개노답 Lv.1"))).toBe(true);
    expect(nameRow.textContent).not.toContain("›");
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
          {
            userId: "done",
            completedAt: "2026-08-07T02:00:00Z",
            durationMinutes: 30,
          },
        ],
      },
    );

  /**
   * ⚠️ 2026-08-07 사용자 화면 확인에서 잡힌 실버그의 회귀 방어.
   * 서버 `poke_user`에는 "상대가 오늘 안 했어야 한다"는 조건이 **없다**(0028은
   * *내가* 오늘 했는지만 본다). 그 규칙을 되살리면 오늘 운동을 마친 친구를 영영
   * 못 찌른다.
   */
  it("오늘 운동을 마친 친구도, 운동 중인 친구도 찌를 수 있다", () => {
    renderBody(
      rowsOf(
        [
          { id: "idle", nickname: "쉬는친구" },
          { id: "done", nickname: "완료친구" },
          { id: "act", nickname: "운동중친구" },
        ],
        {
          sessions: [
            {
              userId: "done",
              completedAt: "2026-08-07T02:00:00Z",
              durationMinutes: 30,
            },
          ],
          active: ["act"],
        },
      ),
      { expanded: true },
    );
    expect(screen.getByLabelText("쉬는친구 찌르기")).toBeTruthy();
    expect(screen.getByLabelText("완료친구 찌르기")).toBeTruthy();
    expect(screen.getByLabelText("운동중친구 찌르기")).toBeTruthy();
  });

  /**
   * ⚠️ 콕은 **모든 크루 행에 항상 자리를 둔다**(설계 §7.3, 사용자 확정 6번 요구).
   * 내가 운동 전이면 흐리게 잠그되 **숨기지 않는다** — 자리가 사라지면 무엇을
   * 하면 열리는지를 화면이 말할 수 없다.
   */
  it("내가 오늘 운동 전이면 콕이 보이되 잠기고, 이유가 한 줄로 뜬다", () => {
    renderBody(idleAndDone(), { iWorkedOut: false, expanded: true });
    const button = screen.getByLabelText("쉬는친구 찌르기") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      screen.getByText("오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉"),
    ).toBeTruthy();
  });

  it("내가 오늘 운동을 마쳤으면 콕이 눌리고 안내가 사라진다", () => {
    const props = renderBody(idleAndDone(), { expanded: true });
    const button = screen.getByLabelText("쉬는친구 찌르기") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(
      screen.queryByText("오늘 운동을 마치면 크루를 콕 찌를 수 있어요 👉"),
    ).toBeNull();
    fireEvent.click(button);
    expect(props.onPoke).toHaveBeenCalledTimes(1);
  });

  it("보내는 중에는 그 사람의 버튼만 잠근다 — 중복 탭 방지", () => {
    renderBody(idleAndDone(), { expanded: true, pokingId: "idle" });
    expect(
      (screen.getByLabelText("쉬는친구 찌르기") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("완료친구 찌르기") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("이미 찌른 친구는 '✅ 찌름'으로 잠긴다", () => {
    renderBody(idleAndDone(), { expanded: true, poked: new Set(["idle"]) });
    expect(screen.getByLabelText("쉬는친구 찌름 완료")).toBeTruthy();
    expect(screen.queryByLabelText("쉬는친구 찌르기")).toBeNull();
  });

  /**
   * ⚠️ 프로필 버튼과 콕 버튼은 **형제**여야 한다(설계 §7.4). 콕을 성과 보기 버튼
   * 안에 넣으면 버튼이 중첩되고, 콕을 눌러도 성과 시트가 함께 열린다.
   */
  it("프로필을 눌러도 콕이 안 나가고, 콕을 눌러도 프로필이 안 열린다", () => {
    const props = renderBody(idleAndDone(), { expanded: true });
    const open = screen.getByLabelText("쉬는친구 성과 보기");
    expect(open.querySelector("button")).toBeNull(); // 버튼 안에 버튼이 없다

    fireEvent.click(open);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onPoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("쉬는친구 찌르기"));
    expect(props.onPoke).toHaveBeenCalledTimes(1);
    expect(props.onSelect).toHaveBeenCalledTimes(1); // 늘지 않았다
  });

  it("잠긴 콕을 눌러도 아무 일도 일어나지 않는다", () => {
    const props = renderBody(idleAndDone(), {
      iWorkedOut: false,
      expanded: true,
    });
    fireEvent.click(screen.getByLabelText("쉬는친구 찌르기"));
    expect(props.onPoke).not.toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });
});

describe("FriendBoardBody — 조회 상태", () => {
  it("조회 중에는 한 행 스켈레톤으로 자리를 잡는다", () => {
    renderBody([], { status: "loading" });
    expect(screen.getAllByRole("listitem", { hidden: true })).toHaveLength(1);
    expect(screen.getByText("오늘의 크루")).toBeTruthy();
  });

  it("조회에 실패하면 그렇게 말한다", () => {
    renderBody([], { status: "failed" });
    expect(screen.getByText(/불러오지 못했어요/)).toBeTruthy();
  });

  it("크루가 0명이면 크루 찾기로 보낸다", () => {
    renderBody([]);
    expect(screen.getByText("아직 크루가 없어요")).toBeTruthy();
    expect(screen.getByText("크루 찾으러 가기 ›").getAttribute("href")).toBe(
      "/crew",
    );
  });

  it("조회 중에는 크루가 없다고 단정하지 않는다", () => {
    renderBody([], { status: "loading" });
    expect(screen.queryByText("아직 크루가 없어요")).toBeNull();
  });

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
 * ⚠️ 홈 행에서 지표를 줄인 것은 **데이터를 지운 것이 아니다**(설계 §7.4).
 * 누적 성과·이력·보유 배지는 프로필 시트가 `get_crew_member_profile`로 직접
 * 조회한다 — 시트를 떼면 그 정보가 앱에서 사라진다.
 */
describe("크루 카드는 프로필 상세를 계속 연다", () => {
  it("MemberProfileSheet를 여전히 렌더한다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/home/friend-board-card.tsx"),
      "utf8",
    );
    expect(src).toContain("<MemberProfileSheet");
    expect(src).toContain("onClose={() => setSelected(null)}");
  });
});

describe("pokeErrorMessage — 서버만 아는 실패를 문구로 옮긴다", () => {
  it("찌르기를 꺼 둔 상대는 미리 알 수 없어 서버 응답으로만 안다", () => {
    expect(
      pokeErrorMessage(new SocialError("pokes_disabled", "pokes_disabled")),
    ).toBe("상대가 찌르기 알림을 꺼 뒀어요");
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
    expect(pokeErrorMessage(new Error("boom"))).toBe("찌르기를 보내지 못했어요");
  });
});
