/**
 * 유입·초대 귀속 지표 — 순수 함수만. DB·네트워크 접근 금지.
 *
 * `analytics.ts`(가입·운동·리텐션) · `analytics-program.ts`(프로그램) ·
 * `analytics-engagement.ts`(알림·열람권·크루)에 이은 네 번째 묶음이다.
 *
 * ⚠️ **0079를 Run하기 전에는 이 파일이 낼 답이 전부 `unknown`·`direct`다.**
 * 컬럼이 없으면 조회가 던지므로 화면이 빈 값을 진짜 값처럼 보여줄 일은 없지만,
 * Run 직후에도 **과거분은 절반만 채워진다**(2026-08-17 실측 crew_links 7건 중
 * 흔적이 남은 것은 4건). 화면이 그 사실을 말해야 한다.
 */

import { acquisitionChannel } from "./acquisition";
import { ratio, type Ratio } from "./analytics";

/** 0079 `crew_links.origin`의 값과 화면 라벨. 순서가 곧 패널의 줄 순서다 */
export const CREW_ORIGIN_LABELS: readonly (readonly [string, string])[] = [
  ["invite_link", "친구 초대 링크"],
  ["challenge", "챌린지 링크"],
  ["search", "닉네임 검색"],
  ["unknown", "알 수 없음 (0079 이전)"],
];

export interface CrewLinkOriginRow {
  userA: string;
  userB: string;
  /** 0079 이전 행은 백필에서 'unknown'이 된다. null은 Run 직후 잠깐만 있다 */
  origin: string | null;
  /** 그 경로를 먼저 연 쪽 — 요청자·링크 주인·방장 */
  initiatedBy: string | null;
}

export interface CrewOriginCount {
  origin: string;
  label: string;
  count: number;
}

/**
 * 크루 연결이 **어떤 경로로** 맺어졌나.
 *
 * ⚠️ 목록에 없는 값도 버리지 않고 그대로 낸다. 새 경로가 생겼는데 라벨을 안
 * 붙이면 그 줄이 화면에서 통째로 사라져 합이 안 맞는다 — 합이 안 맞는 것보다
 * 라벨이 못생긴 편이 낫다.
 */
