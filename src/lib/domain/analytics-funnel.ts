/**
 * 공개 베타 퍼널 — **순수 함수만. DB·네트워크 접근 금지** (배포 D).
 *
 * 무엇을 답하는가: *"외부 사용자가 어느 단계에서 막혀 나갔는가"* 그리고
 * *"어느 인플루언서가 좋은 사용자를 데려왔는가"*.
 *
 * ⚠️ **단계 순서가 브리프와 다르다 — 실제 제품 흐름을 따랐다.**
 *    GND는 닉네임 칸을 카카오·구글 연결 **뒤에** 보여준다
 *    (`onboarding/page.tsx:336` `showNicknameStep = mustAskNickname || linked === true`).
 *    그래서 **정식 계정 전환이 프로필보다 먼저**다. 억지로 브리프 순서를 맞추면
 *    화면이 거짓말을 한다.
 *
 * ⚠️ **"온보딩 완료"라는 단계를 따로 두지 않는다.** 그건 프로필 생성과 같은
 *    행위다(`upsertMyProfile` 한 번이 온보딩을 끝낸다). 두 줄로 그리면 항상
 *    숫자가 똑같은 의미 없는 단계가 생긴다. 감사표:
 *    `docs/analytics/public-beta-funnel-audit.md`
 */

import { MIN_RATIO_SAMPLE, ratio, type Ratio } from "./analytics";

/* ── 입력 ────────────────────────────────────────────────────────────────── */

