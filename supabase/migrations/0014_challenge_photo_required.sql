-- ============================================================
-- 0014: challenges.photo_required - 새 챌린지 사진 인증 필수
-- 설계: docs/superpowers/specs/2026-07-18-challenge-photo-levels-design.md
-- 실행: Supabase Dashboard -> SQL Editor에 전체 붙여넣기 -> Run (1회)
-- ============================================================

-- 기존 행은 false로 채우고, 이후 새 행의 기본값만 true로 전환한다.
-- 이 순서로 기존 챌린지는 종전 집계 규칙을 유지한다.
alter table public.challenges
  add column if not exists photo_required boolean not null default false;

alter table public.challenges
  alter column photo_required set default true;

-- 0006에서 INSERT 가능한 열을 제한했으므로 새 열 권한을 명시한다.
grant insert (photo_required) on public.challenges to authenticated;

-- 앱을 우회한 REST 요청도 새 챌린지의 사진 필수를 끌 수 없게 한다.
alter policy "challenges_insert_member" on public.challenges
  with check (
    created_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
    and status = 'setup'
    and photo_required = true
  );

-- 사진 행은 실제 Storage 파일이 먼저 올라온 경우에만 허용한다.
-- 경로의 두 번째 폴더도 세션 ID와 일치시켜 다른 사진 재사용을 막는다.
alter policy "images_insert_own" on public.workout_images
  with check (
    user_id = auth.uid()
    and public.owns_workout_session(session_id)
    and (storage.foldername(image_path))[1] = auth.uid()::text
    and (storage.foldername(image_path))[2] = session_id::text
    and exists (
      select 1
      from storage.objects stored
      where stored.bucket_id = 'workout-images'
        and stored.name = image_path
    )
  );

-- INSERT와 DELETE 동시 요청으로 존재 검사를 우회할 수 없게 사용자 직접
-- Storage 삭제를 닫는다. 현재 앱에는 인증사진 삭제 기능이 없으며,
-- 운영 정리는 service_role을 사용하는 서버/관리 스크립트만 수행한다.
drop policy if exists "workout_images_delete_own" on storage.objects;
