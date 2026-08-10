import Image from "next/image";

/**
 * GND 화면 아트 — 온보딩 첫 화면·닉네임 단계·로그인의 배경 그림.
 *
 * ⚠️ **세 화면이 한 벌로 움직인다.** 2026-08-08에 로그인만 텍스트 로고(`🏋️ GND`)로
 * 남아 두 화면이 딴 앱처럼 보였다(사용자 지시로 통일). 한쪽만 고치면 다시 갈라지므로
 * 이 파일 하나에 둔다.
 *
 * ── 왜 화면마다 그림이 다른가 ─────────────────────────────
 * 화면마다 **텍스트 블록 높이가 다르고**(220 / 374 / 499px), 그만큼 아트에 남는
 * 세로가 다르다(1.52u / 1.09u / 0.67u, 1u = 컬럼 폭). 한 장을 세 화면에 쓰면 짧은
 * 쪽에서 그림이 잘린다 — 2026-08-10까지 실제로 그랬고, 로그인에서는 **아트의 45%**
 * (황금 문 전체)가 사라지고 있었다.
 *
 * 규격·좌표·측정 방법: `docs/design-sources/onboarding-canvas-spec.md`
 * 자산 생성: `python scripts/make-screen-canvas.py <화면> <아트 파일>`
 *
 * ── 이 구조를 바꾸기 전에 읽어라 ──────────────────────────
 * ⚠️ **`fill`(absolute)이어야 한다.** 옛 코드는 `aspect-[1080/1380]`을 가진 블록이라
 * 문서 흐름에 있었는데, 부모가 `flex flex-col`이라 이 상자가 **flex-shrink로 눌렸다.**
 * 아래 텍스트가 길수록 더 눌려서 로그인은 설계 높이의 63%까지 찌그러졌고, 기기
 * 폭마다 눌리는 정도가 달라 **같은 화면이 폰마다 다른 데서 잘렸다**(실측:
 * 360폭 54% · 390폭 45% · 430폭 36% 잘림).
 *
 * ⚠️ **`object-top`이어야 한다.** 캔버스(비율 2.370)가 어떤 폰보다도 길어서 잘리는
 * 것은 **아래쪽 빈 검정뿐**이다. `object-center`면 아트 위가 잘린다.
 *
 * ⚠️ **음수 z-index를 쓰지 마라.** `main`은 스태킹 컨텍스트를 만들지 않아서
 * `-z-10`을 주면 조상의 `bg-bg` 뒤로 내려가 **그림이 통째로 안 보인다.** 대신 글자
 * 쪽을 `relative`로 올려 DOM 순서로 덮는다(아래 화면들이 그렇게 돼 있다).
 *
 * ⚠️ 옛 `w-[112%]`·`-ml-[6%]`(사용자 지시 "그냥 사진을 키워")는 **되살리지 마라.**
 * 그게 좌우를 각 5.4%씩 잘라 불독 왼팔 47px과 `GND` 마지막 획 13px을 먹고 있었다.
 * 지금은 캔버스가 화면 폭에 정확히 맞아서 키울 이유가 없다.
 */
const SCREEN_ART = {
  /** 제공자 버튼 화면 — 불독 + GND + 포털 + 발판 전부 (아트 1.52u) */
  onboarding: "/onboarding/screen-onboarding.webp",
  /** 닉네임 단계 — 발판을 뺀 구도 (아트 1.09u) */
  nickname: "/onboarding/screen-nickname.webp",
  /** 로그인 — 불독과 GND를 가로로 나란히 (아트 0.67u) */
  login: "/onboarding/screen-login.webp",
} as const;

export type ScreenArtKey = keyof typeof SCREEN_ART;

export function ScreenArt({ screen }: { screen: ScreenArtKey }) {
  return (
    <Image
      src={SCREEN_ART[screen]}
      alt=""
      fill
      // 첫 화면이라 늦게 뜨면 검은 화면을 먼저 본다
      priority
      // 컬럼이 430으로 묶여 있다 — 이걸 안 주면 Next가 3840px짜리를 내려받는다
      sizes="430px"
      /**
       * ⚠️ **`unoptimized`를 빼지 마라** (2026-08-10, 사용자가 "화질이 뭉개
       * 보인다"고 지적해서 찾았다).
       *
       * 이 파일은 `make-screen-canvas.py`가 **이미 최적화해서** 만든다 — 폭이
       * 정확히 1080(컬럼 최대 430의 2.5배)이고 webp q92다. 그런데 Next의 이미지
       * 최적화기는 그걸 받아 **webp q75로 한 번 더 인코딩한다**(실측: 원본
       * 64.4KB → 51KB). 어두운 그라데이션과 글로우가 대부분인 그림이라 그
       * 재인코딩에서 밴딩이 바로 뜬다.
       *
       * ⚠️ `quality={90}`으로 대신하려 하지 마라 — Next 15는 `next.config`의
       * `images.qualities`에 없는 값을 **거부한다**(실측: q=90 요청 시 빈 응답).
       * 재인코딩 자체를 안 하는 게 맞다.
       */
      unoptimized
      className="pointer-events-none object-cover object-top"
    />
  );
}
