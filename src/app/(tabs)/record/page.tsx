"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CalendarView } from "@/components/record/calendar-view";
import { ExerciseCard } from "@/components/record/exercise-card";
import { ExercisePicker } from "@/components/record/exercise-picker";
import { RestBar } from "@/components/record/rest-bar";
import { VerificationPhoto } from "@/components/record/verification-photo";
import { summarizeVolume, type VolumeSummary } from "@/lib/domain/volume";
import { getMyGroups } from "@/lib/crew";
import type { BodyPart, CatalogExercise, ExerciseType } from "@/lib/types";
import {
  cancelWorkout,
  clearDraft,
  completeWorkout,
  createCustomExercise,
  createDraftSession,
  defaultSets,
  emptyDraft,
  getExerciseCatalog,
  getLastCompletedWeightVolume,
  getLastRecordedSets,
  getMyActiveSession,
  getSessionById,
  getSessionExerciseStructure,
  loadDraft,
  localId,
  newSet,
  saveDraft,
  saveSessionExercises,
  startWorkout,
  toVolumeSets,
  type LocalExercise,
  type LocalSet,
} from "@/lib/workout";

export default function RecordPage() {
  const { userId, loading, configured, error } = useAuth();

  if (!configured) {
    return (
      <p className="pt-10 text-center text-sm text-muted">
        Supabase 설정(.env.local)이 필요해요.
      </p>
    );
  }
  if (loading) {
    return <p className="pt-10 text-center text-sm text-muted">불러오는 중…</p>;
  }
  if (!userId) {
    return (
      <p className="pt-10 text-center text-sm text-warn">
        익명 인증에 실패했어요{error ? ` — ${error}` : ""}. 홈 탭에서 상태를
        확인해 주세요.
      </p>
    );
  }
  return <WorkoutScreen userId={userId} />;
}

type CompletedResult = {
  sessionId: string;
  completedAtMs: number;
  durationMinutes: number;
  summary: VolumeSummary;
};

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("active_session_exists")) return "이미 진행 중인 운동이 있어요";
  if (msg.includes("invalid_status")) return "세션 상태가 맞지 않아요. 새로고침해 주세요";
  if (msg.includes("session_not_found")) return "세션을 찾을 수 없어요";
  if (msg.includes("duplicate key")) return "이미 같은 이름의 운동이 있어요";
  return `오류: ${msg}`;
}

