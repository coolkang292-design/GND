import { Icon } from "@/components/ui/icon";
import { BRAND_ENTRY_COPY } from "@/lib/domain/brand-copy";
import type { OAuthProvider } from "@/lib/identity";

/**
 * 브랜드 진입 화면(시작 화면·온보딩·닉네임·로그인)의 공용 조각 — Performance Social (2026-10-06).
 *
 * 시안: `어플 UI 이미지/Performance-Social-2026-10-06-Brand-Entry/original-extracts/`
 * (onboarding-original-approved.png · login-original-approved.png).
 *
 * ⚠️ **네 화면이 한 벌로 움직인다.** 2026-08-08에 로그인만 옛 텍스트 로고로 남아 두 화면이
 *    딴 앱처럼 보였던 적이 있다(옛 `hero-art.tsx`). 로고·사진·버튼은 이 파일 하나에 둔다.
 * ⚠️ 사진에 글자를 굽지 않는다. 로고 아래 부제·슬로건·문구는 전부 실제 글자다
 *    (`brand-copy.ts` — 문구 교정이 이미지 재작업 없이 반영되고, 화면 낭독기가 읽는다).
 */

/**
 * 왼쪽 위 워드마크(`GND` + PERFORMANCE SOCIAL)와, 원하면 오른쪽 손글씨 슬로건.
 *
 * ⚠️ `span`으로만 짓는다 — 시작 화면은 통째로 `<button>`(탭해서 건너뛰기)이라 그 안에
 *    `div`·`p`를 넣을 수 없다.
 */
export function BrandWordmark({ slogan = false }: { slogan?: boolean }) {
  return (
    <span className="relative flex items-start justify-between">
      <span className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gnd/brand/logo.png" alt="GND" width={240} height={80} className="h-[52px] w-auto" />
        <span className="mt-2 block text-[11px] font-semibold tracking-[0.42em] text-text/85">
          {BRAND_ENTRY_COPY.wordmarkSub}
        </span>
      </span>
      {slogan && (
        <span aria-hidden className="mt-1 block -rotate-6 text-right">
          {BRAND_ENTRY_COPY.slogan.map((word) => (
            <span key={word} className="block text-[15px] leading-[1.15] font-light italic tracking-wide text-text/80">
              {word}
            </span>
          ))}
          <span className="mt-1.5 ml-auto block h-[3px] w-14 -skew-x-12 rounded-full bg-accent" />
          <span className="mt-1 ml-auto block h-[2px] w-10 -skew-x-12 rounded-full bg-accent/70" />
        </span>
      )}
    </span>
  );
}

/**
 * 글자 없는 인물 사진. 글자·버튼은 그 위에 따로 얹는다.
 *
 * ⚠️ **글자 블록 안에 넣고, 블록 윗변을 기준으로 놓는다.** 화면 위에 붙이면 폰 길이마다
 *    글자 블록이 사진의 다른 자리를 덮는다 — 375×667에서는 제목이 **얼굴**을, 390×844에서는
 *    아무것도 못 덮어 **손·밧줄**이 드러났다(2026-10-06 실측. 이 생성 사진은 손·밧줄이 어색하다는
 *    사용자 지적이 있다). 블록 기준이면 어떤 폰에서도 손·밧줄이 제목 바로 아래(그라데이션 속)에 온다.
 * ⚠️ 사진은 폭에 맞춰 **원래 비율 그대로**(860×1859) 그린다. `lift`의 %는 `margin-top`이라
 *    **폭** 기준이다 — 사진 속 자리도 폭에 비례하므로 폭이 달라도 같은 자리가 기준선에 온다.
 * ⚠️ 부모(글자 블록)가 `relative`여야 하고, 글자들도 `relative`라야 사진 위에 온다.
 *    블록 앞의 머리말(로고)은 `z-10`으로 올려 둔다 — 사진이 DOM에서 뒤라 덮어 버린다.
 */
