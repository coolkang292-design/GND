"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  launchSplashGate,
  type LaunchSplashStorage,
} from "@/lib/domain/launch-splash";
import { BrandWordmark } from "@/components/brand/entry";
import { BRAND_ENTRY_COPY as COPY } from "@/lib/domain/brand-copy";

/**
 * 시작 화면 그림 (2026-10-06 사용자 지시 "B로 고치기").
 *
 * ⚠️ **글자 없는 사진**이다. 바로 전 판(`/splash/gnd-launch-original-approved-v8.webp`)은
 *    문구가 박힌 420×670 통짜 이미지라 ① 사용자 교정본(`더 나은 나를`)을 반영할 수 없었고
 *    ② 폰에서 흐렸고 ③ 화면 비율이 달라 위아래에 검은 띠가 생겼다. 지금은 Codex 패키지의
 *    글자 없는 사진(860×1859)을 꽉 채우고, 로고·슬로건·문구는 **실제 글자**로 올린다.
 * ⚠️ 860px을 쓰는 이유: 이 화면은 앱 진입을 최대 2초 막는다 — 1280px(318KB)보다 가벼운
 *    860px(약 200KB)이 그 안에 들어올 확률이 높다.
 */
const SPLASH_PHOTO = "/gnd/photos/onboarding-sweat-860.webp";

const DISPLAY_MS = 1_500;
const FADE_MS = 180;
const MAX_BLOCK_MS = 2_000;

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

  /**
   * 사진이 **이미 받아진 채로** 붙으면 `onLoad`가 오지 않는다 (2026-10-06 개발 서버 실측 —
   * 새로고침하면 캐시에서 즉시 차서 complete=true인데 화면은 2초 안전장치까지 검은 채였다).
   * 불러오기 단계에 들어서면 한 번 직접 확인한다.
   */
  useEffect(() => {
    if (phase !== "loading") return;
    // ⚠️ `next/image`에 ref를 붙이지 마라 — 붙였더니 Next 내부의 로딩 감지가 끊겨 `onLoad`도
    //    안 와서 사진이 영영 안 떴다(2026-10-06 실측). DOM에서 직접 찾는다.
    const img = document.querySelector<HTMLImageElement>('[data-testid="launch-splash-image"]');
    if (img?.complete) {
      queueMicrotask(() => startDisplay(img.naturalWidth > 0 ? "showing" : "fallback"));
    }
    // startDisplay는 ref만 만지는 함수라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
        /*
          ⚠️ 사진은 **375:667 상자 안**에 넣어 화면 **아래에 붙인다** (2026-10-06 사용자 지시
          "두 번째 사진(375×667)으로 통일"). 화면을 꽉 채우면 길쭉한 폰(390×844)에서는 사진이
          통째로 들어가 인물이 작아지고, 어색한 손·밧줄이 문구 위로 드러났다. 상자 비율을 고정하면
          어떤 폰에서도 인물 크기와 문구 위치가 같고, 남는 위쪽은 로고가 놓이는 어두운 바탕이 된다.
          화면이 상자보다 짧으면 상자 위쪽이 잘린다(인물은 `object-[42%_30%]`라 남는다).
        */
        <span aria-hidden className="absolute inset-x-0 bottom-0 block aspect-[375/667] w-full">
          {/* ⚠️ `next/image`가 아니라 기본 `<img>`다 (2026-10-06 개발 서버 실측). `next/image`로는
              사진이 다 받아져도(complete) `onLoad`가 오지 않아 2초 안전장치까지 검은 화면이었다.
              변환 서버를 안 쓰는(unoptimized) 단일 사진이라 `next/image`로 얻는 것이 없다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="launch-splash-image"
            src={SPLASH_PHOTO}
            alt=""
            decoding="async"
            fetchPriority="high"
            onLoad={() => startDisplay("showing")}
            onError={() => startDisplay("fallback")}
            // 인물(여성 얼굴·뒤 남성)이 잘리지 않게 위쪽 30% 지점을 기준으로 채운다
            className={`absolute inset-0 h-full w-full object-cover object-[42%_30%] transition-opacity duration-200 ${
              imageVisible ? "opacity-100" : "opacity-0"
            }`}
          />
          {/* 상자 윗변이 칼같이 끊기지 않게 바탕색으로 녹인다(길쭉한 폰에서만 보인다) */}
          <span className="absolute inset-x-0 top-0 block h-28 bg-gradient-to-b from-bg to-transparent" />
        </span>
      )}

      {/* 로고 자리·문구 자리의 대비 — 사진 위아래를 어둡게 누른다(지침 §온보딩) */}
      {(imageVisible || phase === "fallback") && (
        <span
          data-testid="launch-splash-copy"
          className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between"
          style={{
            paddingTop: "max(2.25rem, calc(env(safe-area-inset-top) + 1.25rem))",
            // 문구 블록을 조금 올려 사진의 손·밧줄 구간을 덮는다(위 그라데이션 주석)
            paddingBottom: "max(4.5rem, calc(env(safe-area-inset-bottom) + 3.5rem))",
          }}
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-[34%] bg-gradient-to-b from-bg/85 via-bg/35 to-transparent" />
          {/* ⚠️ 아래 그라데이션이 화면 **68%**까지 올라온다 (2026-10-06 사용자 지적 "손·밧줄 부분이
              부자연스럽다" → "텍스트를 키워서 덮어라"). 생성 사진의 손·밧줄이 어색해서 큰 문구와
              진한 그라데이션으로 그 구간을 가린다. 줄이면 그 부분이 다시 드러난다. */}
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[68%] bg-gradient-to-t from-bg via-bg/92 via-55% to-transparent" />

          {/* 위: 워드마크 + 오른쪽 슬로건 — 온보딩·로그인과 한 벌(`brand/entry.tsx`) */}
          <span className="relative block px-6">
            <BrandWordmark slogan />
          </span>

          {/* 아래: 헤드라인 3줄(마지막 라임) + 보조 문구 2줄 */}
          <span className="relative block px-6">
            {COPY.headline.map((line, i) => (
              <span
                key={line}
                // ⚠️ 한 줄 고정(`whitespace-nowrap`) — 11.5vw에서 `날에도`의 `도`가 다음 줄로 떨어졌다.
                //    10vw면 375~430px에서 가장 긴 줄(`의지가 꺾인 날에도`)이 좌우 24px 안에 들어간다.
                className={`block whitespace-nowrap text-[clamp(2.05rem,10vw,2.7rem)] leading-[1.1] font-black italic tracking-[-0.05em] ${
                  i === COPY.headline.length - 1 ? "text-accent" : "text-text"
                }`}
              >
                {line}
              </span>
            ))}
            <span className="mt-5 block text-[16.5px] leading-[1.55] font-medium text-text/90">
              {COPY.subcopy.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </span>
        </span>
      )}

      <span
        id="launch-splash-description"
        data-testid="launch-splash-description"
        className="sr-only"
      >
        {COPY.headline.join(" ")}
      </span>
    </button>
  );
}
