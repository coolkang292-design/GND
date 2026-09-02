-- 0099 : Storage 버킷 상한 — 외부 파일럿 abuse 방어 (2026-09-03)
--
-- ⚠️ 이 파일은 **기록용이다.** 운영에는 2026-09-03에 Supabase MCP로 이미 적용했고,
--    적용 후 `storage.buckets`를 다시 조회해 확인했다(CLAUDE.md §DB 마이그레이션).
--    이 저장소는 `supabase_migrations` 이력을 쓰지 않으므로, "반영됐는지"는
--    파일 목록이 아니라 **객체를 조회해서** 확인한다:
--
--      select id, public, file_size_limit, allowed_mime_types from storage.buckets;
--
-- ── 왜 (2026-09-03 운영 실측) ────────────────────────────────────
-- 두 버킷 모두 `file_size_limit`·`allowed_mime_types`가 **NULL**이었다. 즉
-- 인증된 사용자가 **아무 형식이든, 아무 크기든** 자기 폴더에 올릴 수 있었다.
-- 정책(0005)은 "자기 UUID 폴더만"은 막지만 **크기와 형식은 안 막는다.**
-- 외부 사용자 20~30명을 받기 직전에 이건 열려 있으면 안 되는 문이다.
--
-- ── 숫자의 근거 — 짐작이 아니라 실측이다 ────────────────────────
-- 저장된 파일 194개가 **전량 image/jpeg**였다(예외 0건). 앱이 그것만 만들기
-- 때문이다 — 업로드 경로는 두 곳뿐이고 둘 다 `contentType: "image/jpeg"`를
-- 박아 넣는다(`lib/avatar.ts`, `lib/workout.ts`). 그 blob은 `lib/image.ts`의
-- `canvas.toBlob("image/jpeg", 0.85)`가 만든다.
--
--   avatars         18개 · 최대 141KB · 평균 63KB   (512px 아바타 / 1080px 모집사진)
--   workout-images 176개 · 최대 748KB · 평균 139KB  (1280px 인증사진)
--
-- 그래서 상한은 실측 최대치의 **4~15배**로 잡는다. 정상 사용에는 닿지 않고,
-- 수십 MB짜리 악의적 업로드는 막힌다.
--
--   avatars        2 MiB = 2097152   (실측 최대의 14.8배)
--   workout-images 3 MiB = 3145728   (실측 최대의 4.1배)
--
-- ⚠️⚠️ **`allowed_mime_types`를 넓히려면 먼저 `lib/image.ts`를 보라.**
--    앱이 JPEG만 만드는 한 PNG·WebP를 열어 둘 이유가 없고, `avatars`는
--    **public 버킷**이라 SVG처럼 스크립트를 품을 수 있는 형식이 올라가면
--    그 URL이 그대로 인터넷에 열린다. 압축 코드를 바꾸면 여기도 같이 바꿔야
--    업로드가 안 막힌다 — 갈라지면 사용자가 사진을 못 올린다.
--
-- ⚠️ **기존 파일에는 소급되지 않는다.** 이미 있는 194개는 그대로 남는다
--    (상한은 새 업로드에만 적용된다). 파일을 옮기거나 지우지 않는다.
--
-- 회귀: `node scripts/storage-limits-check.mjs` — 정상 JPEG 통과 + MIME 3종 거부
--       + 상한 초과 거부 + 남의 폴더 거부를 버킷별로 본다(16 단언).

update storage.buckets
   set file_size_limit    = 2097152,
       allowed_mime_types = array['image/jpeg']
 where id = 'avatars';

update storage.buckets
   set file_size_limit    = 3145728,
       allowed_mime_types = array['image/jpeg']
 where id = 'workout-images';
