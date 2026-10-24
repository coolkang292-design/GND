import "server-only";
import { notFound, redirect } from "next/navigation";
import { CREATOR_BASE_PATH } from "@/lib/domain/creator-return";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Challenge } from "@/lib/types";

export { CREATOR_BASE_PATH };
export { challengeStatusLabel } from "@/lib/domain/creator-studio";

export type HostChallenge = Pick<
  Challenge,
  "id" | "name" | "status" | "start_date" | "end_date" | "invite_code" | "created_by" | "recruit_image_url"
>;

/**
 * Server-side gate for every Creator Studio page. Host-only links and
 * conditional rendering are not security boundaries.
 *
 * - No session → `/login?next=<this page>` (사용자 결정 2026-10-24, §9-③).
 *   After login the server checks again, so a non-host still gets 404.
 * - Not the host, cancelled, or missing → 404 (do not disclose existence).
 */
export async function requireCreatorUser(returnPath: string) {
  const db = await getSupabaseServerClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  return { db, user };
}

export async function requireHostChallenge(id: string, returnPath: string) {
  const { db, user } = await requireCreatorUser(returnPath);
  const { data, error } = await db
    .from("challenges")
    .select("id,name,status,start_date,end_date,invite_code,created_by,recruit_image_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || data.created_by !== user.id || data.status === "cancelled") notFound();
  return { db, user, challenge: data as HostChallenge };
}
