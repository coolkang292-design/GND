"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UiIcon } from "@/components/ui-icon";
import { IntervalSessionOverlay } from "./interval-session-overlay";
import { ChallengePlanFeedback } from "./challenge-workout-feedback";
import type { ActiveChallengeContext } from "@/lib/domain/challenge-confirmation";
import {
  INTERVAL_COPY,
  TABATA_EXERCISE_COUNT,
  TABATA_TRACKS,
  tabataDraftExercises,
  tabataPickFromNames,
  tabataRepsForMinutes,
  tabataTrackForMinutes,
  type TabataMinutes,
  type TabataTrack,
} from "@/lib/domain/tabata";
import {
  advanceLoopBlock,
  cumulativeIntervalElapsed,
  intervalBlockCount,
  shouldLoopAudio,
} from "@/lib/domain/interval-loop";
import type { WorkoutRoutine } from "@/lib/routines";
import type {
  BodyPart,
  CatalogExercise,
  ExerciseType,
} from "@/lib/types";
import { localId, type CalendarSession } from "@/lib/workout";
import { ExercisePicker } from "./exercise-picker";

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
};

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
  /** 로그인한 계정의 음원 설정에 사용한다. 없으면 기본 음원이다. */
  userId?: string | null;
  /**
   * 참여 중인 챌린지 — 있으면 **시작 전에** 이 인터벌의 예상 점수를 보여 준다 (사용자 지시 2026-11-17).
   * 인터벌은 이 시트의 시작 버튼 하나로만 시작되므로 여기가 시작 전 유일한 확인 자리다.
   */
  challengeContexts?: readonly ActiveChallengeContext[];
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
  /**
   * 재생 시작·종료를 알린다 (사용자 지시 2026-08-13).
   *
   * 기록 화면이 근력용 세트 입력 오버레이를 이걸로 내린다. 안 내리면 인터벌
   * 전체화면 뒤에 ± 버튼이 그대로 살아 있다 — 화면이 두 겹이 된다.
   */
  onPlayingChange?: (playing: boolean) => void;
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
  /**
   * 인터벌이 끝난 뒤 같은 세션에서 이어서 할 종목 이름 (설계 2026-09-29).
   * 계획의 5번째부터다. 여기서는 **보여 주기만** 한다 — 고르는 것은 인터벌 4종뿐이다.
   */
  followUpNames?: readonly string[];
  /*
    ⚠️ **`autoStart`를 되살리지 마라** (사용자 지시 2026-08-25).

    2026-08-13에 달력·기록 화면의 인터벌 계획이 시트를 열자마자 재생하게
    했었다. 그러면 계획에 적힌 코스로 음악이 곧장 시작돼 **오늘 몇 분을 할지
    고를 자리가 없다.** 계획을 짤 때와 실제로 몸을 쓰는 때의 컨디션은 다르다.
    계획은 `initialPicked`·`initialMinutes`로 채워 두고, 시작은 사람이 누른다.
  */
  /**
   * 열자마자 종목 고르기 화면을 편다 (사용자 지시 2026-08-13).
   *
   * 상황별 추천의 인터벌 칸에서 온 경우다 — 이미 "인터벌을 하겠다"고 고른
   * 사람에게 빈 목록과 "운동 고르기" 버튼을 한 번 더 보여 줄 이유가 없다.
   */
  openPickerOnMount?: boolean;
  /**
   * **계획 모드** (사용자 지시 2026-08-13) — 시작하지 않고 예정표로 저장한다.
   *
   * 달력의 `새 운동 계획 만들기`가 쓴다. 거기에는 코스를 고르는 화면이 없어서
   * 인터벌 계획을 만들 수 없었다 — 종목만 담으면 3세트 10회짜리 일반 계획이
   * 됐고, 사용자가 그렇게 당했다.
   *
   * 넘기면 음원·세션·화면 유지에 손대지 않는다. 고르는 화면만 쓴다.
   */
  onPlan?: (
    picked: CatalogExercise[],
    minutes: TabataMinutes,
  ) => Promise<boolean>;
  /** 계획 모드에서 버튼에 쓸 날짜 문구 — 예: `8월 14일` */
  planDateLabel?: string;
  /**
   * **오늘 계획으로 저장만 한다** (사용자 지시 2026-11-17) — 음원·세션 없이 지금 고른 종목·코스를
   * 오늘의 인터벌 계획으로 남긴다. 저장되면 true, 실패하면 false(시트를 닫지 않는다).
   *
   * ⚠️ `onPlan`(달력의 날짜 지정 저장)과 다르다: 이쪽은 **시작하는 화면**에 붙는 두 번째 버튼이다.
   *    시작하지 않고 닫으면 바꾼 종목이 사라졌고, 저장 버튼이 없어서 적용이 안 된 줄 알았다.
   *    `onPlan`이 있는 계획 모드에서는 그 자체가 저장 버튼이라 이 버튼을 내지 않는다.
   */
  onSaveToday?: (picked: CatalogExercise[], minutes: TabataMinutes) => Promise<boolean>;
  /**
   * **운동 목록에 담기만 한다** (설계 2026-11-22) — 시작하지 않고 지금 고른 종목·코스를
   * 준비 목록 안의 **인터벌 덩어리**로 넣는다. 웨이트·유산소와 순서를 정한 뒤 한 번에 시작한다.
   * 담기면 true(시트를 닫는다), 못 담으면 false(닫지 않는다).
   * 계획 모드(`onPlan`)·운동 중(`inSession`)에는 내지 않는다.
   */
  onAddToList?: (picked: CatalogExercise[], minutes: TabataMinutes) => boolean;
  /**
   * **이미 시작한 운동 안에서 인터벌 차례가 된 경우** (설계 2026-11-22).
   *
   * 코스·구성은 목록에서 정해졌으므로 **바꾸지 못한다**(바꾸면 저장 순서가 어긋난다).
   * 세션은 이미 있으므로 `onBegin`은 세션을 만들지 않는다. 재생 중 멈추면 **운동 전체를
   * 취소하지 않고** 목록으로 돌아간다(`onLeave`) — 앞서 한 웨이트 기록을 지키려고.
   */
  inSession?: boolean;
  /** `inSession`에서 인터벌을 멈추고 목록으로 돌아간다 */
  onLeave?: () => void;
};

