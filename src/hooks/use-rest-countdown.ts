import { useCallback, useEffect, useRef, useState } from "react";

import {
  getRestCompletionCatchUpBeep,
  getRestCountdownBeep,
} from "@/lib/domain/rest-countdown";
import {
  playRestCountdownBeep,
  prepareRestCountdownAudio,
} from "@/lib/rest-countdown-audio";

/**
 * 휴식은 **종료 시각(endsAtMs)** 으로 관리한다 (2026-08-01).
 *
 * 예전에는 setTimeout을 1초씩 이어 붙이며 남은 초를 하나씩 깎았다. 남은 시간의
 * 근거가 "타이머가 몇 번 깨어났는가"였기 때문에, 다른 앱을 쓰는 동안 브라우저가
 * 백그라운드 타이머를 늦추면 카운트다운이 그만큼 멈춰 섰다(90초 휴식이 5분이 됐다).
 * 이제 남은 초는 매 틱마다 종료 시각에서 계산하므로 앱이 앞에 있든 없든 실제
 * 시간대로 흐른다.
 */
type RestState = {
  generation: number;
  endsAtMs: number;
  sourceKey: string;
};

function remainingFrom(rest: RestState, nowMs: number): number {
  return Math.max(0, Math.ceil((rest.endsAtMs - nowMs) / 1000));
}

export function useRestCountdown(
  active: boolean,
  onRestComplete: () => void,
) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  // 마지막으로 시작된 휴식의 종료 시각. 휴식이 끝난 뒤에도 남겨 둔다 —
  // 무동작 감지가 "휴식이 끝난 시점부터 5분"을 세는 데 쓴다 (2026-08-01).
  const [lastRestEndsAtMs, setLastRestEndsAtMs] = useState<number | null>(null);
  const [restGeneration, setRestGeneration] = useState(0);
  const [previousActive, setPreviousActive] = useState(active);
  const restRef = useRef<RestState | null>(null);
  const generationRef = useRef(0);
  const onRestCompleteRef = useRef(onRestComplete);
  const playedBeepRef = useRef<string | null>(null);
  // 마지막 1초 비프를 냈는지 — 백그라운드에서 건너뛴 채 끝났는지 판정한다.
  const playedFinalBeepRef = useRef(false);

  if (active !== previousActive) {
    setPreviousActive(active);
    if (!active) setRemainingSeconds(null);
  }

  useEffect(() => {
    onRestCompleteRef.current = onRestComplete;
  }, [onRestComplete]);

  const clearRestRefs = useCallback(() => {
    generationRef.current += 1;
    restRef.current = null;
    playedBeepRef.current = null;
    playedFinalBeepRef.current = false;
  }, []);

  const stopRest = useCallback(() => {
    clearRestRefs();
    setRestGeneration(generationRef.current);
    setRemainingSeconds(null);
    // 건너뛰기·취소는 그 자체가 동작이므로 남은 휴식 구간을 봐주지 않는다.
    setLastRestEndsAtMs(null);
  }, [clearRestRefs]);

  const startRest = useCallback((sourceKey: string, seconds: number) => {
    const rest: RestState = {
      generation: generationRef.current + 1,
      endsAtMs: Date.now() + seconds * 1_000,
      sourceKey,
    };
    generationRef.current = rest.generation;
    restRef.current = rest;
    playedBeepRef.current = null;
    playedFinalBeepRef.current = false;
    setRestGeneration(rest.generation);
    setRemainingSeconds(seconds);
    setLastRestEndsAtMs(rest.endsAtMs);
  }, []);

  const extendRest = useCallback(() => {
    const current = restRef.current;
    if (!current) return;

    const rest: RestState = {
      ...current,
      generation: generationRef.current + 1,
      endsAtMs: current.endsAtMs + 30_000,
    };
    generationRef.current = rest.generation;
    restRef.current = rest;
    playedBeepRef.current = null;
    playedFinalBeepRef.current = false;
    setRestGeneration(rest.generation);
    setRemainingSeconds(remainingFrom(rest, Date.now()));
    setLastRestEndsAtMs(rest.endsAtMs);
  }, []);

  const cancelRestForSource = useCallback(
    (sourceKey: string) => {
      if (restRef.current?.sourceKey === sourceKey) stopRest();
    },
    [stopRest],
  );

  /** 종료 시각 기준으로 남은 초를 다시 계산한다. 틱과 앱 복귀에서 함께 쓴다. */
  const syncRest = useCallback(() => {
    const current = restRef.current;
    if (!current) return;

    const next = remainingFrom(current, Date.now());
    if (next > 0) {
      setRemainingSeconds(next);
      return;
    }

    // 자리를 비운 사이 끝났으면 5·4·3·2·1을 건너뛴 것이므로 여기서 한 번 알린다.
    const catchUp = getRestCompletionCatchUpBeep(playedFinalBeepRef.current);
    clearRestRefs();
    setRestGeneration(generationRef.current);
    setRemainingSeconds(null);
    if (catchUp) playRestCountdownBeep(catchUp);
    onRestCompleteRef.current();
  }, [clearRestRefs]);

  useEffect(() => {
    if (active) return;
    generationRef.current += 1;
    restRef.current = null;
    playedBeepRef.current = null;
    playedFinalBeepRef.current = false;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(syncRest, 1_000);
    return () => clearInterval(timer);
  }, [active, syncRest]);

  // 다른 앱을 쓰다 돌아왔을 때: 오디오 컨텍스트를 되살리고 남은 시간을 즉시 맞춘다.
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!restRef.current) return;
      prepareRestCountdownAudio();
      syncRest();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [active, syncRest]);

  useEffect(() => {
    const current = restRef.current;
    if (!active || !current || remainingSeconds === null) return;

    const beep = getRestCountdownBeep(remainingSeconds);
    if (!beep) return;

    const beepKey = `${current.generation}:${remainingSeconds}`;
    if (playedBeepRef.current === beepKey) return;

    playedBeepRef.current = beepKey;
    if (remainingSeconds === 1) playedFinalBeepRef.current = true;
    playRestCountdownBeep(beep);
  }, [active, remainingSeconds, restGeneration]);

  return {
    remainingSeconds: active ? remainingSeconds : null,
    lastRestEndsAtMs: active ? lastRestEndsAtMs : null,
    startRest,
    extendRest,
    stopRest,
    cancelRestForSource,
  };
}
