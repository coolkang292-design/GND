import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noteTrail, pathOnly } from "@/lib/domain/bug-trail";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let browserClient: SupabaseClient | null = null;

/**
 * 실패한 DB 요청을 버그 신고용 흔적에 남긴다.
 *
 * **여기 한 곳에서 앱 전체가 잡힌다.** 앱의 모든 DB 접근이 아래 싱글턴 팩토리를
 * 지나므로, 호출부 33곳의 `catch`(대부분 조용히 삼킨다)를 하나도 건드리지 않고
 * 모든 실패를 기록할 수 있다.
 *
 * 담는 것은 **메서드·경로·상태코드뿐**이다. 쿼리스트링(`?nickname=eq.…`)·요청 본문·
 * 인증 헤더는 절대 담지 않는다 — pathOnly()가 경로만 남긴다.
 *
 * 응답을 읽거나 바꾸지 않는다. 성공·실패 모두 원래 값을 그대로 흘려보낸다.
 */
function instrumentedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = init?.method ?? "GET";
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  return fetch(input, init).then(
    (res) => {
      if (!res.ok) {
        noteTrail("fail", "db", `${method} ${pathOnly(url)} ${res.status}`);
      }
      return res;
    },
    (err: unknown) => {
      // 네트워크가 끊겨 응답 자체가 없는 경우. 지하철·엘리베이터에서 흔하다.
      const name = (err as { name?: string })?.name ?? "error";
      noteTrail("fail", "net", `${method} ${pathOnly(url)} ${name}`);
      throw err;
    },
  );
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { fetch: instrumentedFetch } },
    );
  }
  return browserClient;
}
