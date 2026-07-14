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

/** 크루원 프로필 목록 */
export async function getCrewProfiles(groupId: string): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  const { data: members, error } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  if (error) throw error;
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .in("id", ids);
  if (pErr) throw pErr;
  return profiles ?? [];
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
