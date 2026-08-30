// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase D의 사진 상호작용만 서버를 건드린다. 나머지 테스트는 순수 렌더라
// 부분 모킹으로 충분하다.
const mocks = vi.hoisted(() => ({ toggleReaction: vi.fn() }));
vi.mock("@/lib/social", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social")>()),
  toggleReaction: mocks.toggleReaction,
}));
import type { BreakdownExercise } from "@/components/workout/set-breakdown";
import { EMPTY_SESSION_THREAD } from "@/lib/domain/session-comments";
import type { FeedItem } from "@/lib/social";
import { FeedItemCard } from "./feed-item";

// vitest globals가 꺼져 있어 RTL 자동 정리가 안 돈다 (CLAUDE.md §함정)
afterEach(cleanup);

/** 세트 상세 — getCrewFeed가 이미 받아 오던 것을 버리지 않고 남긴 값 (2026-08-04) */
const BREAKDOWN: BreakdownExercise[] = [
  {
    name: "벤치프레스",
    exerciseType: "weight",
    measure: null,
    sets: [
      { weightKg: 60, reps: 8, distanceKm: 0, durationMin: 0, done: true },
      { weightKg: 60, reps: 4, distanceKm: 0, durationMin: 0, done: false },
    ],
  },
  {
    name: "랫풀다운",
    exerciseType: "weight",
    measure: null,
    sets: [
      { weightKg: 45, reps: 12, distanceKm: 0, durationMin: 0, done: true },
    ],
  },
];

function feedItem(
  photoUrl: string | null,
  breakdown: BreakdownExercise[] = BREAKDOWN,
): FeedItem {
  return {
    breakdown,
    sessionId: "session-1",
    userId: "friend-1",
    nickname: "오빙크",
    avatarUrl: "🙂",
    title: null,
    completedAt: new Date("2026-07-18T21:20:00+09:00"),
    durationMinutes: 45,
    exerciseNames: ["벤치프레스", "랫풀다운"],
    volume: {
      weightVolumeKg: 1_200,
      bodyweightReps: 0,
      cardioDistanceMeters: 0,
      cardioDurationSeconds: 0,
      completedSetCount: 3,
    },
    photoUrl,
    streak: 3,
    recordNote: null,
    tabataMinutes: null,
    reactions: { fire: 1, clap: 0, like: 0 },
    myReactions: new Set(),
    thread: EMPTY_SESSION_THREAD,
    likers: [],
    people: new Map(),
  };
}

describe("FeedItemCard", () => {
  it("사진 기록은 날짜를 위에, 사용자와 완료 시간을 사진 아래쪽에 겹쳐 표시한다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={feedItem("https://example.com/workout.jpg")}
        userId="me"
        onProfileClick={() => {}}
      />,
    );

    expect(html).toContain("absolute inset-x-0 top-0");
    expect(html).toContain("absolute inset-x-0 bottom-0");
    expect(html).toContain("오빙크");
    expect(html).toContain("운동 완료");
  });

  it("사진 카드에서 닉네임을 프로필 버튼으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={feedItem("https://example.com/workout.jpg")}
        userId="me"
        onProfileClick={() => {}}
      />,
    );
    expect(html).toContain('aria-label="오빙크 프로필 보기"');
  });

  it("일반 카드에서도 닉네임을 프로필 버튼으로 감싼다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard item={feedItem(null)} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).toContain('aria-label="오빙크 프로필 보기"');
  });
});

/**
 * ④ 지난 운동 기록 상세보기 — 피드 경로 (2026-08-04).
 *
 * 세트는 이미 손에 있다. 카드를 눌러 펼치기만 하면 되고 새 질의가 없다.
 */
