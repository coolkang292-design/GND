"use client";

import { useEffect, useRef } from "react";

/**
 * 사진 한 장을 화면 위에 크게 띄우는 겹 — **이 앱의 첫 라이트박스** (2026-08-28).
 *
 * 새 관용구를 만든 게 아니다. `fixed inset-0` 배경 + `role="dialog"` +
 * `aria-modal`은 이 저장소 **21개 파일이 이미 쓰던 것**이고, `Escape` 닫기는
 * 6개 파일이 같은 모양으로 쓴다(`cheer-point-modal.tsx`가 가장 가깝다).
 * 여기서 처음으로 그 겹을 **한 번 묶었을 뿐이다.**
 *
 * ⚠️⚠️ **`max-w`를 키우지 마라 — 크게 보일수록 잘 보이는 게 아니다.**
 * 프로필 사진은 업로드 때 긴 변 **512px**로 압축돼 저장된다
 * (`lib/avatar.ts`의 `AVATAR_MAX_DIMENSION`). 원본은 서버에 남지 않는다.
 * 폰 화면은 물리 픽셀로 1100px이 넘어서, 꽉 채우면 브라우저가 2배 넘게
 * **늘려 그린다** — 얼굴이 뭉개진다. 512에서 멈추는 편이 실제로 더 잘 보인다.
 * (원본을 키우려면 업로드 상한부터 올려야 하고, 그래도 **이미 올라간 사진은
 * 안 바뀐다** — 2026-08-28에 사용자가 512 유지로 결정했다.)
 *
 * ⚠️ `next/image`가 아니라 평범한 `<img>`다. 사진이 Supabase 호스트에서 오는데
 * `next.config.ts`에 `images.remotePatterns`가 없다 — `<Image>`로 그리면
 * 런타임에 "hostname not configured"로 죽는다. `components/avatar.tsx`와
 * `feed/feed-item.tsx`가 같은 이유로 `<img>`를 쓴다.
 *
 * ⚠️ z는 **60/70**이다. 바텀시트가 50, 그 배경이 40을 쓴다 — 50 이하로 내리면
 * 프로필 시트 **뒤에** 깔려 아무것도 안 보인다.
 *
 * ⚠️ 겹 전체가 `pointer-events-none`이고 닫기 버튼만 되살린다. 그래서 사진을
 * 포함해 **아무 데나 누르면 배경에 닿아 닫힌다** — 폰에서 기대하는 동작이다.
 *
 * ⚠️ 배경은 `aria-hidden` **div**다(`member-profile-sheet.tsx`·`badge-sheet.tsx`와
 * 같은 꼴). `cheer-point-modal.tsx`처럼 배경을 `aria-label="닫기"` 버튼으로 두면
 * 화면 안의 진짜 닫기 버튼과 **접근 가능한 이름이 겹쳐** 낭독에서 "닫기"가 두 번
 * 나오고 테스트에서도 둘 중 무엇을 눌렀는지 가릴 수 없다. 키보드 경로는 아래
 * 닫기 버튼 하나로 충분하다.
 *
 * ⚠️ 버튼 글자가 **`사진 닫기`**다. 그냥 `닫기`로 줄이지 마라 — 이 겹은 프로필
 * 시트 **위에** 뜨는데 시트 맨 아래에도 `닫기` 버튼이 있다. 이름이 같으면 화면
 * 낭독과 음성 조작에서 둘 중 무엇이 눌리는지 알 수 없다(테스트가 실제로 이
 * 충돌에 걸려서 잡았다).
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  /** 이미 사진으로 판정된 URL만 넘긴다 (`domain/avatar-source.ts`) */
  src: string;
  /** 화면에 글자가 없는 자리라 **반드시 채운다** — 비우면 낭독에서 통째로 사라진다 */
  alt: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/85"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 p-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[70vh] w-auto max-w-[min(90vw,512px)] rounded-card object-contain"
        />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="pointer-events-auto h-12 w-full max-w-[min(90vw,512px)] rounded-card bg-accent text-sm font-extrabold text-accent-ink"
        >
          사진 닫기
        </button>
      </div>
    </>
  );
}
