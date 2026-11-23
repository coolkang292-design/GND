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
    expect(screen.queryByText(/이번 운동 총 획득 점수/)).toBeNull();
    expect(loadChallengeScoreSnapshot).not.toHaveBeenCalled();
  });
  it("인증 뒤 실제 조회에 포함된 운동만 전후 비교를 보여준다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/이번 운동 총 획득 점수/)).toBeTruthy();
    expect(screen.getByText(/현재 참가자 기록 기준/)).toBeTruthy();
    expect(screen.getByRole("link",{name:"챌린지 랭킹 보기"}).getAttribute("href")).toBe("/challenge?open=c&ranking=overall");
  });
  it("운동 ID가 집계에 없으면 증가량 0으로 단정하지 않는다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="missing" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/이번 운동의 반영을 확인하지 못했어요/)).toBeTruthy();
    expect(screen.queryByText(/이번 운동 총 획득 점수/)).toBeNull();
  });
  it("조회 실패는 운동 저장과 분리하고 다시 시도할 수 있다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockRejectedValueOnce(new Error("offline"));
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    expect(await screen.findByText(/운동은 저장됐어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"다시 확인"}));
    expect(await screen.findByText(/이번 운동 총 획득 점수/)).toBeTruthy();
  });
  it("비공개 설정이면 실제 점수·순위를 노출하지 않는다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue({...snapshot,challenge:{...snapshot.challenge,live_ranking:false}});
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={{...context,liveRanking:false}} gains={gains} photoDone/>);
    expect(await screen.findByText(/누적 실적/)).toBeTruthy();
    expect(screen.queryByText(/이번 운동 총 획득 점수/)).toBeNull();
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

describe("1시간 규칙으로 횟수에서 빠진 운동은 작은 알림을 한 번 띄운다", () => {
  const ex = [{ exerciseName: "푸시업", exerciseType: "bodyweight", bodyPart: "가슴", sets: [{ weightKg: 0, reps: 10, distanceMeters: 0, durationSeconds: 0, isCompleted: true }] }];
  // 규칙 시작(2026-11-22 06:00 KST = 11-21 21:00Z) 이후의 두 운동. 앞 운동이 01:30Z에 끝나고 20분 뒤(01:50Z)에 이어 시작한다.
  const gapSnapshot = (secondStart: string, secondEnd = "2026-11-22T02:10:00Z") => ({
    ...snapshot,
    rows: [
      { sessionId: "p", userId: "me", startedAt: "2026-11-22T01:00:00Z", completedAt: "2026-11-22T01:30:00Z", durationMinutes: 30, exercises: ex },
      { sessionId: "s", userId: "me", startedAt: secondStart, completedAt: secondEnd, durationMinutes: 20, exercises: ex },
    ],
  }) as ChallengeScoreSnapshot;
  beforeEach(() => { try { sessionStorage.clear(); } catch { /* 무시 */ } });

  it("20분 뒤 이어 한 운동이면 알림이 뜬다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(gapSnapshot("2026-11-22T01:50:00Z"));
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    expect(await screen.findByTestId("session-gap-notice")).toBeTruthy();
    expect((await screen.findByTestId("session-gap-toast")).textContent).toMatch(/1시간 안에 이어 한 운동/);
  });
  it("같은 운동에는 카드를 다시 그려도 알림이 반복되지 않는다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(gapSnapshot("2026-11-22T01:50:00Z"));
    const first = render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    await screen.findByTestId("session-gap-toast");
    first.unmount();
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    await screen.findByTestId("session-gap-notice");
    expect(screen.queryByTestId("session-gap-toast")).toBeNull();
  });
  it("1시간 넘게 쉬고 한 운동이면 알림이 없다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(gapSnapshot("2026-11-22T02:40:00Z", "2026-11-22T03:00:00Z"));
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    await screen.findByText(/이번 운동 총 획득 점수/);
    expect(screen.queryByTestId("session-gap-toast")).toBeNull();
    expect(screen.queryByTestId("session-gap-notice")).toBeNull();
  });
});

