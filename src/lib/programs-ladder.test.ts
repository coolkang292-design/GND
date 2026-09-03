import { describe, expect, it } from "vitest";
import { buildCreateLadderEnrollmentRpcArgs } from "./programs";
import {
  PULLUP_LADDER_PROGRAM,
  ladderDayOfSession,
} from "./domain/official-programs";
import {
  LADDER_RUNGS,
  LADDER_SESSIONS,
  ladderRepsForDay,
} from "./domain/pullup-ladder";
import { buildLadderSchedule } from "./domain/ladder-schedule";
import { localDateTimeToIso } from "./domain/program-schedule";
import type { CatalogExercise } from "./types";

const TIME_ZONE = "Asia/Seoul";
const TIME = "07:00";

const PULLUP: CatalogExercise = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "풀업",
  body_part: "등",
  exercise_type: "bodyweight",
  measure: "reps",
  is_custom: false,
  created_by: null,
} as CatalogExercise;

/** 화면이 만드는 것과 **같은 함수**로 만든다 — 5일 훈련 / 1일 휴식 주기 */
const BUILT = buildLadderSchedule({
  startDate: "2026-09-07",
  time: TIME,
  timeZone: TIME_ZONE,
});

function schedule() {
  return BUILT.plans;
}

const SLOTS = BUILT.preferredSlots;

function build(maxReps = 5) {
  return buildCreateLadderEnrollmentRpcArgs({
    program: PULLUP_LADDER_PROGRAM,
    item: PULLUP,
    maxReps,
    schedule: schedule(),
    startDate: "2026-09-07",
    timeZone: TIME_ZONE,
    preferredSlots: SLOTS,
  });
}

describe("buildCreateLadderEnrollmentRpcArgs — DB가 요구하는 모양", () => {
  /*
    아래 넷은 취향이 아니라 **RPC가 거절하는 조건**이다(0066·0073·0100).
    하나라도 어긋나면 등록이 통째로 실패한다.
  */
  it("회차를 정확히 24개 만든다 — 원문 4주의 훈련일 수", () => {
    expect(LADDER_SESSIONS).toBe(24);
    expect(build().p_plans).toHaveLength(LADDER_SESSIONS);
  });

  it("회차마다 종목이 1개다 — 풀업만 하는 프로그램이다", () => {
    for (const plan of build().p_plans) {
      expect(plan.exercises).toHaveLength(1);
      expect(plan.exercises[0].name).toBe("풀업");
    }
  });

  it("종목마다 세트가 5개다", () => {
    for (const plan of build().p_plans) {
      expect(plan.exercises[0].sets).toHaveLength(LADDER_RUNGS);
    }
  });

  it("주차·회차·템플릿 키가 위치 그대로다", () => {
    const keys = ["A", "B", "C"] as const;
    build().p_plans.forEach((plan, index) => {
      expect(plan.week).toBe(Math.floor(index / 3) + 1);
      expect(plan.session).toBe((index % 3) + 1);
      expect(plan.template_key).toBe(keys[index % 3]);
    });
  });

  it("처방의 반복 범위가 그날 사다리의 최소~최대다", () => {
    for (const plan of build(8).p_plans) {
      const reps = plan.exercises[0].sets.map((set) => set.reps);
      expect(plan.exercises[0].prescription?.repsMin).toBe(Math.min(...reps));
      expect(plan.exercises[0].prescription?.repsMax).toBe(Math.max(...reps));
    }
  });

  it("휴식은 프로그램이 정한 값이고 RPC 허용 범위 안이다", () => {
    for (const plan of build().p_plans) {
      const rest = plan.exercises[0].prescription?.restSeconds ?? 0;
      expect(rest).toBe(PULLUP_LADDER_PROGRAM.restSeconds);
      expect(rest).toBeGreaterThanOrEqual(60);
      expect(rest).toBeLessThanOrEqual(300);
    }
  });

  /*
    ⚠️ `tabata_minutes`가 실리면 RPC가 그 회차를 **인터벌로 판정**하고
       종목 4개를 요구한다(0070). 사다리에는 절대 실리면 안 된다.
  */
  it("타바타 표식을 싣지 않는다", () => {
    for (const plan of build().p_plans) {
      expect(plan.tabata_minutes).toBeUndefined();
    }
  });

  /*
    ⚠️ 0100이 이 한 칸을 보고 종목 1개·세트 5개를 허용한다. 빠지면 RPC가
       사다리를 **근력으로 판정**해 종목 5~6개를 요구하고 등록이 거절된다.
  */
  it("회차마다 사다리 판별자를 싣는다", () => {
    for (const plan of build().p_plans) {
      expect(plan.plan_kind).toBe("ladder");
    }
  });
});

