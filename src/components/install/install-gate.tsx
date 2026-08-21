"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { getMyIdentities } from "@/lib/identity";
import {
  canOfferInstall,
  detectInstallEnv,
  isStandaloneDisplay,
  needsBrowserEscape,
  readOfferState,
  recordDismiss,
  recordDone,
  shouldOfferInstall,
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
const SESSION_INSTALL = "gnd:install:offer-shown";

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

      // 익명 계정인지 신원이 붙었는지 — 빈 배열이 "이 브라우저에만 있는 계정"이다
      let linked = false;
      if (userId) {
        try {
          linked = (await getMyIdentities()).length > 0;
        } catch {
          // 조회 실패는 "모른다"이지 "붙었다"가 아니다. 안전한 쪽(익명)으로 둔다 —
          // 잘못 띄우면 기록이 갈리고, 안 띄우면 다음 기회에 뜬다.
          linked = false;
        }
      }
      if (cancelled) return;

      if (needsBrowserEscape(env)) {
        // ⚠️ 로그인 전에는 아무 말도 하지 않는다 — 위 주석의 2번 이유.
        if (!linked) return;
        if (sessionSeen(SESSION_ESCAPE)) return;
        const v = escapeVariant(env);
        if (!v) return;
        decided.current = true;
        setVariant(v);
        return;
      }

      if (!canOfferInstall(env)) return;
      if (sessionSeen(SESSION_INSTALL)) return;
      const ok = shouldOfferInstall({
        env,
        state: readOfferState(localStore()),
        loggedIn: linked,
        now: Date.now(),
      });
      if (!ok) return;
      const v = installVariant(env);
      if (!v) return;
      decided.current = true;
      setVariant(v);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, userId, promptEvent]);

  /**
   * 사용자가 시트를 닫았다 — **이때** 세션 표식을 남긴다(위 상수 주석).
   * 어느 표식인지는 지금 떠 있던 시트가 정한다.
   */
  const close = useCallback(() => {
    setVariant((v) => {
      if (v) {
        markSessionSeen(
          v.startsWith("escape-") ? SESSION_ESCAPE : SESSION_INSTALL,
        );
      }
      return null;
    });
  }, []);

  const copyUrl = useCallback(() => {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, []);

  const handlePrimary = useCallback(async () => {
    if (busy) return;

    if (variant === "escape-android") {
      // 크롬을 직접 연다. 안드로이드만 되는 방식이고, 크롬이 없으면 아무 일도
      // 안 일어나므로 '주소 복사하기'를 항상 같이 둔다.
      const { host, pathname, search } = window.location;
      window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }

    if (variant === "install-android-prompt" && promptEvent) {
      setBusy(true);
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") recordDone(localStore());
        else recordDismiss(localStore(), Date.now());
      } catch {
        // 이벤트는 한 번만 쓸 수 있다 — 실패하면 다음 기회로 넘긴다
        recordDismiss(localStore(), Date.now());
      } finally {
        setPromptEvent(null);
        setBusy(false);
        close();
      }
      return;
    }

    // "알겠어요" / "다 했어요"
    if (variant === "install-ios" || variant === "install-android-manual") {
      recordDone(localStore());
    }
    close();
  }, [busy, variant, promptEvent, close]);

  const handleSecondary = useCallback(() => {
    if (variant === "install-ios" || variant === "install-android-manual") {
      recordDismiss(localStore(), Date.now());
      close();
      return;
    }
    if (variant === "install-android-prompt") {
      recordDismiss(localStore(), Date.now());
      close();
      return;
    }
    // 탈출 안내의 보조 버튼은 '주소 복사하기' — 닫지 않는다. 복사하고 나서도
    // 안내를 봐야 어디에 붙여넣을지 안다.
    copyUrl();
  }, [variant, close, copyUrl]);

  if (!variant) return null;

  return (
    <>
      <InstallSheet
        variant={variant}
        busy={busy}
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
