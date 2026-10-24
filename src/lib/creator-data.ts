import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getChallengeActivity,
  getChallengeGoals,
  getChallengeParticipantProfiles,
  getChallengePeriodSessions,
} from "@/lib/challenge";
import type { HostChallenge } from "@/lib/creator-access";
import { buildCreatorMemberDetail, type CreatorMemberDetail } from "@/lib/domain/creator-member-detail";
import {
  buildCreatorSnapshot,
  buildRecentActivity,
  type CreatorActivity,
  type CreatorParticipant,
  type CreatorSnapshot,
} from "@/lib/domain/creator-studio";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { timeAgo } from "@/lib/time-ago";

export type CreatorActivityView = CreatorActivity & { when: string };

export type CreatorMemberDetailView = Omit<CreatorMemberDetail, "recent"> & {
  recent: (CreatorMemberDetail["recent"][number] & { when: string })[];
  todayKey: string;
};

/** 참여자 상세 (시안 2). null → the page answers 404 (not this room's member). */
export async function loadCreatorMemberDetail(
  db: SupabaseClient,
  challenge: HostChallenge,
  userId: string,
): Promise<CreatorMemberDetailView | null> {
  const { data: participantData, error } = await db
    .from("challenge_participants")
    .select("user_id,role,status,joined_at")
    .eq("challenge_id", challenge.id);
  if (error) throw new Error("Creator participants could not be loaded");
  const participants = (participantData ?? []) as CreatorParticipant[];
  if (!participants.some((p) => p.user_id === userId && p.role !== "host" && p.status === "joined")) {
    return null; // 다른 방 회원·탈퇴자·방장 — 더 읽지 않는다
  }

  const tracked = challenge.status === "active" || challenge.status === "ended";
  const [profiles, goals, sessions, activity] = await Promise.all([
    getChallengeParticipantProfiles(challenge.id, db),
    getChallengeGoals(challenge.id, db),
    tracked ? getChallengePeriodSessions(challenge.id, db) : Promise.resolve([]),
    challenge.status === "active" ? getChallengeActivity(challenge.id, db) : Promise.resolve([]),
  ]);
  const todayKey = dayKey(new Date(), DEFAULT_TIMEZONE);
  const detail = buildCreatorMemberDetail({
    userId,
    participants,
    profiles,
    goals,
    sessions,
    activity,
    startDate: challenge.start_date,
    endDate: challenge.end_date,
    todayKey,
    status: challenge.status,
  });
  if (!detail) return null;
  return {
    ...detail,
    todayKey,
    recent: detail.recent.map((r) => ({ ...r, when: timeAgo(new Date(r.at)) })),
  };
}

/**
 * One load for every Creator Studio page, so home and members never count
 * differently. Call only after `requireHostChallenge` — RLS still applies, this
 * adds no privilege.
 */
export async function loadCreatorView(
  db: SupabaseClient,
  challenge: HostChallenge,
  options: { recentLimit?: number } = {},
): Promise<{ snapshot: CreatorSnapshot; recent: CreatorActivityView[] }> {
  const { data: participantData, error } = await db
    .from("challenge_participants")
    .select("user_id,role,status,joined_at")
    .eq("challenge_id", challenge.id);
  if (error) throw new Error("Creator participants could not be loaded");
  const participants = (participantData ?? []) as CreatorParticipant[];

  const tracked = challenge.status === "active" || challenge.status === "ended";
  const [profiles, goals, sessions, activity] = await Promise.all([
    getChallengeParticipantProfiles(challenge.id, db),
    getChallengeGoals(challenge.id, db),
    tracked ? getChallengePeriodSessions(challenge.id, db) : Promise.resolve([]),
    // The feed RPC only answers for active challenges (it 404s otherwise).
    options.recentLimit && challenge.status === "active"
      ? getChallengeActivity(challenge.id, db)
      : Promise.resolve([]),
  ]);

  const snapshot = buildCreatorSnapshot({
    participants,
    profiles,
    goals,
    sessions,
    startDate: challenge.start_date,
    endDate: challenge.end_date,
    todayKey: dayKey(new Date(), DEFAULT_TIMEZONE),
    status: challenge.status,
  });
  const recent = options.recentLimit
    ? buildRecentActivity({ participants, profiles, activity, limit: options.recentLimit })
        // Labels are made on the server so hydration never disagrees with them.
        .map((a) => ({ ...a, when: timeAgo(new Date(a.at)) }))
    : [];
  return { snapshot, recent };
}
