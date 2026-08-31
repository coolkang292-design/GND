/**
 * 추천 계보 — **순수 함수만. DB·네트워크 접근 금지.**
 *
 * 답해야 하는 질문: *"인플루언서 A가 데려온 사람이 또 데려온 사람까지 세면
 * 실제로 몇 명인가?"*
 *
 * ⚠️⚠️ **세 개념을 절대 섞지 않는다.**
 *
 *   A. 최초 외부 유입  `profiles.acquisition_campaign`
 *      그 사람이 **직접 어떤 링크로 들어왔나.** 친구·챌린지 초대 때문에
 *      덮어쓰지 않는다(0080 `freeze_profile_attribution`이 DB에서도 막는다).
 *
 *   B. 직접 초대자      `profiles.invited_by`
 *      **바로 앞에서 데려온 사람 한 명.** `accept_friend_invite`와
 *      `join_challenge_as_newcomer`가 `invited_by is null`일 때만 채운다.
 *
 *   C. 뿌리 캠페인      여기서 **계산한다**
 *      B를 거슬러 올라가 처음 만나는 A. 저장하지 않는다.
 *
 * ⚠️ **새 컬럼을 만들지 않았다.** 2026-08-31 실물 감사에서 A·B가 이미 정확히
 *    저장되고 있음을 확인했다(초대 관련 함수 10개 전수 조회 — acquisition_*를
 *    건드리는 함수가 하나도 없다). 계산으로 표현 가능한 것을 컬럼으로 만들면
 *    같은 사실이 두 곳에 생겨 조용히 갈린다.
 *    감사 기록: `docs/analytics/public-beta-referral-audit.md`
 */

import type { FunnelUserRow } from "./analytics-funnel";
import { DIRECT_CAMPAIGN } from "./analytics-funnel";

/** 계보를 거슬러 올라갈 수 있는 최대 깊이. 넘으면 `too_deep`으로 끊는다 */
export const MAX_REFERRAL_DEPTH = 50;

/** 뿌리를 믿을 수 없을 때. **다른 캠페인에 섞지 않는다** */
export const UNKNOWN_ROOT = "(뿌리 불명)";

/** 3세대부터는 한 칸에 모은다 — 더 쪼개도 읽는 사람이 쓸 일이 없다 */
export const GENERATION_BUCKETS = ["0세대", "1세대", "2세대", "3세대+"] as const;

export type ReferralAnomaly =
  | "cycle" // A→B→A
  | "self" // 자기 자신을 초대자로 가리킴
  | "missing_inviter" // 초대자가 삭제됐거나 목록에 없음
  | "too_deep"; // 깊이 제한 초과

export type ReferralKind =
  | "외부 유입"
  | "친구 초대"
  | "챌린지 초대"
  | "출처 모름";

export interface RootResolution {
  /** 캠페인 이름 · `DIRECT_CAMPAIGN` · `UNKNOWN_ROOT` 중 하나 */
  root: string;
  /** 0 = 링크로 직접 들어옴, 1 = 그 사람이 데려옴, 2 = 그 다음… */
  generation: number;
  /** 정상이면 null. 값이 있으면 `root`는 `UNKNOWN_ROOT`다 */
  anomaly: ReferralAnomaly | null;
}

/**
 * 이 사람의 뿌리 캠페인과 세대.
 *
 * ⚠️⚠️ **무한 루프 방어가 이 함수의 존재 이유의 절반이다.** 운영 데이터는
 *    깨질 수 있다(A가 B를 가리키고 B가 A를 가리키는 상태 등). 그때
 *    **임의로 어떤 캠페인에 넣지 않고** `UNKNOWN_ROOT`로 두고 이상 건수를
 *    화면이 보여준다 — 거짓으로 정확한 숫자를 만드는 것보다 낫다.
 *
 * ⚠️ 자기 자신이 캠페인을 갖고 있으면 **거기서 멈춘다(0세대).** 친구 링크로
 *    들어왔더라도 자기 utm이 있으면 그게 자기 유입이다. 이건 A를 B로 덮어쓰지
 *    않는다는 원칙 그대로다.
 */
