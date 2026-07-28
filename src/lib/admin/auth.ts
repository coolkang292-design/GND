import "server-only";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hasAdminAccess, parseAdminIds } from "@/lib/domain/admin-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** 미들웨어가 심는 암호키 쿠키 이름과 같아야 한다 */
export const ADMIN_COOKIE = "gnd_admin";

export interface AdminAccess {
  userId: string | null;
  /** 통과 경로 — 진단용 */
  via: "uid" | "key";
}

/**
 * `/admin` 유일한 관문. 거부는 전부 **404**다.
 * 403이면 "여기 관리자 페이지가 있다"는 사실이 드러나므로 존재 자체를 숨긴다.
 *
 * 통과 경로는 둘: UID 허용목록(`ADMIN_USER_IDS`) 또는 암호키 쿠키
 * (`ADMIN_ACCESS_KEY`, 미들웨어가 `?key=`를 받아 심는다).
 * 익명 인증이라 브라우저마다 계정이 달라 UID만으로는 새 기기에서 열 수 없다.
 *
 * 판정 규칙은 `domain/admin-access.ts`가 갖고 테스트로 고정돼 있다.
 * **이 함수를 통과한 뒤에만** service_role 조회를 호출할 것.
 */
export async function requireAdmin(): Promise<AdminAccess> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ADMIN_COOKIE)?.value ?? null;
  const adminIds = parseAdminIds(process.env.ADMIN_USER_IDS);

  if (
    !hasAdminAccess({
      userId,
      adminIds,
      cookieValue,
      accessKey: process.env.ADMIN_ACCESS_KEY,
    })
  ) {
    notFound();
  }

  return {
    userId,
    via: adminIds.includes(userId ?? "") ? "uid" : "key",
  };
}
