import { describe, expect, it } from "vitest";
import {
  buildFriendRows,
  canExpandFriendRows,
  foldFriendSessions,
  formatTotalMinutes,
  FRIEND_PREVIEW_COUNT,
  pokeableFriendCount,
  visibleFriendRows,
  workedOutToday,
  type FriendRow,
  type FriendSessionRow,
} from "./friend-board";

const KST = "Asia/Seoul";
/** 2026-08-07(금) 21:00 KST */
const NOW = new Date("2026-08-07T12:00:00Z");

function session(
  userId: string,
  iso: string,
  durationMinutes: number | null = 30,
): FriendSessionRow {
  return { userId, completedAt: iso, durationMinutes };
}

describe("foldFriendSessions — 세션 행 → 사람별 활동", () => {
  it("사람별로 횟수와 분을 합산한다", () => {
    const map = foldFriendSessions(
      [
        session("a", "2026-08-05T02:00:00Z", 40),
        session("a", "2026-08-06T02:00:00Z", 20),
        session("b", "2026-08-06T02:00:00Z", 55),
      ],
      NOW,
      KST,
    );
    expect(map.get("a")?.workoutCount).toBe(2);
    expect(map.get("a")?.totalMinutes).toBe(60);
    expect(map.get("b")?.workoutCount).toBe(1);
    expect(map.get("b")?.totalMinutes).toBe(55);
  });

  it("duration_minutes가 null인 세션은 0분으로 접되 횟수는 센다", () => {
    const map = foldFriendSessions(
      [session("a", "2026-08-06T02:00:00Z", null)],
      NOW,
      KST,
    );
    expect(map.get("a")?.workoutCount).toBe(1);
    expect(map.get("a")?.totalMinutes).toBe(0);
  });

  it("오늘 완료 여부를 KST 기준으로 판정한다", () => {
    // UTC 8/6 16:00 = KST 8/7 01:00 → '오늘'이다
    const map = foldFriendSessions(
      [session("a", "2026-08-06T16:00:00Z")],
      NOW,
      KST,
    );
    expect(map.get("a")?.workedOutToday).toBe(true);
  });

  it("어제까지만 한 사람은 오늘 완료가 아니다", () => {
    const map = foldFriendSessions(
      [session("a", "2026-08-06T02:00:00Z")],
      NOW,
      KST,
    );
    expect(map.get("a")?.workedOutToday).toBe(false);
  });

  it("마지막 운동 시각은 가장 최근 순간이다 (입력 순서와 무관)", () => {
    const map = foldFriendSessions(
      [
        session("a", "2026-08-06T02:00:00Z"),
        session("a", "2026-08-01T02:00:00Z"),
        session("a", "2026-08-04T02:00:00Z"),
      ],
      NOW,
      KST,
    );
    expect(map.get("a")?.lastWorkoutAt?.toISOString()).toBe(
      "2026-08-06T02:00:00.000Z",
    );
  });

  it("스트릭과 이번 주 운동일을 함께 계산한다", () => {
    // 이번 주 월요일은 8/3. 8/3·8/5·8/7 세 날 = 주 3일
    const map = foldFriendSessions(
      [
        session("a", "2026-08-03T02:00:00Z"),
        session("a", "2026-08-05T02:00:00Z"),
        session("a", "2026-08-07T02:00:00Z"),
      ],
      NOW,
      KST,
    );
    expect(map.get("a")?.weekDays).toBe(3);
    expect(map.get("a")?.streak).toBe(3);
  });

  it("같은 날 두 번 운동해도 주간 일수는 1일이다", () => {
    const map = foldFriendSessions(
      [
        session("a", "2026-08-07T01:00:00Z"),
        session("a", "2026-08-07T09:00:00Z"),
      ],
      NOW,
      KST,
    );
    expect(map.get("a")?.workoutCount).toBe(2);
    expect(map.get("a")?.weekDays).toBe(1);
  });

  it("지난주 기록은 이번 주 일수에 안 들어간다", () => {
    // 8/1(토)은 지난주
    const map = foldFriendSessions(
      [session("a", "2026-08-01T02:00:00Z")],
      NOW,
      KST,
    );
    expect(map.get("a")?.weekDays).toBe(0);
    expect(map.get("a")?.workoutCount).toBe(1);
  });
});

