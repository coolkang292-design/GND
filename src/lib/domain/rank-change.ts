/**
 * 챌린지 등수 변동 알림 — 무엇을 누구에게 보낼지 정하는 순수 함수 (I/O 없음).
 *
 * 계획: docs/superpowers/plans/2026-11-15-challenge-rank-change-notification.md
 *
 * 규칙 (사용자 결정 2026-11-15)
 *  · 한 명이라도 등수가 바뀌면 **참가자 전원**에게 1건씩 보낸다.
 *    - 올라간 사람: `📈 N위로 올랐어요`
 *    - 밀린 사람:   `📉 N위로 밀렸어요` + **다시 추월하려면 무엇을 해야 하는지** 제안
 *    - 그대로인 사람: `📊 순위가 바뀌었어요 · N위 그대로`
 *  · 첫 계산(이전 스냅샷 없음)은 기준선만 저장한다 — 허위 알림 방지.
 *  · 쿨다운 안에 이미 받은 사람은 건너뛴다(스냅샷은 항상 최신으로).
 *
 * ⚠️ 점수를 여기서 다시 계산하지 않는다 — `scoreParticipant`만 쓴다
 *    (goal-score.ts 주석: 점수 조립을 두 벌로 만들면 화면마다 숫자가 갈라진다).
 * ⚠️ 제안 문구는 **내 목표**와 **실제 순위 시뮬레이션**으로만 만든다. 점수는 문구에 넣지 않는다.
 *    닉네임은 "○○님이 N위 됐어요"로만 쓴다(사용자 결정 2026-11-15).
 */

import {
  rankParticipants,
  type GoalType,
  type ParticipantInput,
} from "./goal-score";

export const RANK_CHANGE_COOLDOWN_MS = 30 * 60 * 1000;

const EPSILON = 1e-9;

export type RankRow = { userId: string; rank: number };

export type GoalDescriptor = { label: string; unit: string };

export type RankChangeNotification = {
  userId: string;
  /**
   * `rank_drop` = 밀린 사람 — 누르면 기록 탭이 제안 운동을 담는다(`/record?suggest=overtake`).
   * `rank_change` = 올라감·그대로 — 챌린지 탭으로 간다. **세팅은 밀린 사람에게만** 한다.
   */
  type: "rank_change" | "rank_drop";
  title: string;
  body: string;
  /** 밀린 사람만. 화면이 무엇을 담을지 정하는 재료 — **종목이 아니라 목표 종류만** 싣는다 */
  meta: { goal_type: GoalType | null } | null;
};

export type RankChangePlan = {
  /** 이전 스냅샷이 없어 기준선만 저장하는 경우 */
  baseline: boolean;
  notifications: RankChangeNotification[];
  /** 알림을 실제로 보낸 사람 — `notified_at` 갱신 대상 */
  notifiedUserIds: string[];
  /** 저장할 최신 순위 (전원) */
  snapshot: RankRow[];
};

/** 공동 순위면 `공동 N위`, 단독이면 `N위` */
export function rankLabel(rank: number, rows: readonly RankRow[]): string {
  const sharing = rows.filter((r) => r.rank === rank).length;
  return sharing > 1 ? `공동 ${rank}위` : `${rank}위`;
}

/** 남은 양 표기 — 올림해서 "이만큼 하면 된다"가 거짓이 되지 않게 한다 */
function formatRemaining(remaining: number, unit: string): string {
  const up = Math.ceil(remaining * 10 - EPSILON) / 10;
  const text = Number.isInteger(up) ? String(up) : up.toFixed(1);
  return `${text}${unit}`;
}

/**
 * 밀린 사람이 **이전 순위를 탈환하려면** 무엇을 하면 되는지 한 줄.
 *
 * 후보를 실제 순위 계산(`rankParticipants` — 점수식·동점 규칙 전부)으로 시뮬레이션해서,
 * **해 보면 정말로 그 순위가 되는 것만** 말한다 — 말해 놓고 안 되는 제안은 거짓말이다.
 *  1) 아직 못 채운 목표 하나를 끝까지 채우기 (남은 비율이 가장 작은 것부터)
 *  2) 안 되면 그 목표 + 운동 하루 더
 *  목표 순위는 **이전 순위(탈환)** 부터 시작해, 안 되면 한 칸씩 낮춰 현재 바로 위까지
 *  (그때는 "N위까지 올라갈 수 있어요"). 그래도 없으면 null — 호출 쪽이 일반 문구로 대체한다.
 */
