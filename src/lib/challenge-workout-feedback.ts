import { getMyChallenges, getChallengeGoals, getChallengeParticipants, getChallengePeriodSessions } from "./challenge";
import type { ChallengeScoreSnapshot } from "./domain/challenge-workout-impact";
import { DEFAULT_TIMEZONE } from "./domain/time";

/** Fresh membership and rules, never the metadata saved when the workout started. */
export async function loadChallengeScoreSnapshot(userId: string, challengeId: string): Promise<ChallengeScoreSnapshot | null> {
  const challenge = (await getMyChallenges(userId)).find((c) => c.id === challengeId && c.status === "active" && c.myStatus === "joined");
  if (!challenge) return null;
  const [goals, participants, rows] = await Promise.all([
    getChallengeGoals(challengeId), getChallengeParticipants(challengeId), getChallengePeriodSessions(challengeId),
  ]);
  if (!goals.some((g) => g.user_id === userId)) return null;
  const participantIds = [...new Set(participants.filter((p) => p.status !== "invited").map((p) => p.user_id))];
  if (!participantIds.includes(userId)) return null;
  return { challenge, goals, participantIds, rows, timeZone: DEFAULT_TIMEZONE };
}