function TabataSheetBody({
  userId,
  challengeContexts = [],
  catalog,
  onClose,
  onCreateCustom,
  onBegin,
  onComplete,
  onCancelWorkout,
  onPlayingChange,
  pastSessions,
  pastLoading,
  routines,
  routinesLoading,
  initialPicked,
  initialMinutes,
  followUpNames = [],
  openPickerOnMount,
  onPlan,
  onSaveToday,
  onAddToList,
  inSession = false,
  onLeave,
  planDateLabel = "",
}: TabataProps) {
  // 시트는 닫으면 언마운트된다 — 예약된 값은 초기값으로 넣으면 되고,
  // effect 안에서 setState 할 필요가 없다 (교훈 4).
  const [picked, setPicked] = useState<CatalogExercise[]>(initialPicked ?? []);
  const [minutes, setMinutes] = useState<TabataMinutes>(initialMinutes ?? 4);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(openPickerOnMount === true);
  const [phase, setPhase] = useState<"setup" | "playing" | "finishing">("setup");
  /** 음원의 현재 위치 — 지금 몇 라운드인지는 이 값이 정한다 */
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  /**
   * 중단 확인 (2026-11-22). 예전에는 `window.confirm`이었는데, 앱 안 브라우저·일부 홈 화면 앱은
   * 확인창을 **띄우지 않고 곧바로 "아니오"를 돌려준다** — 중단 버튼이 눌러도 아무 일이 없었다.
   * 앱이 직접 그리는 확인창은 어디서나 뜬다.
   */
  const [confirmStop, setConfirmStop] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  /**
   * 반복 재생 상태 (2026-11-19). 8·16분은 4분 파일을 `audio.loop`로 돌리므로
   * 파일 위치(0~250)만으로는 몇 번째 블록인지 모른다 — 되감김을 세어 둔다.
   * 시작·중단에서 반드시 0으로 되돌린다: 되돌리지 않으면 `currentTime = 0`이
   * 되감김으로 읽혀 블록이 올라간다.
   */
  const loopBlockRef = useRef(0);
  const loopPrevTimeRef = useRef(0);

  const track = tabataTrackForMinutes(minutes, userId) ?? TABATA_TRACKS[0];
  const totalBlocks = intervalBlockCount(minutes);

  function resetLoopState() {
    loopBlockRef.current = 0;
    loopPrevTimeRef.current = 0;
  }
  // 예상 점수는 코스가 정한 횟수로 계산한다 — 실제 기록(`tabataDraftExercises`)과 같은 모양이라야 숫자가 맞다
  const forecastExercises = useMemo(
    () => tabataDraftExercises(picked, localId, minutes),
    [picked, minutes],
  );

  /**
   * 고르기 화면에는 **맨몸 종목만** 올린다 (사용자 지시 2026-08-13).
   *
   * 인터벌은 기구 없이 20초를 도는 운동이다. 바벨·머신이 목록에 섞여 있으면
   * 고를 수 없는 것을 고르게 된다.
   *
   * ⚠️ 시간형(플랭크·월 싯 등)도 뺀다. 인터벌 기록은 **횟수**로 저장되므로
   *    (`tabataRepsForMinutes`) 시간형이 들어가면 기록이 어긋난다 — 프로그램
   *    9조합에서 뺀 것과 같은 이유다.
   *
   * ⚠️ 이름으로 되살리는 경로(`fillFromNames`)는 **원본 `catalog`** 를 쓴다.
   *    지난 기록·루틴에 다른 종목이 섞여 있어도 찾을 수 있어야 한다.
   */
  const pickerCatalog = useMemo(
    () =>
      catalog.filter(
        (item) => item.exercise_type === "bodyweight" && item.measure !== "time",
      ),
    [catalog],
  );

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
      resetLoopState();
      audio.loop = shouldLoopAudio(0, totalBlocks);
      // iOS는 사용자 제스처 안에서 play()가 시작돼야 한다 — 세션 생성보다 먼저.
      await audio.play();
      const ok = await onBegin(picked, minutes);
      if (!ok) {
        audio.pause();
        audio.currentTime = 0;
        resetLoopState();
        return;
      }
      await acquireWakeLock();
      setElapsed(0);
      setPaused(false);
      setPhase("playing");
      onPlayingChange?.(true);
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

  /**
   * 계획 모드의 저장 (2026-08-13).
   *
   * ⚠️ 음원을 건드리지 않는다. 재생·세션 생성·화면 유지는 전부 시작 경로의
   *    일이고, 여기서는 고른 것을 그대로 넘길 뿐이다.
   */
  async function savePlan() {
    if (!onPlan || busy || picked.length !== TABATA_EXERCISE_COUNT) return;
    setBusy(true);
    setPickError(null);
    try {
      if (await onPlan(picked, minutes)) onClose();
    } finally {
      setBusy(false);
    }
  }

  /** 시작하지 않고 오늘의 인터벌 계획으로만 저장한다 — 성공하면 시트를 닫는다 */
  async function saveToday() {
    if (!onSaveToday || busy || picked.length !== TABATA_EXERCISE_COUNT) return;
    setBusy(true);
    setPickError(null);
    try {
      if (await onSaveToday(picked, minutes)) onClose();
    } finally {
      setBusy(false);
    }
  }

  function addToList() {
    if (!onAddToList || picked.length !== TABATA_EXERCISE_COUNT) return;
    if (onAddToList(picked, minutes)) onClose();
  }

  function togglePause() {
    const audio = audioRef.current;
    if (!audio || phase !== "playing") return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
      setPaused(false);
    } else {
      audio.pause();
      setPaused(true);
    }
  }

  async function handleEnded() {
    if (phase !== "playing") return;
    setPhase("finishing");
    onPlayingChange?.(false);
    await releaseWakeLock();
    await onComplete();
    onClose();
  }

  function requestStop() {
    if (busy) return;
    setConfirmStop(true);
  }

  async function stop() {
    if (busy) return;
    setConfirmStop(false);
    setBusy(true);
    try {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      resetLoopState();
      await releaseWakeLock();
      if (inSession) {
        // 운동 전체를 취소하지 않는다 — 앞서 한 기록이 있다. 목록으로 돌아가 다시 시작할 수 있다
        setElapsed(0);
        setPaused(false);
        setPhase("setup");
        onPlayingChange?.(false);
        onLeave?.();
        return;
      }
      await onCancelWorkout();
      setElapsed(0);
      setPaused(false);
      setPhase("setup");
      onPlayingChange?.(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/*
        오디오는 **늘 마운트해 둔다.** 재생은 사용자 제스처 안에서 시작해야
        하는데(iOS), 시작 뒤에 시트를 걷어내면서 이 엘리먼트까지 사라지면
        음악이 멈춘다. 그래서 화면 전환과 무관한 자리에 둔다.
      */}
      <audio
        key={track.src}
        ref={audioRef}
        src={track.src}
        preload="metadata"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          // 재생 중에만 블록을 센다 — 고르는 화면의 되감김은 세지 않는다
          if (phase === "playing") {
            const next = advanceLoopBlock({
              block: loopBlockRef.current,
              totalBlocks,
              prevTime: loopPrevTimeRef.current,
              currentTime: el.currentTime,
            });
            if (next !== loopBlockRef.current) {
              loopBlockRef.current = next;
              // 마지막 블록은 loop를 꺼서 끝에서 ended가 오게 한다
              el.loop = shouldLoopAudio(next, totalBlocks);
            }
          }
          loopPrevTimeRef.current = el.currentTime;
          setElapsed(cumulativeIntervalElapsed(loopBlockRef.current, el.currentTime));
        }}
        onEnded={() => void handleEnded()}
      />

      {/*
        고르는 화면과 하는 화면을 **갈랐다** (사용자 지시 2026-08-13).

        예전에는 재생 중에도 이 시트가 떠 있었고, 뒤에는 근력용 세트 입력
        오버레이가 그대로 살아 있었다 — 화면이 두 겹이고 인터벌에는 쓰지도
        않는 ± 버튼이 보였다.
      */}
      {phase === "setup" ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
            aria-hidden
          />
          <div // `[&>*]:shrink-0` — 세로 flex 안에서 자식이 눌려 줄어들면 버튼이 22px로 찌그러진다 (2026-11-22)
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-y-auto rounded-t-[22px] border-t border-line bg-surface p-5 [&>*]:shrink-0">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            {/* 옛 표기는 `🔥`였다 (2026-08-07 2차 시안으로 교체) — 운동 추가 허브의
                `타바타로 바로 시작` 카드와 **같은 그림**(불붙은 스톱워치)이라야
                같은 기능으로 읽힌다 */}
            <h3 className="flex items-center gap-1.5 text-base font-extrabold">
              <UiIcon name="hub-tabata" size={22} />
              {INTERVAL_COPY.title}
            </h3>
            <p className="mt-1 text-xs font-bold text-muted">
              {INTERVAL_COPY.description}
            </p>
            {track.musicTitle && !onPlan && (
              <p className="mt-1 text-xs font-bold text-accent">
                배경음: {track.musicTitle}
              </p>
            )}
            {inSession ? (
              <p className="mt-1 text-xs text-muted" data-testid="interval-in-session-lead">
                {INTERVAL_COPY.inSessionLead}
                <b className="text-accent">
                  {" "}
                  종목마다 {tabataRepsForMinutes(minutes)}회로 기록돼요.
                </b>
              </p>
            ) : (
            <p className="mt-1 text-xs text-muted">
              코스와 구성 운동 {TABATA_EXERCISE_COUNT}개를 고르고{" "}
              {onPlan ? "저장하세요" : "시작하세요"}.
              {onPlan
                ? " 그날 기록 화면에서 바로 시작할 수 있어요."
                : followUpNames.length > 0
                  ? ` ${INTERVAL_COPY.followUpAfterEnd(followUpNames.length)}`
                  : " 음원이 끝나면 자동으로 기록되고, 인증샷만 찍으면 돼요."}
              <b className="text-accent">
                {" "}
                종목마다 {tabataRepsForMinutes(minutes)}회로 기록돼요.
              </b>
            </p>
            )}

            {/*
              고르는 것이 **시간**임을 글자로 적는다 (사용자 지시 2026-08-25).

              예정표에서 온 경우 이 줄이 특히 중요하다 — 계획한 코스가 이미
              눌려 있어서, 이름표가 없으면 "바꿀 수 있는 값"으로 안 읽힌다.
            */}
            <p className="mt-3 text-xs font-extrabold">오늘 할 시간</p>
            <div className="mt-1.5 flex gap-1.5">
              {TABATA_TRACKS.map((t: TabataTrack) => (
                <button
                  key={t.id}
                  onClick={() => setMinutes(t.minutes)}
                  disabled={inSession}
                  aria-pressed={minutes === t.minutes}
                  className={`h-11 flex-1 rounded-card-sm text-sm font-extrabold ${
                    minutes === t.minutes
                      ? "bg-accent text-accent-ink"
                      : "border border-line bg-surface-2 text-muted"
                  } disabled:opacity-60`}
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
                  {!inSession && (
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
                  )}
                </div>
              ))}
            </div>

            {followUpNames.length > 0 && (
              <div
                data-testid="interval-follow-ups"
                className="mt-2 rounded-card-sm border border-line bg-surface-2 px-3 py-2"
              >
                <p className="text-[11px] font-extrabold text-muted">
                  {INTERVAL_COPY.followUpLead}
                </p>
                <p className="mt-0.5 break-words text-sm font-bold">
                  {followUpNames.join(" · ")}
                </p>
              </div>
            )}

            {!inSession && (
              <>
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-2 h-11 rounded-card border border-line bg-surface text-sm font-bold text-accent"
            >
              + 운동 고르기 ({picked.length}/{TABATA_EXERCISE_COUNT})
            </button>
            <p className="mt-1.5 text-center text-[11px] text-muted">
              지난 기록·내 루틴에서 지난번 구성을 그대로 불러올 수 있어요
            </p>
              </>
            )}

            {/* 시작 버튼 바로 앞 — 누르기 전에 "이걸 하면 몇 점"을 본다. 계획 저장 화면은 시작하는 곳이 아니라 뺀다 */}
            {!onPlan && userId && challengeContexts.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <ChallengePlanFeedback
                  userId={userId}
                  contexts={challengeContexts}
                  exercises={forecastExercises}
                  tabataMinutes={minutes}
                />
                {picked.length < TABATA_EXERCISE_COUNT && (
                  <p className="text-center text-[11px] text-muted">
                    운동 {TABATA_EXERCISE_COUNT}개를 모두 고르면 종목 점수까지 정확해져요
                  </p>
                )}
              </div>
            )}

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
            {/*
              계획 모드에서는 **시작하지 않고 예정표로 저장한다**
              (사용자 지시 2026-08-13).

              달력의 `새 운동 계획 만들기`에는 코스를 고르는 화면이 없어서
              인터벌 계획을 만들 수 없었다 — 종목만 담으면 3세트 10회짜리 일반
              계획이 됐다. 코스 선택·종목 고르기가 이미 여기 다 있으므로,
              버튼 하나만 갈아 끼운다.
            */}
            <button
              onClick={() => (onPlan ? void savePlan() : void start())}
              disabled={busy || picked.length !== TABATA_EXERCISE_COUNT}
              className="mt-3 h-12 rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:opacity-50"
            >
              {busy
                ? onPlan
                  ? "저장 중…"
                  : "시작 중…"
                : onPlan
                  ? `${planDateLabel} 예정표로 저장`
                  : INTERVAL_COPY.start}
            </button>
            {/* 시작과 따로 저장 — 컨디션이 안 맞는 날도 구성은 남겨 두고 싶다. 계획 모드는 위 버튼이 저장이다 */}
            {onAddToList && !onPlan && !inSession && (
              <button
                type="button"
                data-testid="interval-add-to-list"
                onClick={addToList}
                disabled={busy || picked.length !== TABATA_EXERCISE_COUNT}
                className="mt-2 h-11 rounded-card border border-accent/50 bg-surface text-sm font-extrabold text-accent disabled:opacity-50"
              >
                {INTERVAL_COPY.addToList}
                <span className="ml-1 text-[11px] font-bold text-muted">
                  {INTERVAL_COPY.addToListHint}
                </span>
              </button>
            )}
            {inSession && (
              <button
                type="button"
                onClick={onClose}
                className="mt-2 h-11 rounded-card border border-line bg-surface text-sm font-bold text-muted"
              >
                {INTERVAL_COPY.leave}
              </button>
            )}
            {onSaveToday && !onPlan && !inSession && (
              <button
                type="button"
                onClick={() => void saveToday()}
                disabled={busy || picked.length !== TABATA_EXERCISE_COUNT}
                className="mt-2 h-11 rounded-card border border-accent/50 bg-surface text-sm font-extrabold text-accent disabled:opacity-50"
              >
                오늘 계획으로 저장만 하기
              </button>
            )}
          </div>
        </>
      ) : (
        /*
          하는 화면 — 전체화면 하나만 뜬다. 20초가 지나면 스스로 다음 종목으로
          넘어가고 음원이 끝나면 스스로 기록된다. 누를 것은 일시정지와 중단뿐이다.
        */
        <IntervalSessionOverlay
          open
          exerciseNames={picked.map((item) => item.name)}
          exerciseIds={picked.map((item) => item.id)}
          minutes={minutes}
          elapsedSeconds={elapsed}
          paused={paused}
          onTogglePause={togglePause}
          onStop={requestStop}
        />
      )}

      {confirmStop && phase === "playing" && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="interval-stop-dialog"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-5"
        >
          <div className="w-full max-w-sm rounded-card border border-line bg-surface p-5">
            <p className="text-[15px] font-extrabold leading-snug">
              {inSession ? INTERVAL_COPY.leaveConfirm : INTERVAL_COPY.stopConfirm}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="interval-stop-cancel"
                onClick={() => setConfirmStop(false)}
                className="min-h-12 rounded-card border border-line bg-surface-2 text-sm font-extrabold"
              >
                계속하기
              </button>
              <button
                type="button"
                data-testid="interval-stop-confirm"
                onClick={() => void stop()}
                className="min-h-12 rounded-card bg-warn text-sm font-extrabold text-black"
              >
                {inSession ? INTERVAL_COPY.leave : "중단하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        지난 기록·내 루틴으로도 구성 운동을 채운다 (2026-08-05).
        예전에는 pastSessions={[]}를 넘겨 '지난 기록' 탭이 늘 비어 있었다 —
        타바타를 할 때마다 카탈로그에서 4개를 새로 찾아야 했다.
        기록 탭이 이미 들고 있는 목록을 넘길 뿐이라 새 질의는 없다.
      */}
      <ExercisePicker
        open={pickerOpen}
        catalog={pickerCatalog}
        /*
          **언제나 종목 목록으로 연다** (사용자 지적 2026-08-13).

          기본값 `hub`로 열면 검색·상황별·부위별 카드가 나오는데, 여기까지 온
          사람은 그 화면을 방금 지나왔다 — 같은 화면이 반복되는 것으로 보인다.
          게다가 목록은 이미 **맨몸만** 걸러져 있어(`pickerCatalog`) 부위별로
          한 번 더 좁힐 이유도 적다.

          ⚠️ 지난 기록·내 루틴으로 지난번 구성을 부르는 길은 목록 화면의
             뒤로 가기 한 번이면 닿는다 — 없앤 것이 아니라 한 단계 뒤로 뺐다.
        */
        initialMode="search"
        // 기본 제목은 '운동 계획하기'다 — 여기는 인터벌 종목을 고르는 자리라 따로 이름을 준다
        heading={{ title: "인터벌 운동 고르기", sub: "" }}
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
        // 세트는 코스가 정한다 — `세트 조절`을 내면 정한 값이 조용히 버려진다
        setupAdjustable={false}
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