/** `analytics_events` 한 행 (0093) */
export interface FunnelEventRow {
  userId: string;
  eventName: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

/**
 * 기존 테이블에서 파생한 사용자 한 명의 도달 상태.
 * **여기 있는 값은 전부 이미 DB가 알던 것이다** — 새 이벤트로 만들지 않았다.
 */
export interface FunnelUserRow {
  userId: string;
  /** `auth.users.is_anonymous` — 익명 계정에 identity를 붙이면 false가 된다 */
  isAnonymous: boolean;
  /** `profiles.created_at` — 온보딩을 끝낸 시각 */
  hasProfile: boolean;
  /** `workout_sessions.started_at` */
  startedWorkout: boolean;
  /** `workout_sessions.status = 'completed'` */
  completedWorkouts: number;
  /** `challenge_participants` */
  joinedChallenge: boolean;
  /**
   * 가입 7일이 **지난 뒤** 한 번이라도 운동했나.
   *
   * ⚠️⚠️ **RETENTION 패널의 `D7`과 다르다. 섞지 마라.** 그쪽
   *    (`reworkoutRetention().d7`)은 **가입 7일째 하루**에 운동했는지를 본다.
   *    퍼널의 마지막 칸에 그 정의를 쓰면 하루라도 어긋난 사람이 전부 빠져
   *    "아무도 안 돌아온다"처럼 보인다. 퍼널이 묻는 것은 "일주일 뒤에도
   *    살아 있나"이므로 **그 이후 아무 날이나** 한 번이면 도달로 센다.
   *    화면도 두 지표를 다른 이름으로 부른다(§배포 D).
   */
  reworkoutD7: boolean;
  /**
   * `profiles.acquisition_campaign` — **이 사람이 직접 어떤 링크로 들어왔나.**
   * 불일치 진단과 추천 계보의 뿌리 판정에 쓴다. 초대 때문에 덮어쓰지 않는다.
   */
  profileCampaign: string | null;
  /**
   * `profiles.invited_by` — **바로 앞에서 이 사람을 데려온 한 명.**
   * `accept_friend_invite`·`join_challenge_as_newcomer`가 첫 접촉 때만 채운다.
   * ⚠️ `profileCampaign`과 **다른 개념이다.** 섞으면 계보가 무너진다.
   */
  invitedBy: string | null;
  /**
   * 이 사람이 초대를 통해 맺어진 `crew_links.origin` —
   * `invite_link`(친구) · `challenge`(챌린지) · `search` · `unknown`.
   * 초대 종류 구별에 쓴다. **새 컬럼을 만들지 않으려고 이걸 재사용한다.**
   */
  inviteOrigin: string | null;
}

/* ── 단계 정의 ───────────────────────────────────────────────────────────── */

export const FUNNEL_STEPS = [
  "유입",
  "온보딩 시작",
  "계정 연결 시도",
  "정식 계정 전환",
  "프로필 완료",
  "첫 운동 시작",
  "첫 운동 완료",
  "3회 운동",
  "가입 7일 후 재운동",
] as const;

export type FunnelStepName = (typeof FUNNEL_STEPS)[number];

export interface FunnelStepCount {
  step: FunnelStepName;
  /** 이 단계**까지 도달한** 사용자 수 */
  count: number;
  /** 직전 단계 대비 빠진 사람 수. 첫 단계는 null */
  dropped: number | null;
  /** 직전 단계 대비 이탈률. 표본이 작으면 `Ratio`가 원시 수치로 낸다 */
  dropRate: Ratio | null;
}

/**
 * 한 사용자가 **어디까지 갔나** — 0부터 시작하는 단계 번호.
 *
 * ⚠️⚠️ **이 함수가 퍼널의 단조성을 보장한다.** 각 단계를 따로 세면
 *    "3회 운동한 사람이 첫 운동 시작보다 많다" 같은 불가능한 표가 나온다
 *    (계측 시작 전 가입자, 제공자가 꺼져 있던 시기 등 예외 흐름 때문에 실제로 난다).
 *    그래서 사람마다 **가장 멀리 간 지점 하나**를 정하고, 단계별 수는
 *    "그 지점 이상인 사람 수"로 센다. 정의상 뒤 단계가 앞 단계보다 클 수 없다.
 *
 * ⚠️ 뒤에서 앞으로 검사한다 — 뒤 단계에 도달했으면 앞 단계는 거쳤다고 본다.
 */
export function furthestStep(
  user: FunnelUserRow,
  events: ReadonlySet<string>,
): number {
  if (user.reworkoutD7) return 8;
  if (user.completedWorkouts >= 3) return 7;
  if (user.completedWorkouts >= 1) return 6;
  if (user.startedWorkout) return 5;
  if (user.hasProfile) return 4;
  if (!user.isAnonymous) return 3;
  if (events.has("identity_link_started")) return 2;
  if (events.has("onboarding_started")) return 1;
  return 0; // 유입만 했다
}

/**
 * 퍼널 한 벌.
 *
 * @param users 집단에 속한 사용자들 (이미 캠페인으로 걸러진 상태)
 * @param eventsByUser 사용자별 이벤트 이름 집합
 */
export function buildFunnel(
  users: readonly FunnelUserRow[],
  eventsByUser: ReadonlyMap<string, ReadonlySet<string>>,
): FunnelStepCount[] {
  const EMPTY: ReadonlySet<string> = new Set();
  const reached = new Array(FUNNEL_STEPS.length).fill(0);

  for (const u of users) {
    const furthest = furthestStep(u, eventsByUser.get(u.userId) ?? EMPTY);
    for (let i = 0; i <= furthest; i++) reached[i] += 1;
  }

  return FUNNEL_STEPS.map((step, i) => {
    const count = reached[i];
    if (i === 0) return { step, count, dropped: null, dropRate: null };
    const prev = reached[i - 1];
    return {
      step,
      count,
      dropped: prev - count,
      // ⚠️ 분모가 직전 단계다. `ratio`가 표본 5 미만이면 퍼센트 대신 원시 수치를 낸다
      dropRate: ratio(prev - count, prev),
    };
  });
}

/* ── 가장 큰 마찰 구간 ───────────────────────────────────────────────────── */

export interface FrictionPoint {
  from: FunnelStepName;
  to: FunnelStepName;
  dropped: number;
  dropRate: Ratio;
}

/**
 * 표본이 충분할 때만 **가장 큰 이탈 구간** 상위 N개.
 *
 * ⚠️⚠️ **표본이 적으면 아무것도 내지 않는다 (빈 배열).** 실사용자 4명 규모에서
 *    "32% 이탈이 문제다"는 가짜 확신이다. 화면은 빈 배열을 받으면
 *    "표본 부족 — 마찰 구간 판정 안 함"이라고 말해야 한다.
 *
 * 기준: 직전 단계 인원이 `MIN_RATIO_SAMPLE` 이상인 구간만 후보다.
 * ⚠️ 임계값을 새로 만들지 않고 **`analytics.ts`의 것을 그대로 쓴다** — 화면마다
 *    다른 기준을 쓰면 같은 데이터가 어디선 "충분"이고 어디선 "부족"이 된다.
 */
export function biggestFrictions(
  steps: readonly FunnelStepCount[],
  top = 3,
): FrictionPoint[] {
  const out: FrictionPoint[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev.count < MIN_RATIO_SAMPLE) continue;
    if (cur.dropped === null || cur.dropped <= 0 || cur.dropRate === null) continue;
    out.push({
      from: prev.step,
      to: cur.step,
      dropped: cur.dropped,
      dropRate: cur.dropRate,
    });
  }
  return out
    .sort((a, b) => b.dropped - a.dropped || a.from.localeCompare(b.from))
    .slice(0, top);
}

