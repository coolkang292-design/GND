/**
 * 퍼널 계측 — **기존 DB가 알 수 없는 5가지만** 기록한다 (배포 D).
 *
 * ⛔ **이건 Mixpanel이 아니다. 모든 클릭을 추적하지 않는다.**
 *    온보딩 완료·첫 운동·챌린지 참가·3회 운동·D7은 이미 `profiles`·
 *    `workout_sessions`·`challenge_participants`가 정확히 알고 있어서 여기서
 *    기록하지 않는다. 같은 사실을 두 곳에 저장하면 숫자가 갈린다.
 *    전수 감사: `docs/analytics/public-beta-funnel-audit.md`
 *
 * ⚠️ **어떤 경우에도 던지지 않는다** (`noteTrail`·`captureAcquisitionOnce`와 같은 규약).
 *    계측이 앱을 죽이면 계측을 안 하느니만 못하다.
 *
 * ⚠️ **개인정보를 싣지 않는다.** 이메일·닉네임·토큰·raw referrer URL·초대 코드
 *    원문·검색어를 넣지 않는다. 실을 수 있는 것은 스키마가 정한 5칸뿐이고
 *    (`source`·`medium`·`campaign`·`error_code`), 자유 JSON 칸이 없다.
 *    0093이 `check` 제약으로 이름과 길이를 강제한다.
 */

import { readAcquisition } from "@/lib/acquisition";
import { trackProduct } from "@/lib/posthog/track";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

/** 0093의 `check` 제약과 **정확히 같아야 한다.** 다르면 DB가 거부한다. */
export const FUNNEL_EVENTS = [
  "landing_opened",
  "onboarding_started",
  "identity_link_started",
  "identity_link_failed",
  "challenge_viewed",
  // 0109 — 눌렀지만 끝내지 않은 것. 끝낸 것(생성·참가·목표 저장·첫 운동)은
  // challenges·challenge_participants·user_goals·workout_sessions가 이미 안다.
  "challenge_create_started",
  "challenge_share_started",
  "challenge_goal_started",
  // 0112 — AI 코치 목표 설정을 열었다. 끝냈는지는 training_profiles.created_at이 안다.
  // 생성·열람·체감 응답은 workout_ai_feedback·workout_session_feedback이 센다.
  "ai_coach_onboarding_started",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/**
 * 이번 브라우저 세션에서 이미 시도한 이벤트 — 새로고침마다 네트워크를 때리지
 * 않으려는 것뿐이다. **정확성의 방어선이 아니다** — 진짜 중복 방지는 0093의
 * `unique (user_id, event_name)`이 한다. 여기가 비어도 DB가 막는다.
 */
function attemptedKey(event: FunnelEvent): string {
  return `gnd:funnel:${event}`;
}

function alreadyAttempted(event: FunnelEvent): boolean {
  try {
    return sessionStorage.getItem(attemptedKey(event)) === "1";
  } catch {
    return false;
  }
}

function markAttempted(event: FunnelEvent): void {
  try {
    sessionStorage.setItem(attemptedKey(event), "1");
  } catch {
    // 프라이빗 모드 등. 다음 로드에서 한 번 더 시도할 뿐 해가 없다.
  }
}

/**
 * 유입 귀속은 **`landing_opened`에만** 싣는다.
 *
 * 왜 여기에도 싣나: 프로필을 안 만든 사람의 캠페인은 `profiles.acquisition_*`에
 * 영영 안 남는다(`crew.ts`가 프로필 생성 때 쓰기 때문). 인플루언서 링크를 열고
 * 그냥 나간 사람을 세려면 이 값이 여기 있어야 한다.
 */
function landingAttribution(): {
  source: string | null;
  medium: string | null;
  campaign: string | null;
} {
  const a = readAcquisition();
  return {
    source: a?.source ?? null,
    medium: a?.medium ?? null,
    campaign: a?.campaign ?? null,
  };
}

/**
 * 같은 사실을 PostHog에도 **한 곳에서** 복제한다 — 화면 코드가 두 번 부르지 않도록.
 *
 * ⛔ 원본은 여전히 `analytics_events`(Supabase)다. 이 함수는 동의한 사용자에 한해 동일 사실을
 *    탐색용으로 복제할 뿐이고, 실패해도 DB 기록과 앱에 영향을 주지 않는다.
 * ⚠️ DB의 `unique (user_id, event_name)`과 다르게, PostHog는 **탭 세션당 한 번**이다
 *    (재방문 분석에 쓰기 위해). 시도가 의미 있는 `identity_link_*`는 중복 제거를 하지 않는다.
 */
function mirrorToPosthog(
  event: FunnelEvent,
  userId: string | null,
  errorCode: string | undefined,
  extra: FunnelExtra | undefined,
): void {
  if (!userId) return;
  const provider = extra?.provider;
  switch (event) {
    case "landing_opened": {
      const a = readAcquisition();
      trackProduct(
        "landing_opened",
        {
          utm_source: a?.source,
          utm_medium: a?.medium,
          utm_campaign: a?.campaign,
          referrer_host: a?.referrer,
          landing_path: a?.landing,
        },
        { userId, dedupe: { key: event, scope: "session" } },
      );
      return;
    }
    case "identity_link_started":
      trackProduct("identity_link_started", { provider }, { userId });
      return;
    case "identity_link_failed":
      trackProduct(
        "identity_link_failed",
        { provider, error_code: errorCode },
        { userId },
      );
      return;
    default:
      trackProduct(event, {}, { userId, dedupe: { key: event, scope: "session" } });
  }
}

/** 화면이 더해 보낼 수 있는 선택 정보. 자유 텍스트는 실지 않는다. */
export interface FunnelExtra {
  provider?: string;
}

/**
 * 이벤트 한 건 기록. **성공 여부를 돌려주되 던지지 않는다.**
 *
 * @param userId 지금 로그인(익명 포함)한 사용자. 없으면 기록하지 않는다 —
 *   0093의 정책이 `auth.uid() = user_id`를 요구하므로 세션 없이는 어차피 거부된다.
 * @param errorCode `identity_link_failed`에만 쓴다. **분류 코드만** — raw error 금지.
 */
export async function recordFunnelEvent(
  event: FunnelEvent,
  userId: string | null,
  errorCode?: string,
  extra?: FunnelExtra,
): Promise<boolean> {
  // PostHog 복제 — DB 경로보다 먼저, 그리고 DB의 실패·중복(23505)와 무관하게.
  // (동의가 없거나 키가 없으면 이 호출은 아무 일도 하지 않는다.)
  try {
    mirrorToPosthog(event, userId, errorCode, extra);
  } catch {
    // 분석이 기존 기록을 막지 않는다
  }
  try {
    if (!isSupabaseConfigured() || !userId) return false;
    if (alreadyAttempted(event)) return false;

    const attribution =
      event === "landing_opened"
        ? landingAttribution()
        : { source: null, medium: null, campaign: null };

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("analytics_events").insert({
      user_id: userId,
      event_name: event,
      ...attribution,
      // 길이 제약(64)을 넘기면 DB가 통째로 거부한다. 여기서 잘라 둔다.
      error_code: errorCode ? errorCode.slice(0, 64) : null,
    });

    if (error) {
      // 23505 = unique 위반 = **이미 기록됐다.** 정상이므로 표시하고 끝낸다.
      if (error.code === "23505") {
        markAttempted(event);
        return false;
      }
      return false;
    }

    markAttempted(event);
    return true;
  } catch {
    return false;
  }
}
