import { useCallback, useEffect, useRef, useState } from "react";

import {
  accumulatedPausedSeconds,
  idlePauseStartMs,
  isIdleTimedOut,
} from "@/lib/domain/idle-guard";

export type IdleGuardSnapshot = {
  pausedSeconds: number;
  pausedAtMs: number | null;
  lastActivityMs: number | null;
  pauseReason?: "manual" | "idle" | null;
};

type UseIdleGuardInput = {
  /** 운동이 진행 중인가 */
  active: boolean;
  /** 이 세션에 무동작 감지를 적용하는가 (유산소 전용·타바타면 false) */
  guarded: boolean;
  /** 마지막으로 시작된 휴식의 종료 시각 — 휴식 구간은 무동작으로 세지 않는다 */
  lastRestEndsAtMs: number | null;
  snapshot: IdleGuardSnapshot;
  /** draft에 반영 — 새로고침·앱 재시작에도 정지 상태가 유지돼야 한다 */
  onChange: (next: IdleGuardSnapshot) => void;
};

/**
 * 무동작 감지 (설계 2026-08-01).
 *
 * 판정은 전부 벽시계 기준이라 다른 앱에 있다 돌아와도 그 자리에서 잡힌다.
 * 상태는 draft(localStorage)에 있으므로 새로고침해도 정지가 풀리지 않는다.
 */