export function suggestOvertake(input: {
  me: ParticipantInput;
  /** 방 전원(나 포함)의 채점 입력 — 순위는 화면과 같은 `rankParticipants`로 잰다 */
  all: readonly ParticipantInput[];
  currentRank: number;
  /** 되찾으려는 이전 순위 */
  beforeRank: number;
  describeGoal: (type: GoalType) => GoalDescriptor;
  /**
   * 순위를 재는 함수 — **화면과 같은 것**을 넣는다(v1/v2 `rankForChallenge`).
   * 안 넣으면 v1 `rankParticipants`. (v2에서 "운동 하루 더"는 세션 수 동점 기준을 못 바꾸므로 근사다.)
   */
  rankWith?: (inputs: readonly ParticipantInput[]) => { userId: string; rank: number }[];
}): { text: string; goalType: GoalType } | null {
  const { me, all, currentRank, beforeRank, describeGoal } = input;
  const rankWith = input.rankWith ?? ((i) => rankParticipants([...i]));

  /** 내가 `p`가 됐을 때의 순위. `shared`면 공동 순위(누군가와 완전 동점)다. */
  const rankIf = (p: ParticipantInput): { rank: number; shared: boolean } => {
    const ranked = rankWith(all.map((x) => (x.userId === me.userId ? p : x)));
    const mine = ranked.find((r) => r.userId === me.userId);
    if (!mine) return { rank: Number.POSITIVE_INFINITY, shared: false };
    return {
      rank: mine.rank,
      shared: ranked.filter((r) => r.rank === mine.rank).length > 1,
    };
  };

  const unfinished = me.goals
    .map((g, index) => ({ g, index, left: g.target - g.actual }))
    .filter((x) => x.g.target > 0 && x.left > EPSILON)
    // 가장 끝에 가까운 목표(남은 비율이 작은 것)부터 — 제일 해볼 만한 제안
    .sort((a, b) => a.left / a.g.target - b.left / b.g.target);

  const completeGoal = (index: number): ParticipantInput => ({
    ...me,
    goals: me.goals.map((g, i) => (i === index ? { ...g, actual: g.target } : g)),
  });
  const withExtraDay = (p: ParticipantInput): ParticipantInput => ({
    ...p,
    workoutDays: p.workoutDays + 1,
  });

  const candidates = [
    ...unfinished.map((x) => ({ x, day: false, rank: rankIf(completeGoal(x.index)) })),
    ...unfinished.map((x) => ({
      x,
      day: true,
      rank: rankIf(withExtraDay(completeGoal(x.index))),
    })),
  ];

  for (let target = beforeRank; target <= currentRank - 1; target += 1) {
    // ⚠️ 공동 순위로 목표에 걸치는 건 '탈환'이라 말하지 않는다 — 확실히 그 순위일 때만.
    const hit = candidates.find(
      (c) => c.rank.rank < target || (c.rank.rank === target && !c.rank.shared),
    );
    if (!hit) continue;
    const d = describeGoal(hit.x.g.type);
    const what = hit.day
      ? `${d.label} ${formatRemaining(hit.x.left, d.unit)} 채우고 운동 하루 더 하면`
      : `${d.label} ${formatRemaining(hit.x.left, d.unit)} 더 하면`;
    const result =
      target === beforeRank
        ? `다시 ${target}위를 탈환할 수 있어요`
        : `${target}위까지 올라갈 수 있어요`;
    return { text: `${what} ${result}`, goalType: hit.x.g.type };
  }
  return null;
}

/**
 * 설정의 `순위` 스위치(`notification_settings.ranks`)를 끈 사람은 뺀다.
 *
 * ⚠️ **행이 없으면 켜짐**이다 — 0011 이래 모든 알림 설정의 관례(`coalesce(ns.ranks, true)`,
 *    0013 `finalize_challenge`). `ranks === false`일 때만 뺀다. 이 함수를 빼먹으면 "순위 알림을
 *    껐는데 오네"가 된다(2026-11-15 개발 확인 중 발견: 라우트가 설정을 안 보고 있었다).
 */
