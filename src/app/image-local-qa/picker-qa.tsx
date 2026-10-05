"use client";
import { useState } from "react";
import { ExerciseCard } from "@/components/record/exercise-card";
import { ExercisePicker } from "@/components/record/exercise-picker";
import type { CatalogExercise } from "@/lib/types";
import type { LocalExercise } from "@/lib/workout";
import { LocalTrialFailureContext } from "@/lib/domain/exercise-image-local-trial";

/**
 * 로컬 이미지 검수 (개발 모드 + 명시 플래그 전용, DB 저장 없음).
 * 고른 운동을 **기록 화면과 같은 운동 카드**로도 그린다 — 담은 뒤 화면의 그림 확인용
 * (2026-10-05 클로드 추가. 카드는 계획 모드로 그려 완료 체크가 없다).
 */
function toLocal(item: CatalogExercise): LocalExercise {
  return {
    key: item.id,
    name: item.name,
    bodyPart: item.body_part,
    exerciseType: item.exercise_type,
    measure: item.measure,
    isCustom: item.is_custom,
    sets: [{ key: `${item.id}-1`, weightKg: 0, reps: 0, distanceKm: 0, durationMin: 0, done: false, effortFeedback: null }],
  };
}

export function LocalImagePickerQA({ catalog, broken }: { catalog: CatalogExercise[]; broken: boolean }) {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<CatalogExercise[]>([]);
  const noop = () => {};
  return <main className="p-4">
    <h1 className="font-bold">로컬 이미지 검수</h1>
    <p>DB 저장 없음 · 실제 운동 선택 컴포넌트</p>
    <p>선택 결과: {picked.map(item => item.name).join(", ") || "없음"}</p>
    <button onClick={() => setOpen(true)}>운동 선택 열기</button>
    <LocalTrialFailureContext.Provider value={broken}>
      <div className="mt-3 flex flex-col gap-3">
        {picked.map((item, i) => (
          <ExerciseCard key={item.id} exercise={toLocal(item)} index={i} active={false} loadingLast={false}
            loadLastDisabled onLoadLast={noop} onUpdateSet={noop} onAddSet={noop} onRemoveSet={noop}
            onRemoveExercise={noop} planning />
        ))}
      </div>
      <ExercisePicker open={open} catalog={catalog} pastSessions={[]} pastLoading={false} initialMode="search"
        onClose={() => setOpen(false)} onPickMany={items => { setPicked(items); setOpen(false); }} onPickPast={async () => false} onCreateCustom={async () => null} />
    </LocalTrialFailureContext.Provider>
  </main>;
}
