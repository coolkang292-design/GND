import { compressImage } from "@/lib/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 프로필 사진 업로드 (2026-08-19).
 *
 * ⚠️ **마이그레이션이 필요 없다.** `avatars` 버킷(public)과 `avatars_upload_own` ·
 * `avatars_update_own` 정책이 **0005부터 이미 있다.** 경로 규칙도 그때 정해졌다 —
 * 첫 칸이 `auth.uid()`여야 통과한다(`storage.foldername(name))[1]`).
 *
 * ⚠️⚠️ **파일 이름에 타임스탬프를 넣는다. 고정 이름으로 덮어쓰지 마라.**
 * `avatars`는 **public 버킷**이라 CDN·브라우저가 URL 단위로 캐시한다. 같은 경로에
 * 새 사진을 올리면 주소가 안 변해서 **옛 사진이 계속 보인다.** 사용자는 "저장이
 * 안 됐다"고 읽는다. 매번 새 경로면 그 문제가 아예 생기지 않는다.
 *
 * 대가: 옛 파일이 버킷에 쌓인다. 0005에 **delete 정책이 없어서** 클라이언트가
 * 지울 수도 없다. 8명 규모에서 사진 몇 장은 무해하므로 이번 범위에서 뺐다 —
 * 정리하려면 delete 정책 추가가 먼저다(계획서 §7).
 */

/** 44~96px 원형으로만 쓰인다. 인증사진(1280)만큼 클 이유가 없다. */
export const AVATAR_MAX_DIMENSION = 512;

/** 압축 **전** 원본 상한. 요즘 폰 사진이 5–10MB라 넉넉히 잡는다. */
export const AVATAR_MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * 압축 → 업로드 → **완성된 공개 URL**을 돌려준다.
 * 호출부는 이 값을 `profiles.avatar_url`에 그대로 넣는다
 * (왜 경로가 아니라 URL인지는 `domain/avatar-source.ts` 주석).
 */
export async function uploadAvatarPhoto(
  userId: string,
  file: File,
): Promise<string> {
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error("사진이 너무 커요 (20MB 이하)");
  }

  const blob = await compressImage(file, AVATAR_MAX_DIMENSION);
  const path = `${userId}/${Date.now()}.jpg`;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
