/**
 * 크루 연결 RPC 래퍼 — 0038의 8개 RPC 중 화면이 쓰는 것만 감싼다.
 *
 * cancel_crew_request는 일부러 빼 뒀다. 화면에서 request_sent는 비활성
 * "요청됨"이라 취소 버튼이 없다(설계 §9). 쓰지 않는 코드를 미리 만들지 않는다 —
 * 나중에 취소 UI를 붙일 때 서버 RPC는 이미 있다.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSearchable } from "@/lib/domain/crew-link";
import type {
  CrewMember,
  CrewRelation,
  CrewRequest,
  CrewSearchResult,
} from "@/lib/domain/crew-link";
import { toSocialError } from "@/lib/social";

/** 닉네임 정확 일치 검색 — 없으면 null (에러 아님) */
export async function searchProfileByNickname(
  nickname: string,
): Promise<CrewSearchResult | null> {
  if (!isSearchable(nickname)) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("search_profile_by_nickname", {
    p_nickname: nickname,
  });
  if (error) throw toSocialError(error);
  const row = (data ?? [])[0] as
    | {
        id: string;
        nickname: string;
        avatar_url: string | null;
        relation: string;
        request_id: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    relation: row.relation as CrewRelation,
    requestId: row.request_id,
  };
}

export async function getMyCrew(): Promise<CrewMember[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_my_crew");
  if (error) throw toSocialError(error);
  return (
    (data ?? []) as {
      id: string;
      nickname: string;
      avatar_url: string | null;
      total_xp: number;
      current_level: number;
      current_stage: number;
    }[]
  ).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    totalXp: r.total_xp,
    currentLevel: r.current_level,
    currentStage: r.current_stage,
  }));
}

export async function getIncomingCrewRequests(): Promise<CrewRequest[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_incoming_crew_requests");
  if (error) throw toSocialError(error);
  return (
    (data ?? []) as {
      request_id: string;
      requester_id: string;
      nickname: string;
      avatar_url: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    requestId: r.request_id,
    requesterId: r.requester_id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    createdAt: new Date(r.created_at),
  }));
}

/** 요청 — 역방향 pending이 있으면 서버가 즉시 수락하고 'accepted'를 준다 */
export async function sendCrewRequest(
  targetId: string,
): Promise<"pending" | "accepted"> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("send_crew_request", {
    p_target_id: targetId,
  });
  if (error) throw toSocialError(error);
  return (data as { status: "pending" | "accepted" }).status;
}

export async function acceptCrewRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("accept_crew_request", {
    p_request_id: requestId,
  });
  if (error) throw toSocialError(error);
}

export async function rejectCrewRequest(requestId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("reject_crew_request", {
    p_request_id: requestId,
  });
  if (error) throw toSocialError(error);
}

export async function removeCrew(targetId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("remove_crew", {
    p_target_id: targetId,
  });
  if (error) throw toSocialError(error);
}