export function resolveRoot(
  userId: string,
  byId: ReadonlyMap<string, FunnelUserRow>,
  maxDepth: number = MAX_REFERRAL_DEPTH,
): RootResolution {
  const start = byId.get(userId);
  if (!start) {
    return { root: UNKNOWN_ROOT, generation: 0, anomaly: "missing_inviter" };
  }

  const seen = new Set<string>([userId]);
  let current = start;
  let generation = 0;

  for (;;) {
    // 자기 캠페인이 있으면 여기가 뿌리다.
    if (current.profileCampaign != null) {
      return { root: current.profileCampaign, generation, anomaly: null };
    }

    const next = current.invitedBy;

    // 초대자가 없다 — 캠페인 없이 그냥 들어온 사람이다.
    if (next == null) {
      return { root: DIRECT_CAMPAIGN, generation, anomaly: null };
    }
    // 자기 자신을 가리킨다.
    if (next === current.userId) {
      return { root: UNKNOWN_ROOT, generation, anomaly: "self" };
    }
    // 이미 지나온 사람이다 — 고리다.
    if (seen.has(next)) {
      return { root: UNKNOWN_ROOT, generation, anomaly: "cycle" };
    }

    const parent = byId.get(next);
    // 초대자가 삭제됐거나 집계 대상이 아니다(테스트 계정 제외 등).
    if (!parent) {
      return { root: UNKNOWN_ROOT, generation, anomaly: "missing_inviter" };
    }

    seen.add(next);
    current = parent;
    generation += 1;

    // 고리가 아니어도 비정상적으로 길면 끊는다.
    if (generation > maxDepth) {
      return { root: UNKNOWN_ROOT, generation, anomaly: "too_deep" };
    }
  }
}

/**
 * 이 사람이 **어떤 경로로** 들어왔나 — 기존 값만으로 판정한다.
 *
 * ⚠️ 새 `referral_kind` 컬럼을 만들지 않았다. `crew_links.origin`이 이미
 *    친구(`invite_link`)와 챌린지(`challenge`)를 구별해 저장하고 있어서다
 *    (`accept_friend_invite` / `join_challenge_as_newcomer`가 각각 넣는다).
 */
export function referralKind(user: FunnelUserRow): ReferralKind {
  if (user.profileCampaign != null) return "외부 유입";
  if (user.invitedBy != null) {
    if (user.inviteOrigin === "challenge") return "챌린지 초대";
    if (user.inviteOrigin === "invite_link") return "친구 초대";
    // 초대자는 있는데 경로 기록이 없다(0079 이전 관계 등). 친구로 넘겨짚지 않는다.
    return "출처 모름";
  }
  return "출처 모름";
}

/** 세대 번호 → 화면에 쓰는 칸 이름 */
export function generationBucket(generation: number): string {
  return GENERATION_BUCKETS[Math.min(generation, 3)];
}

/* ── 확산 성과표 ─────────────────────────────────────────────────────────── */

export interface SpreadRow {
  root: string;
  /** 링크로 직접 들어온 사람 (0세대) */
  direct: number;
  /** 그 사람들이 다시 데려온 사람 (1세대 이상) */
  viral: number;
  /** 뿌리가 이 캠페인인 사람 전체 */
  total: number;
  permanent: number;
  startedWorkout: number;
  completedWorkout: number;
  threeWorkouts: number;
  challengeJoined: number;
  reworkoutD7: number;
  /**
   * 총 영향 / 직접 유입. 직접 유입이 0이면 **계산하지 않는다**(null) —
   * 0으로 나눈 값을 "무한 확산"처럼 보여주지 않는다.
   */
  multiplier: number | null;
  /** `GENERATION_BUCKETS` 순서대로 [0세대, 1세대, 2세대, 3세대+] */
  byGeneration: number[];
}

