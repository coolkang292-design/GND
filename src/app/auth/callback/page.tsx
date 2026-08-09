"use client";

import { useEffect, useRef, useState } from "react";
import { ScreenError } from "@/components/screen-error";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/crew";
import { peekPendingChallengeInvite } from "@/lib/challenge";
import { identityError } from "@/lib/identity";

/**
 * 카카오·구글에서 돌아오는 착지점 (설계 §5.4).
 *
 * ⚠️ `(tabs)` 밖에 둔다. 안에 두면 `OnboardingGate`가 돌면서 **방금 신원을 붙인
 * 사람을 온보딩으로 밀어낸다** — `/login`·`/account`를 밖에 둔 것과 같은 이유다.
 *
 * 갈라 보내는 기준은 **프로필 유무**다. 쿼리스트링에 "어디서 왔는지"를 싣지
 * 않는다 — 주소창·기록에 남고, 사용자가 링크를 저장하면 엉뚱한 곳으로 간다.
 *   · 프로필 없음 = 온보딩 도중에 붙였다 → `/onboarding`으로 돌려보내 닉네임을 마저 받는다
 *   · 프로필 있음 = 기존 사용자가 계정을 지켰다 → `/account`에서 결과를 보여준다
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  /**
   * 오류 화면의 탈출구 — **프로필 유무로 갈린다** (2026-08-09).
   *
   * ⚠️⚠️ 옛 코드는 `/account` 한 곳이었다. 그러면 **초대 링크로 처음 온 사람**이
   * 구글에서 `identity_already_exists`를 맞았을 때 갈 곳이 계정 화면뿐인데,
   * 그 사람은 프로필이 없다 — `/account`는 `(tabs)` 밖이라 `OnboardingGate`가
   * 없어서 온보딩으로 안 보내주고, 신원이 0개라 로그아웃 버튼도 안 그려진다
   * (`account/page.tsx:83`의 fail-closed). **나갈 문이 없는 화면에 앉는다.**
   * 온보딩에서 고친 D2와 같은 함정이 바로 옆 파일에 남아 있었다.
   */
  const [exitHref, setExitHref] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      // useSearchParams를 쓰지 않는다 — Suspense 경계를 요구해서 이 화면 하나
      // 때문에 빌드가 깨진다. 착지 직후 한 번만 읽으면 되는 값이다.
      const params = new URLSearchParams(window.location.search);

      // ⚠️⚠️ **`error`가 오면 전부 "취소"로 뭉개지 마라.** 2026-08-08에 그렇게 했다가
      //    실제로 이런 응답을 조용히 삼켰다(개발 서버 로그에서 발견):
      //
      //      ?error=server_error&error_code=identity_already_exists
      //       &error_description=Identity+is+already+linked+to+another+user
      //
      //    사용자는 계정을 지키려고 눌렀는데 **아무 말 없이** 제자리로 돌아왔다.
      //    그러면 지켜진 줄 알고 브라우저를 지운다 — 그 순간 기록이 사라진다.
      //
      //    취소는 `access_denied`다. 그것만 조용히 보내고 나머지는 이유를 말한다.
      const err = params.get("error");
      if (err) {
        const code = params.get("error_code") ?? err;
        const cancelled = /access_denied/i.test(code);
        if (cancelled) {
          await leave();
          return;
        }
        setError(
          identityError(
            new Error(params.get("error_description") ?? code),
          ),
        );
        // 문구를 먼저 띄우고 탈출구를 이어서 정한다 — 조회를 기다리느라
        // 사용자가 빈 화면을 보지 않게.
        setExitHref(await destination());
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const code = params.get("code");

      // @supabase/ssr의 createBrowserClient는 detectSessionInUrl이 켜져 있어
      // `?code=`를 **스스로 교환한다.** 그래서 무조건 교환하면 "이미 쓴 코드"로
      // 실패한다. 세션이 아직 없을 때만 우리가 교환한다.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session && code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(
            "연결을 마치지 못했어요. 잠시 뒤 다시 시도해 주세요.",
          );
          setExitHref(await destination());
          return;
        }
      }

      await leave();
    }

    /**
     * 프로필 유무로 갈 곳을 정한다. 조회가 실패해도 갇히지 않게 온보딩으로 보낸다.
     *
     * ⚠️ 성공한 이동(`leave`)과 실패했을 때의 탈출구(`exitHref`)가 **같은 함수**를
     * 쓴다. 갈라 두면 한쪽만 고쳐져 어긋난다 — 실제로 그래서 오류 화면이
     * `/account` 한 곳에 굳어 있었다.
     */
    async function destination(): Promise<string> {
      const supabase = getSupabaseBrowserClient();
      let hasProfile = false;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) hasProfile = (await getMyProfile(user.id)) !== null;
      } catch {
        // 일시적인 조회 실패. 온보딩은 프로필이 있으면 알아서 넘어가므로
        // 여기서 잘못 보내도 사용자가 갇히지 않는다. 반대로 `/account`로
        // 잘못 보내면 프로필 없는 사람이 나갈 문 없는 화면에 앉는다.
      }
      if (!hasProfile) return "/onboarding";

      // ⚠️ 프로필이 있어도 **챌린지 초대가 기다리고 있으면 그쪽이 먼저다**
      //    (2026-08-08). 초대 링크를 탭한 사람을 `/account`로 보내면, 계정
      //    화면에서 "내가 왜 여기 있지"가 되고 초대는 조용히 사라진다.
      //    `/challenge`가 보관된 코드로 참가까지 마무리한다.
      const pendingChallenge = peekPendingChallengeInvite();
      return pendingChallenge
        ? `/challenge?join=${encodeURIComponent(pendingChallenge)}`
        : "/account";
    }

    async function leave() {
      // ⚠️ router.replace가 아니라 **전체 페이지 로드**다. `AuthProvider`가 루트
      // 레이아웃에 있어 클라이언트 이동으로는 세션을 다시 읽지 않고, **연결 전의
      // userId를 그대로 들고** 조회한다(`/login`이 같은 이유로 이렇게 한다).
      window.location.assign(await destination());
    }

    void run();
  }, []);

  // ⚠️ 오류만 띄우고 끝내면 사용자가 이 화면에 갇힌다. `ScreenError`가 나갈 문을
  //    같이 그린다. **문의 행선지가 사람마다 다르다** — 프로필이 없는 신규
  //    가입자를 `/account`로 보내면 나갈 문이 또 없다(위 exitHref 주석).
  if (error) {
    return (
      <ScreenError
        icon="🔐"
        message={error}
        exitHref={exitHref}
        exitLabel={
          exitHref === "/onboarding"
            ? "가입 화면으로 돌아가기"
            : "계정 화면으로 돌아가기"
        }
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">🔐</div>
      <p className="text-sm text-muted">계정을 연결하는 중…</p>
    </main>
  );
}
