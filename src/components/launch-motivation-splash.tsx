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
  const copyVisible = imageVisible || phase === "fallback";

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
          src="/splash/gnd-launch-motivation-v3.png"
          alt=""
          fill
          priority
          sizes="(max-width: 430px) 100vw, 430px"
          onLoad={() => startDisplay("showing")}
          onError={() => startDisplay("fallback")}
          className={`object-contain object-center transition-opacity duration-200 ${
            imageVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      <span
        data-testid="launch-splash-copy"
        className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-200 ${
          copyVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {phase === "fallback" && (
          <span
            className="absolute inset-x-0 top-0 block text-center text-4xl font-black tracking-[0.28em] text-accent"
            style={{ paddingTop: "max(3rem, env(safe-area-inset-top))" }}
          >
            GND
          </span>
        )}
        <span
          id="launch-splash-description"
          className="absolute inset-x-0 bottom-0 block px-7 text-center"
          style={{
            paddingBottom:
              "max(4rem, calc(env(safe-area-inset-bottom) + 3rem))",
          }}
        >
          <span
            className="relative inline-block origin-center text-[clamp(1.8rem,7.5vw,2.4rem)] font-black leading-[1.04] tracking-[-0.055em] text-text"
            style={{ transform: "skewX(-8deg) scaleX(0.9)" }}
          >
            <span aria-hidden className="absolute -left-7 top-1 block">
              <span className="mb-1.5 block h-1 w-5 bg-accent" />
              <span className="mb-1.5 ml-2 block h-1 w-4 bg-accent/70" />
              <span className="ml-1 block h-1 w-3 bg-accent/45" />
            </span>
            <span className="block">지금은 같은 출발선.</span>
            <span className="mt-1 block text-[0.7em] text-accent">
              1년 뒤, 프로와 아마추어가 갈린다.
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}
