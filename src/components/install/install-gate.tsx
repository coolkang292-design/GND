"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { hasLinkedIdentity } from "@/lib/identity";
import {
  decideGuide,
  detectInstallEnv,
  isStandaloneDisplay,
  readOfferState,
  recordDismiss,
  recordDone,
  type InstallEnv,
} from "@/lib/domain/install-prompt";

import { InstallSheet, type SheetVariant } from "./install-sheet";

/**
 * **홈 화면 설치 안내를 언제 띄울지 정하는 곳** (계획서
 * `docs/superpowers/plans/2026-08-21-pwa-install-prompt-pipeline.md`).
 *
 * ⚠️ **루트 레이아웃에 둔다. `(tabs)` 안이 아니다.** 로그인 직후의 착지점은
 *    보통 `/record`(탭 안)지만, 초대를 들고 온 사람은 `/challenge`로, 신원을
 *    연결한 사람은 `/account`로 간다. 탭 안에만 두면 그 경로들에서 안 뜬다.
 *
 * ── 왜 전부 "로그인 뒤"인가 ──────────────────────────────────
 * ⚠️ 탈출 안내든 설치 안내든 **신원이 붙은 뒤에만** 띄운다. 두 가지 이유다.
 *
 *  1. **익명 계정에 설치를 밀면 기록이 갈린다.** 설치본에서 그 계정으로 돌아올
 *     방법이 없다.
 *  2. **아직 앱을 못 본 사람은 안내를 안 듣는다** (2026-08-21 사장님 결정).
 *     카톡 링크를 처음 누른 사람에게 첫 화면부터 "사파리로 옮기세요"를 띄우면
 *     그냥 나간다. iOS는 이 순서 때문에 로그인이 한 번 늘지만(카톡·사파리·
 *     설치본), 그건 **카카오 버튼 한 번**이고 계정도 같다 — 훨씬 싼 비용이다.
 */

/** 크롬이 설치 가능 시점에 던지는 이벤트 — 표준 타입에 아직 없다 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * **내 정보 탭에서 직접 열 때 쓰는 신호.**
 *
 * ⚠️ 게이트는 루트 레이아웃에 한 벌만 있다. 시트를 여는 동작(안드로이드
 *    `prompt()`·주소 복사·크롬 인텐트)을 다른 화면이 복사하면 두 벌이 갈린다.
 *    화면은 "열어라"만 보내고 실제 동작은 여기 한 곳에 둔다.
 */
export const OPEN_INSTALL_GUIDE_EVENT = "gnd:open-install-guide";

/**
 * 세션당 1회 — 화면을 옮길 때마다 다시 뜨는 것을 막는다.
 *
 * ⚠️⚠️ **표식은 "띄울 때"가 아니라 "사용자가 닫을 때" 남긴다** (2026-08-22 수정).
 *    처음엔 띄우는 순간 남겼는데, 그러면 **사용자가 아무 버튼도 누르기 전에**
 *    페이지가 한 번 더 로드되는 순간(사파리가 다시 여는 경우·새로고침·복원)
 *    표식만 남고 시트는 사라져 그 세션에서 영영 안 뜬다. 사장님 실기기에서
 *    *"설치 화면이 잠깐 떴다가 사라지고 기록화면으로 랜딩"* 으로 나타났다.
 *
 *    표식은 **사람이 봤다는 증거**여야 한다. 렌더는 증거가 아니다.
 */
const SESSION_ESCAPE = "gnd:install:escape-shown";

function sessionSeen(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSessionSeen(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // 저장소가 막혀도 이번 화면에서는 상태로 닫힌다
  }
}

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function escapeVariant(env: InstallEnv): SheetVariant | null {
  if (env === "inapp-ios") return "escape-ios";
  if (env === "inapp-android") return "escape-android";
  if (env === "ios-other") return "escape-ios-other";
  return null;
}

function installVariant(env: InstallEnv): SheetVariant | null {
  if (env === "ios-safari") return "install-ios";
  if (env === "android-prompt") return "install-android-prompt";
  if (env === "android-manual") return "install-android-manual";
  return null;
}

