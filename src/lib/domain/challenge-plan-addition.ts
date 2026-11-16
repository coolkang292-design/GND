import { durationSecondsOf } from "@/lib/domain/set-timer";
import { localId, newSet, type LocalExercise } from "@/lib/workout";
import type { CatalogExercise } from "@/lib/types";
import type { FinishedDraftExercise } from "@/lib/challenge";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * 추가분을 계획에 담는다 — 점수 시뮬레이션(`challenge-workout-impact.ts`의 `mergeAddition`)과 **같은 규칙**이어야 한다.
 *
 * - 유산소: 이미 계획에 있으면 **새 세트를 만들지 않고 마지막 세트의 시간·거리에 더한다**
 *   (싸이클 50분 + 5분 = 55분). 유산소의 뜻은 세트 수가 아니라 총량이다. 점수는 세트를 합산하므로 합쳐도 같다.
 * - 웨이트·맨몸: 지금처럼 새 세트로 붙인다 (세트 하나하나가 의미다).
 */
export function applyChallengePlanAddition(exercises:readonly LocalExercise[], addition:FinishedDraftExercise, catalog:readonly CatalogExercise[]):LocalExercise[]|null {
  if(addition.sets.length===0) return null;
  const sets=addition.sets.map((s)=>newSet({weightKg:s.weightKg,reps:s.reps,distanceKm:s.distanceKm,durationMin:s.durationMin,durationSec:Math.round(s.durationMin*60),done:false}));
  const index=exercises.findIndex((ex)=>ex.name===addition.name && ex.exerciseType===addition.exerciseType);
  if(index>=0) {
    const target=exercises[index];
    if(addition.exerciseType==="cardio" && target.sets.length>0) {
      const extraSec=sets.reduce((sum,s)=>sum+(s.durationSec??0),0);
      const extraKm=sets.reduce((sum,s)=>sum+s.distanceKm,0);
      const last=target.sets[target.sets.length-1];
      const durationSec=durationSecondsOf(last)+extraSec;
      // key를 새로 준다: 운동 카드의 시간·거리 입력칸은 `defaultValue`(비제어)라 key가 같으면 합친 값이 화면에 안 나온다
      const merged={...last,key:localId(),distanceKm:round2(last.distanceKm+extraKm),durationSec,durationMin:durationSec/60};
      return exercises.map((ex,i)=>i===index?{...ex,sets:[...ex.sets.slice(0,-1),merged]}:ex);
    }
    return exercises.map((ex,i)=>i===index?{...ex,sets:[...ex.sets,...sets]}:ex);
  }
  if(exercises.length>=50) return null;
  const item=catalog.find((ex)=>ex.name===addition.name && ex.exercise_type===addition.exerciseType);
  if(!item) return null;
  return [...exercises,{key:localId(),name:item.name,bodyPart:item.body_part,exerciseType:item.exercise_type,measure:item.measure,isCustom:item.is_custom,sets}];
}
