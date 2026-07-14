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
};

const AuthContext = createContext<AuthState>({
  configured: false,
  loading: true,
  userId: null,
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
        if (!cancelled) {
          setState({ configured: true, loading: false, userId: session.user.id });
        }
        return;
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        console.error("익명 인증 실패:", error.message);
        setState({ configured: true, loading: false, userId: null });
        return;
      }
      setState({
        configured: true,
        loading: false,
        userId: data.user?.id ?? null,
      });
    }

    void ensureAnonymousSession();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