export function crewOriginBreakdown(
  links: CrewLinkOriginRow[],
): CrewOriginCount[] {
  const counts = new Map<string, number>();
  for (const l of links) {
    const key = l.origin ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const known = CREW_ORIGIN_LABELS.filter(([origin]) => counts.has(origin)).map(
    ([origin, label]) => ({ origin, label, count: counts.get(origin)! }),
  );
  const labelled = new Set(CREW_ORIGIN_LABELS.map(([o]) => o));
  const extra = [...counts]
    .filter(([origin]) => !labelled.has(origin))
    .map(([origin, count]) => ({ origin, label: origin, count }));

  return [...known, ...extra];
}

/**
 * 출처를 아는 연결의 비율. **백필이 얼마나 채워졌는지**를 화면이 말하게 하는 값이다.
 *
 * 이 값이 낮은데 "친구 초대 링크 2건"만 크게 띄우면, 보는 사람은 그 2건이 전부인
 * 줄 안다. 실제로는 모르는 연결이 더 많을 수 있다.
 */
export function originKnownRate(links: CrewLinkOriginRow[]): Ratio {
  const known = links.filter(
    (l) => l.origin != null && l.origin !== "unknown",
  ).length;
  return ratio(known, links.length);
}

export interface InviterRow {
  nickname: string;
  /** 이 사람이 먼저 연 크루 연결 수 */
  linksInitiated: number;
  /** 이 사람을 초대자로 기록한 프로필 수 = 실제로 데려온 사람 */
  broughtIn: number;
}

export interface AcquisitionProfileRow {
  userId: string;
  nickname: string;
  invitedBy: string | null;
  source: string | null;
  referrer: string | null;
}

/**
 * 누가 사람을 데려왔나 — 많이 데려온 순.
 *
 * **두 숫자를 함께 낸다.** `linksInitiated`는 "내가 먼저 연결을 걸었다"이고,
 * `broughtIn`은 "그 사람이 GND에 처음 들어온 계기가 나였다"다. 앞은 크지만 뒤가
 * 0인 사람은 **이미 있는 사용자끼리 연결한 것**이라 유입이 아니다. 하나만 내면
 * 그 구분이 화면에서 사라진다.
 *
 * ⚠️ 데려온 사람이 0명이고 연결도 0인 사람은 넣지 않는다 — 전체 사용자 목록을
 * 다시 그리는 표가 되어 버린다(그건 `UserTable`의 몫이다).
 */
export function topInviters(
  links: CrewLinkOriginRow[],
  profiles: AcquisitionProfileRow[],
  limit = 5,
): InviterRow[] {
  const nickById = new Map(profiles.map((p) => [p.userId, p.nickname]));

  const initiated = new Map<string, number>();
  for (const l of links) {
    if (!l.initiatedBy) continue;
    initiated.set(l.initiatedBy, (initiated.get(l.initiatedBy) ?? 0) + 1);
  }

  const brought = new Map<string, number>();
  for (const p of profiles) {
    if (!p.invitedBy) continue;
    brought.set(p.invitedBy, (brought.get(p.invitedBy) ?? 0) + 1);
  }

  const ids = new Set([...initiated.keys(), ...brought.keys()]);
  return [...ids]
    .map((id) => ({
      nickname: nickById.get(id) ?? "(집계 제외 계정)",
      linksInitiated: initiated.get(id) ?? 0,
      broughtIn: brought.get(id) ?? 0,
    }))
    // 데려온 사람이 많은 순, 같으면 연결을 많이 연 순
    .sort((a, b) => b.broughtIn - a.broughtIn || b.linksInitiated - a.linksInitiated)
    .slice(0, limit);
}

export interface ChannelCount {
  channel: string;
  count: number;
}

/**
 * 어디서 왔나 — 채널별 가입자 수.
 *
 * ⚠️ **`direct`를 빼지 마라.** utm도 referrer도 없이 들어온 사람은 측정 실패가
 * 아니라 하나의 채널이다. 빼면 나머지 채널의 비율이 부풀려진다.
 *
 * ⚠️ 0079 이전에 가입한 사람은 전부 `direct`로 잡힌다 — 계측이 없던 때라 값이
 * 비어 있기 때문이다. 화면이 "언제부터 계측했는지"를 함께 말해야 한다.
 */
export function acquisitionBreakdown(
  profiles: AcquisitionProfileRow[],
): ChannelCount[] {
  const counts = new Map<string, number>();
  for (const p of profiles) {
    const channel = acquisitionChannel({
      source: p.source,
      referrer: p.referrer,
    });
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  return [...counts]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

/**
 * 계측이 실제로 붙은 사람의 비율 — utm이든 referrer든 **하나라도** 있는 사람.
 *
 * 채널 분포에서 `direct`가 압도적일 때 그것이 "정말 직접 들어왔다"인지
 * "아직 계측 전에 가입한 사람들"인지 가르는 값이다.
 */
export function acquisitionCaptureRate(
  profiles: AcquisitionProfileRow[],
): Ratio {
  const captured = profiles.filter(
    (p) => p.source != null || p.referrer != null,
  ).length;
  return ratio(captured, profiles.length);
}

/* ── 캠페인 표시명 (배포 D) ──────────────────────────────────────────────────
   인플루언서·커뮤니티별 성과를 비교하려면 운영자가 `influencer_a_pilot01`을
   보고 누구인지 알아야 한다. 그렇다고 **테이블을 만들지 않는다** —
   `CREW_ORIGIN_LABELS`가 이미 같은 문제를 코드 상수로 풀고 있고, 그 방식이
   여기서 더 낫다.

   ⚠️⚠️ **목록에 없는 campaign도 버리지 않고 원본 키를 그대로 낸다.**
      `CREW_ORIGIN_LABELS`의 규칙과 같다("합이 안 맞는 것보다 라벨이 못생긴 편이
      낫다"). 이게 테이블이 필요 없는 진짜 이유다 — 새 파일럿 링크를 여는 데
      코드 배포가 필요 없다. 라벨은 나중에 한 줄 추가하면 된다.

   ⚠️ 유입 링크 규약: `?utm_source=<채널>&utm_medium=creator&utm_campaign=<이 키>`
      `utm_medium=creator`가 "인플루언서가 공유한 링크"를 뜻한다. 같은 인스타
      안에서도 인플루언서 A/B와 pilot01/02가 campaign으로 갈린다.
*/
export const CAMPAIGN_LABELS: readonly (readonly [string, string])[] = [
  // 파일럿을 열 때 여기 한 줄씩 추가한다. 없어도 화면에는 나온다.
];

/** campaign 키 → 사람이 읽는 이름. 없으면 **키를 그대로** 돌려준다 */
export function campaignLabel(campaign: string): string {
  const found = CAMPAIGN_LABELS.find(([key]) => key === campaign);
  return found ? found[1] : campaign;
}
