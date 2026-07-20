"use client";

import { useEffect, useRef, useState } from "react";
import {
  TABATA_EXERCISE_COUNT,
  TABATA_TRACKS,
  tabataTrackForMinutes,
  type TabataMinutes,
  type TabataTrack,
} from "@/lib/domain/tabata";
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
};

function TabataSheetBody({
  catalog,
  onClose,
  onCreateCustom,
  onBegin,
  onComplete,
  onCancelWorkout,
}: TabataProps) {
  const [picked, setPicked] = useState<CatalogExercise[]>([]);
  const [minutes, setMinutes] = useState<TabataMinutes>(4);
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
        <h3 className="text-base font-extrabold">🔥 타바타 — {track.title}</h3>

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
            <p className="mt-1 text-xs text-muted">
              코스와 구성 운동 {TABATA_EXERCISE_COUNT}개를 고르고 시작하세요.
              음원이 끝나면 자동으로 기록되고, 인증샷만 찍으면 돼요.
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
                    onClick={() =>
                      setPicked((cur) => cur.filter((p) => p.id !== item.id))
                    }
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
              {busy ? "시작 중…" : "▶ 타바타 시작"}
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

      <ExercisePicker
        open={pickerOpen}
        catalog={catalog}
        pastSessions={[] as CalendarSession[]}
        pastLoading={false}
        onClose={() => setPickerOpen(false)}
        onPickMany={(items) => {
          setPicked((cur) => {
            const merged = [...cur];
            for (const item of items) {
              if (!merged.some((p) => p.id === item.id)) merged.push(item);
            }
            return merged.slice(0, TABATA_EXERCISE_COUNT);
          });
          setPickerOpen(false);
        }}
        onPickPast={() => Promise.resolve(false)}
        onCreateCustom={onCreateCustom}
      />
    </>
  );
}