describe("인터벌은 시작하기 전에 예상 점수를 보여준다", () => {
  // 인터벌 4종 — 종목마다 코스가 정한 횟수(4분=2회, 8분=4회)로 기록된다 (`tabataRepsForMinutes`)
  const interval = (reps: number): LocalExercise[] => ["버피", "마운틴 클라이머", "점핑잭", "스쿼트 점프"].map((name, i) => ({ key: `t${i}`, name, bodyPart: "코어", exerciseType: "bodyweight", measure: "reps", isCustom: false, sets: [newSet({ reps })] }));
  const now = new Date("2026-11-13T04:00:00Z");
  const empty = { ...snapshot, rows: [] } as ChallengeScoreSnapshot;
  const points = () => Number((document.body.textContent ?? "").match(/예상 \+([\d.]+)점/)?.[1]);
  it("인터벌 문구로 예상 점수를 보여주고 추가 제안 버튼은 없다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(empty);
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={interval(2)} tabataMinutes={4} now={now} />);
    expect(await screen.findByText("이 인터벌을 마치면")).toBeTruthy();
    expect(points()).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "계획에 추가" })).toBeNull();
  });
  it("코스(분)가 바뀌면 예상 점수도 바뀐다 — 8분이 4분보다 크다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(empty);
    const four = render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={interval(2)} tabataMinutes={4} now={now} />);
    await screen.findByText("이 인터벌을 마치면");
    const p4 = points();
    four.unmount();
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={interval(4)} tabataMinutes={8} now={now} />);
    await screen.findByText("이 인터벌을 마치면");
    expect(points()).toBeGreaterThan(p4);
  });
  it("종목을 아직 안 골랐어도 인터벌 횟수·시간 점수는 보여준다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue({ ...empty, goals: [{ ...goal, goal_type: "tabata_count", target_value: 4 }] } as ChallengeScoreSnapshot);
    render(<ChallengePlanFeedback userId="me" contexts={[{ ...context, goals: [{ ...goal, goal_type: "tabata_count", target_value: 4 }] }]} exercises={[]} tabataMinutes={4} now={now} />);
    expect(await screen.findByText("이 인터벌을 마치면")).toBeTruthy();
    expect(points()).toBeGreaterThan(0);
  });
  it("종목도 없고 인터벌도 아니면 아무것도 안 그린다 (기존 동작)", () => {
    const { container } = render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[]} onAdd={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
  it("비공개 챌린지는 인터벌에서도 점수를 보여주지 않는다", () => {
    const { container } = render(<ChallengePlanFeedback userId="me" contexts={[{ ...context, liveRanking: false }]} exercises={interval(2)} tabataMinutes={4} now={now} />);
    expect(container.textContent).toBe("");
    expect(loadChallengeScoreSnapshot).not.toHaveBeenCalled();
  });
});

describe("활동 점수 표시 (1일·1회·60분당 1점)", () => {
  it("운동을 마치면 오른 활동 점수와 총점 변화를 보여준다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    const box = await screen.findByTestId("score-breakdown");
    expect(box.textContent).toContain("+2.17"); // 1일 + 1회 + 10분(0.17)
    expect(box.textContent).toContain("활동 점수");
    expect(document.body.textContent).toContain("챌린지 총점");
  });
  it("큰 숫자는 기본 점수 + 활동 점수 = 총 획득 점수다 (0.01도 어긋나지 않는다)", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    const total = Number((await screen.findByTestId("total-gain")).textContent!.match(/\+?(-?[\d.]+)/)?.[1]);
    const box = (await screen.findByTestId("score-breakdown")).textContent!;
    const base = Number(box.match(/기본 점수\+?(-?[\d.]+)/)?.[1]);
    const act = Number(box.match(/활동 점수\+?(-?[\d.]+)/)?.[1]);
    expect(act).toBeGreaterThan(0);
    expect(Math.round((base + act) * 100)).toBe(Math.round(total * 100));
  });
  it("활동 점수 자세히: 운동한 날·횟수·시간 몫의 합이 활동 점수와 같다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    const detail = (await screen.findByTestId("activity-detail")).textContent!;
    const parts = [...detail.matchAll(/\+([\d.]+)/g)].map((m) => Math.round(Number(m[1]) * 100));
    expect(parts).toHaveLength(3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(217);
  });
  it("옛 제목('이번 운동으로 기본 점수')은 사라졌다", async () => {
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={context} gains={gains} photoDone/>);
    await screen.findByTestId("total-gain");
    expect(screen.queryByText(/이번 운동으로 기본 점수/)).toBeNull();
  });
  it("계획을 완료하면 얼마나 오르는지도 보여준다", async () => {
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[exercise]} onAdd={vi.fn()} now={new Date("2026-11-13T04:00:00Z")} />);
    const box = await screen.findByTestId("activity-forecast");
    expect(box.textContent).toContain("활동 점수");
    expect(box.textContent).toContain("총점");
  });
  it("큰 숫자는 기본 점수만이 아니라 활동 점수까지 더한 총점 증가분이다", async () => {
    render(<ChallengePlanFeedback userId="me" contexts={[context]} exercises={[exercise]} onAdd={vi.fn()} now={new Date("2026-11-13T04:00:00Z")} />);
    const activity = await screen.findByTestId("activity-forecast");
    const text = document.body.textContent ?? "";
    const num = (re: RegExp) => Number(text.match(re)?.[1]);
    const headline = num(/예상 \+([\d.]+)점/);
    const base = num(/기본 점수 \+([\d.]+)/);
    const act = Number(activity.textContent!.match(/활동 점수 \+([\d.]+)점/)?.[1]);
    expect(act).toBeGreaterThan(0);
    expect(headline).toBeCloseTo(base + act, 2);
  });
});

describe("목표를 모두 채운 뒤 우승 안내", () => {
  // 목표(5회)를 이미 채웠고 계획일(주 1회 × 7일 = 1일)도 채웠다 → 기본 점수는 더 오르지 않는다
  const doneGoal = { ...goal, target_value: 5, planned_days: 1 };
  const done = { ...snapshot, challenge: { ...snapshot.challenge, start_date: "2026-11-13", end_date: "2026-11-19" }, goals: [doneGoal] } as ChallengeScoreSnapshot;
  it("운동을 마친 뒤 결과 카드에 동점 규칙과 내 위치를 알려준다", async () => {
    vi.mocked(loadChallengeScoreSnapshot).mockResolvedValue(done);
    render(<ChallengeWorkoutResultCard userId="me" sessionId="s" context={{ ...context, goals: [doneGoal] }} gains={gains} photoDone/>);
    const box = await screen.findByTestId("win-guidance");
    expect(box.textContent).toContain("우승");
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
