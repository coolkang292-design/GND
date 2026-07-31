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
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("profiles").upsert({
    ...input,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
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