describe("buildFriendRows — 행 조립", () => {
  const crew = [
    { id: "a", nickname: "가나", avatarUrl: "🐵", totalXp: 1200 },
    { id: "b", nickname: "나다", avatarUrl: null, totalXp: 0 },
  ];

  it("레벨을 캐시값이 아니라 total_xp로 계산한다", () => {
    const rows = buildFriendRows({
      crew,
      activity: new Map(),
      badges: new Map(),
      activeUserIds: new Set(),
    });
    const a = rows.find((r) => r.userId === "a")!;
    const b = rows.find((r) => r.userId === "b")!;
    // 0 XP는 반드시 Lv.1이고, 1200 XP는 그보다 높아야 한다
    expect(b.level).toBe(1);
    expect(a.level).toBeGreaterThan(b.level);
  });

  it("기록이 없는 친구도 행이 나온다 (0회·0분)", () => {
    const rows = buildFriendRows({
      crew,
      activity: new Map(),
      badges: new Map(),
      activeUserIds: new Set(),
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.workoutCount === 0 && r.totalMinutes === 0)).toBe(
      true,
    );
  });

  it("배지 수가 안 오면 null이다 — 0개와 구별한다", () => {
    const rows = buildFriendRows({
      crew,
      activity: new Map(),
      badges: new Map([["b", { total: 0, recentKeys: [] }]]),
      activeUserIds: new Set(),
    });
    expect(rows.find((r) => r.userId === "a")!.badgeCount).toBeNull();
    expect(rows.find((r) => r.userId === "b")!.badgeCount).toBe(0);
  });

  it("배지 썸네일 키를 행에 싣는다 — 이미지 경로의 재료다", () => {
    const rows = buildFriendRows({
      crew,
      activity: new Map(),
      badges: new Map([
        ["a", { total: 6, recentKeys: ["streak_5", "volume_1t"] }],
      ]),
      activeUserIds: new Set(),
    });
    const a = rows.find((r) => r.userId === "a")!;
    expect(a.badgeKeys).toEqual(["streak_5", "volume_1t"]);
    expect(a.badgeCount).toBe(6);
    // 안 온 사람은 빈 배열 — 화면이 map을 돌려도 안전하다
    expect(rows.find((r) => r.userId === "b")!.badgeKeys).toEqual([]);
  });

  it("오늘 완료 → done, 진행 중 → active, 둘 다 아니면 idle", () => {
    const activity = foldFriendSessions(
      [session("a", "2026-08-07T02:00:00Z")],
      NOW,
      KST,
    );
    const rows = buildFriendRows({
      crew,
      activity,
      badges: new Map(),
      activeUserIds: new Set(["b"]),
    });
    expect(rows.find((r) => r.userId === "a")!.status).toBe("done");
    expect(rows.find((r) => r.userId === "b")!.status).toBe("active");
  });

  it("오늘 완료한 사람이 또 운동 중이면 done이 이긴다", () => {
    const activity = foldFriendSessions(
      [session("a", "2026-08-07T02:00:00Z")],
      NOW,
      KST,
    );
    const rows = buildFriendRows({
      crew,
      activity,
      badges: new Map(),
      activeUserIds: new Set(["a"]),
    });
    expect(rows.find((r) => r.userId === "a")!.status).toBe("done");
  });
});

