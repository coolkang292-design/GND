"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { normalizeInviteCode } from "@/lib/domain/invite-code";
import { getMyProfile, joinGroupWithCode, savePendingInvite } from "@/lib/crew";

/**
 * 초대 링크 탭 → 자동 크루 합류 (§4).
 * 프로필이 없으면(신규) 코드를 저장해두고 온보딩으로 보낸다.
 */
export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const router = useRouter();
  const { userId, loading, configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (loading || !configured || started.current) return;
    started.current = true;

    async function run() {
      const code = normalizeInviteCode(decodeURIComponent(rawCode));
      if (!code) {
        setError("잘못된 초대 링크예요");
        return;
      }
      if (!userId) {
        setError("익명 인증에 실패했어요. 새로고침해 보세요.");
        return;
      }
      const profile = await getMyProfile(userId);
      if (!profile) {
        savePendingInvite(code);
        router.replace("/onboarding");
        return;
      }
      try {
        await joinGroupWithCode(code);
        router.replace("/home");
      } catch {
        setError("존재하지 않는 초대 코드예요");
      }
    }
    void run();
  }, [loading, configured, userId, rawCode, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">👥</div>
      {error ? (
        <p className="text-sm font-semibold text-warn">{error}</p>
      ) : (
        <p className="text-sm text-muted">크루에 합류하는 중…</p>
      )}
    </main>
  );
}
