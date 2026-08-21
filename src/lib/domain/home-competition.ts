/**
 * 홈 상단 경쟁 보드의 순수 표시 규칙 (2026-08-21).
 *
 * 설계: `docs/superpowers/specs/2026-08-21-home-personal-crew-competition-board-design.md`
 *
 * 이 모듈은 I/O를 하지 않는다. 조회는 홈(`home-client.tsx`)과 크루 카드가 하고,
 * 여기서는 **내 오늘 상태를 무슨 말로 어떻게 비교할지**만 정한다.
 *
 * ⚠️ 등수를 만들지 않는다. 비교는 "같은 기간·같은 기준의 상태를 나란히 놓는 것"까지다
 *    (설계 §1) — 크루를 성과순으로 줄 세우는 것은 `friend-board.ts`가 명시적으로
 *    거부한 것이고 여기서 우회로 되살리면 안 된다.
 */

import type { FriendStatus } from "./friend-board";

/** 크루의 오늘 — `total`은 나를 뺀 크루 수, `done`은 그중 오늘 마친 사람 */
export type CrewTodaySummary = { total: number; done: number };

/**
 * 내 카드 하단 행동 영역.
 *
 * ⚠️ `kind`가 곧 **마크업의 갈래**다. `link`는 `/record`로 가는 진짜 링크이고,
 * `success`는 누를 수 없는 배너다 — 완료한 사람에게 다음 운동을 재촉하지 않는다
 * (설계 §6.2, 사용자 확정). 문구만 바꾸고 둘 다 링크로 그리면 그 결정이 사라진다.
 */
export type PersonalTodayAction =
  | { kind: "link"; label: string }
  | { kind: "success"; label: string };

/**
 * 내 오늘 상태 3단계 — 크루 행과 **같은 규칙**을 쓴다.
 *
 * ⚠️ 완료가 운동 중보다 우선한다. 오늘 이미 마쳤는데 또 하는 중일 수 있고, 그
 * 사람에게 필요한 말은 "운동 중"이 아니라 "완료"다(`friend-board.ts`의
 * `friendStatus`와 같은 판정 — 두 곳이 갈리면 같은 사람이 내 카드와 크루 행에서
 * 다른 상태로 보인다).
 */
export function resolvePersonalTodayStatus(
  workedOutToday: boolean,
  isActive: boolean,
): FriendStatus {
  if (workedOutToday) return "done";
  return isActive ? "active" : "idle";
}

/**
 * 크루 완료 요약.
 *
 * ⚠️ **내 행을 넣지 마라.** 분자에 나를 섞으면 "크루 2명 중 2명 완료 · 나도 완료"
 * 처럼 나를 두 번 세는 문장이 된다. 크루 카드의 `rows`는 이미 나를 제외한 목록이다.
 */
export function crewTodaySummary(
  rows: ReadonlyArray<{ status: FriendStatus }>,
): CrewTodaySummary {
  return {
    total: rows.length,
    done: rows.filter((row) => row.status === "done").length,
  };
}

/**
 * 홈에서 완료 인원을 말하는 **유일한 문장** (설계 §6.1).
 *
 * ⚠️ 크루 카드 헤더에 `1 / 2명 완료` 칩을 다시 만들지 마라. 같은 사실을 두 곳에서
 * 말하면 화면이 넓어지기만 하고 읽는 속도는 느려진다(2026-08-21 보완 기준 2).
 *
 * `null`(조회 전)과 `total === 0`(크루 없음)을 구별한다 — 합치면 조회가 늦는 동안
 * "아직 크루가 없어요"가 번쩍인다.
 */
export function personalComparisonText(
  summary: CrewTodaySummary | null,
  status: FriendStatus,
): string {
  if (summary === null) return "크루 현황을 불러오는 중…";
  if (summary.total === 0) return "아직 크루가 없어요";
  const mine =
    status === "done"
      ? "나도 완료"
      : status === "active"
        ? "나는 운동 중"
        : "나는 아직";
  return `크루 ${summary.total}명 중 ${summary.done}명 완료 · ${mine}`;
}

/**
 * 상태별 주 행동.
 *
 * ⚠️ `maxWorkoutXp`를 **인자로 받는다.** 문구에 숫자를 박으면 `MAX_DAILY_WORKOUT_XP_NOW`가
 * 180으로 오를 때 화면만 160으로 남아 **받을 수 없는 XP를 약속하게 된다**
 * (`lib/domain/xp.ts:41` 주석이 같은 이유로 상수를 쓰라고 한다).
 */
export function personalTodayAction(
  status: FriendStatus,
  maxWorkoutXp: number,
): PersonalTodayAction {
  if (status === "done") {
    return { kind: "success", label: "오늘 운동 완료! 오늘도 해냈어요 🔥" };
  }
  if (status === "active") {
    return { kind: "link", label: "운동 이어가기" };
  }
  return { kind: "link", label: `오늘 운동하고 +${maxWorkoutXp} XP` };
}