function WorkoutScreen({ userId }: { userId: string }) {
  // 임시저장 복구: 렌더 전 lazy 초기화 (§10 새로고침 복구)
  const [draft, setDraft] = useState(() => loadDraft(userId));
  const [subTab, setSubTab] = useState<"workout" | "calendar">("workout");
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [prevVolume, setPrevVolume] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [result, setResult] = useState<CompletedResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = draft.sessionId !== null && draft.startedAtMs !== null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // 자동 임시저장 (§10)
  useEffect(() => {
    saveDraft(userId, draft);
  }, [userId, draft]);

  // 카탈로그·크루·직전 볼륨 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, groups, prev] = await Promise.all([
          getExerciseCatalog(),
          getMyGroups(),
          getLastCompletedWeightVolume(userId),
        ]);
        if (cancelled) return;
        setCatalog(cat);
        setGroupId(groups[0]?.id ?? null);
        setPrevVolume(prev);
      } catch {
        if (!cancelled) showToast("데이터를 불러오지 못했어요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  // 세션 상태 대사(對査): 로컬 draft ↔ 서버 상태 (§10 복구)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadDraft(userId);
      if (local.sessionId) {
        const s = await getSessionById(local.sessionId).catch(() => null);
        if (cancelled) return;
        if (s && s.status === "active" && s.started_at) {
          const startedAtMs = new Date(s.started_at).getTime();
          setDraft((d) => ({ ...d, startedAtMs }));
        } else if (s && s.status === "draft") {
          setDraft((d) => ({ ...d, startedAtMs: null }));
        } else {
          // 다른 기기에서 완료·취소됐거나 삭제됨
          setDraft((d) => emptyDraft(d.restSeconds));
        }
      } else {
        const s = await getMyActiveSession(userId).catch(() => null);
        if (cancelled || !s?.started_at) return;
        const startedAtMs = new Date(s.started_at).getTime();
        setDraft((d) => ({ ...d, sessionId: s.id, startedAtMs }));
        showToast("진행 중이던 운동을 이어서 기록해요");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  // 경과 시간 틱
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // 휴식 카운트다운 (완료 체크 시 사전설정 시간으로 시작)
  useEffect(() => {
    if (restRemaining === null) return;
    const t = setTimeout(() => {
      if (restRemaining <= 1) {
        setRestRemaining(null);
        showToast("휴식 끝! 다음 세트 시작 💪");
      } else {
        setRestRemaining(restRemaining - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [restRemaining, showToast]);

  const updateExercise = useCallback(
    (key: string, updater: (ex: LocalExercise) => LocalExercise) => {
      setDraft((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => (ex.key === key ? updater(ex) : ex)),
      }));
    },
    [],
  );

  function addExercise(item: CatalogExercise) {
    const ex: LocalExercise = {
      key: localId(),
      name: item.name,
      bodyPart: item.body_part,
      exerciseType: item.exercise_type,
      isCustom: item.is_custom,
      sets: defaultSets(item.exercise_type),
    };
    setDraft((d) => ({ ...d, exercises: [...d.exercises, ex] }));
    setPickerOpen(false);
    showToast(`'${item.name}' 추가됨`);
    // 직전 기록 불러오기 (§10) — 있으면 세트 구조 프리필
    getLastRecordedSets(userId, item.name)
      .then((sets) => {
        if (sets) updateExercise(ex.key, (e) => ({ ...e, sets }));
      })
      .catch(() => {});
  }

  async function handleCreateCustom(input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
  }) {
    try {
      const created = await createCustomExercise({ ...input, userId });
      setCatalog((c) => [...c, created]);
      addExercise(created);
    } catch (e) {
      showToast(errorMessage(e));
    }
  }

  function updateSet(exKey: string, si: number, patch: Partial<LocalSet>) {
    updateExercise(exKey, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) => (i === si ? { ...s, ...patch } : s)),
    }));
  }

  function toggleDone(exKey: string, si: number) {
    if (!active) {
      showToast("운동을 먼저 시작하세요 💪");
      return;
    }
    const ex = draft.exercises.find((e) => e.key === exKey);
    const willDone = !ex?.sets[si]?.done;
    updateSet(exKey, si, { done: willDone });
    if (willDone) setRestRemaining(draft.restSeconds);
  }

  function addSet(exKey: string) {
    updateExercise(exKey, (ex) => {
      const last = ex.sets.at(-1);
      // 새 세트는 직전값 복사 (§10)
      return {
        ...ex,
        sets: [
          ...ex.sets,
          newSet(
            last
              ? {
                  weightKg: last.weightKg,
                  reps: last.reps,
                  distanceKm: last.distanceKm,
                  durationMin: last.durationMin,
                }
              : {},
          ),
        ],
      };
    });
  }

  function removeSet(exKey: string) {
    updateExercise(exKey, (ex) =>
      ex.sets.length > 1 ? { ...ex, sets: ex.sets.slice(0, -1) } : ex,
    );
  }

  function removeExercise(exKey: string) {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.filter((ex) => ex.key !== exKey),
    }));
  }

  function stepRest(delta: number) {
    setDraft((d) => ({
      ...d,
      restSeconds: Math.min(600, Math.max(10, d.restSeconds + delta)),
    }));
  }

  // 지난 운동 복사 (§10) — 종목·세트 구조를 오늘 draft로 (완료 여부는 초기화)
  async function handleCopyFromPast(sessionId: string) {
    if (active) {
      showToast("운동 중에는 불러올 수 없어요");
      return;
    }
    if (
      draft.exercises.length > 0 &&
      !window.confirm("준비 중인 운동 목록을 지우고 지난 운동으로 바꿀까요?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const items = await getSessionExerciseStructure(sessionId);
      if (items.length === 0) {
        showToast("복사할 종목이 없어요");
        return;
      }
      const byName = new Map(catalog.map((c) => [c.name, c]));
      const exercises: LocalExercise[] = items.map((it) => ({
        key: localId(),
        name: it.name,
        bodyPart: byName.get(it.name)?.body_part ?? "코어",
        exerciseType: it.exerciseType,
        isCustom: byName.get(it.name)?.is_custom ?? false,
        sets: it.sets,
      }));
      setDraft((d) => ({ ...d, exercises }));
      setSubTab("workout");
      showToast("지난 운동을 불러왔어요 — 시작을 누르면 오늘 기록이 돼요 📋");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    if (draft.exercises.length === 0) {
      showToast("운동을 먼저 추가하세요");
      return;
    }
    setBusy(true);
    try {
      let sessionId = draft.sessionId;
      if (!sessionId) {
        const tz =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
        const s = await createDraftSession({ groupId, timezone: tz });
        sessionId = s.id;
        setDraft((d) => ({ ...d, sessionId }));
      }
      const started = await startWorkout(sessionId);
      const startedAtMs = new Date(started.started_at!).getTime();
      setDraft((d) => ({ ...d, sessionId, startedAtMs }));
      showToast("운동 시작! 💪");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    if (!draft.sessionId) return;
    const incomplete = draft.exercises
      .flatMap((e) => e.sets)
      .filter((s) => !s.done).length;
    if (
      incomplete > 0 &&
      !window.confirm(
        `미완료 세트 ${incomplete}개는 볼륨에 반영되지 않아요.\n이대로 완료할까요?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await saveSessionExercises(draft.sessionId, draft.exercises);
      const s = await completeWorkout(draft.sessionId);
      setResult({
        sessionId: s.id,
        completedAtMs: s.completed_at
          ? new Date(s.completed_at).getTime()
          : Date.now(),
        durationMinutes: s.duration_minutes ?? 0,
        summary: summarizeVolume(toVolumeSets(draft.exercises)),
      });
      clearDraft(userId);
      setDraft(emptyDraft(draft.restSeconds));
      setRestRemaining(null);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("운동을 취소할까요? 이번 기록은 저장되지 않아요.")) {
      return;
    }
    setBusy(true);
    try {
      if (draft.sessionId) await cancelWorkout(draft.sessionId);
      setDraft(emptyDraft(draft.restSeconds));
      setRestRemaining(null);
      showToast("운동을 취소했어요");
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const summary = summarizeVolume(toVolumeSets(draft.exercises));
  const elapsedSec =
    active && draft.startedAtMs
      ? Math.max(0, Math.floor((nowMs - draft.startedAtMs) / 1000))
      : 0;
  const hh = String(Math.floor(elapsedSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const restMm = String(Math.floor(draft.restSeconds / 60)).padStart(2, "0");
  const restSs = String(draft.restSeconds % 60).padStart(2, "0");
  const today = new Date();
  const volumeDelta =
    prevVolume !== null ? summary.weightVolumeKg - prevVolume : null;

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <header className="pt-2 pb-1">
          <h1 className="text-[19px] font-extrabold tracking-tight">운동 기록</h1>
        </header>
        <section className="rounded-card border border-good bg-surface p-6 text-center shadow-card">
          <div className="text-4xl">🎉</div>
          <h2 className="mt-1 text-lg font-extrabold">오늘 운동 완료!</h2>
          <p className="mt-1 text-sm text-muted">
            {result.durationMinutes}분 · 볼륨{" "}
            {result.summary.weightVolumeKg.toLocaleString()}kg · 완료 세트{" "}
            {result.summary.completedSetCount}개
          </p>
        </section>
        {/* 인증사진 (§11) — 촬영/앨범/사진 없이 */}
        <VerificationPhoto
          userId={userId}
          sessionId={result.sessionId}
          durationMinutes={result.durationMinutes}
          completedAtMs={result.completedAtMs}
          onToast={showToast}
        />
        <p className="text-center text-xs text-muted">
          &lsquo;달력&rsquo; 탭에서 오늘 스탬프를 확인할 수 있어요. 카메라
          인증은 🔥, 업로드는 ●로 찍혀요.
        </p>
        <button
          onClick={() => setResult(null)}
          className="h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          확인
        </button>
        {toast && (
          <div
            className="fixed inset-x-8 z-50 rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
          >
            {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      <header className="flex items-center justify-between pt-2 pb-1">
        <div>
          <h1 className="text-[19px] font-extrabold tracking-tight">운동 기록</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {active ? "운동 중" : "준비"}
          </p>
        </div>
        {active && subTab === "workout" && (
          <button
            onClick={handleCancel}
            disabled={busy}
            className="text-xs font-bold text-faint"
          >
            취소
          </button>
        )}
      </header>

      {/* 운동 / 달력 서브탭 (§12) */}
      <div className="flex gap-1 rounded-card border border-line bg-surface-2 p-1">
        {(["workout", "calendar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`h-9 flex-1 rounded-[9px] text-sm font-bold transition-colors ${
              subTab === t
                ? "bg-surface text-accent shadow-card"
                : "text-muted"
            }`}
          >
            {t === "workout" ? "운동" : "달력"}
          </button>
        ))}
      </div>

      {subTab === "calendar" ? (
        <>
          <CalendarView userId={userId} onCopySession={handleCopyFromPast} />
          {toast && (
            <div
              className="fixed inset-x-8 z-50 rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
            >
              {toast}
            </div>
          )}
        </>
      ) : (
        <>
      {/* 세션 헤더 (§10) */}
      <section className="rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-accent">
              {active ? "운동 중" : "준비"}
            </p>
            {active ? (
              <p className="mt-1 font-mono text-2xl font-extrabold">
                {hh}:{mm}:{ss}
              </p>
            ) : (
              <p className="mt-1 font-mono text-sm text-muted">
                {today.getMonth() + 1}월 {today.getDate()}일
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">완료 볼륨</p>
            <p className="font-mono text-[26px] leading-tight font-extrabold">
              {summary.weightVolumeKg.toLocaleString()}
              <span className="text-[15px]">kg</span>
            </p>
            {volumeDelta !== null && (
              <p className="font-mono text-xs text-muted">
                이전 대비{" "}
                <span className={volumeDelta >= 0 ? "text-good" : "text-warn"}>
                  {volumeDelta >= 0 ? "+" : ""}
                  {volumeDelta.toLocaleString()}kg
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 휴식 사전설정 — 운동 시작 전 10초 단위 (§10) */}
      <section className="flex items-center justify-between rounded-card border border-line bg-surface px-4 py-3 shadow-card">
        <div>
          <p className="text-sm font-bold">세트 사이 휴식</p>
          <p className="text-[11.5px] text-muted">
            {active ? "운동 중에는 변경할 수 없어요" : "완료 체크하면 이 시간으로 시작해요"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepRest(-10)}
            disabled={active}
            aria-label="10초 줄이기"
            className="h-9 w-9 rounded-full border border-line bg-surface-2 text-lg font-bold disabled:opacity-40"
          >
            –
          </button>
          <span className="w-12 text-center font-mono text-sm font-extrabold">
            {restMm}:{restSs}
          </span>
          <button
            onClick={() => stepRest(10)}
            disabled={active}
            aria-label="10초 늘리기"
            className="h-9 w-9 rounded-full border border-line bg-surface-2 text-lg font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>
      </section>

      {/* 운동 카드 목록 */}
      {draft.exercises.map((ex, i) => (
        <ExerciseCard
          key={ex.key}
          exercise={ex}
          index={i}
          active={active}
          onUpdateSet={(si, patch) => updateSet(ex.key, si, patch)}
          onToggleDone={(si) => toggleDone(ex.key, si)}
          onAddSet={() => addSet(ex.key)}
          onRemoveSet={() => removeSet(ex.key)}
          onRemoveExercise={() => removeExercise(ex.key)}
        />
      ))}

      <div className="flex gap-2">
        <button
          onClick={() => setPickerOpen(true)}
          className="h-12 flex-1 rounded-card border border-line bg-surface text-sm font-bold text-accent"
        >
          + 운동 추가
        </button>
        <button
          onClick={active ? handleFinish : handleStart}
          disabled={busy}
          className={`h-12 flex-1 rounded-card text-sm font-extrabold disabled:opacity-60 ${
            active ? "bg-good text-white" : "bg-accent text-accent-ink"
          }`}
        >
          {busy ? "처리 중…" : active ? "운동 종료" : "운동 시작"}
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        완료 체크한 세트만 볼륨에 반영돼요. 새로고침해도 진행 중 기록은 복구됩니다.
      </p>

      {restRemaining !== null && (
        <RestBar
          remainingSeconds={restRemaining}
          onExtend={() => setRestRemaining((r) => (r === null ? r : r + 30))}
          onSkip={() => setRestRemaining(null)}
        />
      )}

      <ExercisePicker
        open={pickerOpen}
        catalog={catalog}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        onCreateCustom={handleCreateCustom}
      />

      {toast && (
        <div
          className="fixed inset-x-8 z-50 rounded-card border border-line bg-surface px-4 py-3 text-center text-sm font-bold shadow-card"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
        >
          {toast}
        </div>
      )}
        </>
      )}
    </div>
  );
}
