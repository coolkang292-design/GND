/**
 * `profiles.avatar_url` 한 칸을 **이모지 / 사진 URL / 없음**으로 가르는 단일 판정.
 *
 * 왜 한 곳인가. 이 값을 그리는 화면이 **14군데**다(챌린지 참가자 3 · 크루 목록 2 ·
 * 피드 카드 2 · 킹 카드 2 · 크루 검색 · 프로필 시트 · 크루 최근운동 · 진행 중 카드).
 * 전부 `{x.avatar_url ?? "👤"}` 꼴로 **글자를 그린다.** 사진 URL이 들어오는 순간
 * 그 화면들이 `https://…`를 글자로 뱉는다. 판정을 흩뿌리면 한 곳은 반드시 빠진다.
 *
 * ⚠️ **화면에서 직접 판정하지 마라.** `components/avatar.tsx`의 `<Avatar>`만 쓴다.
 *    `avatar-source.test.ts`와 `avatar.test.tsx`가 이 규칙을 고정한다.
 *
 * ⚠️ 컬럼에는 **완성된 공개 URL**을 넣는다(storage 경로가 아니라).
 *    `avatars` 버킷이 public이라 경로→URL 변환이 결정적이긴 하지만, 이 값을
 *    돌려주는 곳이 클라이언트만이 아니다 — 0038·0051의 RPC와 `/admin` 서버 조회도
 *    같은 컬럼을 그대로 흘려보낸다. 완성된 URL이면 소비자가 아무것도 안 해도 된다.
 *    대가: Supabase 프로젝트를 옮기면 저장된 URL을 일괄 치환해야 한다.
 */

export type AvatarSource =
  | { kind: "photo"; url: string }
  | { kind: "emoji"; emoji: string }
  | { kind: "none" };

/**
 * ⚠️ `http`/`https`만 사진으로 본다. `javascript:`·`data:`·`//`는 **이모지로**
 * 떨어뜨린다 — `<img src>`에 실리면 안 되는 값이라, 화면에 이상한 글자가 보이는
 * 편이 조용히 실려 나가는 것보다 낫다.
 */
export function avatarSource(value: string | null | undefined): AvatarSource {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return { kind: "none" };

  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("https://") || lowered.startsWith("http://")) {
    return { kind: "photo", url: trimmed };
  }
  return { kind: "emoji", emoji: trimmed };
}

/** 사진인지만 알면 되는 곳(업로드 시트의 "지우기" 노출 판정 등)을 위한 축약 */
export function isPhotoAvatar(value: string | null | undefined): boolean {
  return avatarSource(value).kind === "photo";
}
