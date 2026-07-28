import "server-only";

import { notFound } from "next/navigation";
import { isAdminUser, parseAdminIds } from "@/lib/domain/admin-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * `/admin` 유일한 관문. 거부는 전부 **404**다.
 * 403이면 "여기 관리자 페이지가 있다"는 사실이 드러나므로 존재 자체를 숨긴다.
 *
 * 판정 규칙 자체는 `domain/admin-access.ts`가 갖고 있고 테스트로 고정돼 있다.
 * **이 함수를 통과한 뒤에만** service_role 조회를 호출할 것.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  if (!isAdminUser(userId, parseAdminIds(process.env.ADMIN_USER_IDS))) {
    notFound();
  }
  return { userId: userId! };
}