export interface SpreadResult {
  rows: SpreadRow[];
  /** 계보가 깨진 사람 수 — 화면이 그대로 보여준다. 어떤 캠페인에도 안 섞인다 */
  anomalies: { kind: ReferralAnomaly; count: number }[];
  anomalyTotal: number;
  /** 초대 경로별 인원 — §4 "초대 종류 구별" */
  kinds: { kind: ReferralKind; count: number }[];
}

/**
 * 뿌리 캠페인별 확산 성과.
 *
 * ⚠️⚠️ **캠페인 A의 계보와 캠페인 B의 계보는 절대 섞이지 않는다.** 각 사람의
 *    뿌리를 따로 계산해서 그 뿌리에만 더하기 때문이다. 이건 테스트가 지킨다
 *    (시나리오 D).
 *
 * ⚠️ **어떤 사람의 `acquisition_campaign`도 바꾸지 않는다.** 이 함수는 읽기만
 *    한다 — "영희가 어떤 링크로 들어왔나"와 "영희가 어느 계보에 속하나"는
 *    끝까지 다른 값으로 남는다.
 */
export function campaignSpread(
  users: readonly FunnelUserRow[],
  maxDepth: number = MAX_REFERRAL_DEPTH,
): SpreadResult {
  const byId = new Map(users.map((u) => [u.userId, u]));

  const acc = new Map<string, SpreadRow>();
  const anomalyCount = new Map<ReferralAnomaly, number>();
  const kindCount = new Map<ReferralKind, number>();

  const blank = (root: string): SpreadRow => ({
    root,
    direct: 0,
    viral: 0,
    total: 0,
    permanent: 0,
    startedWorkout: 0,
    completedWorkout: 0,
    threeWorkouts: 0,
    challengeJoined: 0,
    reworkoutD7: 0,
    multiplier: null,
    byGeneration: [0, 0, 0, 0],
  });

  for (const u of users) {
    const { root, generation, anomaly } = resolveRoot(u.userId, byId, maxDepth);
    if (anomaly) {
      anomalyCount.set(anomaly, (anomalyCount.get(anomaly) ?? 0) + 1);
    }

    const kind = referralKind(u);
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);

    let row = acc.get(root);
    if (!row) {
      row = blank(root);
      acc.set(root, row);
    }

    row.total += 1;
    /*
      ⚠️ **계보가 깨진 사람을 "직접 유입"으로 세지 않는다.** 초대자가 삭제됐거나
         고리가 걸린 사람은 걸어 올라가다 0세대에서 멈추는데, 그들은 **누군가의
         링크로 들어온 사람**이지 캠페인 링크로 직접 들어온 사람이 아니다.
         직접으로 세면 확산 배수가 실제보다 낮게 나온다(분모가 부푼다).
    */
    if (generation === 0 && anomaly === null) row.direct += 1;
    else row.viral += 1;
    // 이상 건은 전부 UNKNOWN_ROOT 줄에 모이고, 그 줄의 세대 분포는 진단용이다.
    row.byGeneration[Math.min(generation, 3)] += 1;

    if (!u.isAnonymous) row.permanent += 1;
    if (u.startedWorkout) row.startedWorkout += 1;
    if (u.completedWorkouts >= 1) row.completedWorkout += 1;
    if (u.completedWorkouts >= 3) row.threeWorkouts += 1;
    if (u.joinedChallenge) row.challengeJoined += 1;
    if (u.reworkoutD7) row.reworkoutD7 += 1;
  }

  const rows = [...acc.values()]
    .map((r) => ({
      ...r,
      // 소수 첫째 자리까지. 직접 유입이 0이면 계산하지 않는다.
      multiplier:
        r.direct > 0 ? Math.round((r.total / r.direct) * 10) / 10 : null,
    }))
    .sort((a, b) => b.total - a.total || a.root.localeCompare(b.root));

  const anomalies = [...anomalyCount]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  const kinds = [...kindCount]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  return {
    rows,
    anomalies,
    anomalyTotal: anomalies.reduce((s, a) => s + a.count, 0),
    kinds,
  };
}
