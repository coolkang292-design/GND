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

describe("진행 중에는 활동 점수를 보여주지 않는다 (최종 발표 때만 더한다)", () => {
  it("운동을 마쳐도 활동 점수·총점 줄이 없다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/이번 운동으로 기본 점수/)).toBeTruthy();
    expect(screen.queryByTestId("activity-gain")).toBeNull();
    expect(document.body.textContent).not.toMatch(/활동 점수 \+|총점/);
  });
  it("계획 카드도 기본 점수만 말한다 — 큰 숫자는 기본 점수 증가분이다", async () => {
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[exercise]} onAdd={vi.fn()} now={new Date("2026-11-13T04:00:00Z")} />);
    expect(await screen.findByText("이 계획을 완료하면")).toBeTruthy();
    expect(screen.queryByTestId("activity-forecast")).toBeNull();
    expect(document.body.textContent).not.toMatch(/활동 점수 \+|총점/);
  });
  it("큰 숫자(예상 +N점)가 기본 점수 증가분과 같다 — 활동 점수가 섞이지 않는다", async () => {
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[exercise]} onAdd={vi.fn()} now={new Date("2026-11-13T04:00:00Z")} />);
    await screen.findByText("이 계획을 완료하면");
    const text = document.body.textContent ?? "";
    const headline = Number(text.match(/예상 \+([\d.]+)점/)?.[1]);
    const base = Number(text.match(/기본 점수 \+([\d.]+)/)?.[1]);
    expect(base).toBeGreaterThan(0);
    expect(headline).toBeCloseTo(base, 2);
  });
});

describe("목표를 모두 채운 뒤 안내", () => {
  // 목표(5회)를 이미 채웠고 계획일(주 1회 × 7일 = 1일)도 채웠다 → 기본 점수는 더 오르지 않는다
  const doneGoal = { ...goal, target_value: 5, planned_days: 1 };
  const done = { ...snapshot, challenge: { ...snapshot.challenge, start_date: "2026-11-13", end_date: "2026-11-19" }, goals: [doneGoal] } as ChallengeScoreSnapshot;
  it("운동을 마친 뒤 결과 카드에 동점 규칙과 내 위치를 알려준다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(done);
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={{ ...context, goals: [doneGoal] }} gains={gains} photoDone/>);
    const box = await screen.findByTestId("win-guidance");
    expect(box.textContent).toContain("최종 발표 때 활동 점수가 더해져요");
    expect(box.textContent).toContain("운동한 날 수 → 운동 횟수 → 운동 시간");
  });
  it("계획 카드에도 같은 안내가 뜬다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(done);
    render(<ChallengePlanFeedback userId="me" contexts={[{ ...context, goals: [doneGoal] }]} exercises={[exercise]} onAdd={vi.fn()} now={new Date("2026-11-13T04:00:00Z")} />);
    const box = await screen.findByTestId("win-guidance");
    expect(box.textContent).toContain("이 계획을 마치면");
  });
  it("목표가 남아 있으면 안내가 없다 — 추가 점수 안내만 보인다", async () => {
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[exercise]} onAdd={vi.fn()} now={new Date("2026-11-13T04:00:00Z")} />);
    expect(await screen.findByText("이 계획을 완료하면")).toBeTruthy();
    expect(screen.queryByTestId("win-guidance")).toBeNull();
  });
});
