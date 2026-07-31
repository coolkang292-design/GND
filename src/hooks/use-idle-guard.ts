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
    });
  }, []);

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
    totalPausedSeconds,
  };
}
