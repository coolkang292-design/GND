import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 공유 카드를 그리는 데 필요한 **최소한의** 조회 — 서버 전용 (2026-09-20).
 *
 * ── 왜 service_role인가 ─────────────────────────────────────────────────
 *
 * 카카오 스크래퍼는 로그인하지 않고, 자바스크립트도 안 돌린다. 그런데 이 앱의
 * RPC는 **전부 `anon`에서 revoke**돼 있다(0049·0061·0096). 즉 브라우저 키로는
 * 초대 코드로 아무것도 못 읽는다. `generateMetadata`가 도는 **서버**에서
 * service_role로 읽는 것이 유일한 길이다.
 *
 * `SUPABASE_SERVICE_ROLE_KEY`는 이미 Vercel에 들어가 있다(`/api/briefing`이
 * 쓴다). **새 마이그레이션이 필요 없다.**
 *
 * ⚠️⚠️ **RLS를 우회하는 키다. 돌려주는 필드를 여기서 못 박는다.**
 *    `select("*")`를 쓰지 마라. 카드에 실리는 것은 설계 D3의 경계 그대로
 *    **챌린지 이름·모집 사진·초대자 닉네임**까지다. 참가자 목록·이메일·
 *    UUID·목표는 **어느 것도 나가지 않는다** — 카드는 링크를 안 누른 사람에게도
 *    보이고, 단톡방으로 전달된다.
 *
 * ⚠️⚠️ **어떤 함수도 던지지 않는다.** `generateMetadata`가 예외를 내면
 *    그 페이지는 500이 되고, 스크래퍼는 **카드를 통째로 안 만든다.** 조회가
 *    실패하면 카드가 기본 문구로 나오는 편이 훨씬 낫다. 그래서 전부
 *    `null`로 삼킨다.
 */

/** 조회 한 건이 이만큼 넘게 걸리면 포기한다 — 스크래퍼가 기다려 주지 않는다 */
const LOOKUP_TIMEOUT_MS = 2500;

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export interface ChallengeCardInfo {
  name: string | null;
  /** `avatars` public 버킷의 공개 URL — 서명 URL이 아니라 만료가 없다 */
  imageUrl: string | null;
}

/**
 * 초대 코드 → 챌린지 이름·모집 사진.
 *
 * ⚠️ 코드를 대문자로 맞추지 않는다. `challenges.invite_code`는 서버가
 *    `GND-XXXXX`로 발급한 값 그대로다(0049). 사람이 손으로 치는 경로가 아니라
 *    링크에 실려 온 값이므로 정규화할 이유가 없고, 괜히 건드리면 형식이
 *    바뀌는 날 조용히 안 맞는다.
 */
export async function lookupChallengeByInviteCode(
  code: string,
): Promise<ChallengeCardInfo | null> {
  if (!code) return null;
  try {
    const supabase = getSupabaseAdminClient();
    const res = await withTimeout(
      supabase
        .from("challenges")
        .select("name, recruit_image_url")
        .eq("invite_code", code)
        .maybeSingle(),
      LOOKUP_TIMEOUT_MS,
    );
    if (!res || res.error || !res.data) return null;
    const row = res.data as { name: string | null; recruit_image_url: string | null };
    return { name: row.name, imageUrl: row.recruit_image_url };
  } catch {
    return null;
  }
}

/** 사용자 id → 닉네임. 챌린지 링크의 `?by=`가 나르는 값이다 (0091) */
export async function lookupNickname(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const supabase = getSupabaseAdminClient();
    const res = await withTimeout(
      supabase
        .from("profiles")
        .select("nickname")
        .eq("id", userId)
        .maybeSingle(),
      LOOKUP_TIMEOUT_MS,
    );
    if (!res || res.error || !res.data) return null;
    return (res.data as { nickname: string | null }).nickname;
  } catch {
    return null;
  }
}

export interface InviteOwner {
  nickname: string | null;
  /** 옛 그룹 코드로 맞은 경우의 그룹 이름 (0061 이전 링크) */
  groupName: string | null;
}

/**
 * 친구 초대 코드 → 주인.
 *
 * ⚠️ **친구 코드를 먼저 본다.** 0061이 `profiles.invite_code`와
 *    `groups.invite_code`의 코드 공간을 공유하므로(둘 다 `GND-XXXXX`), 그룹을
 *    먼저 찾으면 친구 코드가 그룹으로 오인될 수 있다. `crew.ts:250`의
 *    `redeemInviteCode`가 같은 순서를 쓴다 — 두 곳의 순서를 다르게 두지 마라.
 */
export async function lookupInviteOwner(
  code: string,
): Promise<InviteOwner | null> {
  if (!code) return null;
  try {
    const supabase = getSupabaseAdminClient();

    const person = await withTimeout(
      supabase
        .from("profiles")
        .select("nickname")
        .eq("invite_code", code)
        .maybeSingle(),
      LOOKUP_TIMEOUT_MS,
    );
    if (person && !person.error && person.data) {
      return {
        nickname: (person.data as { nickname: string | null }).nickname,
        groupName: null,
      };
    }

    const group = await withTimeout(
      supabase
        .from("groups")
        .select("name")
        .eq("invite_code", code)
        .maybeSingle(),
      LOOKUP_TIMEOUT_MS,
    );
    if (group && !group.error && group.data) {
      return {
        nickname: null,
        groupName: (group.data as { name: string | null }).name,
      };
    }

    return null;
  } catch {
    return null;
  }
}
