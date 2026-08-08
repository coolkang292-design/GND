"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { normalizeInviteCode } from "@/lib/domain/invite-code";
import { getMyProfile, redeemInviteCode, savePendingInvite } from "@/lib/crew";

/**
 * 초대 링크 탭 → 자동 합류.
 * 프로필이 없으면(신규) 코드를 저장해두고 온보딩으로 보낸다.
 *
 * ⚠️ 2026-08-08부터 이 링크는 **친구 연결**이 먼저다(0061). 옛 그룹 코드는
 * `redeemInviteCode`가 하위 호환으로 받는다 — 카카오톡에 이미 뿌려진 링크가
 * 죽지 않게 하는 장치다. 그 2단계 로직을 여기 복사하지 마라(설계 §3.3).
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
        await redeemInviteCode(code);
        router.replace("/home");
      } catch (e) {
        // 자기 자신의 링크를 누른 경우는 따로 말해 준다. "존재하지 않는 코드"로
        // 뭉개면 사용자가 링크가 깨진 줄 알고 다시 만든다.
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg.includes("self_invite")
            ? "내 초대 링크예요. 친구에게 보내 주세요 🙂"
            : "존재하지 않는 초대 링크예요",
        );
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
        <p className="text-sm text-muted">친구를 맺는 중…</p>
      )}
    </main>
  );
}