describe("FeedItemCard — 기록 상세 펼치기", () => {
  const renderCard = (photoUrl: string | null = null, breakdown?: BreakdownExercise[]) =>
    render(
      <FeedItemCard
        item={feedItem(photoUrl, breakdown)}
        userId="me"
        onProfileClick={() => {}}
      />,
    );

  const toggle = () => screen.getByRole("button", { name: /운동 상세/ });

  it("펼치기 전에는 세트가 보이지 않는다", () => {
    renderCard();

    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("요약을 누르면 종목별 세트가 펼쳐진다", () => {
    renderCard();

    fireEvent.click(toggle());

    expect(screen.getByText("60kg 8회")).toBeTruthy();
    expect(screen.getByText("45kg 12회")).toBeTruthy();
  });

  it("완료·미완료를 구분해 보여준다 — done이 실제로 전달돼야 한다", () => {
    renderCard();

    fireEvent.click(toggle());

    // 종목 2개가 각각 1세트를 완료했고, 벤치프레스만 2세트를 남겼다.
    expect(screen.getAllByLabelText("1세트 완료")).toHaveLength(2);
    expect(screen.getAllByLabelText("2세트 미완료")).toHaveLength(1);
    expect(screen.queryByLabelText("2세트 완료")).toBeNull();
  });

  it("다시 누르면 접힌다", () => {
    renderCard();

    fireEvent.click(toggle());
    expect(screen.getByText("60kg 8회")).toBeTruthy();

    fireEvent.click(toggle());
    expect(screen.queryByText("60kg 8회")).toBeNull();
  });

  it("사진 카드에서도 펼칠 수 있다 — 두 변형이 같은 요약 블록을 쓴다", () => {
    renderCard("https://example.com/workout.jpg");

    fireEvent.click(toggle());

    expect(screen.getByText("60kg 8회")).toBeTruthy();
  });

  it("저장된 세트가 없으면 없다고 알린다 — 빈 칸을 남기지 않는다", () => {
    renderCard(null, []);

    fireEvent.click(toggle());

    expect(screen.getByText(/세트 기록이 없어요/)).toBeTruthy();
  });

  it("기존 종목 요약 줄은 그대로 남는다", () => {
    renderCard();

    expect(screen.getByText("벤치프레스 · 랫풀다운")).toBeTruthy();
  });
});

/**
 * 명칭 통일 (2026-08-12, 사용자 지시) — 피드 배지도 "타바타" 대신
 * "전신 인터벌"로 부른다. 내부 필드명(`tabataMinutes`)은 그대로다.
 */
describe("FeedItemCard — 전신 인터벌 배지", () => {
  const intervalItem = (): FeedItem => ({ ...feedItem(null), tabataMinutes: 8 });

  it("인터벌 세션이면 코스 분수를 전신 인터벌로 적는다", () => {
    render(
      <FeedItemCard item={intervalItem()} userId="me" onProfileClick={() => {}} />,
    );

    expect(screen.getByText(/🔥 전신 인터벌 8분/)).toBeTruthy();
  });

  it("옛 용어 '타바타'는 남지 않는다", () => {
    // 제거 검증 — 새 문구만 찾으면 옛 문구가 사라졌는지 확인한 게 아니다.
    render(
      <FeedItemCard item={intervalItem()} userId="me" onProfileClick={() => {}} />,
    );

    expect(screen.queryByText(/타바타/)).toBeNull();
  });

  it("일반 세션에는 인터벌 배지를 그리지 않는다", () => {
    render(
      <FeedItemCard item={feedItem(null)} userId="me" onProfileClick={() => {}} />,
    );

    expect(screen.queryByText(/전신 인터벌/)).toBeNull();
  });
});

/**
 * 캡션 + 댓글 (2026-08-30, 0082).
 *
 * 캡션은 `workout_sessions.title`이다 — 0004부터 있던 컬럼인데 **렌더하는 곳이
 * 한 군데도 없었다.** 피드는 이미 조회해서 손에 들고 있으면서 버리고 있었다.
 */
describe("FeedItemCard — 캡션", () => {
  it("캡션이 있으면 닉네임과 함께 그린다 (인스타 캡션 형식)", () => {
    const item = { ...feedItem(null), title: "💀 오늘 다 털렸다" };
    const html = renderToStaticMarkup(
      <FeedItemCard item={item} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).toContain("💀 오늘 다 털렸다");
  });

  it("사진 카드에서도 같은 캡션이 나온다 — 두 변형이 같은 footer를 쓴다", () => {
    const item = {
      ...feedItem("https://example.com/workout.jpg"),
      title: "🔥 컨디션 좋았다",
    };
    const html = renderToStaticMarkup(
      <FeedItemCard item={item} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).toContain("🔥 컨디션 좋았다");
  });

  /**
   * ⚠️ 회귀 방어. 남의 게시물에 캡션 칩이 뜨면 **남의 운동에 내 말을 쓰려다
   * 서버 RLS에 막힌다** — 사용자에게는 그냥 안 되는 버튼으로 보인다.
   */
  it("남의 게시물에는 캡션 칩을 내주지 않는다", () => {
    const item = { ...feedItem(null), userId: "friend-1" };
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={item}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(html).not.toContain("직접 쓰기");
  });

  /**
   * ⚠️⚠️ 회귀 방어 (사용자 결정 2026-08-30):
   * > "표시된 기분은 피드에서 다 보여 주지 말고 선택한 기분만 표시하게 해줘"
   *
   * 피드 카드에서는 칩 6개가 **접혀 있어야** 한다. 펼쳐 두면 카드마다 가로
   * 스크롤 편집 도구가 깔려서 게시물보다 도구가 더 커진다.
   */
  it("피드 카드에서는 기분 칩을 다 펼치지 않는다 — 버튼 하나만", () => {
    const item = { ...feedItem(null), userId: "me", title: null };
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={item}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(html).toContain("오늘 기분 남기기");
    expect(html).not.toContain("💀 오늘 다 털렸다"); // CAPTION_CHIPS[0]
    expect(html).not.toContain("🧊 몸이 무거웠다"); // CAPTION_CHIPS[5]
    expect(html).not.toContain("직접 쓰기");
  });

  it("버튼을 누르면 그때 칩이 펼쳐진다", () => {
    const item = { ...feedItem(null), userId: "me", title: null };
    render(
      <FeedItemCard
        item={item}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(screen.queryByText("💀 오늘 다 털렸다")).toBeNull();
    fireEvent.click(screen.getByText("✍️ 오늘 기분 남기기"));
    expect(screen.getByText("💀 오늘 다 털렸다")).toBeTruthy();
  });

  it("이미 고른 기분이 있으면 그것만 캡션 줄에 보이고 칩은 접혀 있다", () => {
    const item = {
      ...feedItem(null),
      userId: "me",
      title: "🔥 컨디션 좋았다",
    };
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={item}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(html).toContain("🔥 컨디션 좋았다");
    expect(html).not.toContain("💀 오늘 다 털렸다");
    expect(html).toContain("기분 바꾸기");
  });

  /**
   * ⚠️ `onItemChange`가 없으면 카드는 읽기 전용이다. 저장할 곳이 없는데 칩을
   * 열어 두면 사용자가 누른 것이 다음 렌더에 조용히 사라진다.
   */
  it("onItemChange가 없으면 칩을 열지 않는다", () => {
    const item = { ...feedItem(null), userId: "me", title: null };
    const html = renderToStaticMarkup(
      <FeedItemCard item={item} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).not.toContain("직접 쓰기");
  });
});

describe("FeedItemCard — 댓글", () => {
  const withComments = (count: number): FeedItem => ({
    ...feedItem(null),
    thread: {
      comments: Array.from({ length: count }, (_, i) => ({
        id: `c${i}`,
        senderId: "friend-1",
        body: `댓글 ${i}`,
        createdAt: new Date("2026-08-30T10:00:00Z"),
        fromCheer: false,
        parentId: null,
        replies: [],
        editedAt: null,
      })),
      cheerTally: [],
      cheerTotal: 0,
    },
    likers: [],
    people: new Map([["friend-1", { nickname: "오빙크", avatarUrl: null }]]),
  });

  it("댓글 수를 액션 줄에 표시한다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={withComments(3)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="댓글 3개"');
  });

  it("접혀 있을 때는 스레드를 그리지 않는다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard
        item={withComments(2)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(html).not.toContain("댓글 남기기");
  });

  it("💬를 누르면 스레드와 입력창이 열린다", () => {
    render(
      <FeedItemCard
        item={withComments(2)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "댓글 2개" }));
    expect(screen.getByLabelText("댓글 입력")).toBeTruthy();
    expect(screen.getByText("댓글 0")).toBeTruthy();
  });

  /**
   * ⚠️ 알림에서 들어온 게시물(`/feed?session=<id>`)은 **댓글이 펼쳐진 채로**
   * 열려야 한다. 접혀 있으면 사용자가 알림을 누르고도 한 번 더 눌러야 한다 —
   * 무엇 때문에 왔는지 못 찾는다.
   */
  it("openComments면 처음부터 펼쳐서 연다", () => {
    render(
      <FeedItemCard
        item={withComments(1)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
        openComments
      />,
    );
    expect(screen.getByLabelText("댓글 입력")).toBeTruthy();
  });

  it("댓글이 3개를 넘으면 '모두 보기'로 접는다", () => {
    render(
      <FeedItemCard
        item={withComments(5)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
        openComments
      />,
    );
    expect(screen.getByText("댓글 5개 모두 보기")).toBeTruthy();
    // 최신 2개만 — 앞에서 자르면 가장 오래된 것이 남는다
    expect(screen.queryByText("댓글 0")).toBeNull();
    expect(screen.getByText("댓글 4")).toBeTruthy();
  });
});

/**
 * 액션 줄 (2026-08-30) — 인스타식 민무늬 아이콘.
 *
 * 사용자가 인스타 화면을 첨부하며 "감정을 남기는 것도 심플하게",
 * "공유하기만 빼면 되겠네"라고 했다.
 */
describe("FeedItemCard — 액션 줄", () => {
  it("공유·북마크 버튼을 두지 않는다", () => {
    render(
      <FeedItemCard
        item={feedItem(null)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
    expect(labels.some((l) => /공유|share|저장|북마크/.test(l))).toBe(false);
  });

  /** 사용자 결정 2026-08-30: "감정을 하트와 코멘트만 남기고 나머지 제거" */
  it("하트와 댓글 둘만 내준다 — 🔥·👏 버튼은 없다", () => {
    render(
      <FeedItemCard
        item={feedItem(null)}
        userId="me"
        onProfileClick={() => {}}
        onItemChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /좋아요/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /댓글/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /불태웠다/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /멋지다/ })).toBeNull();
  });

  /**
   * ⚠️⚠️ 회귀 방어. 하트가 `like`만 세면 운영 DB에 쌓인 🔥 12건·👏 3건이
   * 화면에서 사라진다 — 눌러 준 사람의 반응이 없어진 것이다.
   */
  it("옛 🔥·👏를 합산해서 하트 옆에 낸다", () => {
    const item = {
      ...feedItem(null),
      reactions: { fire: 12, clap: 3, like: 1 },
    };
    render(
      <FeedItemCard item={item} userId="me" onProfileClick={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "좋아요 16" })).toBeTruthy();
  });

  /** 0을 그리면 안 누른 것이 `0`으로 줄을 채워 지저분해진다 */
  it("0이면 숫자를 그리지 않는다", () => {
    const item = { ...feedItem(null), reactions: { fire: 0, clap: 0, like: 0 } };
    const html = renderToStaticMarkup(
      <FeedItemCard item={item} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).not.toContain(">0<");
  });
});


/**
 * Phase D — 사진 상호작용 (2026-08-31).
 *
 * 한 번 탭과 두 번 탭이 **같은 자리**에 있다. 터치에서 더블탭은 click을 두 번
 * 쏘므로, 첫 click을 곧바로 처리하면 라이트박스가 열린 뒤에 좋아요가 붙는다.
 * 그 분기를 여기서 못 박는다.
 */
describe("FeedItemCard — 사진 탭 (Phase D)", () => {
  const PHOTO = "https://example.com/workout.jpg";

  beforeEach(() => {
    mocks.toggleReaction.mockReset();
    mocks.toggleReaction.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPhotoCard(item = feedItem(PHOTO)) {
    return render(
      <FeedItemCard item={item} userId="me" onProfileClick={() => {}} />,
    );
  }

  it("사진 비율이 4/5다 — 세로 화면에서 스크롤당 게시물 하나", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard item={feedItem(PHOTO)} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).toContain("aspect-[4/5]");
    expect(html).not.toContain("aspect-[4/3]");
  });

  it("한 번 탭하면 잠깐 뒤에 라이트박스가 열린다", () => {
    renderPhotoCard();
    fireEvent.click(screen.getByLabelText(/인증사진 크게 보기/));
    // 곧바로 열면 더블탭의 첫 click에 반응해 버린다
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("두 번 탭하면 라이트박스가 열리지 않고 좋아요가 나간다", async () => {
    renderPhotoCard();
    const photo = screen.getByLabelText(/인증사진 크게 보기/);
    fireEvent.click(photo);
    fireEvent.doubleClick(photo);
    act(() => vi.advanceTimersByTime(500));

    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() =>
      expect(mocks.toggleReaction).toHaveBeenCalledWith(
        "session-1",
        "me",
        "like",
        true,
      ),
    );
  });

  /**
   * 이게 이 묶음에서 가장 중요한 단언이다. 인스타의 더블탭은 **켜기만** 한다.
   * 토글로 만들면 사진을 크게 보려고 두 번 친 사람이 자기 좋아요를 지운다.
   */
  it("이미 좋아요한 글을 두 번 탭해도 꺼지지 않는다", async () => {
    const liked = feedItem(PHOTO);
    liked.myReactions = new Set(["like"]);
    liked.reactions = { fire: 0, clap: 0, like: 1 };
    renderPhotoCard(liked);

    fireEvent.doubleClick(screen.getByLabelText(/인증사진 크게 보기/));
    act(() => vi.advanceTimersByTime(500));
    await Promise.resolve();

    expect(mocks.toggleReaction).not.toHaveBeenCalled();
  });

  it("사진이 없는 기록에는 사진 탭 판이 없다", () => {
    const html = renderToStaticMarkup(
      <FeedItemCard item={feedItem(null)} userId="me" onProfileClick={() => {}} />,
    );
    expect(html).not.toContain("인증사진 크게 보기");
  });
});
