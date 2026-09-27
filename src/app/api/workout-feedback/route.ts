import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCoachGenerator } from "@/lib/ai-coach/deepseek";
import { requestWorkoutFeedback } from "@/lib/ai-coach/feedback-service";
import { createSupabaseFeedbackDeps } from "@/lib/ai-coach/supabase-deps";
import { PROVIDER_TIMEOUT_MS } from "@/lib/domain/coach-config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 운동 직후 AI 코치 피드백 (0112, 설계 2026-09-28).
 *
 * 입력은 `{ sessionId, retry? }` **하나뿐**이다. userId·기록·지시문·모델 이름을
 * 클라이언트가 보내게 하지 않는다 (명령문 §22) — 사용자는 로그인 토큰으로 정한다.
 *
 * ⚠️ 운동 완료(`complete_workout_v2`)와 무관하다. 완료 화면이 **완료 뒤에** 부른다.
 */

export const dynamic = "force-dynamic";
// AI 대기(30초) + 조회·저장 여유. Vercel 함수 제한 안쪽이다
export const maxDuration = 60;

/**
 * 요청자의 권한으로 도는 클라이언트.
 *
 * 브라우저가 `Authorization: Bearer <access token>`을 실어 보내면 그걸 쓴다 —
 * 쿠키 갱신 시점에 기대지 않는다. 없으면 쿠키 세션(`@supabase/ssr`)으로 떨어진다.
 */
async function userClient(
  req: Request,
): Promise<{ client: SupabaseClient; userId: string } | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return { client, userId: data.user.id };
  }
  const client = await getSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "env_missing" }, { status: 500 });
  }

  const auth = await userClient(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: unknown; retry?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const deps = createSupabaseFeedbackDeps({
    userId: auth.userId,
    user: auth.client,
    admin: getSupabaseAdminClient(),
    generate: createCoachGenerator({
      openRouterApiKey: process.env.OPENROUTER_API_KEY,
      deepSeekApiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.AI_COACH_MODEL || undefined,
      timeoutMs: PROVIDER_TIMEOUT_MS,
    }),
  });

  try {
    const result = await requestWorkoutFeedback(body.sessionId, deps, {
      retry: body.retry === true,
    });
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch {
    // 원문 오류를 내보내지 않는다 — 쿼리·키가 섞일 수 있다
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
