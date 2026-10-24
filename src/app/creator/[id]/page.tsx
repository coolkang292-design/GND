import { notFound } from "next/navigation";
import { CreatorStudio } from "@/components/challenge/creator-studio";
import {
  getChallengeGoals,
  getChallengeParticipantProfiles,
  getChallengePeriodSessions,
} from "@/lib/challenge";
import { buildCreatorSnapshot, type CreatorParticipant } from "@/lib/domain/creator-studio";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Challenge } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server-side authorization is mandatory: host-only links and conditional
 * rendering are not security boundaries. No service_role and no client-side
 * query of private management data. Existing participant/session RLS stays on.
 */
export default async function CreatorChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) notFound();

  const { data, error } = await db
    .from("challenges")
    .select("id,name,status,start_date,end_date,invite_code,created_by")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || data.created_by !== user.id || data.status === "cancelled") {
    notFound(); // Do not disclose another host's challenge existence.
  }

  const challenge = data as Pick<Challenge,
    "id" | "name" | "status" | "start_date" | "end_date" | "invite_code" | "created_by">;
  const { data: participantData, error: participantsError } = await db
    .from("challenge_participants")
    .select("user_id,role,status,joined_at")
    .eq("challenge_id", challenge.id);
  if (participantsError) throw new Error("Creator participants could not be loaded");

  const [profiles, goals, sessions] = await Promise.all([
    getChallengeParticipantProfiles(challenge.id, db),
    getChallengeGoals(challenge.id, db),
    challenge.status === "active" || challenge.status === "ended"
      ? getChallengePeriodSessions(challenge.id, db)
      : Promise.resolve([]),
  ]);

  const snapshot = buildCreatorSnapshot({
    participants: (participantData ?? []) as CreatorParticipant[],
    profiles,
    goals,
    sessions,
    startDate: challenge.start_date,
    endDate: challenge.end_date,
    todayKey: dayKey(new Date(), DEFAULT_TIMEZONE),
    status: challenge.status,
  });
  return <CreatorStudio challenge={challenge} snapshot={snapshot} viewerId={user.id} />;
}
