import { describe, expect, it } from "vitest";
import {
  buildProfileHistory,
  formatCumulativeDistance,
  formatCumulativeMinutes,
  formatCumulativeVolume,
  type ProfileHistoryInput,
} from "./profile-history";

const CATALOG = [
  { key: "streak_7", emoji: "🔥", name: "일주일 개근" },
  { key: "volume_1t", emoji: "🏋️", name: "1톤 클럽" },
];

const base: ProfileHistoryInput = {
  joinedAt: new Date("2026-07-19T01:00:00Z"),
  levelUps: [],
  badges: [],
  catalog: CATALOG,
};

describe("buildProfileHistory", () => {
  it("가입만 있으면 한 줄", () => {
    expect(buildProfileHistory(base)).toEqual([
      { kind: "joined", at: new Date("2026-07-19T01:00:00Z") },
    ]);
  });

  it("최신이 위, 가입이 맨 아래", () => {
    const events = buildProfileHistory({
      ...base,
      levelUps: [
        { level: 2, at: new Date("2026-07-20T00:00:00Z") },
        { level: 5, at: new Date("2026-08-01T00:00:00Z") },
      ],
      badges: [
        { badgeKey: "streak_7", earnedAt: new Date("2026-07-25T00:00:00Z") },
      ],
    });

    expect(events.map((e) => e.kind)).toEqual([
      "level_up",
      "badge",
      "level_up",
      "joined",
    ]);
    expect(events[0]).toMatchObject({ level: 5 });
    expect(events[3].kind).toBe("joined");
  });

  it("배지는 카탈로그 이름을 붙인다", () => {
    const [event] = buildProfileHistory({
      ...base,
      joinedAt: null,
      badges: [
        { badgeKey: "volume_1t", earnedAt: new Date("2026-08-01T00:00:00Z") },
      ],
    });
    expect(event).toMatchObject({
      kind: "badge",
      name: "1톤 클럽",
      emoji: "🏋️",
    });
  });

  /**
   * ⚠️ 카탈로그에 없는 키는 **버린다.** `badgeShelf`가 하는 것과 같은 규칙이다 —
   * 배지가 늘거나 이름이 바뀌어도 화면이 `undefined`를 그리지 않는다.
   */
  it("카탈로그에 없는 배지는 버린다", () => {
    const events = buildProfileHistory({
      ...base,
      joinedAt: null,
      badges: [
        { badgeKey: "없는배지", earnedAt: new Date("2026-08-01T00:00:00Z") },
      ],
    });
    expect(events).toEqual([]);
  });

  it("가입일이 없으면 가입 줄이 없다 — 빈 날짜를 지어내지 않는다", () => {
    const events = buildProfileHistory({ ...base, joinedAt: null });
    expect(events).toEqual([]);
  });

  /**
   * 같은 배지를 여러 번 받을 수 있다(repeatable). 이력은 **받은 횟수만큼** 줄이 선다 —
   * 배지 선반(`badgeShelf`)이 개수로 접는 것과 다르다. 여기서는 "언제"가 요점이다.
   */
  it("반복 배지는 받은 만큼 줄이 선다", () => {
    const events = buildProfileHistory({
      ...base,
      joinedAt: null,
      badges: [
        { badgeKey: "streak_7", earnedAt: new Date("2026-07-25T00:00:00Z") },
        { badgeKey: "streak_7", earnedAt: new Date("2026-08-05T00:00:00Z") },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0].at).toEqual(new Date("2026-08-05T00:00:00Z"));
  });

  it("같은 시각이면 레벨업이 배지보다 위 — 순서가 흔들리지 않는다", () => {
    const at = new Date("2026-08-01T00:00:00Z");
    const events = buildProfileHistory({
      ...base,
      joinedAt: null,
      levelUps: [{ level: 3, at }],
      badges: [{ badgeKey: "streak_7", earnedAt: at }],
    });
    expect(events.map((e) => e.kind)).toEqual(["level_up", "badge"]);
  });
});

describe("formatCumulativeMinutes", () => {
  it("한 시간 미만은 분", () => {
    expect(formatCumulativeMinutes(0)).toBe("0분");
    expect(formatCumulativeMinutes(45)).toBe("45분");
  });

  it("한 시간 이상은 시간과 분", () => {
    expect(formatCumulativeMinutes(60)).toBe("1시간");
    expect(formatCumulativeMinutes(1873)).toBe("31시간 13분");
  });

  it("음수·소수는 안전하게 다룬다", () => {
    expect(formatCumulativeMinutes(-5)).toBe("0분");
    expect(formatCumulativeMinutes(90.7)).toBe("1시간 31분");
  });
});

describe("formatCumulativeDistance", () => {
  /** ⚠️ 0이면 `null`이다 — 달리기를 안 하는 사람에게 `0.0km`는 잡음이다 */
  it("0이면 null", () => {
    expect(formatCumulativeDistance(0)).toBeNull();
    expect(formatCumulativeDistance(-3)).toBeNull();
  });

  it("1km 미만은 미터", () => {
    expect(formatCumulativeDistance(850)).toBe("850m");
  });

  it("1km 이상은 소수 한 자리", () => {
    expect(formatCumulativeDistance(110490)).toBe("110.5km");
    expect(formatCumulativeDistance(1000)).toBe("1.0km");
  });
});

/**
 * 누적 든 무게 (2026-08-21 사용자 요청 — 기록 탭에 누적 지표 넷).
 *
 * ⚠️ **단위가 도중에 바뀐다.** 시작한 사람은 수백 kg이고 오래 한 사람은 수십 톤이다.
 * 늘 톤으로 적으면 초보에게 `0.3톤`이 되고, 늘 kg으로 적으면 `284,500kg`이 칸을
 * 넘는다. `toDisplayUnit`(배지 진행바)은 늘 톤인데, 그건 배지 기준값이 톤 단위라
 * 그렇다 — 여기는 사람의 누적이라 다르다.
 */
describe("formatCumulativeVolume", () => {
  it("1톤 미만은 kg으로 적는다", () => {
    expect(formatCumulativeVolume(0)).toBe("0kg");
    expect(formatCumulativeVolume(284.4)).toBe("284kg");
    expect(formatCumulativeVolume(999)).toBe("999kg");
  });

  it("1톤부터는 톤으로 적고 소수 첫째 자리까지 남긴다", () => {
    expect(formatCumulativeVolume(1000)).toBe("1톤");
    expect(formatCumulativeVolume(12345)).toBe("12.3톤");
  });

  it("큰 수는 천 단위를 끊어 읽게 한다", () => {
    expect(formatCumulativeVolume(1234567)).toBe("1,234.6톤");
  });

  /** ⚠️ 음수는 데이터 사고다. 화면이 `-3kg`을 말하게 두지 않는다 */
  it("음수는 0으로 눕힌다", () => {
    expect(formatCumulativeVolume(-5)).toBe("0kg");
  });
});
