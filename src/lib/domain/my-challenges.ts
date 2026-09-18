/**
 * "내 챌린지" 목록과 상태별 대표 버튼 (2026-09-18 챌린지 탭 개편).
 *
 * 옛 화면은 가로 칩(`ChallengePicker`)으로 챌린지 하나를 고르고, 고른 것의
 * setup·active·ended 블록을 **한 화면에 전부** 펼쳤다. 새 화면은
 *   ① 목록 — 상태별 칸(진행 중·준비 중·초대받음·종료)
 *   ② 상세 — 대표 버튼 **하나**
 * 로 나눈다. 여기는 그 판정만 한다(순수·테스트 대상).
 *
 * ⚠️ 대표 버튼을 화면에서 다시 고르지 마라. 목록 카드와 상세가 같은 상태에 다른
 *    버튼을 달면 "눌렀더니 또 다른 버튼이 나온다"가 된다. 문맥(`card`/`detail`)이
 *    다른 것은 의도다 — 상세는 **이미 준비 화면**이라 "시작 준비 보기"가 자기
 *    자신을 가리키게 되므로 그 자리에 친구 초대를 둔다.
 */
import { inclusiveDays } from "./challenge-time";

export type MyChallengeLike = {
  id: string;
  status: "setup" | "active" | "ended" | "cancelled";
  myStatus: "invited" | "joined" | "dropped";
  start_date: string;
  end_date: string;
  created_at: string;
};

export type MySection = "active" | "setup" | "invited" | "ended";

export const SECTION_LABEL: Record<MySection, string> = {
  active: "진행 중",
  setup: "준비 중",
  invited: "초대받음",
  ended: "종료",
};

const SECTION_ORDER: readonly MySection[] = ["active", "setup", "invited", "ended"];

export function sectionOf(c: MyChallengeLike): MySection | null {
  if (c.status === "cancelled") return null;
  if (c.myStatus === "invited") {
    // 미응답 초대는 autostart가 지운다. 시작한 방의 invited는 없어야 하지만,
    // 있더라도 참가할 수 없으므로 보이지 않게 둔다.
    return c.status === "setup" ? "invited" : null;
  }
  // 목표를 안 세워 빠진 사람에게 진행 중 칸의 "오늘 운동하기"는 거짓말이다.
  if (c.myStatus === "dropped") return "ended";
  if (c.status === "active") return "active";
  if (c.status === "setup") return "setup";
  return "ended";
}

/** 칸 안의 순서 — 규칙이 없으면 조회할 때마다 순서가 바뀐다 */
function compareIn(section: MySection) {
  return (a: MyChallengeLike, b: MyChallengeLike) => {
    const tie = a.created_at.localeCompare(b.created_at);
    switch (section) {
      case "active":
        return a.end_date.localeCompare(b.end_date) || tie; // 곧 끝나는 것부터
      case "setup":
      case "invited":
        return a.start_date.localeCompare(b.start_date) || tie; // 곧 시작하는 것부터
      case "ended":
        return b.end_date.localeCompare(a.end_date) || tie; // 최근에 끝난 것부터
    }
  };
}

/** 비어 있는 칸은 돌려주지 않는다. 원본 배열은 건드리지 않는다. */
export function groupMyChallenges<T extends MyChallengeLike>(
  list: readonly T[],
): { section: MySection; items: T[] }[] {
  const buckets = new Map<MySection, T[]>();
  for (const c of list) {
    const s = sectionOf(c);
    if (!s) continue;
    const arr = buckets.get(s) ?? [];
    arr.push(c);
    buckets.set(s, arr);
  }
  return SECTION_ORDER.filter((s) => buckets.has(s)).map((s) => ({
    section: s,
    items: [...buckets.get(s)!].sort(compareIn(s)),
  }));
}

export type ChallengeActionKind =
  | "goto_record"
  | "open_goal_setup"
  | "open_detail"
  | "accept_invite"
  | "share_invite"
  | "finalize"
  | "none";

export type ChallengeAction = { kind: ChallengeActionKind; label: string };

const NONE: ChallengeAction = { kind: "none", label: "" };

/**
 * 상태별 대표 버튼 하나.
 *
 * @param endedByDate 종료일이 지났는데 아직 active인가(autofinalize 전) —
 *   그때 할 일은 운동이 아니라 결과다.
 */
export function primaryActionOf(
  c: MyChallengeLike & { hasMyGoals: boolean; endedByDate: boolean },
  context: "card" | "detail",
): ChallengeAction {
  if (c.status === "cancelled") return NONE;

  if (c.myStatus === "invited") {
    return context === "card"
      ? { kind: "open_detail", label: "초대 확인" }
      : { kind: "accept_invite", label: "참여하기" };
  }

  if (c.myStatus === "dropped") {
    return context === "card" ? { kind: "open_detail", label: "결과 보기" } : NONE;
  }

  if (c.status === "setup") {
    if (!c.hasMyGoals) return { kind: "open_goal_setup", label: "내 목표 정하기" };
    return context === "card"
      ? { kind: "open_detail", label: "시작 준비 보기" }
      : { kind: "share_invite", label: "친구 초대하기" };
  }

  if (c.status === "active") {
    if (c.endedByDate) {
      return context === "card"
        ? { kind: "open_detail", label: "결과 보기" }
        : { kind: "finalize", label: "결과 발표하기" };
    }
    return { kind: "goto_record", label: "오늘 운동하기" };
  }

  // ended
  return context === "card" ? { kind: "open_detail", label: "결과 보기" } : NONE;
}

export type DayProgress = {
  phase: "before" | "running" | "after";
  /** 오늘이 몇째 날인가 (시작 전 0, 끝난 뒤 total) */
  day: number;
  total: number;
  /** 0~1 — 날짜만으로 잰 진행 막대. 운동 실적이 아니다 */
  ratio: number;
  /** 시작까지 남은 날 (시작 전에만 0보다 크다) */
  daysUntilStart: number;
};

/**
 * "DAY 7 / 28" — **날짜만으로** 계산한다.
 *
 * ⚠️ 목록 카드에 운동 실적(이번 주 2/3)을 그리려면 챌린지마다 기간 세션 RPC를
 *    한 번씩 불러야 한다. 1차는 조회 0건인 이 값만 쓴다.
 */
export function challengeDayProgress(
  todayKey: string,
  startKey: string,
  endKey: string,
): DayProgress {
  const total = Math.max(1, inclusiveDays(startKey, endKey));
  if (todayKey < startKey) {
    return {
      phase: "before",
      day: 0,
      total,
      ratio: 0,
      daysUntilStart: inclusiveDays(todayKey, startKey) - 1,
    };
  }
  if (todayKey > endKey) {
    return { phase: "after", day: total, total, ratio: 1, daysUntilStart: 0 };
  }
  const day = inclusiveDays(startKey, todayKey);
  return { phase: "running", day, total, ratio: day / total, daysUntilStart: 0 };
}
