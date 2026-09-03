import { describe, expect, it } from "vitest";
import { buildLadderSchedule } from "./ladder-schedule";
import {
  LADDER_SESSIONS,
  LADDER_SPAN_DAYS,
  ladderDayOffset,
} from "./pullup-ladder";

const TZ = "Asia/Seoul";

function build(startDate = "2026-09-07", time = "07:00") {
  return buildLadderSchedule({ startDate, time, timeZone: TZ });
}

function dayDiff(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return (
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
}

describe("buildLadderSchedule — 원문의 5일 훈련 1일 휴식", () => {
  it("24회차를 만든다", () => {
    expect(build().plans).toHaveLength(LADDER_SESSIONS);
  });

  /*
    이 테스트가 "휴식일도 프로그램이 정한다"(사장님 지시 2026-09-04)의 전부다.
    요일 기반 일정은 7일마다 반복해서 6일 주기를 **표현할 수 없다** — 여기서
    5일 뒤 하루가 비는지 직접 센다.
  */
  it("5회차마다 하루를 비운다", () => {
    const dates = build().plans.map((plan) => plan.date);
    const gaps = dates
      .slice(1)
      .map((date, index) => dayDiff(dates[index], date));
    // 훈련일 사이는 1일, 휴식을 건너뛴 자리만 2일
    expect(gaps.filter((gap) => gap === 1)).toHaveLength(
      LADDER_SESSIONS - 1 - 4,
    );
    expect(gaps.filter((gap) => gap === 2)).toHaveLength(4);
    expect(gaps.every((gap) => gap === 1 || gap === 2)).toBe(true);
  });

  it("쉬는 날이 정확히 5·11·17·23일째다", () => {
    const offsets = new Set(
      build().plans.map((plan) => dayDiff("2026-09-07", plan.date)),
    );
    const rest = [...Array(LADDER_SPAN_DAYS).keys()].filter(
      (offset) => !offsets.has(offset),
    );
    expect(rest).toEqual([5, 11, 17, 23]);
  });

  /*
    원문은 "4주 동안 유지"다. 24회 × 5일훈련/1일휴식이 정확히 28일에 떨어지는
    것이 24를 고른 이유다 — 이 단언이 깨지면 회차 수와 원문이 갈라진 것이다.
  */
  it("시작일부터 정확히 4주(28일)에 끝난다", () => {
    const plans = build().plans;
    expect(LADDER_SPAN_DAYS).toBe(28);
    expect(dayDiff("2026-09-07", plans.at(-1)!.date)).toBe(27);
  });

  it("회차 번호가 시작일 기준 주기 위치와 같다", () => {
    build().plans.forEach((plan, index) => {
      expect(dayDiff("2026-09-07", plan.date)).toBe(ladderDayOffset(index + 1));
    });
  });
});

describe("buildLadderSchedule — DB가 요구하는 모양", () => {
  it("주차·회차·템플릿 키가 위치 그대로다", () => {
    const keys = ["A", "B", "C"] as const;
    build().plans.forEach((plan, index) => {
      expect(plan.week).toBe(Math.floor(index / 3) + 1);
      expect(plan.session).toBe((index % 3) + 1);
      expect(plan.templateKey).toBe(keys[index % 3]);
    });
  });

  it("주차가 1~8이다 — program_week 컬럼 제약(0101)과 같은 범위", () => {
    const weeks = build().plans.map((plan) => plan.week);
    expect(Math.min(...weeks)).toBe(1);
    expect(Math.max(...weeks)).toBe(8);
  });

  it("날짜가 오름차순이고 같은 날이 두 번 없다", () => {
    const dates = build().plans.map((plan) => plan.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  /*
    ⚠️ RPC가 회차마다 **현지 시각이 슬롯 시각과 같은지** 본다
       (`program_scheduled_time_mismatch`). 하나라도 어긋나면 등록이 통째로
       거절된다.
  */
  it("모든 회차가 같은 시각이고, 슬롯이 그 시각을 담는다", () => {
    const { plans, preferredSlots } = build("2026-09-07", "06:30");
    for (const plan of plans) {
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(plan.scheduledAt));
      expect(local).toBe("06:30");
    }
    expect(preferredSlots.every((slot) => slot.time === "06:30")).toBe(true);
  });

  /*
    슬롯은 사다리에서 **날짜를 정하지 않는다**(주기가 정한다). 그래도 RPC가
    서로 다른 요일 2~5개를 요구해서 채워 보내야 한다 — 첫 주기 5일의 요일이
    언제나 서로 다른 5개라 그것을 쓴다.
  */
  it("슬롯이 서로 다른 요일 5개다 — 시작 요일이 무엇이든", () => {
    for (const start of [
      "2026-09-07",
      "2026-09-10",
      "2026-09-12",
      "2026-09-13",
    ]) {
      const slots = build(start).preferredSlots;
      expect(slots).toHaveLength(5);
      expect(new Set(slots.map((slot) => slot.weekday)).size).toBe(5);
    }
  });
});

describe("buildLadderSchedule — 입력 검증", () => {
  it("날짜·시각·시간대가 이상하면 거절한다", () => {
    expect(() => build("2026-13-01")).toThrow();
    expect(() => build("2026-09-07", "25:00")).toThrow();
    expect(() =>
      buildLadderSchedule({
        startDate: "2026-09-07",
        time: "07:00",
        timeZone: "Not/AZone",
      }),
    ).toThrow();
  });

  /*
    서머타임 경계에서도 24회가 전부 만들어지고 현지 시각이 유지되는지.
    한국은 DST가 없지만 이 함수는 시간대를 인자로 받는다 — 언젠가 다른
    시간대가 들어오면 여기서 먼저 걸린다.
  */
  it("서머타임이 있는 시간대에서도 현지 시각을 지킨다", () => {
    const { plans } = buildLadderSchedule({
      startDate: "2026-03-05",
      time: "07:00",
      timeZone: "America/New_York",
    });
    expect(plans).toHaveLength(LADDER_SESSIONS);
    for (const plan of plans) {
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(plan.scheduledAt));
      expect(local).toBe("07:00");
    }
  });
});
