/**
 * 공식 6주 프로그램 지표 — 순수 함수만. DB·네트워크 접근 금지.
 *
 * 왜 별도 파일인가: `analytics.ts`는 "가입·운동·리텐션"을 본다. 프로그램은
 * **등록이라는 별도의 약속**을 재료로 쓰고 기간 처리 규칙도 다르다(아래 참조).
 *
 * ⚠️ **기간 필터를 전체에 적용하지 않는다.** 6주짜리 프로그램을 7일 창으로 자르면
 * 완주가 0일 수밖에 없다 — 그 0은 "아무도 못 끝냈다"가 아니라 "볼 수 없는 창으로
 * 봤다"는 뜻이다. 그래서 상태·완주율·퍼널은 **누적**이고, 기간 지표는
 * `newEnrollmentsInPeriod` 하나뿐이다.
 */

import { ratio, type Period, type Ratio } from "./analytics";
import { PROGRAM_TOTAL_SESSIONS } from "./program-schedule";

export type ProgramEnrollmentStatus = "active" | "completed" | "cancelled";

export interface ProgramEnrollmentRow {
  id: string;
  userId: string;
  programKey: string;
  /** 등록 당시 제목 스냅샷. 프로그램 정의가 바뀌어도 그때 이름으로 남는다 */
  title: string;
  status: ProgramEnrollmentStatus;
  createdAt: Date;
  /** completed_at ?? cancelled_at. 진행 중이면 null */
  endedAt: Date | null;
}

export interface ProgramSessionRow {
  enrollmentId: string;
  /** null이면 담기만 하고 아직 안 끝낸 회차다 */
  completedAt: Date | null;
}

export interface ProgramFunnelStep {
  label: string;
  count: number;
}

export interface ProgramByKey {
  programKey: string;
  title: string;
  count: number;
  completed: number;
}

export interface ProgramMetrics {
  /** 누적 등록 수 */
  enrollments: number;
  /** 누적 등록자 수(사람). 한 사람이 여러 개 등록해도 1 */
  enrolledUsers: number;
  /** 기간 내 신규 등록 — 유일한 기간 지표 */
  newEnrollmentsInPeriod: number;
  /** 등록자 / 활성 사용자 */
  adoption: Ratio;
  active: number;
  completed: number;
  cancelled: number;
  /** 완주 / 끝난 등록(완주+포기). **진행 중은 모수에서 뺀다** */
  completionRate: Ratio;
  /** 등록 → 1회+ → 절반+ → 완주 */
  funnel: ProgramFunnelStep[];
  /** 포기한 등록이 평균 몇 회차에서 멈췄나. 포기가 없으면 null */
  avgSessionsAtDropout: number | null;
  /** 포기 중 한 회차도 안 끝낸 비율 */
  dropoutBeforeFirstSession: Ratio;
  byProgram: ProgramByKey[];
}

/** 절반 기준. 18회의 절반은 9회 — 홀수여도 올림해 "절반을 넘겼다"를 지킨다 */
const HALF_SESSIONS = Math.ceil(PROGRAM_TOTAL_SESSIONS / 2);

function inRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d < to;
}

export function buildProgramMetrics(
  enrollments: ProgramEnrollmentRow[],
  programSessions: ProgramSessionRow[],
  activeUsers: number,
  period: Period,
): ProgramMetrics {
  // 완료한 회차만 센다. 담기만 한 행을 세면 "시작은 했다"가 부풀려진다.
  const doneByEnrollment = new Map<string, number>();
  for (const s of programSessions) {
    if (s.completedAt === null) continue;
    doneByEnrollment.set(
      s.enrollmentId,
      (doneByEnrollment.get(s.enrollmentId) ?? 0) + 1,
    );
  }
  const doneOf = (e: ProgramEnrollmentRow) => doneByEnrollment.get(e.id) ?? 0;

  const active = enrollments.filter((e) => e.status === "active").length;
  const completed = enrollments.filter((e) => e.status === "completed").length;
  const cancelledRows = enrollments.filter((e) => e.status === "cancelled");
  const cancelled = cancelledRows.length;

  const dropoutSessions = cancelledRows.map(doneOf);
  const avgSessionsAtDropout =
    dropoutSessions.length === 0
      ? null
      : Math.round(
          (dropoutSessions.reduce((a, b) => a + b, 0) / dropoutSessions.length) *
            10,
        ) / 10;

  const byKey = new Map<string, ProgramByKey>();
  for (const e of enrollments) {
    const row = byKey.get(e.programKey) ?? {
      programKey: e.programKey,
      title: e.title,
      count: 0,
      completed: 0,
    };
    row.count += 1;
    if (e.status === "completed") row.completed += 1;
    byKey.set(e.programKey, row);
  }

  return {
    enrollments: enrollments.length,
    enrolledUsers: new Set(enrollments.map((e) => e.userId)).size,
    newEnrollmentsInPeriod: enrollments.filter((e) =>
      inRange(e.createdAt, period.from, period.to),
    ).length,
    adoption: ratio(new Set(enrollments.map((e) => e.userId)).size, activeUsers),
    active,
    completed,
    cancelled,
    completionRate: ratio(completed, completed + cancelled),
    funnel: [
      { label: "등록", count: enrollments.length },
      {
        label: "1회차 완료",
        count: enrollments.filter((e) => doneOf(e) >= 1).length,
      },
      {
        label: `절반(${HALF_SESSIONS}회)`,
        count: enrollments.filter((e) => doneOf(e) >= HALF_SESSIONS).length,
      },
      {
        label: `완주(${PROGRAM_TOTAL_SESSIONS}회)`,
        count: enrollments.filter(
          (e) => doneOf(e) >= PROGRAM_TOTAL_SESSIONS || e.status === "completed",
        ).length,
      },
    ],
    avgSessionsAtDropout,
    dropoutBeforeFirstSession: ratio(
      dropoutSessions.filter((n) => n === 0).length,
      cancelled,
    ),
    byProgram: [...byKey.values()].sort((a, b) => b.count - a.count),
  };
}
