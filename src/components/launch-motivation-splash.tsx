"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  launchSplashGate,
  type LaunchSplashStorage,
} from "@/lib/domain/launch-splash";

const DISPLAY_MS = 1_500;
const FADE_MS = 180;
const MAX_BLOCK_MS = 3_000;

type Phase =
  | "checking"
  | "loading"
  | "showing"
  | "fallback"
  | "fading"
  | "hidden";

export function LaunchMotivationSplash() {
  const [phase, setPhase] = useState<Phase>("checking");
  const decisionTimer = useRef<number | null>(null);
  const displayTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);
  const displayStarted = useRef(false);
  const dismissing = useRef(false);

  const clearTimers = useCallback(() => {
    for (const timer of [
      decisionTimer,
      displayTimer,
      fadeTimer,
      safetyTimer,
    ]) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, []);

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;

    if (displayTimer.current !== null) {
      window.clearTimeout(displayTimer.current);
      displayTimer.current = null;
    }
    if (safetyTimer.current !== null) {
      window.clearTimeout(safetyTimer.current);
      safetyTimer.current = null;
    }

    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reducedMotion) {
      setPhase("hidden");
      return;
    }

    setPhase("fading");
    fadeTimer.current = window.setTimeout(() => setPhase("hidden"), FADE_MS);
  }, []);

  useEffect(() => {
    decisionTimer.current = window.setTimeout(() => {
      if (dismissing.current) return;

      let storage: LaunchSplashStorage | null = null;
      try {
        storage = window.sessionStorage;
      } catch {
        storage = null;
      }

      if (!launchSplashGate.claim(storage)) {
        setPhase("hidden");
        return;
      }

      setPhase("loading");
      safetyTimer.current = window.setTimeout(() => {
        dismissing.current = true;
        setPhase("hidden");
      }, MAX_BLOCK_MS);
    }, 0);

    return clearTimers;
  }, [clearTimers]);

  function startDisplay(nextPhase: "showing" | "fallback") {
    if (dismissing.current || displayStarted.current) return;
    displayStarted.current = true;
    setPhase(nextPhase);
    displayTimer.current = window.setTimeout(dismiss, DISPLAY_MS);
  }

  if (phase === "hidden") return null;

  const imageVisible = phase === "showing" || phase === "fading";

  return (
    <button
      type="button"
      aria-label="시작 화면 건너뛰기"
      aria-describedby="launch-splash-description"
      onClick={dismiss}
      className={`fixed inset-0 z-[100] overflow-hidden bg-bg p-0 text-left transition-opacity duration-200 motion-reduce:transition-none ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      {phase !== "checking" && (
        <Image
          data-testid="launch-splash-image"
          src="/splash/gnd-launch-motivation.png"
          alt=""
          fill
          priority
          sizes="100vw"
          onLoad={() => startDisplay("showing")}
          onError={() => startDisplay("fallback")}
          className={`object-cover object-center transition-opacity duration-200 ${
            imageVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      <span id="launch-splash-description" className="sr-only">
        GND. 오늘의 한 번이, 몸을 바꾼다.
      </span>

      {phase === "fallback" && (
        <span
          data-testid="launch-splash-copy"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 opacity-100"
        >
          <span className="text-4xl font-black tracking-[0.28em] text-accent">
            GND
          </span>
          <span className="text-center text-3xl font-black leading-tight text-text">
            <span className="block">오늘의 한 번이,</span>
            <span className="block text-accent">몸을 바꾼다.</span>
          </span>
        </span>
      )}
    </button>
  );
}