describe("정렬 — 순위가 아니라 '지금 할 수 있는 일' 순", () => {
  const crew = [
    { id: "done", nickname: "완료", avatarUrl: null, totalXp: 9000 },
    { id: "idle", nickname: "쉬는중", avatarUrl: null, totalXp: 0 },
    { id: "active", nickname: "운동중", avatarUrl: null, totalXp: 5000 },
  ];

  function rows(): FriendRow[] {
    const activity = foldFriendSessions(
      [
        session("done", "2026-08-07T02:00:00Z"),
        session("idle", "2026-08-04T02:00:00Z"),
        session("active", "2026-08-05T02:00:00Z"),
      ],
      NOW,
      KST,
    );
    return buildFriendRows({
      crew,
      activity,
      badges: new Map(),
      activeUserIds: new Set(["active"]),
    });
  }

  /**
   * ⚠️ 2026-08-07에 "오늘 안 한 친구 먼저"를 뺐다. 그 순서의 유일한 근거는
   * *찌를 수 있는 사람이 접힌 3행 안에 있어야 한다*였는데, 콕이 모든 친구에게
   * 열리면서 근거가 사라졌다. 이제는 최근 운동순이다.
   */
  it("가장 최근에 운동한 친구가 맨 위다", () => {
    expect(rows()[0].userId).toBe("done"); // 오늘 운동
  });

  it("오늘 안 한 친구를 억지로 위로 올리지 않는다", () => {
    const order = rows().map((r) => r.userId);
    expect(order.indexOf("idle")).toBeGreaterThan(order.indexOf("active"));
  });

  it("성과가 높은 사람을 위로 올리지 않는다 — 순위표가 아니다", () => {
    // idle(0 XP)이 active(5000 XP)보다 레벨이 낮지만 순서는 운동 시각이 정한다
    const order = rows().map((r) => r.userId);
    expect(order).toEqual(["done", "active", "idle"]);
  });

  it("같은 그룹 안에서는 최근 운동순이다", () => {
    const activity = foldFriendSessions(
      [
        session("x", "2026-08-04T02:00:00Z"),
        session("y", "2026-08-06T02:00:00Z"),
      ],
      NOW,
      KST,
    );
    const sorted = buildFriendRows({
      crew: [
        { id: "x", nickname: "엑스", avatarUrl: null, totalXp: 0 },
        { id: "y", nickname: "와이", avatarUrl: null, totalXp: 0 },
      ],
      activity,
      badges: new Map(),
      activeUserIds: new Set(),
    });
    expect(sorted.map((r) => r.userId)).toEqual(["y", "x"]);
  });

  it("기록이 없는 친구는 뒤로, 동률은 닉네임순", () => {
    const sorted = buildFriendRows({
      crew: [
        { id: "n2", nickname: "나중", avatarUrl: null, totalXp: 0 },
        { id: "n1", nickname: "가장", avatarUrl: null, totalXp: 0 },
        { id: "has", nickname: "기록있음", avatarUrl: null, totalXp: 0 },
      ],
      activity: foldFriendSessions(
        [session("has", "2026-08-04T02:00:00Z")],
        NOW,
        KST,
      ),
      badges: new Map(),
      activeUserIds: new Set(),
    });
    expect(sorted.map((r) => r.userId)).toEqual(["has", "n1", "n2"]);
  });
});

describe("접기·펼치기", () => {
  function many(n: number): FriendRow[] {
    return buildFriendRows({
      crew: Array.from({ length: n }, (_, i) => ({
        id: `u${i}`,
        nickname: `친구${i}`,
        avatarUrl: null,
        totalXp: 0,
      })),
      activity: new Map(),
      badges: new Map(),
      activeUserIds: new Set(),
    });
  }

  it(`접으면 ${FRIEND_PREVIEW_COUNT}명만 보인다`, () => {
    expect(visibleFriendRows(many(7), false)).toHaveLength(FRIEND_PREVIEW_COUNT);
  });

  it("펼치면 전원이 보인다", () => {
    expect(visibleFriendRows(many(7), true)).toHaveLength(7);
  });

  it("3명 이하면 접어도 전원이 보이고 '전체 보기'가 필요 없다", () => {
    expect(visibleFriendRows(many(3), false)).toHaveLength(3);
    expect(canExpandFriendRows(many(3))).toBe(false);
  });

  it("4명부터 '전체 보기'가 생긴다", () => {
    expect(canExpandFriendRows(many(4))).toBe(true);
  });
});

