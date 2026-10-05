"use client";
import { useState } from "react";
import { ActiveSessionOverlay } from "@/components/record/active-session-overlay";
import { ExerciseCard } from "@/components/record/exercise-card";
import { IntervalSessionOverlay } from "@/components/record/interval-session-overlay";
import { IntervalProgramDetail, ProgramDetail } from "@/components/programs/program-catalog";
import { OFFICIAL_PROGRAMS, isIntervalProgram, isLadderProgram } from "@/lib/domain/official-programs";
import { amountFields } from "@/lib/domain/set-input";
import { imageIdForAddedExercise } from "@/lib/domain/exercise-images";
import { ExercisePicker } from "@/components/record/exercise-picker";
import type { CatalogExercise } from "@/lib/types";
import type { LocalExercise } from "@/lib/workout";
import { LocalTrialFailureContext } from "@/lib/domain/exercise-image-local-trial";

/**
 * 로컬 이미지 검수 (개발 모드 + 명시 플래그 전용, DB 저장 없음).
 * 고른 운동을 **기록 화면과 같은 운동 카드**로도 그린다 — 담은 뒤 화면의 그림 확인용
 * (2026-10-05 클로드 추가. 카드는 계획 모드로 그려 완료 체크가 없다).
 * 「운동 중 화면」 버튼은 고른 첫 운동을 지금 운동, 둘째를 다음 운동으로 하는 운동 중
 * 화면(①제목·③다음 운동 그림)을 띄운다. 값은 가짜이고 아무 데도 저장하지 않는다.
 * 「인터벌」 버튼은 고른 운동(최대 4개)으로 인터벌 화면을 운동 중(20초)·휴식(38초) 시점에 띄운다.
 * `?program=<key>`면 공식 프로그램 상세(종목 그림)를 그린다 — 실제 경로는 Supabase가 있어야 열린다.
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

function ProgramPreview({ programKey }: { programKey: string }) {
  const noop = () => {};
  const program = OFFICIAL_PROGRAMS.find(p => p.key === programKey);
  if (!program) return <p>프로그램 키: {OFFICIAL_PROGRAMS.map(p => p.key).join(", ")}</p>;
  if (isIntervalProgram(program)) return <IntervalProgramDetail program={program} onBack={noop} onSchedule={noop} scheduleAvailable={false} />;
  if (isLadderProgram(program)) return <p>사다리 프로그램은 종목 표가 없다</p>;
  return <ProgramDetail program={program} onBack={noop} onSchedule={noop} scheduleAvailable={false} />;
}

export function LocalImagePickerQA({ catalog, broken, program }: { catalog: CatalogExercise[]; broken: boolean; program?: string }) {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<CatalogExercise[]>([]);
  const [overlay, setOverlay] = useState<"input" | "rest" | null>(null);
  const [intervalAt, setIntervalAt] = useState<number | null>(null);
  const noop = () => {};
  const imageOf = (item: CatalogExercise | undefined) => {
    const id = item ? imageIdForAddedExercise({ name: item.name, isCustom: item.is_custom }) : undefined;
    return item && id ? { id, bodyPart: item.body_part } : null;
  };
  const [now, next] = picked;
  if (program) return <main className="p-4"><ProgramPreview programKey={program} /></main>;
  return <main className="p-4">
    <h1 className="font-bold">로컬 이미지 검수</h1>
    <p>DB 저장 없음 · 실제 운동 선택 컴포넌트</p>
    <p>선택 결과: {picked.map(item => item.name).join(", ") || "없음"}</p>
    <button onClick={() => setOpen(true)}>운동 선택 열기</button>
    {now && <p className="mt-2 flex gap-2">
      <button className="rounded border px-2" onClick={() => setOverlay("input")}>운동 중 화면(입력)</button>
      <button className="rounded border px-2" onClick={() => setOverlay("rest")}>운동 중 화면(휴식)</button>
    </p>}
    {now && <p className="mt-2 flex gap-2">
      <button className="rounded border px-2" onClick={() => setIntervalAt(20)}>인터벌(운동 중)</button>
      <button className="rounded border px-2" onClick={() => setIntervalAt(38)}>인터벌(휴식)</button>
    </p>}
    <LocalTrialFailureContext.Provider value={broken}>
      <div className="mt-3 flex flex-col gap-3">
        {picked.map((item, i) => (
          <ExerciseCard key={item.id} exercise={toLocal(item)} index={i} active={false} loadingLast={false}
            loadLastDisabled onLoadLast={noop} onUpdateSet={noop} onAddSet={noop} onRemoveSet={noop}
            onRemoveExercise={noop} planning />
        ))}
      </div>
      {now && intervalAt !== null && (
        <IntervalSessionOverlay open exerciseNames={picked.slice(0, 4).map(item => item.name)}
          exerciseIds={picked.slice(0, 4).map(item => item.id)} minutes={4} elapsedSeconds={intervalAt}
          paused={false} onTogglePause={noop} onStop={() => setIntervalAt(null)} />
      )}
      {now && overlay && (
        <ActiveSessionOverlay open mode={overlay} elapsedLabel="12:34" exerciseName={now.name} exerciseImage={imageOf(now)}
          progress={{ completed: 1, total: 4, percent: 25 }} setProgress={{ done: 1, total: 3, remaining: 2 }}
          setPosition={{ index: 1, total: 3 }} fields={amountFields(now.exercise_type, now.measure)}
          values={{ weightKg: 20, reps: 10, distanceKm: 0, durationMin: 0, durationSec: 0 }}
          restSeconds={45} restPresetSeconds={60}
          nextUp={next ? { exerciseName: next.name, amount: "20kg 10회", image: imageOf(next) } : null}
          isLastPendingSet={false} lastSetMessage="" completionMessage={{ headline: "다 했어요", cheer: "" }}
          paused={false} busy={false} canReplaceExercise={false} previousHint={null} onChallengeReps={noop}
          nextUpHint={null} onNextUpChallengeReps={noop} spreadOffer={null} onApplySpread={noop} onDismissSpread={noop}
          onChangeAmount={noop} onCompleteSet={noop} timerRunning={false} timerSeconds={0} timerTargetSeconds={0}
          onStartTimer={noop} onStopTimer={noop} paceLabel={null} onReplaceExercise={noop} onSkipExercise={noop}
          onAdjustRest={noop} onPickRestPreset={noop} onStartNext={noop} onMinimize={() => setOverlay(null)}
          onCancel={() => setOverlay(null)} onFinish={() => setOverlay(null)} />
      )}
      <ExercisePicker open={open} catalog={catalog} pastSessions={[]} pastLoading={false} initialMode="search"
        onClose={() => setOpen(false)} onPickMany={items => { setPicked(items); setOpen(false); }} onPickPast={async () => false} onCreateCustom={async () => null} />
    </LocalTrialFailureContext.Provider>
  </main>;
}
