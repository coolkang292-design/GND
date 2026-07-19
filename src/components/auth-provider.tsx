"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

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
 * 앱 첫 진입 시 자동 익명 신원 발급 (§3).
 * 세션이 이미 있으면 재사용, 없으면 signInAnonymously().
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
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
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