export function filterByRanksSetting<T extends { userId: string }>(
  notifications: readonly T[],
  settings: readonly { userId: string; ranks: boolean | null }[],
): T[] {
  const off = new Set(settings.filter((s) => s.ranks === false).map((s) => s.userId));
  return notifications.filter((n) => !off.has(n.userId));
}


/**
 * 본문 문구 변형 (사용자 요청 2026-11-15: "약간의 위트와 재치").
 *
 * ⚠️ **고정 어구는 모든 변형에 그대로 둔다** — 테스트와 사용자가 의미를 확인하는 부분이다:
 *    `지금 나는 N위예요`(밀림) · `N위 → M위`(오름) · `N위 그대로`(그대로) · `다시 N위를 탈환`(제안).
 *    위트는 그 옆의 꼬리표 이모지·한마디에만 얹는다 — 말장난이 사실을 가리면 안 된다.
 * ⚠️ 날짜·시각 기반 결정적 선택이다(`variantSeed`). 랜덤은 같은 입력에 다른 문구가 나와
 *    테스트·재현이 어렵다(`streak-messages.ts` 머리주석과 같은 이유).
 */
const DROP_ME: ((label: string) => string)[] = [
  (l) => `지금 나는 ${l}예요 👑 왕좌는 잠깐 빌려준 것뿐!`,
  (l) => `지금 나는 ${l}예요 🪑 잠깐 앉아서 쉬었을 뿐이에요`,
  (l) => `지금 나는 ${l}예요 🔥 복수는 운동으로 하는 거예요`,
  (l) => `지금 나는 ${l}예요 🏃 지금은 도움닫기 구간이에요`,
];
const DROP_TAIL: string[] = ["💪", "🔥", "⚡", "😤"];
const DROP_FALLBACK: ((before: number) => string)[] = [
  (b) => `오늘 운동하면 다시 ${b}위를 탈환할 수 있어요`,
  (b) => `오늘 땀 한 방울이면 다시 ${b}위를 탈환할 수 있어요 💦`,
  (b) => `오늘 한 세트만 해도 다시 ${b}위를 탈환할 수 있어요 😏`,
];
const SAME_BODY: ((label: string) => string)[] = [
  (l) => `내 순위는 ${l} 그대로예요`,
  (l) => `나는 ${l} 그대로예요 🧘 흔들림 없는 한 칸`,
  (l) => `나는 ${l} 그대로예요 😎 느긋하게 구경 중이에요`,
];
const RISE_TAIL: string[] = ["", " · 오늘의 주인공은 바로 나 😎", " · 계단 오르는 소리가 들려요 🪜"];

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[Math.abs(Math.trunc(seed)) % variants.length];
}

