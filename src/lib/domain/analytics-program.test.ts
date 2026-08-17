import { describe, expect, it } from "vitest";
import {
  buildProgramMetrics,
  type ProgramEnrollmentRow,
  type ProgramSessionRow,
} from "./analytics-program";
import { buildPeriod } from "./analytics";
import { PROGRAM_TOTAL_SESSIONS } from "./program-schedule";

const now = new Date("2026-08-17T00:00:00Z");
const period = buildPeriod(28, now);

function enrollment(
  over: Partial<ProgramEnrollmentRow> & { id: string },
): ProgramEnrollmentRow {
  return {
    userId: `u-${over.id}`,
    programKey: "shoulder-frame-6w",
    title: "상체의 틀을 넓히는 6주",
    status: "active",
    createdAt: new Date("2026-08-10T00:00:00Z"),
    endedAt: null,
    ...over,
  };
}

/** n회 완료한 회차 행을 만든다 */
function sessions(enrollmentId: string, completed: number): ProgramSessionRow[] {
  return Array.from({ length: completed }, () => ({
    enrollmentId,
    completedAt: new Date("2026-08-11T00:00:00Z"),
  }));
}

describe("buildProgramMetrics", () => {
  it("등록이 없으면 모든 비율이 모수 0이고 터지지 않는다", () => {
    const m = buildProgramMetrics([], [], 10, period);
    expect(m.enrollments).toBe(0);
    expect(m.enrolledUsers).toBe(0);
    expect(m.adoption.denominator).toBe(10);
    expect(m.adoption.numerator).toBe(0);
    // 끝난 등록이 없으면 완주율의 모수도 0이다 — 0%가 아니라 "측정 불가"여야 한다
    expect(m.completionRate.denominator).toBe(0);
    expect(m.avgSessionsAtDropout).toBeNull();
    expect(m.byProgram).toEqual([]);
  });

  it("상태별 개수와 완주율을 센다 — 진행 중은 완주율 모수에서 빠진다", () => {
    const rows = [
      enrollment({ id: "a", status: "active" }),
      enrollment({ id: "b", status: "completed", endedAt: now }),
      enrollment({ id: "c", status: "cancelled", endedAt: now }),
      enrollment({ id: "d", status: "cancelled", endedAt: now }),
    ];
    const m = buildProgramMetrics(rows, [], 4, period);
    expect(m.active).toBe(1);
    expect(m.completed).toBe(1);
    expect(m.cancelled).toBe(2);
    // 아직 하는 중인 사람을 실패로 세면 완주율이 실제보다 낮게 나온다
    expect(m.completionRate).toEqual({ numerator: 1, denominator: 3 });
  });

  it("등록률의 모수는 활성 사용자 수이고, 한 사람이 여러 개 등록해도 1명이다", () => {
    const rows = [
      enrollment({ id: "a", userId: "u1" }),
      enrollment({ id: "b", userId: "u1" }),
      enrollment({ id: "c", userId: "u2" }),
    ];
    const m = buildProgramMetrics(rows, [], 8, period);
    expect(m.enrollments).toBe(3);
    expect(m.enrolledUsers).toBe(2);
    expect(m.adoption).toEqual({ numerator: 2, denominator: 8 });
  });

  it("퍼널은 완료 회차 수로 갈린다 — 절반과 완주 기준이 18회에서 파생된다", () => {
    const rows = [
      enrollment({ id: "none" }),
      enrollment({ id: "one" }),
      enrollment({ id: "half" }),
      enrollment({ id: "done", status: "completed", endedAt: now }),
    ];
    const rowsSessions = [
      ...sessions("one", 1),
      ...sessions("half", Math.ceil(PROGRAM_TOTAL_SESSIONS / 2)),
      ...sessions("done", PROGRAM_TOTAL_SESSIONS),
    ];
    const m = buildProgramMetrics(rows, rowsSessions, 4, period);
    expect(m.funnel.map((s) => s.count)).toEqual([4, 3, 2, 1]);
    expect(m.funnel[0].label).toContain("등록");
  });

  it("완료하지 않은 회차 행은 진행에 안 센다", () => {
    const rows = [enrollment({ id: "a" })];
    const rowsSessions: ProgramSessionRow[] = [
      { enrollmentId: "a", completedAt: null },
      { enrollmentId: "a", completedAt: null },
    ];
    const m = buildProgramMetrics(rows, rowsSessions, 1, period);
    // 담기만 하고 안 끝낸 회차를 진행으로 세면 "시작은 했다"가 부풀려진다
    expect(m.funnel[1].count).toBe(0);
  });

  it("포기 시점 평균 회차와 '한 번도 안 한 채 포기' 비율을 센다", () => {
    const rows = [
      enrollment({ id: "x", status: "cancelled", endedAt: now }),
      enrollment({ id: "y", status: "cancelled", endedAt: now }),
      enrollment({ id: "z", status: "cancelled", endedAt: now }),
    ];
    const m = buildProgramMetrics(
      rows,
      [...sessions("y", 2), ...sessions("z", 4)],
      3,
      period,
    );
    expect(m.avgSessionsAtDropout).toBe(2); // (0+2+4)/3
    expect(m.dropoutBeforeFirstSession).toEqual({
      numerator: 1,
      denominator: 3,
    });
  });

  it("기간 내 신규 등록만 따로 센다 — 누적과 섞지 않는다", () => {
    const rows = [
      enrollment({ id: "old", createdAt: new Date("2026-06-01T00:00:00Z") }),
      enrollment({ id: "new", createdAt: new Date("2026-08-15T00:00:00Z") }),
    ];
    const m = buildProgramMetrics(rows, [], 2, period);
    // 6주 프로그램을 7일 창으로 자르면 완주가 0일 수밖에 없다.
    // 그래서 누적이 기본이고, 기간 지표는 '신규 등록'만이다.
    expect(m.enrollments).toBe(2);
    expect(m.newEnrollmentsInPeriod).toBe(1);
  });

  it("프로그램별 집계는 등록이 많은 순이고 제목을 함께 낸다", () => {
    const rows = [
      enrollment({ id: "a", programKey: "interval-burn-6w", title: "인터벌" }),
      enrollment({ id: "b", programKey: "interval-burn-6w", title: "인터벌" }),
      enrollment({
        id: "c",
        programKey: "shoulder-frame-6w",
        title: "어깨",
        status: "completed",
        endedAt: now,
      }),
    ];
    const m = buildProgramMetrics(rows, [], 3, period);
    expect(m.byProgram[0]).toEqual({
      programKey: "interval-burn-6w",
      title: "인터벌",
      count: 2,
      completed: 0,
    });
    expect(m.byProgram[1].completed).toBe(1);
  });
});
