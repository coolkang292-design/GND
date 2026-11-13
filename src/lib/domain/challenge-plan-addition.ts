import { localId, newSet, type LocalExercise } from "@/lib/workout";
import type { CatalogExercise } from "@/lib/types";
import type { FinishedDraftExercise } from "@/lib/challenge";

/** Apply exactly the extra sets that were simulated, preserving the existing plan metadata. */
export function applyChallengePlanAddition(exercises:readonly LocalExercise[], addition:FinishedDraftExercise, catalog:readonly CatalogExercise[]):LocalExercise[]|null {
  if(addition.sets.length===0) return null;
  const sets=addition.sets.map((s)=>newSet({weightKg:s.weightKg,reps:s.reps,distanceKm:s.distanceKm,durationMin:s.durationMin,durationSec:Math.round(s.durationMin*60),done:false}));
  const index=exercises.findIndex((ex)=>ex.name===addition.name && ex.exerciseType===addition.exerciseType);
  if(index>=0) return exercises.map((ex,i)=>i===index?{...ex,sets:[...ex.sets,...sets]}:ex);
  if(exercises.length>=50) return null;
  const item=catalog.find((ex)=>ex.name===addition.name && ex.exercise_type===addition.exerciseType);
  if(!item) return null;
  return [...exercises,{key:localId(),name:item.name,bodyPart:item.body_part,exerciseType:item.exercise_type,measure:item.measure,isCustom:item.is_custom,sets}];
}
