-- 0106 — 스토리지 삭제를 "행이 가리키지 않는 객체"로 좁힌다 (0104 수정)
--
-- ⓘ 비파괴다. `alter policy`로 조건을 **좁히기만** 한다 — drop 도 revoke 도 없다.
--
-- **왜 — 0104가 너무 넓었다. 회귀 테스트가 잡았다.**
-- `challenge-photo-test.mjs`에 예전부터 이런 단언이 있었다:
--     "사진 행이 연결된 Storage 파일 삭제는 거부"
-- 0104 이전에는 storage.objects 에 DELETE 정책이 **아예 없어서** 이 단언이
-- 통과하고 있었다. 0104가 소유자 삭제를 열면서 통과 이유가 사라졌고,
-- 2026-09-10 실행에서 `status=200`으로 깨졌다.
--
-- 그냥 단언을 고치면 안 되는 이유:
--   `workout_images` 행은 남기고 스토리지 파일만 지울 수 있게 되면,
--   `get_challenge_period_sessions`가 `exists(workout_images)`만 보므로
--   **사진 없이 photo_required 챌린지 인증 크레딧을 받는다.**
--   피드에는 깨진 이미지가 뜨지만 집계는 통과한다. 이건 진짜 구멍이다.
--
-- **왜 이 조건으로 삭제 흐름이 안 막히나**
-- `deleteWorkoutImage()`(src/lib/workout.ts)는 **행을 먼저** 지우고 그 다음
-- 스토리지를 지운다. 스토리지를 지울 때는 이미 가리키는 행이 없다.
-- (순서가 그렇게 된 이유는 따로다 — 스토리지를 먼저 지우면 실패했을 때
--  없는 파일을 가리키는 행이 남아 카드에 깨진 이미지가 뜬다. 두 이유가
--  같은 순서를 가리킨다.)
-- ⚠️ 그러므로 **그 순서를 뒤집지 마라.** 뒤집으면 이 정책이 삭제를 막는다.

begin;

alter policy workout_images_delete_own on storage.objects
  using (
    bucket_id = 'workout-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    -- ⚠️ 이 줄이 0106의 전부다. 지우지 마라 — 위 주석의 구멍이 다시 열린다.
    and not exists (
      select 1 from public.workout_images wi where wi.image_path = name
    )
  );

commit;

-- 적용 후 확인:
--   select policyname, qual from pg_policies
--    where schemaname='storage' and tablename='objects' and cmd='DELETE';
--   → qual 에 `NOT (EXISTS ( SELECT 1 FROM workout_images ...))` 가 있어야 한다
