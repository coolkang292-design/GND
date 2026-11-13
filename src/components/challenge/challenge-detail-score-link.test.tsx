// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeDetail } from "./challenge-detail";
const noop=vi.fn();
const props={challenge:{id:"c",name:"test",status:"active",myStatus:"joined",live_ranking:true,scoring_version:2,start_date:"2026-11-01",end_date:"2026-11-30",created_by:"other"},userId:"me",todayKey:"2026-11-13",detailsAreCurrent:true,members:[],goals:[],approvals:new Set(),stats:new Map(),sessionRows:[],plans:[],timeZone:"Asia/Seoul",completedAts:[],busy:false,share:null,onBack:noop,onOpenGoals:noop,onAcceptInvite:noop,onDeclineInvite:noop,onStart:noop,onApprove:noop,onLeave:noop,onCancelChallenge:noop,onFinalize:noop,onShare:noop,onOpenManage:noop,onProfile:noop,onDiscover:noop,onGoalRaised:noop} as unknown as Parameters<typeof ChallengeDetail>[0];
afterEach(cleanup);
describe("완료 결과의 종합 순위 링크",()=>{
  it("공개 챌린지는 운동 횟수 대신 종합점수 순위를 바로 연다",()=>{
    render(<ChallengeDetail {...props} openOverallRanking/>);
    expect(screen.getByRole("heading",{name:"종합 점수 랭킹"})).toBeTruthy();
  });
  it("주소로 요청해도 비공개 챌린지는 종합점수를 열지 않는다",()=>{
    render(<ChallengeDetail {...props} challenge={{...props.challenge,live_ranking:false}} openOverallRanking/>);
    expect(screen.queryByRole("heading",{name:"종합 점수 랭킹"})).toBeNull();
  });
});
