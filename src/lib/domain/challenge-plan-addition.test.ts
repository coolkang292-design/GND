import { describe, expect, it } from "vitest";
import { applyChallengePlanAddition } from "./challenge-plan-addition";
import { newSet, type LocalExercise } from "@/lib/workout";
import type { FinishedDraftExercise } from "@/lib/challenge";
const base:LocalExercise={key:"x",name:"사이클",bodyPart:"유산소",exerciseType:"cardio",measure:"time",isCustom:false,sets:[newSet({durationMin:20,durationSec:1200})]};
const addition:FinishedDraftExercise={name:"사이클",bodyPart:"유산소",exerciseType:"cardio",sets:[{weightKg:0,reps:0,distanceKm:0,durationMin:5,done:true}]};
describe("챌린지 제안 계획 적용",()=>{
  it("추가 세트는 미완료 상태이며 초 단위와 분 단위를 일치시킨다",()=>{
    const result=applyChallengePlanAddition([base],addition,[]);
    expect(result?.[0].sets[1]).toMatchObject({done:false,durationMin:5,durationSec:300});
    expect(base.sets).toHaveLength(1);
  });
  it("같은 종목이 여러 줄이어도 첫 줄에만 한번 추가한다",()=>{
    const result=applyChallengePlanAddition([base,{...base,key:"other"}],addition,[]);
    expect(result?.map((ex)=>ex.sets.length)).toEqual([2,1]);
  });
  it("카탈로그에 없는 새 종목을 임의로 등록하지 않는다",()=>{
    expect(applyChallengePlanAddition([],addition,[])).toBeNull();
  });
});
