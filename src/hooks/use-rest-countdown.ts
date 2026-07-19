import { useCallback, useEffect, useRef, useState } from "react";

import { getRestCountdownBeep } from "@/lib/domain/rest-countdown";
import { playRestCountdownBeep } from "@/lib/rest-countdown-audio";

type RestState = {
  generation: number;
  remainingSeconds: number;
  sourceKey: string;
};

export function useRestCountdown(
  active: boolean,
  onRestComplete: () => void,
) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [restGeneration, setRestGeneration] = useState(0);
  const [previousActive, setPreviousActive] = useState(active);
  const restRef = useRef<RestState | null>(null);
  const generationRef = useRef(0);
  const onRestCompleteRef = useRef(onRestComplete);
  const playedBeepRef = useRef<string | null>(null);

  if (active !== previousActive) {
    setPreviousActive(active);
    if (!active) setRemainingSeconds(null);
  }

  useEffect(() => {
    onRestCompleteRef.current = onRestComplete;
  }, [onRestComplete]);

  const stopRest = useCallback(() => {
    generationRef.current += 1;
    restRef.current = null;
    playedBeepRef.current = null;
    setRestGeneration(generationRef.current);
    setRemainingSeconds(null);
  }, []);

  const startRest = useCallback((sourceKey: string, seconds: number) => {
    const rest: RestState = {
      generation: generationRef.current + 1,
      remainingSeconds: seconds,
      sourceKey,
    };
    generationRef.current = rest.generation;
    restRef.current = rest;
    playedBeepRef.current = null;
    setRestGeneration(rest.generation);
    setRemainingSeconds(seconds);
  }, []);

  const extendRest = useCallback(() => {
    const current = restRef.current;
    if (!current) return;

    const rest: RestState = {
      ...current,
      generation: generationRef.current + 1,
      remainingSeconds: current.remainingSeconds + 30,
    };
    generationRef.current = rest.generation;
    restRef.current = rest;
    playedBeepRef.current = null;
    setRestGeneration(rest.generation);
    setRemainingSeconds(rest.remainingSeconds);
  }, []);

  const cancelRestForSource = useCallback(
    (sourceKey: string) => {
      if (restRef.current?.sourceKey === sourceKey) stopRest();
    },
    [stopRest],
  );

  useEffect(() => {
    if (active) return;
    generationRef.current += 1;
    restRef.current = null;
    playedBeepRef.current = null;
  }, [active]);

  useEffect(() => {
    const current = restRef.current;
    if (!active || !current || current.remainingSeconds !== remainingSeconds) {
      return;
    }

    const scheduledGeneration = current.generation;
    const timeout = setTimeout(() => {
      if (
        generationRef.current !== scheduledGeneration ||
        restRef.current !== current
      ) {
        return;
      }

      if (current.remainingSeconds <= 1) {
        generationRef.current += 1;
        restRef.current = null;
        setRemainingSeconds(null);
        onRestCompleteRef.current();
        return;
      }

      const nextRest = {
        ...current,
        remainingSeconds: current.remainingSeconds - 1,
      };
      restRef.current = nextRest;
      setRemainingSeconds(nextRest.remainingSeconds);
    }, 1_000);

    return () => clearTimeout(timeout);
  }, [active, remainingSeconds, restGeneration]);

  useEffect(() => {
    const current = restRef.current;
    if (!active || !current || current.remainingSeconds !== remainingSeconds) {
      return;
    }

    const beep = getRestCountdownBeep(remainingSeconds);
    if (!beep) return;

    const beepKey = `${current.generation}:${remainingSeconds}`;
    if (playedBeepRef.current === beepKey) return;

    playedBeepRef.current = beepKey;
    playRestCountdownBeep(beep);
  }, [active, remainingSeconds, restGeneration]);

  return {
    remainingSeconds: active ? remainingSeconds : null,
    startRest,
    extendRest,
    stopRest,
    cancelRestForSource,
  };
}