/* ── 캠페인 집단 ─────────────────────────────────────────────────────────── */

/** 캠페인이 없는 유입 — **통계에서 빼지 않는다** (`acquisitionBreakdown`과 같은 원칙) */
export const DIRECT_CAMPAIGN = "(직접 유입)";

export interface CampaignRow {
  /** `landing_opened`의 campaign. 없으면 `DIRECT_CAMPAIGN` */
  campaign: string;
  source: string | null;
  medium: string | null;
  /** 이 집단의 퍼널 — 단계 순서는 `FUNNEL_STEPS` */
  steps: FunnelStepCount[];
  /** 유입 수 (= steps[0].count). 정렬·표시 편의 */
  entered: number;
  /**
   * 이 집단에서 챌린지에 참가한 사람 수.
   * ⚠️ 퍼널 **단계가 아니다** — 챌린지는 모두가 거치는 길이 아니라서 핵심 퍼널에
   *    섞으면 안 한 사람이 전부 이탈로 보인다. 비교표의 별도 열로만 쓴다.
   */
  challengeJoined: number;
}

export interface CampaignMismatch {
  eventCampaign: string;
  profileCampaign: string;
  count: number;
}

export interface CampaignCohortResult {
  rows: CampaignRow[];
  /**
   * `landing_opened`의 campaign과 `profiles.acquisition_campaign`이 다른 사용자.
   *
   * ⚠️⚠️ **불일치가 있어도 이 함수는 던지지 않는다.** 진단 하나 때문에 `/admin`
   *    전체를 500으로 잃지 않는다(사용자 지시 2026-08-31). 대신 세어서 같이 낸다.
   *    화면이 "campaign 귀속 불일치 N건"으로 말하고, 운영자가 원인을 짚을 수 있게
   *    어떤 쌍이 몇 건인지 보여준다.
   *
   * ⚠️ **사용자 id·이메일을 담지 않는다.** campaign 문자열 쌍과 건수뿐이다 —
   *    개인 감시를 만들지 않는다.
   */
  mismatches: {
    count: number;
    samples: CampaignMismatch[];
  };
  /** 계측이 붙은 사용자 수 / 전체 — 화면이 "왜 표가 비었나"를 말할 수 있게 */
  measured: Ratio;
}

/**
 * 캠페인별로 집단을 갈라 각각의 퍼널을 만든다.
 *
 * ⚠️ **집단 배정은 `landing_opened` 이벤트가 한다.** `profiles.acquisition_campaign`이
 *    아니다 — 프로필을 안 만든 사람(=퍼널 윗부분에서 빠진 사람)은 `profiles`에
 *    행 자체가 없어서, 그걸 기준으로 삼으면 **가장 알고 싶은 이탈자가 통째로
 *    사라진다.** 이건 "조용한 선택"이 아니라 문서화된 우선순위이고, 불일치는
 *    위 `mismatches`로 드러낸다.
 *
 * ⚠️ `landing_opened`가 없는 사용자는 집단에 넣지 않는다 — 계측 시작(2026-08-31)
 *    이전 가입자다. 추측으로 backfill하지 않는다. `measured`가 그 비율을 말한다.
 */
