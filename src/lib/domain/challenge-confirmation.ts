import type { UserGoal } from "@/lib/types";
import type { GoalContribution } from "@/lib/challenge";
import type { GoalType } from "@/lib/domain/goal-score";

/** One active, joined challenge; independently verified after the session is saved. */
export type ActiveChallengeContext = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  photoRequired: boolean;
  goals: UserGoal[];
};

export type ChallengeConfirmation =
  | { status: "checking" }
  | { status: "unavailable" }
  | {
      status: "confirmed";
      totals: {
        type: GoalType;
        label: string;
        value: number;
        unit: string;
        target: number;
      }[];
    };

/**
 * Photo-proof gate applies to any active challenge whose server scoring excludes
 * unverified sessions — even if a single-session estimate says delta=0. A second
 * workout on the same day can satisfy a distinct-exercise daily threshold.
 */
export function hasPendingChallengeProof(
  entries: readonly { context: Pick<ActiveChallengeContext, "photoRequired" | "goals">; gains: readonly GoalContribution[] }[],
  photoDone: boolean,
): boolean {
  return !photoDone && entries.some(({ context }) =>
    context.photoRequired && context.goals.length > 0);
}

/** A confirmation is per-challenge; never treat a successful sibling as confirmation. */
export function challengeConfirmationLabel(
  photoRequired: boolean,
  photoDone: boolean,
  status: ChallengeConfirmation["status"],
): "pending" | "checking" | "unavailable" | "confirmed" {
  if (photoRequired && !photoDone) return "pending";
  return status;
}