export function InstallGate() {
  const { userId, loading } = useAuth();
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [variant, setVariant] = useState<SheetVariant | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  /** 한 번 결정하면 다시 판정하지 않는다 — 이벤트가 늦게 와도 두 번 뜨지 않게 */
  const decided = useRef(false);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      // ⚠️ 막아야 크롬이 자기 배너를 안 띄운다. 우리 시트와 겹치면 사용자가
      //    같은 말을 두 번 듣는다.
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    if (loading || decided.current) return;

    let cancelled = false;
    void (async () => {
      const env = detectInstallEnv({
        userAgent: navigator.userAgent,
        standalone: isStandaloneDisplay(window),
        hasPromptEvent: promptEvent !== null,
      });
      if (env === "installed" || env === "desktop") return;

      // 익명 계정인지 신원이 붙었는지.
      //
      // ⚠️⚠️ **네트워크를 타는 `getMyIdentities()`를 쓰면 안 된다** (2026-08-22).
      //    그건 `/auth/v1/user`를 호출해서, 느리거나 실패하면 "신원 없음"이 되고
      //    안내가 **떴다 안 떴다** 한다. 카톡 → 사파리로 막 넘어온 순간이 네트워크가
      //    가장 불안정한데 하필 그때가 이 안내를 띄워야 하는 순간이다.
      //    세션은 이미 로컬에 있다 — 물어보지 말고 읽는다.
      let linked = false;
      if (userId) {
        try {
          linked = await hasLinkedIdentity();
        } catch {
          // ⚠️ **"모른다"는 "안 붙었다"가 아니다.** 여기서 false로 밀면 신원이
          //    멀쩡히 붙은 사람에게 "먼저 로그인해 주세요"라는 **틀린 말**을 한다.
          //    아무 말도 안 하고 다음 기회로 넘긴다.
          return;
        }
      }
      if (cancelled) return;

      const kind = decideGuide({
        env,
        linked,
        state: readOfferState(localStore()),
        now: Date.now(),
      });
      if (kind === "none") return;

      // ⚠️ 세션 표식은 **탈출 안내에만** 쓴다.
      //
      //    탈출 안내는 닫아도 저장소에 이력을 안 남긴다(카톡에 다시 들어올 때마다
      //    필요하니까). 그래서 같은 세션에서 반복 노출을 막을 것이 세션 표식뿐이다.
      //
      //    설치·로그인 안내는 다르다. 닫으면 저장소에 유예가 남으므로 세션 표식이
      //    **중복**이고, 사파리 탭은 며칠씩 살아 있어서 유예가 지난 뒤에도 계속
      //    막는 **숨은 빗장**이 된다(2026-08-22, 앱을 지우고 다시 해도 안 뜬 원인).
      if (kind === "escape" && sessionSeen(SESSION_ESCAPE)) return;

      const v =
        kind === "escape"
          ? escapeVariant(env)
          : kind === "login-first"
            ? ("login-first" as const)
            : installVariant(env);
      if (!v) return;
      decided.current = true;
      setVariant(v);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, userId, promptEvent]);

  /**
   * **내 정보 탭에서 직접 열었다** — 닫기 이력을 보지 않는다.
   *
   * ⚠️ "다 했어요"를 한 번 누르면 자동 안내가 영영 안 뜬다. 실제로 그 상태에
   *    갇힌 일이 있었다(사장님 사파리, 2026-08-22). 그때 돌아올 문이 여기다.
   */
  useEffect(() => {
    function openNow() {
      const env = detectInstallEnv({
        userAgent: navigator.userAgent,
        standalone: isStandaloneDisplay(window),
        hasPromptEvent: promptEvent !== null,
      });
      void (async () => {
        let linked = false;
        try {
          linked = await hasLinkedIdentity();
        } catch {
          linked = false;
        }
        const kind = decideGuide({
          env,
          linked,
          state: readOfferState(localStore()),
          now: Date.now(),
          manual: true,
        });
        if (kind === "none") return;
        const v =
          kind === "escape"
            ? escapeVariant(env)
            : kind === "login-first"
              ? ("login-first" as const)
              : installVariant(env);
        if (v) setVariant(v);
      })();
    }
    window.addEventListener(OPEN_INSTALL_GUIDE_EVENT, openNow);
    return () => window.removeEventListener(OPEN_INSTALL_GUIDE_EVENT, openNow);
  }, [promptEvent]);

  /**
   * 사용자가 시트를 닫았다 — **이때** 세션 표식을 남긴다(위 상수 주석).
   * 어느 표식인지는 지금 떠 있던 시트가 정한다.
   */
  const close = useCallback(() => {
    // ⚠️⚠️ **부수효과를 `setState` 갱신함수 안에 넣지 마라** (2026-08-22).
    //    거기 넣었더니 한 번 닫았는데 `dismissCount`가 **2**가 됐다 — React는
    //    갱신함수를 순수하다고 보고 두 번 부를 수 있다(StrictMode). 유예가 두
    //    배로 빨리 길어지고 중단 상한에도 절반 만에 닿는다.
    if (variant) {
      // 탈출 안내는 카톡에 다시 들어올 때마다 필요하므로 이력을 남기지 않는다.
      if (variant.startsWith("escape-")) markSessionSeen(SESSION_ESCAPE);
      else recordDismiss(localStore(), Date.now());
    }
    setVariant(null);
  }, [variant]);

  const copyUrl = useCallback(() => {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, []);

  const handlePrimary = useCallback(async () => {
    if (busy) return;

    if (variant === "login-first") {
      // ⚠️ 여기서 로그인시키지 않는다 — 익명 세션에 `signInWithOAuth`를 쓰면
      //    계정이 갈린다. `linkIdentity`를 쓰는 화면으로 보낸다.
      close();
      window.location.assign("/account");
      return;
    }

    if (variant === "escape-android") {
      // 크롬을 직접 연다. 크롬이 없으면 아무 일도 안 일어나므로
      // '주소 복사하기'를 항상 같이 둔다.
      const { host, pathname, search } = window.location;
      window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }

    if (variant === "install-android-prompt" && promptEvent) {
      setBusy(true);
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        // ⚠️ 브라우저가 "설치됨"이라고 확인해 준 유일한 자리다. 사람의 선언이
        //    아니라 **시스템의 답**이라 믿을 수 있다.
        if (outcome === "accepted") recordDone(localStore());
      } catch {
        // 이벤트는 한 번만 쓸 수 있다 — 실패하면 다음 기회로 넘긴다
      } finally {
        setPromptEvent(null);
        setBusy(false);
        close();
      }
      return;
    }

    // 그 밖(탈출 안내의 '주소 복사하기')은 복사만 하고 닫지 않는다 —
    // 복사한 뒤에도 안내를 봐야 어디에 붙여넣을지 안다.
    copyUrl();
  }, [busy, variant, promptEvent, close, copyUrl]);

  /** 지금은 안드로이드 탈출 안내의 '주소 복사하기' 하나뿐이다 */
  const handleSecondary = useCallback(() => copyUrl(), [copyUrl]);

  if (!variant) return null;

  return (
    <>
      <InstallSheet
        variant={variant}
        busy={busy}
        onClose={close}
        onPrimary={() => void handlePrimary()}
        onSecondary={handleSecondary}
      />
      {copied && (
        <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-accent-ink">
          주소를 복사했어요
        </div>
      )}
    </>
  );
}
