import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadChallengeScoreSnapshot } from "./challenge-workout-feedback";
import { getMyChallenges, getChallengeGoals, getChallengeParticipants, getChallengePeriodSessions } from "./challenge";
import type { MyChallenge } from "./challenge";

vi.mock("./challenge", () => ({
  getMyChallenges: vi.fn(), getChallengeGoals: vi.fn(), getChallengeParticipants: vi.fn(), getChallengePeriodSessions: vi.fn(),
}));
const challenge = { id: "c", status: "active", myStatus: "joined", live_ranking: true } as MyChallenge;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyChallenges).mockResolvedValue([challenge]);
  vi.mocked(getChallengeGoals).mockResolvedValue([{ user_id: "me" }] as never);
  vi.mocked(getChallengeParticipants).mockResolvedValue([{ user_id: "me", role: "member", status: "joined" }, { user_id: "invited", role: "member", status: "invited" }]);
  vi.mocked(getChallengePeriodSessions).mockResolvedValue([]);
});
describe("loadChallengeScoreSnapshot", () => {
  it.each(["invited", "dropped"])("%s면 점수 자료를 조회하지 않는다", async (myStatus) => {
    vi.mocked(getMyChallenges).mockResolvedValue([{ ...challenge, myStatus } as MyChallenge]);
    expect(await loadChallengeScoreSnapshot("me", "c")).toBeNull();
    expect(getChallengePeriodSessions).not.toHaveBeenCalled();
  });
  it("챌린지가 없으면 기존 흐름을 위해 null이다", async () => {
    vi.mocked(getMyChallenges).mockResolvedValue([]);
    expect(await loadChallengeScoreSnapshot("me", "c")).toBeNull();
    expect(getChallengeGoals).not.toHaveBeenCalled();
  });
  it("참가자 명단과 원본 운동을 같은 snapshot으로 전달한다", async () => {
    expect(await loadChallengeScoreSnapshot("me", "c")).toMatchObject({ challenge, participantIds: ["me"], rows: [], timeZone: "Asia/Seoul" });
  });
  it("다른 챌린지 조회 성공으로 실패한 챌린지를 확정하지 않는다", async () => {
    vi.mocked(getChallengePeriodSessions).mockRejectedValue(new Error("offline"));
    await expect(loadChallengeScoreSnapshot("me", "c")).rejects.toThrow("offline");
  });
});
