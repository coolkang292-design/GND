import { describe, expect, it } from "vitest";
import {
  buildLadderMissedSessionProposal,
  buildLadderSchedule,
} from "./ladder-schedule";
import {
  LADDER_SESSIONS,
  LADDER_SPAN_DAYS,
  LADDER_TRAIN_DAYS,
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


/*
  §2-2 (인수인계서 2026-09-04): 사다리의 「남은 일정 다시 잡기」.

  ⚠️ 이 자리는 **조용히 틀리던** 곳이다. 공용 `buildMissedSessionProposal`은
     **요일 슬롯**으로 다시 잡는데, 사다리는 요일이 아니라 6일 주기다. 사다리의
     `preferredSlots`는 첫 주기 5일의 요일을 담고 있을 뿐이라(RPC가 서로 다른
     요일 2~5개를 요구해서 채워 보내는 값), 그것으로 다시 잡으면 **7일 주기로
     근사**된다 — 5일 훈련 뒤 2일을 쉬게 된다.

     그런데 RPC는 통과한다. 모든 회차가 같은 시각이고 슬롯이 그 시각을 담고
     있어서 `program_scheduled_time_mismatch`에 안 걸리고, 날짜도 오름차순이라
     `program_plan_date_order`에도 안 걸린다. **오류 없이 틀린 날짜가 깔린다.**

  아래 테스트들은 전부 "주기가 유지되는가"를 **날짜 간격을 세어서** 본다.
  "예외가 안 났다"로는 이 버그를 절대 못 잡는다.
*/
describe("buildLadderMissedSessionProposal — 요일이 아니라 주기로 다시 잡는다", () => {
  /** 사다리 24회를 계획 목록으로. `completedSessions`는 1-based 회차 번호 */
  function ladderPlans(input: {
    startDate?: string;
    completedSessions?: readonly number[];
  } = {}) {
    const startDate = input.startDate ?? "2026-09-07";
    const completed = new Set(input.completedSessions ?? []);
    return build(startDate).plans.map((plan, index) => ({
      id: `plan-${index + 1}`,
      date: plan.date,
      completed: completed.has(index + 1),
    }));
  }

  function propose(input: {
    plans: ReturnType<typeof ladderPlans>;
    todayKey: string;
  }) {
    return buildLadderMissedSessionProposal({
      plans: input.plans,
      todayKey: input.todayKey,
      time: "07:00",
      timeZone: TZ,
    });
  }

  /** 제안을 반영한 뒤의 최종 날짜 목록 (회차 순서 그대로) */
  function finalDates(
    plans: ReturnType<typeof ladderPlans>,
    moves: ReturnType<typeof propose>,
  ) {
    const byId = new Map(moves.map((move) => [move.planId, move.suggestedDate]));
    return plans.map((plan) => byId.get(plan.id) ?? plan.date);
  }

  it("놓친 회차가 없으면 아무것도 제안하지 않는다", () => {
    // 시작 전날 — 지난 회차가 하나도 없다
    expect(propose({ plans: ladderPlans(), todayKey: "2026-09-06" })).toEqual([]);
  });

  it("이미 다 마쳤으면 아무것도 제안하지 않는다", () => {
    const plans = ladderPlans({
      completedSessions: Array.from({ length: LADDER_SESSIONS }, (_, i) => i + 1),
    });
    expect(propose({ plans, todayKey: "2026-12-31" })).toEqual([]);
  });

  /*
    ⚠️ **이 테스트 하나가 §2-2 버그의 전부다.**
    간격이 1·1·1·1·2 로 반복돼야 한다. 요일 기반이면 여기서 2가 아니라
    3(주말 두 칸)이 섞여 들어온다.
  */
  it("다시 잡은 뒤에도 5일 훈련 1일 휴식이 유지된다", () => {
    const plans = ladderPlans({ completedSessions: [1, 2] });
    const moves = propose({ plans, todayKey: "2026-09-14" });
    const remaining = finalDates(plans, moves).slice(2);
    const gaps = remaining
      .slice(1)
      .map((date, index) => dayDiff(remaining[index], date));

    expect(gaps.every((gap) => gap === 1 || gap === 2)).toBe(true);
    // 남은 22회 → 사이 간격 21개. 5개마다 휴식 하나
    expect(gaps).toHaveLength(LADDER_SESSIONS - 2 - 1);
    for (const [index, gap] of gaps.entries()) {
      // 다시 잡은 첫 회차부터 세어 5번째마다 하루를 쉰다
      expect(gap).toBe(index % LADDER_TRAIN_DAYS === LADDER_TRAIN_DAYS - 1 ? 2 : 1);
    }
  });

  it("남은 회차는 오늘부터 시작한다", () => {
    const plans = ladderPlans({ completedSessions: [1, 2] });
    const moves = propose({ plans, todayKey: "2026-09-14" });
    expect(finalDates(plans, moves)[2]).toBe("2026-09-14");
  });

  it("마친 회차는 건드리지 않는다", () => {
    const plans = ladderPlans({ completedSessions: [1, 2, 3] });
    const moves = propose({ plans, todayKey: "2026-09-20" });
    const movedIds = new Set(moves.map((move) => move.planId));
    for (const id of ["plan-1", "plan-2", "plan-3"]) {
      expect(movedIds.has(id)).toBe(false);
    }
  });

  /*
    오늘 이미 한 회차를 마쳤으면 남은 회차는 **내일부터**다. 오늘로 잡으면
    RPC의 `program_plan_date_order`(같은 날 두 회차 금지)에 걸려 배치가
    통째로 거부된다 — 화면에는 "일정을 다시 잡지 못했어요"만 뜨고 왜인지
    알 수 없다.
  */
  it("오늘 마친 회차가 있으면 남은 회차는 내일부터 잡는다", () => {
    const plans = ladderPlans().map((plan) =>
      plan.date === "2026-09-14" ? { ...plan, completed: true } : plan,
    );
    // 9-14는 8회차(2주기 3일째). 앞의 1~7회차는 놓쳤다
    const moves = propose({ plans, todayKey: "2026-09-14" });
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.suggestedDate > "2026-09-14")).toBe(true);
  });

  it("최종 날짜는 회차 순서대로 하루 이상씩 늘어난다", () => {
    const plans = ladderPlans({ completedSessions: [1] });
    const dates = finalDates(plans, propose({ plans, todayKey: "2026-09-30" }));
    for (let index = 1; index < dates.length; index += 1) {
      expect(dayDiff(dates[index - 1], dates[index])).toBeGreaterThanOrEqual(1);
    }
  });

  it("제안한 시각은 회차 시각을 그대로 지킨다", () => {
    const plans = ladderPlans({ completedSessions: [1, 2] });
    for (const move of propose({ plans, todayKey: "2026-09-14" })) {
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(move.scheduledAt));
      expect(local).toBe("07:00");
    }
  });

  it("제자리에 그대로 서는 회차는 제안에 넣지 않는다", () => {
    const plans = ladderPlans({ completedSessions: [1, 2] });
    for (const move of propose({ plans, todayKey: "2026-09-14" })) {
      expect(move.suggestedDate).not.toBe(move.fromDate);
    }
  });

  it("잘못된 입력은 던진다", () => {
    const plans = ladderPlans();
    expect(() =>
      buildLadderMissedSessionProposal({
        plans,
        todayKey: "2026-9-14",
        time: "07:00",
        timeZone: TZ,
      }),
    ).toThrow();
    expect(() =>
      buildLadderMissedSessionProposal({
        plans: [...plans, plans[0]],
        todayKey: "2026-09-14",
        time: "07:00",
        timeZone: TZ,
      }),
    ).toThrow();
  });
});
