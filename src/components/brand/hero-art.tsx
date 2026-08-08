import Image from "next/image";

/**
 * GND 히어로 아트 — 온보딩·로그인 첫 화면의 상단 그림.
 *
 * ⚠️ **온보딩과 로그인이 같은 것을 써야 한다.** 2026-08-08에 로그인 화면만
 * 텍스트 로고(`🏋️ GND`)로 남아 있어서 두 화면이 딴 앱처럼 보였다(사용자 지시로
 * 통일). 한쪽만 고치면 다시 갈라지므로 이 파일 하나에 둔다.
 *
 * ── 자산 규격 ─────────────────────────────────────────────
 * `public/onboarding/hero.webp` (1080×2252). 위 61%가 아트, 아래는 빈 검정이다.
 * 규격과 생성 프롬프트는 `docs/design-sources/onboarding-hero-prompt.md`.
 *
 * ⚠️ 비율 `1080/1380`은 **자산에서 잰 값이다. 눈대중으로 고치지 마라.**
 * `python scripts/make-onboarding-assets.py`가 실행할 때마다 아트 아래끝을 재서
 * `→ CSS: aspect-[...]`로 찍어 준다. 자산을 바꾸면 그 값을 그대로 옮겨 적는다.
 *
 * ── 배치에서 두 번 당한 것 ────────────────────────────────
 * ⚠️ **그림을 배경으로 깔고 문구를 그 위에 얹지 마라.** 그러면 그림 높이는
 * *컬럼 폭*이, 문구 위치는 *화면 높이*가 정해서 서로를 모른다 — 화면 비율이
 * 바뀔 때마다 겹칠지 말지가 달라진다. 문서 흐름에 두고 문구가 **다음**에 오게
 * 하면 겹칠 방법이 구조적으로 없다.
 *
 * ⚠️ **`w-full`로 되돌리지 마라.** 조상의 좌우 패딩을 물려받아 양옆에 띠가 생긴다.
 * `left-1/2` + `-translate-x-1/2` + `w-screen`이 그걸 통째로 무시한다.
 * `max-w-[430px]`은 앱 컬럼 폭(`layout.tsx`)과 같은 값이다 — 컬럼을 바꾸면 여기도.
 *
 * ⚠️ 이미지가 `w-[112%]`인 것은 사용자 지시("그냥 사진을 키워")다. 자산에 여백이
 * 없어서 더 키우려면 확대해 가장자리를 자르는 수밖에 없다. 더 키우려면 `-ml`도
 * 같이 올린다(`w-[120%]` → `-ml-[10%]`). `max-w-none`이 없으면 전역
 * `img { max-width: 100% }`에 막혀 안 커진다.
 */
export function HeroArt() {
  return (
    <div
      aria-hidden
      className="relative left-1/2 aspect-[1080/1380] w-screen max-w-[430px] -translate-x-1/2 overflow-hidden"
    >
      <Image
        src="/onboarding/hero.webp"
        alt=""
        width={1080}
        height={2252}
        priority
        className="-ml-[6%] h-auto w-[112%] max-w-none"
      />
    </div>
  );
}
