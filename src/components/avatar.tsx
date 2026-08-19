import { avatarSource } from "@/lib/domain/avatar-source";

/**
 * 프로필 아바타 한 칸 — **이 앱에서 `avatar_url`을 그리는 유일한 방법.**
 *
 * ⚠️⚠️ **`{x.avatar_url ?? "👤"}`를 다시 쓰지 마라.** 그 칸에는 이모지도 오고
 * 사진 URL도 온다(2026-08-19부터). 직접 그리면 사진을 올린 사람의 화면에
 * `https://…`가 **글자로** 나온다. 판정은 `domain/avatar-source.ts` 한 곳뿐이다.
 *
 * ⚠️ `next/image`가 아니라 **평범한 `<img>`다.** 사진은 Supabase 호스트에서 오는데
 * `next.config.ts`에 `images.remotePatterns`가 없다 — `<Image>`로 그리면 런타임에
 * "hostname not configured"로 죽는다. 인증사진도 같은 이유로 `<img>`를 쓴다
 * (`feed/feed-item.tsx:87`). 설정을 넓히는 대신 선례를 따른다.
 *
 * 바깥 `<span>`은 호출부의 `className`을 **그대로** 받는다. 크기·배경·둥글기가
 * 자리마다 다르고(챌린지 `h-8 w-8`, 크루 `h-9 w-9`, 킹 카드 `text-3xl`), 그
 * 판단은 각 화면이 이미 내려 뒀다 — 여기서 통일하려 들면 레이아웃이 밀린다.
 */
export function Avatar({
  src,
  className,
  fallback = "👤",
  label,
}: {
  /** `profiles.avatar_url` 값 그대로. 이모지 · 사진 URL · null 아무거나 */
  src: string | null | undefined;
  /** 바깥 span에 그대로 실린다 — 기존 자리의 크기·배경 클래스를 넘긴다 */
  className?: string;
  /** 값이 비었을 때 그릴 글자 (기본 👤, 관리자 화면만 🙂) */
  fallback?: string;
  /**
   * 사진일 때의 `alt`. 기본은 장식(`""`)이다 — 대부분의 자리에서 바로 옆에
   * 닉네임이 **글자로** 붙어 있어, 읽어 주면 같은 이름을 두 번 말한다.
   */
  label?: string;
}) {
  const source = avatarSource(src);

  return (
    <span className={className}>
      {source.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source.url}
          alt={label ?? ""}
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      ) : source.kind === "emoji" ? (
        source.emoji
      ) : (
        fallback
      )}
    </span>
  );
}