export function useIdleGuard({
  active,
  guarded,
  lastRestEndsAtMs,
  snapshot,
  onChange,
}: UseIdleGuardInput) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const snapshotRef = useRef(snapshot);
  const onChangeRef = useRef(onChange);

  // 틱·이벤트 핸들러가 최신 값을 보게 한다. effect는 다음 틱(1초)보다 훨씬 먼저
  // 도므로 지연이 문제되지 않는다.
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const paused = active && snapshot.pausedAtMs !== null;

  /**
   * 사용자가 무언가 했다 — 무동작 시계를 지금부터 다시 센다.
   *
   * 운동 시작 **전**(준비 중)에는 세지 않는다. 운동을 준비하다 시작하면
   * 무동작 시계가 준비 시점부터 흐르고 있어서, 시작하자마자 정지되는 일이
   * 있었다(2026-08-01 개발 서버 확인에서 발견).
   */
  const markActivity = useCallback(() => {
    if (!active) return;
    if (snapshotRef.current.pausedAtMs !== null) return; // 정지 중엔 모달로만 푼다
    onChangeRef.current({
      ...snapshotRef.current,
      lastActivityMs: Date.now(),
    });
  }, [active]);

  /** [이어서 운동] — 정지 구간을 누적하고 무동작 시계를 다시 시작한다 */
  const resumeFromPause = useCallback(() => {
    const current = snapshotRef.current;
    if (current.pausedAtMs === null) return;
    const now = Date.now();
    onChangeRef.current({
      pausedSeconds: accumulatedPausedSeconds({
        pausedSeconds: current.pausedSeconds,
        pausedAtMs: current.pausedAtMs,
        nowMs: now,
      }),
      pausedAtMs: null,
      lastActivityMs: now,
      pauseReason: null,
    });
  }, []);

  /** 수동 일시정지는 유산소라도 즉시 세션 전체 시간에 적용한다. */
  const pauseManually = useCallback(() => {
    if (!active) return;
    const current = snapshotRef.current;
    if (current.pausedAtMs !== null) return;
    const next: IdleGuardSnapshot = {
      ...current,
      pausedAtMs: Date.now(),
      pauseReason: "manual",
    };
    snapshotRef.current = next;
    onChangeRef.current(next);
  }, [active]);

  /** 종료 시 서버로 보낼 누적 정지 시간 — 정지 중이면 그 구간까지 포함한다 */
  const totalPausedSeconds = useCallback(
    () =>
      accumulatedPausedSeconds({
        pausedSeconds: snapshotRef.current.pausedSeconds,
        pausedAtMs: snapshotRef.current.pausedAtMs,
        nowMs: Date.now(),
      }),
    [],
  );

  // 운동을 시작하는 순간을 첫 동작으로 삼는다. 이미 값이 있으면(새로고침으로
  // 복구된 진행 중 운동) 건드리지 않는다 — 새로고침으로 정지를 피할 수 없어야 한다.
  useEffect(() => {
    if (!active || snapshotRef.current.lastActivityMs !== null) return;
    onChangeRef.current({
      ...snapshotRef.current,
      lastActivityMs: Date.now(),
    });
  }, [active]);

  /*
    감지가 **꺼져 있다 켜지는 순간** 무동작 시계를 그 시각부터 다시 센다
    (2026-11-25, 8분 인터벌이 5분으로 기록된 사고).

    감지가 꺼진 동안은 마지막 동작 시각이 그대로 얼어 있다. 인터벌 음원이 끝나면
    앱이 블록 세트를 한꺼번에 완료로 바꾸는데(사람의 동작이 아니다) 그 순간 감지가
    켜지고, 얼어 있던 "마지막 동작 = 시작 시각"을 읽어 **정지 시작을 5분 지점으로
    거꾸로 찍었다.** 8분 코스는 약 200초, 16분 코스는 약 11분이 운동 시간에서 빠진다.

    꺼져 있던 구간은 정의상 판정하지 않던 시간이다 — 켜지는 순간이 새 출발점이다.
    ⚠️ 이미 정지 중이면(pausedAtMs) 건드리지 않는다: 새로고침·감지 토글로 정지를
    피할 수 없어야 한다. 처음부터 켜진 채 마운트된 경우도 건드리지 않는다
    (복구된 draft의 마지막 동작 시각을 지키려고 ref를 현재 값으로 시작한다).
    이 effect는 아래 틱 effect보다 **먼저** 선언해야 한다 — 같은 렌더에서 틱의
    첫 check()가 갱신된 시각을 읽는다.
  */
  const wasGuardedRef = useRef(guarded);
  useEffect(() => {
    const turnedOn = guarded && !wasGuardedRef.current;
    wasGuardedRef.current = guarded;
    if (!turnedOn || !active) return;
    if (snapshotRef.current.pausedAtMs !== null) return;
    const next = { ...snapshotRef.current, lastActivityMs: Date.now() };
    snapshotRef.current = next;
    onChangeRef.current(next);
  }, [active, guarded]);

  // 1초 틱 — 화면 갱신 + 무동작 판정. 백그라운드에서 늦어져도 판정은 벽시계라
  // 돌아온 첫 틱(또는 visibilitychange)에서 그대로 잡힌다.
  useEffect(() => {
    if (!active) return;

    const check = () => {
      const now = Date.now();
      setNowMs(now);

      const current = snapshotRef.current;
      if (!guarded || current.pausedAtMs !== null) return;
      if (current.lastActivityMs === null) return;
      if (
        !isIdleTimedOut({
          lastActivityMs: current.lastActivityMs,
          lastRestEndsAtMs,
          nowMs: now,
        })
      ) {
        return;
      }

      // 정지 시작 시각은 "지금"이 아니라 **임계값을 넘긴 그 순간**이다.
      // 자리를 비운 20분 중 앞의 5분은 정상 운동 시간으로 인정한다.
      onChangeRef.current({
        ...current,
        pausedAtMs: idlePauseStartMs(current.lastActivityMs, lastRestEndsAtMs),
        pauseReason: "idle",
      });
    };

    check();
    const timer = setInterval(check, 1_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, guarded, lastRestEndsAtMs]);

  return {
    /** 지금 정지 중인가 — 모달을 띄우는 조건 */
    paused,
    /** 화면 갱신용 현재 시각 (경과 시간 표시가 이 값으로 다시 그려진다) */
    nowMs,
    markActivity,
    resumeFromPause,
    pauseManually,
    totalPausedSeconds,
  };
}
