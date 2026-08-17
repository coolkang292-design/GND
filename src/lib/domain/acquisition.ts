/**
 * 유입 출처(첫 접촉) 정규화 — 순수 함수만. DOM·localStorage·네트워크 접근 금지.
 *
 * **왜 필요한가 (2026-08-17 실측).** 앱이 `utm_*`도 `document.referrer`도 어디서도
 * 읽지 않아서, 카카오톡으로 왔는지 인스타로 왔는지 검색으로 왔는지 **구분이 전혀
 * 안 됐다.** 대시보드의 확산 패널이 "초대 출처가 기록되지 않아 측정할 수 없습니다"를
 * 띄우고 있던 이유의 절반이 이것이다(나머지 절반은 `crew_links.origin` — 0079).
 *
 * 규칙 세 가지 — 어기면 개인정보가 샌다.
 *  1. **referrer는 호스트만 담는다.** 전체 URL에는 검색어가 붙는다
 *     (`google.com/search?q=...`). 호스트만 있으면 채널 판정에 충분하다
 *  2. **랜딩 경로는 모양만 담는다.** `/invite/GND-7K2QP`는 초대 코드 그 자체라
 *     `/invite/:code`로 마스킹한다 — 남의 코드가 통계에 눕는 것을 막는다
 *  3. **길이를 자른다.** utm 값은 광고 도구가 임의로 길게 넣는다
 */

/** 한 값의 길이 상한 — DB 컬럼은 text지만 무한정 받을 이유가 없다 */
export const ACQUISITION_VALUE_MAX = 120;

/**
 * 읽어 들이는 쿼리 파라미터. **`app/page.tsx`가 이 목록으로 리다이렉트에
 * 실어 나른다** — 목록이 갈리면 넘겨준 것과 읽는 것이 어긋난다.
 */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export interface Acquisition {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  /** referrer의 **호스트만** */
  referrer: string | null;
  /** 첫 진입 경로의 모양 (`/invite/:code`) */
  landing: string | null;
  /** ISO 8601 */
  capturedAt: string;
}

function clean(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = String(raw).trim().slice(0, ACQUISITION_VALUE_MAX);
  return v === "" ? null : v;
}

/**
 * referrer URL에서 **호스트만** 뽑는다.
 *
 * 같은 출처(자기 자신)에서 온 것은 유입이 아니다 — 앱 안에서 화면을 옮긴 것뿐이라
 * null을 준다. 안 거르면 거의 모든 사람의 referrer가 `gnd-one.vercel.app`이 된다.
 */
export function referrerHost(
  rawReferrer: string | null | undefined,
  selfHost: string | null | undefined,
): string | null {
  const raw = clean(rawReferrer);
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (!host) return null;
    if (selfHost && host === String(selfHost).toLowerCase()) return null;
    return host.slice(0, ACQUISITION_VALUE_MAX);
  } catch {
    // 파싱 실패는 조용히 버린다 — 계측이 앱을 죽이면 안 된다
    return null;
  }
}

/**
 * 랜딩 경로를 **모양**으로 바꾼다. 값이 들어가는 자리는 전부 마스킹한다.
 *
 * ⚠️ 새 동적 라우트가 생기면 여기에 추가해야 한다. 안 하면 그 세그먼트의 값이
 *    그대로 통계에 쌓인다 — `bug-trail.ts`의 `pathOnly`가 쿼리스트링을 통째로
 *    버리는 것과 같은 이유다.
 */
export function landingShape(pathname: string | null | undefined): string | null {
  const raw = clean(pathname);
  if (!raw) return null;
  return raw
    .replace(/^\/invite\/[^/]+/, "/invite/:code")
    .replace(/^\/challenge\/[^/]+/, "/challenge/:id")
    .slice(0, ACQUISITION_VALUE_MAX);
}

/**
 * 첫 접촉 한 벌을 만든다.
 *
 * ⚠️ **전부 비어 있어도 객체를 돌려준다.** "직접 들어옴(utm도 referrer도 없음)"은
 *    측정 실패가 아니라 그 자체로 하나의 채널이다. null을 돌려주면 그 사람들이
 *    통계에서 통째로 사라져 나머지 채널의 비율이 부풀려진다.
 */
export function buildAcquisition(input: {
  search: string;
  referrer: string | null;
  pathname: string;
  selfHost: string | null;
  now: Date;
}): Acquisition {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(input.search);
  } catch {
    params = new URLSearchParams();
  }

  const [sourceKey, mediumKey, campaignKey] = UTM_KEYS;
  return {
    source: clean(params.get(sourceKey)),
    medium: clean(params.get(mediumKey)),
    campaign: clean(params.get(campaignKey)),
    referrer: referrerHost(input.referrer, input.selfHost),
    landing: landingShape(input.pathname),
    capturedAt: input.now.toISOString(),
  };
}

/**
 * 화면·집계에 쓸 채널 한 글자. **여기서 판정을 한곳에 모은다** — 대시보드와
 * 다른 화면이 각자 문자열을 비교하면 기준이 조용히 갈린다.
 *
 * ⚠️ `utm_source`가 있으면 그것이 답이다. 광고·공유 링크가 스스로 밝힌 값이라
 *    referrer 추정보다 정확하다.
 */
export function acquisitionChannel(a: {
  source: string | null;
  referrer: string | null;
}): string {
  if (a.source) return a.source.toLowerCase();
  if (!a.referrer) return "direct";

  const host = a.referrer.toLowerCase();
  if (host.includes("kakao")) return "kakao";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("google")) return "google";
  if (host.includes("naver")) return "naver";
  if (host.includes("daum")) return "daum";
  if (host.includes("youtube")) return "youtube";
  if (host.includes("facebook")) return "facebook";
  return host;
}
