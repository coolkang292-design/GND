"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ScreenError } from "@/components/screen-error";
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
      // ⚠️⚠️ **이 조회를 try 밖에 두지 마라** (D6, 2026-08-09에 고쳤다).
      //    `getMyProfile`은 오류를 던진다(`crew.ts:12`). 밖에 있으면 네트워크가
      //    한 번 흔들렸을 때 `void run()`이 rejection을 삼키고 화면이
      //    **`친구를 맺는 중…`에서 영원히 멈춘다** — 오류도, 재시도도, 나갈 문도
      //    없다. 실패를 "안 보이는 멈춤"으로 바꾸는 것이 가장 나쁜 실패다.
      let profile;
      try {
        profile = await getMyProfile(userId);
      } catch {
        setError(
          "지금 연결이 불안정해요. 잠시 뒤 링크를 다시 눌러 주세요.",
        );
        return;
      }

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

  // ⚠️ 오류일 때는 `ScreenError`를 쓴다 — **나갈 문이 딸려 오기 때문이다**(D7).
  //    옛 코드는 오류를 네 가지나 그리면서 링크가 0개였다. PWA로 홈 화면에서
  //    열면 주소창이 없어 나갈 수단이 아예 없다.
  if (error) {
    return (
      <ScreenError
        icon="👥"
        message={error}
        exitHref="/home"
        exitLabel="홈으로 가기"
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">👥</div>
      <p className="text-sm text-muted">친구를 맺는 중…</p>
    </main>
  );
}