export function planRankChange(input: {
  challengeName: string;
  prev: readonly RankRow[];
  next: readonly RankRow[];
  /** userId → 마지막으로 이 방에서 등수 알림을 보낸 시각(ISO) */
  lastNotifiedAt: Record<string, string | null | undefined>;
  now: Date;
  /** 제안 문구 재료 — 없으면 일반 문구로 보낸다 */
  inputs?: Record<string, ParticipantInput>;
  describeGoal?: (type: GoalType) => GoalDescriptor;
  /**
   * userId → 닉네임. 있으면 본인 외 참가자에게 "○○님이 N위 됐어요"로 알린다
   * (사용자 결정 2026-11-15 — 이름 노출). 없으면 이름 없는 옛 문구로 간다.
   */
  nicknames?: Record<string, string>;
  /** 탈환 시뮬레이션에 쓸 순위 함수 — 화면과 같은 것(`getActiveChallengeStanding().rankWith`) */
  rankWith?: (inputs: readonly ParticipantInput[]) => { userId: string; rank: number }[];
  /** 문구 변형을 고르는 씨앗 — 안 주면 0(첫 변형). 호출 쪽이 시각 기반 값을 준다 */
  variantSeed?: number;
}): RankChangePlan {
  const { challengeName, prev, next, lastNotifiedAt, now } = input;
  const seed = input.variantSeed ?? 0;
  const snapshot = next.map((r) => ({ userId: r.userId, rank: r.rank }));

  if (prev.length === 0) {
    return { baseline: true, notifications: [], notifiedUserIds: [], snapshot };
  }

  const prevRank = new Map(prev.map((r) => [r.userId, r.rank]));
  // 이전 스냅샷에 없던 사람(새 합류)은 "바뀐 것"으로 치지 않는다.
  const anyChanged = next.some((r) => {
    const before = prevRank.get(r.userId);
    return before !== undefined && before !== r.rank;
  });
  if (!anyChanged) {
    return { baseline: false, notifications: [], notifiedUserIds: [], snapshot };
  }

  // 이번 변동의 주인공 — 순위가 가장 크게 오른 사람(최고 순위 → 많이 뛴 순).
  // 본인 외 참가자에게는 "○○님이 N위 됐어요"로 이 사람을 알린다.
  const mover = pickMover(prevRank, next);
  const moverNick = mover ? input.nicknames?.[mover.userId] : undefined;
  const moverLabel = mover ? rankLabel(mover.rank, next) : "";
  const headline = (icon: string, fallback: string) =>
    mover && moverNick
      ? `${icon} ${challengeName} · ${moverNick}님이 ${moverLabel} 됐어요`
      : `${icon} ${challengeName} · ${fallback}`;

  const notifications: RankChangeNotification[] = [];
  for (const r of next) {
    const last = lastNotifiedAt[r.userId];
    if (last && now.getTime() - new Date(last).getTime() < RANK_CHANGE_COOLDOWN_MS) {
      continue;
    }
    const before = prevRank.get(r.userId);
    const label = rankLabel(r.rank, next);

    if (before === undefined || before === r.rank) {
      notifications.push({
        userId: r.userId,
        type: "rank_change",
        title: headline("📊", "순위가 바뀌었어요"),
        body: pickVariant(SAME_BODY, seed + r.rank)(label),
        meta: null,
      });
    } else if (r.rank < before) {
      notifications.push({
        userId: r.userId,
        type: "rank_change",
        title: `📈 ${challengeName} · ${label}로 올랐어요`,
        body: `${before}위 → ${r.rank}위${pickVariant(RISE_TAIL, seed + r.rank)}`,
        meta: null,
      });
    } else {
      const advice = adviceFor(r, before, input.inputs, input.describeGoal, input.rankWith);
      notifications.push({
        userId: r.userId,
        type: "rank_drop",
        title: headline("📉", `${label}로 밀렸어요`),
        // 구조: [제목] ○○님이 N위 됐어요 → [본문] 지금 나는 M위예요 + 한마디 · 이 운동을 하면 다시 N위를 탈환할 수 있어요
        body: `${pickVariant(DROP_ME, seed + r.rank)(label)} · ${
          advice
            ? `${advice.text} ${pickVariant(DROP_TAIL, seed + before)}`
            : pickVariant(DROP_FALLBACK, seed + before)(before)
        }`,
        meta: { goal_type: advice?.goalType ?? null },
      });
    }
  }

  return {
    baseline: false,
    notifications,
    notifiedUserIds: notifications.map((n) => n.userId),
    snapshot,
  };
}

/**
 * 이번 변동의 주인공: 순위가 **오른** 사람 중 새 순위가 가장 높은 사람,
 * 같으면 더 많이 뛴 사람, 그래도 같으면 userId 순(결정적). 오른 사람이 없으면 null.
 */
function pickMover(
  prevRank: ReadonlyMap<string, number>,
  next: readonly RankRow[],
): RankRow | null {
  const risers = next
    .map((r) => ({ r, jump: (prevRank.get(r.userId) ?? r.rank) - r.rank }))
    .filter((x) => x.jump > 0)
    .sort(
      (a, b) =>
        a.r.rank - b.r.rank ||
        b.jump - a.jump ||
        a.r.userId.localeCompare(b.r.userId),
    );
  return risers[0]?.r ?? null;
}

/** 밀린 사람의 이전 순위 탈환 제안 문구 */
function adviceFor(
  me: RankRow,
  beforeRank: number,
  inputs: Record<string, ParticipantInput> | undefined,
  describeGoal: ((type: GoalType) => GoalDescriptor) | undefined,
  rankWith?: (inputs: readonly ParticipantInput[]) => { userId: string; rank: number }[],
): { text: string; goalType: GoalType } | null {
  if (!inputs || !describeGoal) return null;
  const myInput = inputs[me.userId];
  if (!myInput) return null;
  return suggestOvertake({
    me: myInput,
    all: Object.values(inputs),
    currentRank: me.rank,
    beforeRank,
    describeGoal,
    rankWith,
  });
}