describe("pokeableFriendCount — 안내 문구용", () => {
  const base = buildFriendRows({
    crew: [
      { id: "i1", nickname: "쉬는하나", avatarUrl: null, totalXp: 0 },
      { id: "i2", nickname: "쉬는둘", avatarUrl: null, totalXp: 0 },
      { id: "d1", nickname: "완료", avatarUrl: null, totalXp: 0 },
      { id: "a1", nickname: "운동중", avatarUrl: null, totalXp: 0 },
    ],
    activity: foldFriendSessions(
      [session("d1", "2026-08-07T02:00:00Z")],
      NOW,
      KST,
    ),
    badges: new Map(),
    activeUserIds: new Set(["a1"]),
  });

  /**
   * ⚠️ 2026-08-07 사용자 지시 — 상대의 오늘 운동 여부를 보지 않는다.
   * 서버 `poke_user`에도 그런 규칙이 없다(0028은 *내가* 오늘 했는지만 본다).
   * 이 단언을 되돌리면 오늘 운동을 마친 친구를 영영 못 찌르는 상태로 돌아간다.
   */
  it("오늘 완료·운동 중인 친구도 찌를 수 있다", () => {
    expect(pokeableFriendCount(base, new Set())).toBe(4);
  });

  it("이미 찌른 사람만 뺀다", () => {
    expect(pokeableFriendCount(base, new Set(["i1", "d1"]))).toBe(2);
  });
});

describe("캐릭터 이미지 — 프로필 이모지가 아니라 현재 레벨", () => {
  it("레벨에 맞는 캐릭터 경로와 단계 이름을 함께 준다", () => {
    const [low] = buildFriendRows({
      crew: [{ id: "a", nickname: "가나", avatarUrl: "🐵", totalXp: 0 }],
      activity: new Map(),
      badges: new Map(),
      activeUserIds: new Set(),
    });
    expect(low.characterPath).toMatch(/^\/characters\/char-\d+\.png$/);
    expect(low.stageName.length).toBeGreaterThan(0);
  });

  it("XP가 많이 다르면 캐릭터도 달라진다", () => {
    const rows = buildFriendRows({
      crew: [
        { id: "a", nickname: "가나", avatarUrl: null, totalXp: 0 },
        { id: "b", nickname: "나다", avatarUrl: null, totalXp: 500_000 },
      ],
      activity: new Map(),
      badges: new Map(),
      activeUserIds: new Set(),
    });
    const a = rows.find((r) => r.userId === "a")!;
    const b = rows.find((r) => r.userId === "b")!;
    expect(a.characterPath).not.toBe(b.characterPath);
  });
});

describe("workedOutToday — 콕 활성 조건", () => {
  it("오늘(KST) 완료가 있으면 true", () => {
    // UTC 8/6 16:00 = KST 8/7 01:00
    expect(
      workedOutToday([new Date("2026-08-06T16:00:00Z")], NOW, KST),
    ).toBe(true);
  });

  it("어제까지만 했으면 false", () => {
    expect(
      workedOutToday([new Date("2026-08-06T02:00:00Z")], NOW, KST),
    ).toBe(false);
  });

  it("기록이 없으면 false", () => {
    expect(workedOutToday([], NOW, KST)).toBe(false);
  });

  /**
   * ⚠️ 이 판정은 **필터 없는 내 전체 기록**을 받아야 한다. 친구 목록 질의는
   * `visibility='group'`으로 좁혀 있어서, 그 결과로 판정하면 서버는 허용하는데
   * 버튼만 흐릿한 막다른 길이 생긴다. 서버(0028)는 내 세션 전부를 본다.
   */
  it("여러 건 중 하나만 오늘이어도 true", () => {
    expect(
      workedOutToday(
        [
          new Date("2026-08-01T02:00:00Z"),
          new Date("2026-08-07T02:00:00Z"),
          new Date("2026-08-04T02:00:00Z"),
        ],
        NOW,
        KST,
      ),
    ).toBe(true);
  });
});

describe("formatTotalMinutes — 누적이라 값이 크다", () => {
  it("60분 미만은 분으로 적는다", () => {
    expect(formatTotalMinutes(0)).toBe("0분");
    expect(formatTotalMinutes(59)).toBe("59분");
  });

  it("60분 이상은 시간으로 내림해 적는다", () => {
    expect(formatTotalMinutes(60)).toBe("1시간");
    expect(formatTotalMinutes(3180)).toBe("53시간");
  });

  it("음수·소수는 방어한다", () => {
    expect(formatTotalMinutes(-5)).toBe("0분");
    expect(formatTotalMinutes(90.4)).toBe("1시간");
  });
});
