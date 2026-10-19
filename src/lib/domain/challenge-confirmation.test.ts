import { describe, expect, it } from "vitest";
import { challengeConfirmationLabel, hasPendingChallengeProof } from "./challenge-confirmation";
const gain = [{ type: "workout_days" as const, delta: 1, label: "운동일", target: 10, unit: "일" }];
describe("independent per-challenge verification", () => {
  const goals = [{ id: "goal" } as never];
  it("one photo-required challenge holds the link, even with a no-photo sibling", () => {
    expect(hasPendingChallengeProof([
      { context: { photoRequired: false, goals }, gains: gain },
      { context: { photoRequired: true, goals }, gains: gain },
    ], false)).toBe(true);
    expect(hasPendingChallengeProof([
      { context: { photoRequired: false, goals }, gains: gain },
      { context: { photoRequired: true, goals }, gains: gain },
    ], true)).toBe(false);
  });
  it("zero provisional contribution still needs proof: combined daily sessions may qualify", () => {
    expect(hasPendingChallengeProof([{ context: { photoRequired: true, goals }, gains: [{ ...gain[0], delta: 0 }] }], false)).toBe(true);
    expect(hasPendingChallengeProof([{ context: { photoRequired: true, goals: [] }, gains: [] }], false)).toBe(false);
  });
  it("upload alone never confirms a result if server did not respond", () => {
    expect(challengeConfirmationLabel(true, true, "checking")).toBe("checking");
    expect(challengeConfirmationLabel(true, true, "unavailable")).toBe("unavailable");
    expect(challengeConfirmationLabel(true, true, "confirmed")).toBe("confirmed");
    expect(challengeConfirmationLabel(true, false, "confirmed")).toBe("pending");
  });
});
