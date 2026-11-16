import { describe, expect, it } from "vitest";
import { applyChallengePlanAddition } from "./challenge-plan-addition";
import { newSet, type LocalExercise } from "@/lib/workout";
import type { FinishedDraftExercise } from "@/lib/challenge";
const base:LocalExercise={key:"x",name:"싸이클",bodyPart:"유산소",exerciseType:"cardio",measure:"time",isCustom:false,sets:[newSet({durationMin:50,durationSec:3000})]};
const addition:FinishedDraftExercise={name:"싸이클",bodyPart:"유산소",exerciseType:"cardio",sets:[{weightKg:0,reps:0,distanceKm:0,durationMin:5,done:true}]};
const weightBase:LocalExercise={key:"w",name:"벤치프레스",bodyPart:"가슴",exerciseType:"weight",measure:"reps",isCustom:false,sets:[newSet({weightKg:60,reps:10})]};
const weightAddition:FinishedDraftExercise={name:"벤치프레스",bodyPart:"가슴",exerciseType:"weight",sets:[{weightKg:60,reps:5,distanceKm:0,durationMin:0,done:true}]};
describe("챌린지 제안 계획 적용",()=>{
  it("유산소 시간은 새 세트가 아니라 기존 시간에 더한다 (50분 + 5분 = 55분)",()=>{
    const result=applyChallengePlanAddition([base],addition,[]);
    expect(result?.[0].sets).toHaveLength(1);
    expect(result?.[0].sets[0]).toMatchObject({durationMin:55,durationSec:3300});
    expect(base.sets[0].durationSec).toBe(3000);
  });
  it("합친 세트는 새 key를 받는다 — 입력칸이 defaultValue라 key가 같으면 화면이 옛 값(50)으로 남는다", () => {
    const result=applyChallengePlanAddition([base],addition,[]);
    expect(result?.[0].sets[0].key).not.toBe(base.sets[0].key);
  });
  it("초 단위만 있는 옛 세트(durationSec 없음)에도 분 값으로 읽어 더한다",()=>{
    const legacySet={...newSet({durationMin:20}),durationSec:undefined};
    const result=applyChallengePlanAddition([{...base,sets:[legacySet]}],addition,[]);
    expect(result?.[0].sets).toHaveLength(1);
    expect(result?.[0].sets[0]).toMatchObject({durationMin:25,durationSec:1500});
  });
  it("유산소 거리도 기존 거리에 더한다",()=>{
    const run:LocalExercise={...base,name:"러닝",sets:[newSet({distanceKm:5,durationMin:30,durationSec:1800})]};
    const result=applyChallengePlanAddition([run],{...addition,name:"러닝",sets:[{weightKg:0,reps:0,distanceKm:0.5,durationMin:0,done:true}]},[]);
    expect(result?.[0].sets).toHaveLength(1);
    expect(result?.[0].sets[0]).toMatchObject({distanceKm:5.5,durationSec:1800});
  });
  it("세트가 여러 개면 마지막 세트에 더하고 완료 상태는 그대로 둔다",()=>{
    const two:LocalExercise={...base,sets:[newSet({durationMin:10,durationSec:600}),newSet({durationMin:20,durationSec:1200})]};
    const result=applyChallengePlanAddition([two],addition,[]);
    expect(result?.[0].sets.map((s)=>s.durationSec)).toEqual([600,1500]);
    expect(result?.[0].sets[1].done).toBe(false);
  });
  it("웨이트는 지금처럼 새 세트로 추가하고 미완료 상태다",()=>{
    const result=applyChallengePlanAddition([weightBase],weightAddition,[]);
    expect(result?.[0].sets).toHaveLength(2);
    expect(result?.[0].sets[1]).toMatchObject({weightKg:60,reps:5,done:false});
    expect(weightBase.sets).toHaveLength(1);
  });
  it("같은 종목이 여러 줄이어도 첫 줄에만 한번 더한다",()=>{
    const result=applyChallengePlanAddition([base,{...base,key:"other"}],addition,[]);
    expect(result?.map((ex)=>ex.sets[0].durationSec)).toEqual([3300,3000]);
  });
  it("계획에 없는 유산소 종목은 카탈로그에서 새 세트로 담는다",()=>{
    const catalog=[{name:"싸이클",body_part:"유산소",exercise_type:"cardio",measure:"time",is_custom:false}] as never;
    const result=applyChallengePlanAddition([],addition,catalog);
    expect(result?.[0].sets).toHaveLength(1);
    expect(result?.[0].sets[0]).toMatchObject({durationMin:5,durationSec:300,done:false});
  });
  it("카탈로그에 없는 새 종목을 임의로 등록하지 않는다",()=>{
    expect(applyChallengePlanAddition([],addition,[])).toBeNull();
  });
});
