// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengeWorkoutResultCard, ChallengePlanFeedback } from "./challenge-workout-feedback";
import { loadChallengeScoreSnapshot } from "@/lib/challenge-workout-feedback";
import type { ChallengeScoreSnapshot } from "@/lib/domain/challenge-workout-impact";
import type { ActiveChallengeContext } from "@/lib/domain/challenge-confirmation";
import { newSet, type LocalExercise } from "@/lib/workout";

vi.mock("@/lib/challenge-workout-feedback", () => ({ loadChallengeScoreSnapshot: vi.fn() }));
const goal = { id: "g", user_id: "me", challenge_id: "c", goal_type: "bodyweight_reps", target_value: 100, planned_days: 2, qualifier: null, unit: "회" } as ChallengeScoreSnapshot["goals"][number];
const exercise: LocalExercise = { key:"x", name:"푸시업", bodyPart:"가슴", exerciseType:"bodyweight", measure:"reps", isCustom:false, sets:[newSet({ reps:10 })] };
const snapshot = { challenge:{id:"c",name:"함께 운동",status:"active",myStatus:"joined",live_ranking:true,photo_required:true,scoring_version:2,start_date:"2026-11-01",end_date:"2026-11-30"},goals:[goal],participantIds:["me","other"],rows:[{sessionId:"s",userId:"me",completedAt:"2026-11-13T03:00:00Z",durationMinutes:10,exercises:[{exerciseName:"푸시업",exerciseType:"bodyweight",bodyPart:"가슴",sets:[{weightKg:0,reps:10,distanceMeters:0,durationSeconds:0,isCompleted:true}]}]}],timeZone:"Asia/Seoul" } as ChallengeScoreSnapshot;
const context: ActiveChallengeContext = { id:"c",name:"함께 운동",startDate:"2026-11-01",endDate:"2026-11-30",photoRequired:true,goals:[goal],liveRanking:true };
const gains=[{type:goal.goal_type,label:"맨몸 횟수",delta:10,unit:"회",target:100}];
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(snapshot); });
afterEach(cleanup);
describe("운동 전후 챌린지 안내", () => {
  it("사진 인증 전에는 점수와 순위를 확정하지 않는다", () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone={false}/>);
    expect(screen.getByText("인증 대기")).toBeTruthy();
    expect(screen.queryByText(/이번 운동으로 기본 점수/)).toBeNull();
    expect(loadChallengeScoreSnapshot).not.toHaveBeenCalled();
  });
  it("인증 뒤 실제 조회에 포함된 운동만 전후 비교를 보여준다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/이번 운동으로 기본 점수/)).toBeTruthy();
    expect(screen.getByText(/현재 참가자 기록 기준/)).toBeTruthy();
    expect(screen.getByRole("link",{name:"챌린지 랭킹 보기"}).getAttribute("href")).toBe("/challenge?open=c&ranking=overall");
  });
  it("운동 ID가 집계에 없으면 증가량 0으로 단정하지 않는다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="missing" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/이번 운동의 반영을 확인하지 못했어요/)).toBeTruthy();
    expect(screen.queryByText(/이번 운동으로 기본 점수/)).toBeNull();
  });
  it("조회 실패는 운동 저장과 분리하고 다시 시도할 수 있다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockRejectedValueOnce(new Error("offline"));
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/운동은 저장됐어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"다시 확인"}));
    expect(await screen.findByText(/이번 운동으로 기본 점수/)).toBeTruthy();
  });
  it("비공개 설정이면 실제 점수·순위를 노출하지 않는다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue({...snapshot,challenge:{...snapshot.challenge,live_ranking:false}});
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={{...context,liveRanking:false}} gains={gains} photoDone/>);
    expect(await screen.findByText(/누적 실적/)).toBeTruthy();
    expect(screen.queryByText(/이번 운동으로 기본 점수/)).toBeNull();
  });
  it("비공개 챌린지는 로딩과 실패도 기존 누적 실적 카드로 보여준다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockRejectedValue(new Error("offline"));
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={{...context,liveRanking:false}} gains={gains} photoDone/>);
    expect(screen.getByText("실적 확인 중")).toBeTruthy();
    expect(await screen.findByText(/집계 결과를 확인하지 못했어요/)).toBeTruthy();
    expect(screen.queryByText(/점수와 순위/)).toBeNull();
  });
  it("챌린지가 없으면 계획 화면에 아무것도 추가하지 않는다", () => {
    const {container}=render(<ChallengePlanFeedback userId="me" contexts={[]} exercises={[exercise]} onAdd={vi.fn()}/>);
    expect(container.textContent).toBe("");
    expect(loadChallengeScoreSnapshot).not.toHaveBeenCalled();
  });
  it("비공개 챌린지 계획에는 점수 제안도 표시하지 않는다", () => {
    const {container}=render(<ChallengePlanFeedback userId="me" contexts={[{...context,liveRanking:false}]} exercises={[exercise]} onAdd={vi.fn()}/>);
    expect(container.textContent).toBe("");
    expect(loadChallengeScoreSnapshot).not.toHaveBeenCalled();
  });
  it("계획 예상과 제안의 추가점수를 나누고 누를 때만 계획에 추가한다", async () => {
    const onAdd=vi.fn();
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[exercise]} onAdd={onAdd} now={new Date("2026-11-13T04:00:00Z")}/>);
    expect(await screen.findByText("이 계획을 완료하면")).toBeTruthy();
    expect(screen.getByText(/현재 계획보다/)).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button",{name:"계획에 추가"})[0]);
    await waitFor(()=>expect(onAdd).toHaveBeenCalledTimes(1));
  });
});
