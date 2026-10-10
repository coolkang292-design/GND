"use client";

import { useState, useSyncExternalStore } from "react";

import { enabledProviders, type OAuthProvider } from "@/lib/identity";
import { isEmbeddedWebView, providersUsableIn } from "@/lib/domain/embedded-browser";

/**
 * **이 브라우저에서 끝까지 갈 수 있는 제공자** (2026-10-11, Issue #2 P0-3).
 *
 * 켜진 제공자(`enabledProviders`)에서 웹뷰가 막는 구글을 뺀다 — 이유는
 * `domain/embedded-browser.ts`. 가입(`/onboarding`)·로그인(`/login`)·계정 연결
 * (`/account`) 세 화면이 **같은 판정**을 써야 해서 한 곳에 둔다.
 *
 * ⚠️ UA는 `useSyncExternalStore`로 읽는다. 서버 스냅샷은 `false`(구글 있음)라
 *    하이드레이션이 서버 HTML과 맞고, 그 직후 클라이언트 값으로 바뀐다. 렌더 중에
 *    `navigator`를 직접 읽으면 서버/클라이언트가 갈려 하이드레이션이 깨진다.
 */
const noSubscribe = () => () => {};

export function useUsableProviders(): {
  providers: OAuthProvider[];
  /** 켜져 있지만 이 브라우저라서 뺀 것이 있는가 — 안내 문구를 띄울지 */
  googleBlocked: boolean;
} {
  const enabled = enabledProviders();
  const embedded = useSyncExternalStore(
    noSubscribe,
    () => isEmbeddedWebView(navigator.userAgent),
    () => false,
  );

  const providers = embedded
    ? providersUsableIn(enabled, navigator.userAgent)
    : enabled;
  return {
    providers,
    googleBlocked: embedded && enabled.includes("google") && !providers.includes("google"),
  };
}

/**
 * 구글을 뺐을 때 **왜 없는지**와 **어떻게 하면 되는지**를 한 줄로.
 *
 * ⚠️ 말없이 빼지 않는다. 구글로 가입한 사람이 인스타에서 열면 버튼이 사라진 것처럼
 *    보인다 — "고장"이 아니라 "여기선 안 되고, 사파리·크롬에선 된다"를 말해야 한다.
 */
export function GoogleBlockedNote({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <p className={`text-[12px] leading-relaxed text-muted ${className}`}>
      구글 로그인은 인스타·카톡 같은 앱 안 화면에서는 막혀 있어요. 사파리·크롬에서
      열면 쓸 수 있어요.{" "}
      <button
        type="button"
        onClick={copy}
        className="font-bold text-text underline underline-offset-2"
      >
        {copied ? "주소를 복사했어요" : "주소 복사"}
      </button>
    </p>
  );
}
