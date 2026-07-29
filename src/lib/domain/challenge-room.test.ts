import { describe, expect, it } from "vitest";
import {
  daysMeetingQualifier,
  goalFloor,
  pickPrimaryChallenge,
  FLOOR_BASELINE_DAYS,
  type ChallengeLike,
} from "./challenge-room";

const ch = (
  id: string,
  status: ChallengeLike["status"],
  startDate: string,
  endDate: string,
  createdAt: string,
): ChallengeLike => ({ id, status, startDate, endDate, createdAt });

describe("pickPrimaryChallenge", () => {
  it("없으면 null", () => {
    expect(pickPrimaryChallenge([])).toBeNull();
  });

  it("active가 하나면 그것", () => {
    const a = ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a])?.id).toBe("a");
  });

  it("active 여러 개면 종료일이 가장 임박한 것", () => {
    const a = ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T00:00:00Z");
    const b = ch("b", "active", "2026-08-01", "2026-08-10", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
  });

  it("active가 없으면 시작일이 가장 가까운 setup", () => {
    const a = ch("a", "setup", "2026-09-01", "2026-09-28", "2026-07-30T00:00:00Z");
    const b = ch("b", "setup", "2026-08-05", "2026-09-01", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
  });

  it("active가 하나라도 있으면 setup보다 우선", () => {
    const a = ch("a", "setup", "2026-08-01", "2026-08-05", "2026-07-30T00:00:00Z");
    const b = ch("b", "active", "2026-07-01", "2026-12-31", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
  });

  it("종료일이 같으면 먼저 만들어진 것 — 조회마다 대표가 바뀌면 안 된다", () => {
    const a = ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T09:00:00Z");
    const b = ch("b", "active", "2026-08-01", "2026-08-28", "2026-07-30T08:00:00Z");
    expect(pickPrimaryChallenge([a, b])?.id).toBe("b");
    // 입력 순서를 뒤집어도 같은 답이어야 한다
    expect(pickPrimaryChallenge([b, a])?.id).toBe("b");
  });

  it("ended·cancelled는 대표가 될 수 없다", () => {
    const a = ch("a", "ended", "2026-07-01", "2026-07-28", "2026-07-30T00:00:00Z");
    const b = ch("b", "cancelled", "2026-07-01", "2026-07-28", "2026-07-30T00:00:00Z");
    expect(pickPrimaryChallenge([a, b])).toBeNull();
  });

  it("입력 배열을 변형하지 않는다", () => {
    const list = [
      ch("a", "active", "2026-08-01", "2026-08-28", "2026-07-30T00:00:00Z"),
      ch("b", "active", "2026-08-01", "2026-08-10", "2026-07-30T00:00:00Z"),
    ];
    const before = list.map((c) => c.id).join(",");
    pickPrimaryChallenge(list);
    expect(list.map((c) => c.id).join(",")).toBe(before);
  });
});

describe("goalFloor", () => {
  it("기준일과 같은 기간이면 실적이 그대로 하한", () => {
    expect(goalFloor("weight_days", 14, 28)).toBe(14);
  });

  it("기간이 짧으면 비례로 줄고 올림된다 — 설계서 §5.3 예시", () => {
    // 13일 × 21 ÷ 28 = 9.75 → 10일
    expect(goalFloor("weight_days", 13, 21)).toBe(10);
  });

  it("기간이 길면 비례로 늘어난다", () => {
    // 10일 × 56 ÷ 28 = 20
    expect(goalFloor("weight_days", 10, 56)).toBe(20);
  });

  it("횟수형은 정수로 올림", () => {
    // 301 × 21 ÷ 28 = 225.75 → 226
    expect(goalFloor("weight_reps", 301, 21)).toBe(226);
  });

  it("거리는 0.1 단위로 올림 — 설계서 §5.3 예시", () => {
    // 42.3 × 21 ÷ 28 = 31.725 → 31.8
    expect(goalFloor("cardio_distance", 42.3, 21)).toBe(31.8);
  });

  it("시간도 0.1 단위로 올림", () => {
    expect(goalFloor("cardio_time", 100.04, 28)).toBe(100.1);
  });

  it("맨몸 시간도 0.1 단위", () => {
    expect(goalFloor("bodyweight_time", 33.31, 28)).toBe(33.4);
  });

  it("이미 0.1 배수면 올리지 않는다", () => {
    expect(goalFloor("cardio_distance", 20, 28)).toBe(20);
  });

  it("실적이 0이면 하한도 0 — 통과시킨다는 뜻", () => {
    expect(goalFloor("weight_days", 0, 28)).toBe(0);
  });

  it("레거시 volume은 하한을 걸지 않는다 (0 반환)", () => {
    expect(goalFloor("volume", 5000, 28)).toBe(0);
  });

  it("기간이 0 이하면 0 — 0 나눗셈 방지", () => {
    expect(goalFloor("weight_days", 14, 0)).toBe(0);
  });

  it("기준 구간은 28일", () => {
    expect(FLOOR_BASELINE_DAYS).toBe(28);
  });
});

// ── *_days 유형의 부위 조건 (2026-07-30 실측으로 드러난 구멍) ────────
//
// weight_days·bodyweight_days는 "하루 N종목 이상 한 날"을 센다. 그래서 같은
// 과거 데이터라도 N이 몇이냐에 따라 실적이 달라진다. 실측 예: 최근 웨이트가
// 하루 최대 3부위였던 사용자가 목표를 qualifier=4로 세워서, 19일 목표가
// 영구히 0일이 됐다.
//
// baselineActual을 qualifier 없이 계산해 넘기면 하한선이 이 경우를 못 잡는다.
// 아래 헬퍼가 "이 qualifier로 세면 과거에 며칠이었나"를 돌려주고, 호출부는
// 사용자가 지금 고른 qualifier로 과거를 다시 세어 넘겨야 한다.
describe("daysMeetingQualifier", () => {
  const countByDay = {
    "2026-07-27": 1,
    "2026-07-28": 3,
    "2026-07-29": 1,
  };

  it("조건을 만족한 날만 센다", () => {
    expect(daysMeetingQualifier(countByDay, 1)).toBe(3);
    expect(daysMeetingQualifier(countByDay, 3)).toBe(1);
  });

  it("아무 날도 못 만족하면 0 — 목표가 불가능해지는 지점", () => {
    expect(daysMeetingQualifier(countByDay, 4)).toBe(0);
  });

  it("qualifier가 없으면 1로 본다 (actualForGoal과 같은 기본값)", () => {
    expect(daysMeetingQualifier(countByDay, null)).toBe(3);
    expect(daysMeetingQualifier(countByDay, undefined)).toBe(3);
  });

  it("빈 기록은 0", () => {
    expect(daysMeetingQualifier({}, 3)).toBe(0);
  });

  it("하한선과 함께 쓰면 qualifier가 하한을 바꾼다", () => {
    // 같은 과거 데이터인데 qualifier에 따라 하한이 달라져야 한다.
    const days3 = daysMeetingQualifier(countByDay, 3); // 1일
    const days4 = daysMeetingQualifier(countByDay, 4); // 0일
    expect(goalFloor("weight_days", days3, 28)).toBe(1);
    expect(goalFloor("weight_days", days4, 28)).toBe(0);
  });
});
