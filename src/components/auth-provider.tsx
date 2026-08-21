"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { isStandaloneDisplay } from "@/lib/domain/install-prompt";

type AuthState = {
  /** Supabase env 미설정이면 false — 인증 시도 안 함 */
  configured: boolean;
  loading: boolean;
  userId: string | null;
  /** 인증 실패 사유 (성공 시 null) — 화면에 노출해 원인 파악 가능하게 */
  error: string | null;
};

const AuthContext = createContext<AuthState>({
  configured: false,
  loading: true,
  userId: null,
  error: null,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * 익명 계정을 **발급하지 않는** 경로 — "계정이 없는 것이 정상"인 화면들이다.
 *
 * ⚠️ `/login` (2026-08-01 로그아웃 도입): 여기서 발급하면 로그아웃 직후 곧바로
 *    새 익명 계정이 생겨 ① 사용자는 로그아웃이 아니라 **다른 사람**이 되고
 *    ② 로그아웃할 때마다 운영 DB에 프로필 없는 유령 계정이 쌓인다.
 *
 * ⚠️⚠️ `/auth/callback` (2026-08-09): 제공자에서 돌아오는 중이라 세션이 **아직
 *    없는 것이 정상**이다. 여기서 발급하면 코드 교환이 실패한 순간
 *    (만료·재사용·PKCE verifier 없음) 사용자가 조용히 새 익명 계정이 되고,
 *    더 나쁘게는 콜백 화면의 `if (!session && code)` 가드가 **그 익명 세션을 보고
 *    교환을 통째로 건너뛴다.** 결과: 구글로 로그인했는데 빈 계정으로 온보딩에
 *    떨어지고 원래 기록과 갈린다. `signInWithOAuth`/`linkIdentity`를 뒤바꿨을 때와
 *    같은 종류의 사고다 — 조용해서 더 위험하다.
 *
 * ⚠️ 여기에 경로를 더할 때는 그 화면이 **스스로 세션을 만들거나 되찾는지** 확인해라.
 *    아무도 세션을 안 만드는 화면을 넣으면 그 화면은 영원히 `userId=null`이다.
 */
const NO_ANON_ROUTES = ["/login", "/auth/callback"];

/**
 * **설치본에서 세션이 없어도 익명 계정을 발급해 주는** 경로.
 *
 * `/onboarding`만이다. `/login`의 "처음이신가요? 시작하기"로 온 사람인데, 여기서도
 * `/login`으로 되돌리면 **두 화면이 서로를 가리키며 갇힌다.** 진짜 신규 가입자는
 * 이 문으로 들어와야 한다.
 */
const STANDALONE_ANON_OK_ROUTES = ["/onboarding"];

/**
 * 앱 첫 진입 시 자동 익명 신원 발급 (§3).
 * 세션이 이미 있으면 재사용, 없으면 signInAnonymously().
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const pathname = usePathname();
  const isNoAnonRoute = NO_ANON_ROUTES.includes(pathname);
  const isStandaloneAnonOk = STANDALONE_ANON_OK_ROUTES.includes(pathname);
  const [state, setState] = useState<AuthState>({
    configured,
    loading: configured,
    userId: null,
    error: null,
  });

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    async function ensureAnonymousSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        // 로컬 세션은 서버에서 계정이 삭제돼도 토큰 만료 전까지 살아 있다
        // (데이터 리셋 후 "저장 실패"의 원인). 서버에 실존 여부를 확인해
        // 유령 세션이면 지우고 새 익명 계정을 발급한다. 네트워크 오류 등
        // 그 외 실패는 로컬 세션을 그대로 신뢰한다.
        const { error: userError } = await supabase.auth.getUser();
        const isGhostSession =
          userError !== null &&
          userError !== undefined &&
          (userError.status === 401 || userError.status === 403);

        if (!isGhostSession) {
          if (!cancelled) {
            setState({
              configured: true,
              loading: false,
              userId: session.user.id,
              error: null,
            });
          }
          return;
        }

        await supabase.auth.signOut();
        if (cancelled) return;
      }

      // "계정 없음"이 정상 상태인 화면들(NO_ANON_ROUTES)에서는 발급하지 않는다.
      // 화면만 그리고 끝낸다 — 세션은 그 화면이 스스로 만들거나 되찾는다.
      if (isNoAnonRoute) {
        setState({
          configured: true,
          loading: false,
          userId: null,
          error: null,
        });
        return;
      }

      // ⚠️⚠️ **설치본에서 세션이 없다 = 방금 홈 화면에 추가했다는 뜻이다.**
      //
      // iOS는 홈 화면 앱과 사파리의 **저장소가 갈린다.** 사파리에서 로그인해
      // 두고 설치하면, 설치본은 로그인되지 않은 상태로 처음 열린다. 여기서
      // 익명 계정을 발급하면 그 사람은 **새 사람**이 되고, `OnboardingGate`가
      // 온보딩으로 보낸다 → 카카오를 누르면 `identity_already_exists`
      // (`identity.ts`), 닉네임을 넣으면 중복. **나갈 문이 없는 화면에 앉는다.**
      //
      // 그래서 발급 대신 `/login`으로 보낸다. 거기엔 두 문이 다 있다 —
      // 돌아오는 사람은 로그인, 진짜 신규는 "처음이신가요? 시작하기".
      //
      // ⚠️ `/login`은 `NO_ANON_ROUTES`라 도착해서 다시 발급하지 않는다. 루프는
      //    생기지 않는다. `/onboarding`을 예외로 둔 이유는 위 상수의 주석 참고.
      // ⚠️ 안드로이드는 여기 안 걸린다 — 크롬과 저장소를 공유해서 설치본에도
      //    세션이 그대로 있다. 즉 이 분기는 사실상 iOS 전용이다.
      if (
        !isStandaloneAnonOk &&
        typeof window !== "undefined" &&
        isStandaloneDisplay(window)
      ) {
        // 이동 중에는 상태를 건드리지 않는다. loading을 끄면 그 한 프레임에
        // 게이트가 돌아 엉뚱한 화면이 번쩍인다.
        window.location.assign("/login?from=installed");
        return;
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        console.error("익명 인증 실패:", error.message);
        setState({
          configured: true,
          loading: false,
          userId: null,
          error: error.message,
        });
        return;
      }
      setState({
        configured: true,
        loading: false,
        userId: data.user?.id ?? null,
        error: null,
      });
    }

    // 예외로 죽으면 loading이 영원히 안 끝난다 — 반드시 여기서 회수
    ensureAnonymousSession().catch((e: unknown) => {
      if (cancelled) return;
      const msg = e instanceof Error ? e.message : String(e);
      console.error("익명 인증 예외:", e);
      setState({ configured: true, loading: false, userId: null, error: msg });
    });
    // 로그인·로그아웃으로 계정이 바뀌면 여기서 userId를 갱신한다.
    // 이게 없으면 /login에서 로그인해도 provider가 **이전 익명 userId**를 계속
    // 들고 있어, 화면은 남의 빈 계정을 조회하고 온보딩으로 튕긴다.
    // 익명 세션 발급은 위 ensureAnonymousSession이 이미 처리하므로
    // 여기서는 세션이 생겼을 때만 반영한다(없어졌다고 새로 발급하지 않는다).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const nextId = session?.user?.id ?? null;
      setState((prev) =>
        prev.userId === nextId && !prev.loading
          ? prev
          : { configured: true, loading: false, userId: nextId, error: null },
      );
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // isNoAnonRoute는 /login·/auth/callback에 들어가고 나올 때만 뒤집힌다 —
    // 매 이동마다 재실행되지 않는다.
  }, [configured, isNoAnonRoute, isStandaloneAnonOk]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
