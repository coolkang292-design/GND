import Link from "next/link";

/**
 * 오류 화면의 공용 껍데기 — **문구와 함께 반드시 나갈 문을 그린다.**
 *
 * ⚠️⚠️ 왜 컴포넌트로 만들었나: "사용자를 화면에 가두지 않는다"가 지금까지
 * **화면마다 손으로** 지켜지고 있었고, 그래서 같은 구멍이 세 번 열렸다.
 *
 *   · D2 (2026-08-08) `/onboarding` — 참가 실패가 온보딩에 가뒀다.
 *     `(tabs)` 밖이라 `OnboardingGate`도 없어 새로고침도 소용없었다
 *   · D5 (2026-08-09) `/auth/callback` — 탈출구가 `/account` 한 곳이라,
 *     프로필 없는 신규 가입자가 로그아웃 버튼도 없는 화면에 앉았다
 *   · D7 (2026-08-09) `/invite/[code]` — 오류를 4가지나 그리면서 **링크가 0개**였다.
 *     PWA로 홈 화면에서 열면 주소창이 없어 나갈 수단이 아예 사라진다
 *
 * 셋 다 "고치면 끝"이 아니다 — **다음 화면이 생기면 또 열린다.** 그래서 오류를
 * 그리는 자리를 한 곳으로 모은다. 새 화면은 이걸 쓰면 탈출구가 딸려 온다.
 *
 * ⚠️ `exitHref`를 없애지 마라. 선택 항목으로 바꾸는 순간 이 장치의 존재 이유가
 * 사라진다. 목적지를 아직 모르면 `null`을 넘겨라 — 정해지는 대로 다시 그린다.
 */
export function ScreenError({
  icon,
  message,
  exitHref,
  exitLabel,
}: {
  /** 화면 위쪽 큰 이모지 — 어느 흐름에서 멈췄는지 알아보게 한다 */
  icon: string;
  message: string;
  /** 나갈 곳. 아직 정해지지 않았으면 `null` (조회 중 등) */
  exitHref: string | null;
  exitLabel: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="text-sm leading-relaxed font-semibold text-warn">
        {message}
      </p>
      {exitHref && (
        <Link
          href={exitHref}
          className="mt-2 text-[13px] text-muted underline"
        >
          {exitLabel}
        </Link>
      )}
    </main>
  );
}