describe("buildCreateLadderEnrollmentRpcArgs — 사다리가 회차 번호대로 오른다", () => {
  it("1·2·3회차가 출처의 5·4·3·2·1 → 5·4·3·2·2 → 5·4·3·3·2다", () => {
    const plans = build(5).p_plans;
    expect(plans[0].exercises[0].sets.map((s) => s.reps)).toEqual([
      5, 4, 3, 2, 1,
    ]);
    expect(plans[1].exercises[0].sets.map((s) => s.reps)).toEqual([
      5, 4, 3, 2, 2,
    ]);
    expect(plans[2].exercises[0].sets.map((s) => s.reps)).toEqual([
      5, 4, 3, 3, 2,
    ]);
  });

  /*
    회차 번호(`week`·`session`)만으로 며칠째인지 되돌릴 수 있어야 한다 —
    계획 행에는 "몇 일차"라는 컬럼이 없기 때문이다.
  */
  it("모든 회차가 week·session이 가리키는 일차의 사다리를 담는다", () => {
    for (const plan of build(9).p_plans) {
      const day = ladderDayOfSession(plan.week, plan.session);
      expect(plan.exercises[0].sets.map((set) => set.reps)).toEqual([
        ...ladderRepsForDay(9, day),
      ]);
    }
  });

  it("입력한 최대 개수가 첫 회차 첫 세트가 된다", () => {
    expect(build(12).p_plans[0].exercises[0].sets[0].reps).toBe(12);
  });

  it("계획 제목이 일차와 사다리를 그대로 보여 준다", () => {
    expect(build(5).p_plans[2].title).toBe("풀업 사다리 3일차 · 5·4·3·3·2");
  });

  it("제목이 RPC 상한(80자)을 넘지 않는다", () => {
    for (const plan of build(30).p_plans) {
      expect(plan.title.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("buildCreateLadderEnrollmentRpcArgs — 등록 메타", () => {
  it("최대 개수를 세 난이도 칸에 접어 넣는다", () => {
    expect(build(5).p_level_at_start).toBe("beginner");
    expect(build(8).p_level_at_start).toBe("moderate");
    expect(build(12).p_level_at_start).toBe("experienced");
  });

  it("프로그램 키·버전·제목을 그대로 넘긴다", () => {
    const args = build();
    expect(args.p_program_key).toBe("pullup-ladder-18");
    expect(args.p_program_version).toBe(1);
    expect(args.p_title_snapshot).toBe(PULLUP_LADDER_PROGRAM.title);
  });
});

describe("buildCreateLadderEnrollmentRpcArgs — 거절해야 하는 입력", () => {
  it("범위 밖 최대 개수를 거절한다", () => {
    expect(() => build(4)).toThrow("program_invalid_max_reps");
    expect(() => build(31)).toThrow("program_invalid_max_reps");
  });

  it("프로그램이 정한 종목이 아닌 카탈로그 행을 거절한다", () => {
    expect(() =>
      buildCreateLadderEnrollmentRpcArgs({
        program: PULLUP_LADDER_PROGRAM,
        item: { ...PULLUP, name: "친업" },
        maxReps: 5,
        schedule: schedule(),
        startDate: "2026-09-07",
        timeZone: TIME_ZONE,
        preferredSlots: SLOTS,
      }),
    ).toThrow("program_catalog_item_invalid:친업");
  });

  /*
    남이 만든 동명 커스텀 종목이 골라지면 그 사람 종목에 18회 계획을 심는다.
    `resolveLadderProgram`이 막지만 여기서 한 번 더 잠근다.
  */
  it("커스텀 종목을 거절한다", () => {
    expect(() =>
      buildCreateLadderEnrollmentRpcArgs({
        program: PULLUP_LADDER_PROGRAM,
        item: {
          ...PULLUP,
          is_custom: true,
          created_by: "22222222-2222-4222-8222-222222222222",
        } as CatalogExercise,
        maxReps: 5,
        schedule: schedule(),
        startDate: "2026-09-07",
        timeZone: TIME_ZONE,
        preferredSlots: SLOTS,
      }),
    ).toThrow("program_catalog_item_invalid:풀업");
  });

  it("24회가 아닌 일정을 거절한다", () => {
    expect(() =>
      buildCreateLadderEnrollmentRpcArgs({
        program: PULLUP_LADDER_PROGRAM,
        item: PULLUP,
        maxReps: 5,
        schedule: schedule().slice(0, LADDER_SESSIONS - 1),
        startDate: "2026-09-07",
        timeZone: TIME_ZONE,
        preferredSlots: SLOTS,
      }),
    ).toThrow("program_plans_count");
  });

  /*
    휴식일을 프로그램이 정한다 (사장님 지시 2026-09-04). 날짜가 주기에서
    벗어나면 원문의 "5일 훈련 1일 휴식"이 아니다 — 화면이 무엇을 보내든
    여기서 막는다.
  */
  it("5일 훈련 1일 휴식 주기를 벗어난 날짜를 거절한다", () => {
    const bad = schedule().map((plan, index) =>
      // 쉬는 날을 없애고 6회차를 하루 당겨 연속 6일로 만든다.
      // ⚠️ `scheduledAt`도 같이 옮긴다 — 안 그러면 날짜·시각 불일치가 먼저
      //    걸려서 정작 확인하려던 주기 검사에 닿지 못한다.
      index === 5
        ? {
            ...plan,
            date: "2026-09-12",
            scheduledAt: localDateTimeToIso("2026-09-12", TIME, TIME_ZONE),
          }
        : plan,
    );
    expect(() =>
      buildCreateLadderEnrollmentRpcArgs({
        program: PULLUP_LADDER_PROGRAM,
        item: PULLUP,
        maxReps: 5,
        schedule: bad,
        startDate: "2026-09-07",
        timeZone: TIME_ZONE,
        preferredSlots: SLOTS,
      }),
    ).toThrow("program_invalid_plan_date");
  });

  it("슬롯에 없는 시각의 회차를 거절한다", () => {
    const bad = [...schedule()];
    bad[4] = {
      ...bad[4],
      scheduledAt: localDateTimeToIso(bad[4].date, "21:30", TIME_ZONE),
    };
    expect(() =>
      buildCreateLadderEnrollmentRpcArgs({
        program: PULLUP_LADDER_PROGRAM,
        item: PULLUP,
        maxReps: 5,
        schedule: bad,
        startDate: "2026-09-07",
        timeZone: TIME_ZONE,
        preferredSlots: SLOTS,
      }),
    ).toThrow("program_scheduled_time_mismatch");
  });
});
