"use client";

import { useEffect, useState } from "react";

import { GoogleBlockedNote, useUsableProviders } from "@/components/auth/usable-providers";
import {
  PROVIDER_META,
  hasLinkedIdentity,
  identityError,
  linkProvider,
  type OAuthProvider,
} from "@/lib/identity";

/**
 * **운동을 마친 익명 사용자에게 기록 지키기를 권한다** (2026-10-11, Issue #2 P0-2).
 *
 * "닉네임만 정하고 바로 시작"으로 들어온 사람은 소셜 신원이 0개다. 그 계정은 이
 * 브라우저에만 있다 — 지우면 기록이 사라지고, 다른 기기에서 같은 카카오로 먼저
 * 가입하면 이 계정에는 영영 못 붙인다(`identity_already_exists`, 08-08 3차 결정의 경고).
 * 그래서 **가치를 막 느낀 순간**, 운동 완료 화면에서 권한다.
 *
 * ⚠️ `linkProvider`(= `linkIdentity`)다. `signInWithOAuth`로 바꾸면 **새 계정**에
 *    로그인되어 방금 한 운동이 갈린다(`identity.ts` 상단 표).
 * ⚠️ 신원 판단은 로컬 세션을 읽는 `hasLinkedIdentity`다 — 판단 못 하면 안 띄운다.
 *    붙은 사람에게 "지켜 두세요"는 틀린 말이다.
 */
export function ProtectRecordsCard() {
  const { providers, googleBlocked } = useUsableProviders();
  const [show, setShow] = useState(false);
  const [linking, setLinking] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasLinkedIdentity()
      .then((linked) => {
        if (!cancelled) setShow(!linked);
      })
      .catch(() => {
        // 모른다 ≠ 안 붙었다
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show || (providers.length === 0 && !googleBlocked)) return null;

  async function link(provider: OAuthProvider) {
    if (linking) return;
    setLinking(provider);
    setError(null);
    try {
      // 성공하면 제공자 화면으로 떠난다. 돌아오면 `/auth/callback` → `/account`.
      await linkProvider(provider);
    } catch (e) {
      setError(identityError(e));
      setLinking(null);
    }
  }

  return (
    <section className="rounded-card border border-accent/40 bg-surface p-4 shadow-card">
      <h2 className="text-[15px] font-extrabold">방금 기록, 지켜 둘까요?</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        지금은 <b className="text-text">이 브라우저에만</b> 저장돼 있어요. 카카오·구글을
        연결하면 폰을 바꾸거나 앱을 깔아도 기록이 그대로예요.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => void link(p)}
            disabled={linking !== null}
            className="h-11 w-full rounded-full border border-line bg-surface-2 text-sm font-extrabold disabled:opacity-60"
          >
            {linking === p ? "이동 중…" : `${PROVIDER_META[p].short}로 지키기`}
          </button>
        ))}
        {googleBlocked && <GoogleBlockedNote />}
      </div>
      {error && (
        <p className="mt-2 text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
