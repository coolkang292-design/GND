"use client";
import { useState } from "react";
import { ExercisePicker } from "@/components/record/exercise-picker";
import type { CatalogExercise } from "@/lib/types";
import { LocalTrialFailureContext } from "@/lib/domain/exercise-image-local-trial";

export function LocalImagePickerQA({ catalog, broken }: { catalog: CatalogExercise[]; broken: boolean }) {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  return <main className="p-4">
    <h1 className="font-bold">로컬 이미지 검수</h1>
    <p>DB 저장 없음 · 실제 운동 선택 컴포넌트</p>
    <p>선택 결과: {picked.join(", ") || "없음"}</p>
    <button onClick={() => setOpen(true)}>운동 선택 열기</button>
    <LocalTrialFailureContext.Provider value={broken}><ExercisePicker open={open} catalog={catalog} pastSessions={[]} pastLoading={false} initialMode="search"
      onClose={() => setOpen(false)} onPickMany={items => { setPicked(items.map(item => item.name)); setOpen(false); }} onPickPast={async () => false} onCreateCustom={async () => null} /></LocalTrialFailureContext.Provider>
  </main>;
}
