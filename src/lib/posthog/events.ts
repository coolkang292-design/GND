/**
 * PostHog로 나가는 **모든 것의 화이트리스트.**
 *
 * 이 파일에 없는 이벤트·속성은 코드 어디서 보내려 해도 전송 직전에 버려진다
 * (`sanitizeOutgoing`이 SDK의 `before_send`에 걸려 있다). 새 이벤트를 만들려면
 * 여기에 **먼저** 적고, `docs/analytics/posthog-privacy-review.md`의 표도 고친다.
 *
 * ⚠️ 원본은 Supabase다. 여기 있는 이벤트 중 DB가 이미 아는 사실(온보딩 완료, 운동 완료)은
 *    **탐색용 복제본**이다. 숫자가 다르면 DB가 맞다.
 */

import type { CaptureResult } from "posthog-js";

export const PRODUCT_EVENTS = [
  "landing_opened",
  "onboarding_started",
  "onboarding_nickname_shown",
  "onboarding_completed",
  "identity_link_started",
  "identity_link_succeeded",
  "identity_link_failed",
  "login_succeeded",
  "login_failed",
  "workout_completed",
  "challenge_viewed",
  "challenge_create_started",
  "challenge_share_started",
  "challenge_goal_started",
  "ai_coach_onboarding_started",
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

export function isProductEvent(name: string): name is ProductEvent {
  return (PRODUCT_EVENTS as readonly string[]).includes(name);
}

type Spec =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "slug" }
  | { kind: "host" }
  | { kind: "path" };

const LINK_PROVIDERS = ["kakao", "google", "other"] as const;
const LOGIN_PROVIDERS = ["kakao", "google", "password", "other"] as const;
export const DURATION_BUCKETS = [
  "lt10",
  "10-20",
  "20-40",
  "40-60",
  "60-90",
  "gte90",
  "unknown",
] as const;

const SPECS: Record<ProductEvent, Record<string, Spec>> = {
  landing_opened: {
    utm_source: { kind: "slug" },
    utm_medium: { kind: "slug" },
    utm_campaign: { kind: "slug" },
    referrer_host: { kind: "host" },
    landing_path: { kind: "path" },
  },
  onboarding_started: {},
  onboarding_nickname_shown: {},
  onboarding_completed: { has_invite: { kind: "bool" } },
  identity_link_started: { provider: { kind: "enum", values: LINK_PROVIDERS } },
  identity_link_succeeded: { provider: { kind: "enum", values: LINK_PROVIDERS } },
  identity_link_failed: {
    provider: { kind: "enum", values: LINK_PROVIDERS },
    error_code: { kind: "slug" },
  },
  login_succeeded: { provider: { kind: "enum", values: LOGIN_PROVIDERS } },
  login_failed: {
    provider: { kind: "enum", values: LOGIN_PROVIDERS },
    error_code: { kind: "slug" },
  },
  workout_completed: {
    is_first: { kind: "bool" },
    workout_index: { kind: "int", min: 1, max: 100000 },
    exercise_count: { kind: "int", min: 0, max: 200 },
    duration_bucket: { kind: "enum", values: DURATION_BUCKETS },
    has_photo: { kind: "bool" },
  },
  challenge_viewed: {},
  challenge_create_started: {},
  challenge_share_started: {},
  challenge_goal_started: {},
  ai_coach_onboarding_started: {},
};

/** 사람 속성(`$set`/`$set_once`)에 실을 수 있는 키 */
const PERSON_SPECS: Record<string, Spec> = {
  is_anonymous: { kind: "bool" },
  initial_utm_source: { kind: "slug" },
  initial_utm_medium: { kind: "slug" },
  initial_utm_campaign: { kind: "slug" },
};

export type Primitive = string | number | boolean;

/**
 * 글자·숫자·`_ . - +`만, 64자까지. **`@`가 없으므로 이메일이 통과할 수 없고**,
 * 공백·슬래시·콜론이 없으므로 URL도 통과할 수 없다. JWT 모양은 따로 한 번 더 막는다.
 */
const SLUG = /^[\p{L}\p{N}_.+-]{1,64}$/u;
const HOST = /^[a-z0-9.-]{1,120}$/;
const PATH = /^\/[A-Za-z0-9_\-./:]{0,119}$/;
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{8,}/;

function normalizeSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, "_").slice(0, 64);
  if (!SLUG.test(s) || JWT_LIKE.test(s)) return null;
  return s;
}

function check(spec: Spec, v: unknown): Primitive | null {
  switch (spec.kind) {
    case "bool":
      return typeof v === "boolean" ? v : null;
    case "int":
      return typeof v === "number" &&
        Number.isInteger(v) &&
        v >= spec.min &&
        v <= spec.max
        ? v
        : null;
    case "enum":
      return typeof v === "string" && spec.values.includes(v) ? v : null;
    case "slug":
      return normalizeSlug(v);
    case "host":
      return typeof v === "string" && HOST.test(v) ? v : null;
    case "path":
      return typeof v === "string" && PATH.test(v) ? v : null;
  }
}

function pick(
  specs: Record<string, Spec>,
  input: Record<string, unknown>,
): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const v = check(spec, input[key]);
    if (v !== null) out[key] = v;
  }
  return out;
}

/** 이벤트 속성 — 화이트리스트에 없는 키와 모양이 틀린 값은 버린다. */
export function sanitizeEventProps(
  event: ProductEvent,
  input: Record<string, unknown> | undefined,
): Record<string, Primitive> {
  return pick(SPECS[event], input ?? {});
}

export function sanitizePersonProps(
  input: Record<string, unknown> | undefined,
): Record<string, Primitive> {
  return pick(PERSON_SPECS, input ?? {});
}

/** 소요 시간(분) → 구간. 정확한 시간은 보내지 않는다. */
export function durationBucket(
  minutes: number | null | undefined,
): (typeof DURATION_BUCKETS)[number] {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "unknown";
  if (minutes < 10) return "lt10";
  if (minutes < 20) return "10-20";
  if (minutes < 40) return "20-40";
  if (minutes < 60) return "40-60";
  if (minutes < 90) return "60-90";
  return "gte90";
}

// ── 전송 직전 최종 필터 (SDK `before_send`) ───────────────────────────

/** SDK가 이벤트마다 자동으로 붙이는 값 중 **남기는 것**. 나머지($current_url 등)는 버린다. */
const SAFE_SYSTEM_KEYS = new Set([
  "token",
  "distinct_id",
  "$lib",
  "$lib_version",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
  "$timezone",
  "$timezone_offset",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$session_id",
  "$window_id",
  "$device_id",
  "$is_identified",
  "$process_person_profile",
  "$anon_distinct_id",
]);

/** SDK가 스스로 만드는 이벤트 중 허용하는 것 (식별·사람 속성) */
const SAFE_SYSTEM_EVENTS = new Set(["$identify", "$set"]);

export function sanitizeOutgoing(cr: CaptureResult | null): CaptureResult | null {
  if (!cr) return null;
  const event = cr.event;
  const isProduct = isProductEvent(event);
  if (!isProduct && !SAFE_SYSTEM_EVENTS.has(event)) return null;

  const props = (cr.properties ?? {}) as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const k of Object.keys(props)) {
    if (SAFE_SYSTEM_KEYS.has(k)) cleaned[k] = props[k];
  }
  if (isProduct) Object.assign(cleaned, sanitizeEventProps(event, props));
  // IP·GeoIP는 서버에서 붙는다. 끄라고 알린다(`ip: false`와 짝).
  cleaned.$geoip_disable = true;

  const topSet = sanitizePersonProps(cr.$set as Record<string, unknown> | undefined);
  const topSetOnce = sanitizePersonProps(
    cr.$set_once as Record<string, unknown> | undefined,
  );
  const innerSet = sanitizePersonProps(props.$set as Record<string, unknown> | undefined);
  const innerSetOnce = sanitizePersonProps(
    props.$set_once as Record<string, unknown> | undefined,
  );
  if (Object.keys(innerSet).length) cleaned.$set = innerSet;
  if (Object.keys(innerSetOnce).length) cleaned.$set_once = innerSetOnce;

  return {
    ...cr,
    properties: cleaned,
    $set: Object.keys(topSet).length ? topSet : undefined,
    $set_once: Object.keys(topSetOnce).length ? topSetOnce : undefined,
  } as CaptureResult;
}
