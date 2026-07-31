import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isValidAccessKey } from "@/lib/domain/admin-access";

/** 관리자 암호키 쿠키 이름 — requireAdmin()이 같은 이름을 읽는다 */
export const ADMIN_COOKIE = "gnd_admin";

/**
 * `/admin`에서만 동작한다(아래 matcher).
 *
 * 앱 전체는 클라이언트 컴포넌트 + createBrowserClient로 인증하므로 서버 측
 * 토큰 갱신 지점이 없다. 갱신이 없으면 액세스 토큰이 만료된 뒤 서버 컴포넌트가
 * 유효한 사용자를 못 읽어 **관리자에게도 404**가 뜬다.
 * getUser() 호출이 필요 시 토큰을 갱신하고 새 쿠키를 응답에 싣는다.
 *
 * 여기서 권한을 판정하지 않는다 — 게이트는 requireAdmin() 한 곳이다.
 */
export async function proxy(request: NextRequest) {
  // ── ?key=… 로 들어오면 쿠키로 바꾸고 주소에서 지운다 ──────────────
  // 쿠키로 옮기는 이유: 암호가 주소창·방문기록·공유 링크에 계속 남지 않게.
  // 쿠키는 httpOnly라 JS로 못 읽고, path를 /admin으로 좁혀 다른 경로엔 안 실린다.
  const provided = request.nextUrl.searchParams.get("key");
  if (provided !== null) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("key");
    const redirect = NextResponse.redirect(url);

    if (isValidAccessKey(provided, process.env.ADMIN_ACCESS_KEY)) {
      redirect.cookies.set(ADMIN_COOKIE, provided, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/admin",
        maxAge: 60 * 60 * 24 * 180, // 180일
      });
    }
    // 틀린 키는 쿠키를 안 심고 그냥 보낸다 — requireAdmin()이 404로 막는다.
    // 여기서 "틀렸다"고 알려주면 키를 맞출 때까지 시도할 단서를 준다.
    return redirect;
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // 환경변수가 없으면 갱신할 세션도 없다. requireAdmin()이 404로 막는다.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

/**
 * 다른 라우트의 동작을 바꾸지 않기 위해 /admin으로 한정한다.
 * "/admin"을 따로 적는 이유: "/admin/:path*"가 하위 경로 없는 "/admin"까지
 * 잡는지는 path-to-regexp 버전에 달렸다. 빗나가면 정작 대시보드 본체가
 * 세션 갱신을 못 받아 관리자에게 404가 뜬다 — 이 미들웨어의 존재 이유가 사라진다.
 */
export const config = { matcher: ["/admin", "/admin/:path*"] };