export function EntryPhoto({ src, top, lift }: { src: string; top: string; lift: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 block"
      style={{ top, marginTop: lift }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={860}
        height={1859}
        decoding="async"
        fetchPriority="high"
        className="block h-auto w-full"
      />
      {/* 아주 긴 화면에서 사진 윗변이 칼같이 끊기지 않게 바탕색으로 녹인다 */}
      <span className="absolute inset-x-0 top-0 block h-28 bg-gradient-to-b from-bg to-transparent" />
    </span>
  );
}

/** 로고 자리 대비 — 머리말(`relative`) 안 맨 앞에 둔다 */
export function EntryTopShade() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 block h-44 bg-gradient-to-b from-bg/85 via-bg/35 to-transparent"
    />
  );
}

/**
 * 글자 블록 뒤에 깔리는 그라데이션 — 블록 위 `reach`만큼 사진을 바탕색으로 녹인다.
 * 부모(글자 블록)가 `relative`여야 하고, 형제 글자들도 `relative`라야 이 층 위에 온다.
 */
export function EntryFade({ reach = "-top-32" }: { reach?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 bottom-0 ${reach} block bg-gradient-to-t from-bg from-45% via-bg/85 via-70% to-transparent`}
    />
  );
}

/**
 * 글자 블록 윗변 위아래를 검게 누르는 그림자 띠 (2026-10-06 사용자 지시 "어색한 부분을 검정 그림자로").
 *
 * `EntryFade`는 위로 갈수록 투명해져서 제목 바로 위 띠(생성 사진의 아래팔·밧줄)가 그대로 비친다.
 * 이 띠는 블록 윗변 근처를 한 번 더 진하게 덮는다. 부모(글자 블록)가 `relative`여야 한다.
 */
export function EntryShadow() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-28 block h-56"
      style={{
        background:
          "linear-gradient(to bottom, transparent 0%, rgb(9 10 12 / 0.72) 38%, rgb(9 10 12 / 0.9) 62%, transparent 100%)",
      }}
    />
  );
}

/**
 * 카카오·구글 버튼.
 *
 * ⚠️ **색은 각 회사의 로그인 버튼 가이드를 따른다** (사용자 결정 2026-10-06). 시안 1번은 카카오를
 *    라임으로 칠했지만 카카오 로그인 디자인 가이드는 `#FEE500` 바탕 + 검은 말풍선 + 85% 검정
 *    글자를 요구한다 — 검수에서 걸릴 수 있다. 구글도 흰 바탕 + 공식 4색 G다.
 *    라임은 GND 자체 버튼(로그인·시작하기)에만 쓴다.
 */
export function ProviderButton({
  provider,
  label,
  onClick,
  disabled,
}: {
  provider: OAuthProvider;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const kakao = provider === "kakao";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-14 w-full items-center justify-center rounded-2xl px-14 text-[16px] font-extrabold transition-transform active:scale-[0.99] disabled:opacity-60 ${
        kakao ? "bg-[#FEE500] text-black/85" : "bg-white text-[#1f1f1f]"
      }`}
    >
      <span aria-hidden className="absolute left-5 flex h-6 w-6 items-center justify-center">
        {kakao ? <KakaoSymbol /> : <GoogleG />}
      </span>
      {label}
      <Icon name="arrow" size={20} strokeWidth={2.2} className="absolute right-5" />
    </button>
  );
}

/** GND 자체 주 버튼 — 라임 바탕 + 오른쪽 화살표 (시안의 `로그인 →`) */
export function LimeCta({
  children,
  onClick,
  type = "button",
  busy,
  arrow = true,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  busy?: boolean;
  arrow?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-black text-accent-ink shadow-[0_0_28px_rgba(200,255,61,0.22)] transition-transform active:scale-[0.99] disabled:opacity-60"
    >
      {children}
      {arrow && !busy && <Icon name="arrow" size={20} strokeWidth={2.4} />}
    </button>
  );
}

/** 카카오 말풍선 심벌 (검정) */
function KakaoSymbol() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <path
        fill="#000"
        d="M12 3.2C6.48 3.2 2 6.69 2 11c0 2.78 1.86 5.22 4.66 6.6l-.95 3.48c-.08.3.26.54.52.37l4.15-2.74c.53.07 1.07.11 1.62.11 5.52 0 10-3.49 10-7.82S17.52 3.2 12 3.2Z"
      />
    </svg>
  );
}

/** 구글 공식 4색 G */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width={22} height={22} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