export function campaignCohorts(
  users: readonly FunnelUserRow[],
  events: readonly FunnelEventRow[],
): CampaignCohortResult {
  const eventsByUser = new Map<string, Set<string>>();
  const landingByUser = new Map<string, FunnelEventRow>();

  for (const e of events) {
    let set = eventsByUser.get(e.userId);
    if (!set) {
      set = new Set();
      eventsByUser.set(e.userId, set);
    }
    set.add(e.eventName);
    if (e.eventName === "landing_opened") landingByUser.set(e.userId, e);
  }

  const byCampaign = new Map<
    string,
    { source: string | null; medium: string | null; users: FunnelUserRow[] }
  >();
  const mismatchCounts = new Map<string, CampaignMismatch>();
  let measuredCount = 0;

  for (const u of users) {
    const landing = landingByUser.get(u.userId);
    if (!landing) continue; // 계측 전 사용자
    measuredCount += 1;

    const campaign = landing.campaign ?? DIRECT_CAMPAIGN;

    // 불일치 진단 — 둘 다 값이 있을 때만 비교한다.
    // 한쪽이 비어 있는 것은 불일치가 아니다(프로필을 아직 안 만들었거나
    // 계측 전 유입이라 자연스럽게 비어 있는 경우가 많다).
    if (
      landing.campaign != null &&
      u.profileCampaign != null &&
      landing.campaign !== u.profileCampaign
    ) {
      // ⚠️ 구분자 없이 이어붙이면 ("ab","c")와 ("a","bc")가 같은 키가 된다.
      //    campaign은 UTM 값이라 어떤 글자든 들어올 수 있으므로 JSON으로 만든다.
      const key = JSON.stringify([landing.campaign, u.profileCampaign]);
      const found = mismatchCounts.get(key);
      if (found) found.count += 1;
      else
        mismatchCounts.set(key, {
          eventCampaign: landing.campaign,
          profileCampaign: u.profileCampaign,
          count: 1,
        });
    }

    let bucket = byCampaign.get(campaign);
    if (!bucket) {
      bucket = { source: landing.source, medium: landing.medium, users: [] };
      byCampaign.set(campaign, bucket);
    }
    bucket.users.push(u);
  }

  const rows: CampaignRow[] = [...byCampaign]
    .map(([campaign, b]) => {
      const steps = buildFunnel(b.users, eventsByUser);
      return {
        campaign,
        source: b.source,
        medium: b.medium,
        steps,
        entered: steps[0].count,
        challengeJoined: b.users.filter((u) => u.joinedChallenge).length,
      };
    })
    .sort((a, b) => b.entered - a.entered || a.campaign.localeCompare(b.campaign));

  const samples = [...mismatchCounts.values()].sort(
    (a, b) => b.count - a.count || a.eventCampaign.localeCompare(b.eventCampaign),
  );

  return {
    rows,
    mismatches: {
      count: samples.reduce((s, m) => s + m.count, 0),
      samples,
    },
    measured: ratio(measuredCount, users.length),
  };
}

/* ── 사회적 전환 퍼널 (별도) ─────────────────────────────────────────────── */

/**
 * 챌린지는 **모든 사용자가 반드시 거치는 단계가 아니다.** 혼자 쓰는 사람도
 * 정상 사용자다. 그래서 핵심 활성화 퍼널에 섞지 않고 따로 낸다 —
 * 섞으면 "챌린지를 안 한 사람"이 전부 이탈로 보인다.
 */
export interface SocialFunnel {
  viewed: number;
  joined: number;
  conversion: Ratio;
}

export function socialFunnel(
  users: readonly FunnelUserRow[],
  eventsByUser: ReadonlyMap<string, ReadonlySet<string>>,
): SocialFunnel {
  const viewedUsers = users.filter((u) =>
    (eventsByUser.get(u.userId) ?? new Set<string>()).has("challenge_viewed"),
  );
  const joined = viewedUsers.filter((u) => u.joinedChallenge).length;
  return {
    viewed: viewedUsers.length,
    joined,
    conversion: ratio(joined, viewedUsers.length),
  };
}

/**
 * 이벤트 행 목록 → 사용자별 이벤트 이름 집합.
 * `buildFunnel`·`socialFunnel`이 같은 모양을 요구해서 한 곳에서 만든다.
 */
export function eventsByUserMap(
  events: readonly FunnelEventRow[],
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const e of events) {
    let set = m.get(e.userId);
    if (!set) {
      set = new Set();
      m.set(e.userId, set);
    }
    set.add(e.eventName);
  }
  return m;
}
