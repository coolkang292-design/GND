"use client";

import { useEffect, useRef, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import {
  INTERVAL_COPY,
  TABATA_EXERCISE_COUNT,
  TABATA_TRACKS,
  tabataPickFromNames,
  tabataRepsForMinutes,
  tabataTrackForMinutes,
  type TabataMinutes,
  type TabataTrack,
} from "@/lib/domain/tabata";
import type { WorkoutRoutine } from "@/lib/routines";
import type {
  BodyPart,
  CatalogExercise,
  ExerciseType,
} from "@/lib/types";
import type { CalendarSession } from "@/lib/workout";
import { ExercisePicker } from "./exercise-picker";

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * 타바타 모드 (설계 2026-07-19) — 운동 4개 선택 → 음원 재생 → 종료 시 자동 기록.
 * 세션 시작/완료/취소는 record 페이지가 콜백으로 수행한다.
 */
export function TabataSheet({ open, ...props }: TabataProps & { open: boolean }) {
  // 닫을 때 언마운트 → 다시 열면 초기 상태 (effect 내 setState 금지 — 교훈 4)
  if (!open) return null;
  return <TabataSheetBody {...props} />;
}

type TabataProps = {
  catalog: CatalogExercise[];
  onClose: () => void;
  onCreateCustom: (input: {
    name: string;
    bodyPart: BodyPart;
    exerciseType: ExerciseType;
    measure: "reps" | "time" | null;
  }) => Promise<CatalogExercise | null>;
  /** 선택 운동·코스로 세션을 시작한다. 성공 시 true */
  onBegin: (picked: CatalogExercise[], minutes: TabataMinutes) => Promise<boolean>;
  /** 음원 종료 — 전 세트 완료 처리 후 세션 자동 완료 */
  onComplete: () => Promise<void>;
  /** 재생 중단 — 세션 취소 */
  onCancelWorkout: () => Promise<void>;
  // ── 지난 기록·내 루틴으로 구성 운동 채우기 (2026-08-05) ──────────
  /** 기록 탭이 이미 갖고 있는 완료 세션 — 새 질의 없이 이름만 쓴다 */
  pastSessions: CalendarSession[];
  pastLoading: boolean;
  /** null이면 루틴 기능을 쓸 수 없다 (0056 미적용) */
  routines?: WorkoutRoutine[];
  routinesLoading?: boolean;
  /** 예정표에서 연 타바타 — 종목·코스를 미리 채운 채 연다 (0059) */
  initialPicked?: CatalogExercise[];
  initialMinutes?: TabataMinutes;
};

function TabataSheetBody({
  catalog,
  onClose,
  onCreateCustom,
  onBegin,
  onComplete,
  onCancelWorkout,
  pastSessions,
  pastLoading,
  routines,
  routinesLoading,
  initialPicked,
  initialMinutes,
}: TabataProps) {
  // 시트는 닫으면 언마운트된다 — 예약된 값은 초기값으로 넣으면 되고,
  // effect 안에서 setState 할 필요가 없다 (교훈 4).
  const [picked, setPicked] = useState<CatalogExercise[]>(initialPicked ?? []);
  const [minutes, setMinutes] = useState<TabataMinutes>(initialMinutes ?? 4);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phase, setPhase] = useState<"setup" | "playing" | "finishing">("setup");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const track = tabataTrackForMinutes(minutes) ?? TABATA_TRACKS[0];

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  async function acquireWakeLock() {
    try {
      const nav = navigator as WakeLockNavigator;
      wakeLockRef.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLockRef.current = null; // 화면 유지 실패는 무해 — 사용자가 켜두면 됨
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // 이미 해제됨
    }
    wakeLockRef.current = null;
  }

  async function start() {
    if (busy || picked.length !== TABATA_EXERCISE_COUNT) return;
    setBusy(true);
    setPlayError(null);
    try {
      const audio = audioRef.current;
      if (!audio) return;
      // iOS는 사용자 제스처 안에서 play()가 시작돼야 한다 — 세션 생성보다 먼저.
      await audio.play();
      const ok = await onBegin(picked, minutes);
      if (!ok) {
        audio.pause();
        audio.currentTime = 0;
        return;
      }
      await acquireWakeLock();
      setPhase("playing");
    } catch (e) {
      setPhase("setup");
      setPlayError(
        `음원을 재생하지 못했어요 (${e instanceof Error ? e.name : "오류"}). 기기 소리 출력과 볼륨을 확인하고 다시 눌러주세요.`,
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * 이름 목록으로 구성 운동을 통째로 갈아 끼운다 (2026-08-05).
   *
   * **덧붙이지 않고 교체한다.** 지난 타바타를 부르는 건 "그날 그 구성으로 다시"
   * 라는 뜻이고, 4개 한도에 이미 걸려 있으면 덧붙이기는 아무 일도 안 한 것처럼
   * 보인다. 하나도 못 찾으면 시트를 닫지 않고 이유를 말한다.
   */
  function fillFromNames(names: readonly string[], label: string): boolean {
    const found = tabataPickFromNames(names, catalog);
    if (found.length === 0) {
      setPickError(`${label}의 종목을 운동 목록에서 찾지 못했어요.`);
      return false;
    }
    setPicked(found);
    setPickError(
      found.length < TABATA_EXERCISE_COUNT
        ? `${found.length}개만 채웠어요 — ${TABATA_EXERCISE_COUNT - found.length}개를 더 골라주세요.`
        : null,
    );
    return true;
  }

  /** 고른 운동을 중복 없이 뒤에 붙인다 (4개 한도). 검색·추천이 같이 쓴다 */
  function addPickedItems(items: readonly CatalogExercise[]) {
    setPicked((cur) => {
      const merged = [...cur];
      for (const item of items) {
        if (!merged.some((p) => p.id === item.id)) merged.push(item);
      }
      return merged.slice(0, TABATA_EXERCISE_COUNT);
    });
    setPickError(null);
    setPickerOpen(false);
  }

  function pickPastSession(sessionId: string): boolean {
    const session = pastSessions.find((s) => s.id === sessionId);
    if (!session) return false;
    const filled = fillFromNames(session.exerciseNames, "그 기록");
    // 지난 타바타면 코스까지 그때 것으로 되돌린다 — 8분을 했으면 8분으로.
    if (filled && session.tabataMinutes) {
      const track = tabataTrackForMinutes(session.tabataMinutes);
      if (track) setMinutes(track.minutes);
    }
    return filled;
  }

  async function handleEnded() {
    if (phase !== "playing") return;
    setPhase("finishing");
    await releaseWakeLock();
    await onComplete();
    onClose();
  }

  async function stop() {
    if (busy) return;
    if (!window.confirm("타바타를 중단할까요? 운동은 기록되지 않아요.")) return;
    setBusy(true);
    try {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      await releaseWakeLock();
      await onCancelWorkout();
      setPhase("setup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={phase === "setup" ? onClose : undefined}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {/* 옛 표기는 `🔥`였다 (2026-08-07 2차 시안으로 교체) — 운동 추가 허브의
            `타바타로 바로 시작` 카드와 **같은 그림**(불붙은 스톱워치)이라야
            같은 기능으로 읽힌다 */}
        <h3 className="flex items-center gap-1.5 text-base font-extrabold">
          <UiIcon name="hub-tabata" size={22} />
          {INTERVAL_COPY.title}
        </h3>

        <audio
          key={track.src}
          ref={audioRef}
          src={track.src}
          preload="metadata"
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (Number.isFinite(el.duration)) {
              setRemaining(el.duration - el.currentTime);
            }
          }}
          onEnded={() => void handleEnded()}
        />

        {phase === "setup" && (
          <>
            <p className="mt-1 text-xs font-bold text-muted">
              {INTERVAL_COPY.description}
            </p>
            <p className="mt-1 text-xs text-muted">
              코스와 구성 운동 {TABATA_EXERCISE_COUNT}개를 고르고 시작하세요.
              음원이 끝나면 자동으로 기록되고, 인증샷만 찍으면 돼요.
              <b className="text-accent">
                {" "}
                종목마다 {tabataRepsForMinutes(minutes)}회로 기록돼요.
              </b>
            </p>

            <div className="mt-3 flex gap-1.5">
              {TABATA_TRACKS.map((t: TabataTrack) => (
                <button
                  key={t.id}
                  onClick={() => setMinutes(t.minutes)}
                  aria-pressed={minutes === t.minutes}
                  className={`h-11 flex-1 rounded-card-sm text-sm font-extrabold ${
                    minutes === t.minutes
                      ? "bg-accent text-accent-ink"
                      : "border border-line bg-surface-2 text-muted"
                  }`}
                >
                  {t.minutes}분
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              {picked.map((item) => (
                <div
                  key={item.id}
                  className="flex h-11 items-center justify-between rounded-card-sm border border-line bg-surface-2 px-3"
                >
                  <p className="text-sm font-bold">
                    <span className="text-muted">{item.body_part} | </span>
                    {item.name}
                  </p>
                  <button
                    onClick={() => {
                      setPicked((cur) => cur.filter((p) => p.id !== item.id));
                      setPickError(null); // "N개만 채웠어요"가 남아 어긋나지 않게
                    }}
                    aria-label={`${item.name} 빼기`}
                    className="text-sm text-faint"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setPickerOpen(true)}
              className="mt-2 h-11 rounded-card border border-line bg-surface text-sm font-bold text-accent"
            >
              + 운동 고르기 ({picked.length}/{TABATA_EXERCISE_COUNT})
            </button>
            <p className="mt-1.5 text-center text-[11px] text-muted">
              지난 기록·내 루틴에서 지난번 구성을 그대로 불러올 수 있어요
            </p>

            {pickError && (
              <p className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-xs text-warn">
                {pickError}
              </p>
            )}
            {playError && (
              <p className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2 text-xs text-warn">
                {playError}
              </p>
            )}
            <button
              onClick={() => void start()}
              disabled={busy || picked.length !== TABATA_EXERCISE_COUNT}
              className="mt-3 h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
            >
              {busy ? "시작 중…" : INTERVAL_COPY.start}
            </button>
          </>
        )}

        {phase !== "setup" && (
          <>
            <p className="mt-4 text-center font-mono text-5xl font-extrabold text-accent">
              {remaining !== null ? formatClock(remaining) : "•••"}
            </p>
            <p className="mt-1 text-center text-xs text-muted">
              {phase === "finishing"
                ? "기록 저장 중…"
                : "음원이 끝나면 자동으로 기록돼요 — 화면을 켜둔 채 운동하세요"}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {picked.map((item) => (
                <span
                  key={item.id}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted"
                >
                  {item.name}
                </span>
              ))}
            </div>
            <button
              onClick={() => void stop()}
              disabled={busy || phase === "finishing"}
              className="mt-4 h-11 rounded-card border border-line bg-surface-2 text-sm font-bold disabled:opacity-50"
            >
              중단하기
            </button>
          </>
        )}
      </div>

      {/*
        지난 기록·내 루틴으로도 구성 운동을 채운다 (2026-08-05).
        예전에는 pastSessions={[]}를 넘겨 '지난 기록' 탭이 늘 비어 있었다 —
        타바타를 할 때마다 카탈로그에서 4개를 새로 찾아야 했다.
        기록 탭이 이미 들고 있는 목록을 넘길 뿐이라 새 질의는 없다.
      */}
      <ExercisePicker
        open={pickerOpen}
        catalog={catalog}
        pastSessions={pastSessions}
        pastLoading={pastLoading}
        routines={routines}
        routinesLoading={routinesLoading}
        onClose={() => setPickerOpen(false)}
        onPickMany={addPickedItems}
        /*
          추천 경로도 같은 자리로 받는다 (2026-08-06).

          ⚠️ 이 prop을 안 넘기면 피커의 `confirmSetup`이 `if (!onPickConfigured)
          ... return`으로 **조용히 죽는다.** 추천으로 4개를 고르고 '추가하기'를
          눌러도 아무 일도 안 일어나고 오류도 없었다 — 옵셔널 prop이라 타입
          검사도 통과한다. 개발 서버에서 눌러 보고 잡았다.

          세트·목표는 버린다. 타바타는 코스 분수로 횟수를 스스로 정한다
          (`tabataRepsForMinutes`) — 여기서 받은 3세트·10회를 쓰면 안 된다.
        */
        onPickConfigured={(picks) => addPickedItems(picks.map((p) => p.item))}
        onPickPast={(sessionId) => Promise.resolve(pickPastSession(sessionId))}
        onPickRoutine={
          routines
            ? (routine) =>
                Promise.resolve(
                  fillFromNames(
                    routine.exercises.map((e) => e.name),
                    `'${routine.name}'`,
                  ),
                )
            : undefined
        }
        onCreateCustom={onCreateCustom}
      />
    </>
  );
}
