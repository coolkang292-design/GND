// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VerifiedChallengeProofCard } from "./verified-challenge-proof-card";

afterEach(cleanup);
const gains=[{type:"workout_days" as const,label:"운동한 날",delta:1,unit:"일",target:24}];
const base={ name:"크루 아침 운동",photoRequired:true,photoDone:false,gains };
describe("VerifiedChallengeProofCard",()=>{
  it("never shows success while proof is missing, even if a stale confirmation exists",()=>{
    render(<VerifiedChallengeProofCard {...base} confirmation={{status:"confirmed",totals:[{type:"workout_days",label:"운동한 날",value:6,unit:"일",target:24}]}}/>);
    expect(screen.getByText("인증 대기")).toBeTruthy();
    expect(screen.queryByText(/서버 확인 완료/)).toBeNull();
  });
  it("distinguishes verification failure from success",()=>{
    render(<VerifiedChallengeProofCard {...base} photoDone confirmation={{status:"unavailable"}}/>);
    expect(screen.getByText(/집계 결과를 확인하지 못했어요/)).toBeTruthy();
  });
  it("shows only confirmed cumulative totals, never provisional +1 day",()=>{
    render(<VerifiedChallengeProofCard {...base} photoDone confirmation={{status:"confirmed",totals:[{type:"workout_days",label:"운동한 날",value:6,unit:"일",target:24}]}}/>);
    expect(screen.getByText(/누적 실적/)).toBeTruthy();
    expect(screen.getByText("6일")).toBeTruthy();
    expect(screen.queryByText("+1일")).toBeNull();
  });
});
