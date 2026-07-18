import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트 — RLS 우회. **API route 전용.**
 * SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사가 없어 클라 번들에
 * 포함되지 않는다. 클라이언트 컴포넌트에서 import 금지.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
