import { acquisitionColumns } from "@/lib/acquisition";
import { resolveTimeZone } from "@/lib/domain/time";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Group, Profile } from "@/lib/types";

/** 내 프로필 (없으면 null → 온보딩 필요) */
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertMyProfile(input: {
  id: string;
  nickname: string;
  avatar_url: string;
  weekly_goal: number;
  /**
   * 소개·SNS (0085). **optional인 이유** — 이 함수를 부르는 곳이 프로필 편집만이
   * 아니다. 필수로 만들면 기존 호출부를 전부 고쳐야 하고, 안 고친 곳은 값을
   * 안 넘겨 **저장돼 있던 소개가 지워진다.**
   *
   * ⚠️ 그래서 편집 화면은 세 필드를 **언제나 값 또는 null로** 넘긴다.
   *    `undefined`로 두면 upsert에서 키가 빠져 옛 값이 남는다 — 사용자가 지운
   *    소개가 안 지워진다.
   */
  bio?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("profiles").upsert({
    ...input,
    timezone: resolveTimeZone(),
    // 0079: 첫 진입에서 붙잡아 둔 유입 출처를 프로필과 함께 심는다.
    // ⚠️ 프로필 편집에서도 이 upsert가 다시 도는데, 그때는 저장된 값이 그대로
    //    다시 실린다. **덮어써도 같은 값**이고, 혹시 비어 있어도 서버 트리거가
    //    기존 값을 지킨다(freeze_profile_attribution). 방어선이 양쪽에 있다.
    ...acquisitionColumns(),
  });
  if (error) {
    // 0017 유니크 위반 — 같은 사람이 다른 기기/브라우저로 또 가입하는 사고 방지
    if (error.code === "23505") {
      throw new Error(
        "이미 사용 중인 닉네임이에요. 본인 계정이 이미 있다면 원래 쓰던 기기·브라우저로 접속해 주세요.",
      );
    }
    throw error;
  }
}

/**
 * 프로필 사진 **한 칸만** 바꾼다 (2026-08-22).
 *
 * ⚠️ **`upsertMyProfile`을 쓰지 않는 이유가 있다. 되돌리지 마라.**
 * 저건 `nickname`·`weekly_goal`을 **함께** 요구하는 온보딩용 upsert다. 사진만
 * 바꾸는 자리(홈 → 프로필 시트)에서 그걸 부르면
 *   ① 그 화면이 갖고 있지도 않은 `weekly_goal`을 지어내 덮어써야 하고
 *   ② 다른 기기에서 방금 바꾼 닉네임을 **손에 든 낡은 값으로 되돌린다**
 *   ③ 닉네임을 건드리지도 않았는데 23505(닉네임 중복)로 실패할 수 있다
 * 사진을 바꾸는 일에 셋 다 필요 없다.
 *
 * `update`라서 프로필 행이 **이미 있어야** 한다 — 온보딩을 마친 사람만 이 경로에
 * 닿으므로(홈은 `getMyProfile`이 준 값으로 그려진다) 전제가 성립한다.
 *
 * RLS `profiles_update_own`(using·check 모두 `id = auth.uid()`)이 남의 행을 막는다.
 */
export async function updateMyAvatar(
  userId: string,
  avatarUrl: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);
  if (error) throw error;
}

/** 크루 만들기 — 그룹 생성 + owner 멤버십 (단일 트랜잭션 RPC) */
export async function createGroup(name: string): Promise<Group> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_group", {
    p_name: name,
  });
  if (error) throw error;
  return data as Group;
}

/** 초대코드로 참여 (security definer RPC) */
export async function joinGroupWithCode(
  code: string,
): Promise<{ group_id: string; group_name: string }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("join_group_with_code", {
    p_code: code,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("invalid_invite_code");
  return row as { group_id: string; group_name: string };
}

/** 내가 속한 크루 목록 (Phase 2에선 보통 1개) */
export async function getMyGroups(): Promise<Group[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** id 목록 → 프로필. RLS가 읽게 해주는 것만 온다(본인·크루·같은 그룹). */
export async function profilesByIds(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

/**
 * 같은 그룹에 속한 사람들의 프로필 — **챌린지 전용**.
 *
 * 0039로 "크루"의 뜻이 바뀌었지만 챌린지는 아직 그룹 기반이라(설계 §15) 참가자
 * 명단은 여전히 group_members가 원천이다. 이름을 group으로 바꾼 이유는, 그대로
 * 두면 다음 사람이 크루 기준이라고 착각하고 챌린지 명단을 조용히 망가뜨리기 때문이다.
 */
export async function getGroupMemberProfiles(
  groupId: string,
): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: members, error } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  if (error) throw error;
  return profilesByIds((members ?? []).map((m) => m.user_id));
}

/**
 * 내 크루원 프로필 목록 (본인 제외) — 0039부터 상호 수락 기준.
 *
 * 반환 타입을 Profile[]로 유지하는 이유는 호출부(홈 크루 카드·꾸준왕 카드)가
 * avatar_url·nickname을 그 이름 그대로 쓰고 MemberProfileSheet에 넘기기 때문이다.
 * crew_links는 RLS가 "내가 낀 행"으로 좁히므로 필터 없이 읽어도 내 연결만 온다.
 */
export async function getCrewProfiles(myUserId: string): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: links, error } = await supabase
    .from("crew_links")
    .select("user_a, user_b");
  if (error) throw error;
  return profilesByIds(
    ((links ?? []) as { user_a: string; user_b: string }[]).map((l) =>
      l.user_a === myUserId ? l.user_b : l.user_a,
    ),
  );
}

/**
 * 내 친구 초대 코드 — 없으면 발급, 있으면 그대로 (0061, 멱등).
 *
 * ⚠️ **그룹 코드가 아니다.** 2026-08-08까지 홈의 "친구 초대하기" 카드는
 * `groups.invite_code`를 보여줬고, 그 링크는 `join_group_with_code`를 타서
 * `group_members`에만 넣었다 — `crew_links`는 한 줄도 안 건드렸다. 그래서 링크로
 * 들어온 사람이 **친구 목록에 안 나타났다**(사용자 지적).
 * 설계: `docs/superpowers/specs/2026-08-08-friend-invite-identity-onboarding-design.md` §3
 *
 * 코드는 한 번 발급되면 바뀌지 않는다. 바뀌면 사용자가 어제 보낸 링크가 죽는다.
 */
export async function issueMyInviteCode(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("issue_my_invite_code");
  if (error) throw error;
  return data as string;
}

export type FriendInviteResult = {
  ownerId: string;
  nickname: string;
  /** 이미 친구였다 — 화면은 "이미 친구예요"로 말해야 한다 */
  alreadyFriends: boolean;
};

/**
 * 친구 초대 코드 수락 — `crew_links`에 즉시 1행 (0061).
 *
 * 요청/수락을 다시 묻지 않는다. **링크를 보낸 것이 초대 의사이고 링크를 연 것이
 * 수락이다.** `sendCrewRequest`를 거치게 하면 초대한 사람이 자기가 부른 사람의
 * 요청을 또 수락해야 한다.
 *
 * ⚠️ 코드가 친구 코드가 아니면 서버가 **`invalid_friend_code`** 를 던진다.
 * 호출부는 그때 **옛 그룹 코드로 재시도**해야 한다 — 카카오톡에 이미 뿌려진
 * 링크가 죽지 않게 하는 유일한 장치다(`/invite/[code]`, 온보딩 둘 다).
 */
export async function acceptFriendInvite(
  code: string,
): Promise<FriendInviteResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("accept_friend_invite", {
    p_code: code,
  });
  if (error) throw error;
  const row = data as {
    ownerId: string;
    nickname: string;
    alreadyFriends: boolean;
  };
  return {
    ownerId: row.ownerId,
    nickname: row.nickname,
    alreadyFriends: row.alreadyFriends,
  };
}

/** 서버가 "이 코드는 친구 코드가 아니다"라고 답했는가 — 그룹 코드 재시도 조건 */
export function isNotFriendCode(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("invalid_friend_code");
}

export type InviteRedeemResult =
  | { kind: "friend"; nickname: string; alreadyFriends: boolean }
  | { kind: "group"; groupName: string };

/**
 * 초대 코드 하나로 **친구 먼저, 옛 그룹 코드는 하위 호환**으로 처리한다.
 *
 * ⚠️ **이 함수가 유일한 진입점이다.** `/invite/[code]`와 온보딩이 같은 2단계를
 * 밟아야 하는데, 두 곳에 복사하면 한쪽만 고쳐져 갈라진다. 실제로 이 저장소는
 * 같은 실수로 `start_challenge`를 세 번 고쳤다.
 *
 * 순서를 뒤집지 마라. 그룹을 먼저 시도하면, 0061이 코드 공간을 공유하므로
 * **친구 코드가 그룹 코드로 오인될 수 있다**(둘 다 `GND-XXXXX`).
 *
 * @throws 둘 다 실패하면 마지막 오류를 그대로 던진다 — 호출부가 "존재하지 않는
 *   초대 링크"로 옮긴다.
 */
export async function redeemInviteCode(
  code: string,
): Promise<InviteRedeemResult> {
  try {
    const friend = await acceptFriendInvite(code);
    return {
      kind: "friend",
      nickname: friend.nickname,
      alreadyFriends: friend.alreadyFriends,
    };
  } catch (e) {
    // 친구 코드가 아닐 때만 그룹으로 넘어간다. `self_invite`처럼 **친구 코드가
    // 맞는데 거절된** 경우까지 그룹으로 재시도하면, 자기 링크를 눌렀을 때
    // "존재하지 않는 초대 링크"라는 엉뚱한 문구가 뜬다.
    if (!isNotFriendCode(e)) throw e;
    const joined = await joinGroupWithCode(code);
    return { kind: "group", groupName: joined.group_name };
  }
}

const PENDING_INVITE_KEY = "gnd-pending-invite";

export function savePendingInvite(code: string): void {
  localStorage.setItem(PENDING_INVITE_KEY, code);
}

export function peekPendingInvite(): string | null {
  return localStorage.getItem(PENDING_INVITE_KEY);
}

export function clearPendingInvite(): void {
  localStorage.removeItem(PENDING_INVITE_KEY);
}
