-- ============================================================
-- Phase 4: 인증사진 — 버킷·workout_images·RLS·storage 정책·인증 RPC
-- 계획서 §11(인증사진 단순화)·§13(스키마)·§14(RLS) 기준.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- (버킷 insert가 권한 오류로 실패하면: Dashboard → Storage에서
--  avatars(public)·workout-images(private) 수동 생성 후 재실행)
-- ============================================================

-- ── 버킷 2개 (§11): avatars=public, workout-images=private ──

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('workout-images', 'workout-images', false)
on conflict (id) do nothing;

-- ── workout_images 테이블 (§13) ─────────────────────────────

create table public.workout_images (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_path text not null, -- storage 'workout-images' 버킷 내 경로: {userId}/{sessionId}/{file}
  source text not null check (source in ('camera', 'album')),
  server_uploaded_at timestamptz not null default now(), -- 서버시간이 진실
  client_captured_at timestamptz,
  unique (session_id) -- 세션당 사진 1장 (§11 단순화)
);

alter table public.workout_images enable row level security;

-- 본인만 원본 관리, 크루원은 공개 완료 세션에 연결된 것만 조회 (§14)
create policy "images_select_own_or_crew" on public.workout_images
  for select using (
    user_id = auth.uid()
    or public.workout_session_crew_visible(session_id)
  );
create policy "images_insert_own" on public.workout_images
  for insert with check (
    user_id = auth.uid()
    and public.owns_workout_session(session_id)
    and image_path like auth.uid()::text || '/%'
  );
create policy "images_delete_own" on public.workout_images
  for delete using (user_id = auth.uid());

revoke all on public.workout_images from anon;
-- server_uploaded_at은 default(서버시간)만 허용 — 클라 직접 쓰기 금지
revoke insert, update on public.workout_images from authenticated;
grant insert (id, session_id, user_id, image_path, source, client_captured_at)
  on public.workout_images to authenticated;

-- ── storage.objects 정책 ─────────────────────────────────────
-- 경로 규칙: {auth.uid()}/{sessionId}/{filename}

create policy "workout_images_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'workout-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "workout_images_read_own_or_crew" on storage.objects
  for select to authenticated using (
    bucket_id = 'workout-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.workout_images wi
        where wi.image_path = name
          and public.workout_session_crew_visible(wi.session_id)
      )
    )
  );

create policy "workout_images_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'workout-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- avatars: 공개 버킷(읽기는 public URL), 쓰기는 본인 폴더만
create policy "avatars_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 인증 상태 RPC (§11·§15) ──────────────────────────────────
-- verification_status/server_uploaded_at은 컬럼 권한상 클라 직접 쓰기 불가
-- → 사진 업로드 후 이 RPC로만 기록. 서버시간이 진실.

create or replace function public.set_workout_verification(
  p_session_id uuid,
  p_source text,
  p_client_captured_at timestamptz default null
)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_source not in ('camera', 'album') then
    raise exception 'invalid_source:%', p_source;
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'completed' then
    raise exception 'invalid_status:%', s.status;
  end if;
  -- 실제 업로드된 사진이 있어야 인증 인정
  if not exists (
    select 1 from workout_images
    where session_id = p_session_id and user_id = auth.uid()
  ) then
    raise exception 'image_not_found';
  end if;

  update workout_sessions
  set verification_status = case p_source
        when 'camera' then 'camera_verified'
        else 'photo_uploaded'
      end,
      verification_source = p_source,
      server_uploaded_at = now(),
      client_captured_at = p_client_captured_at
  where id = p_session_id
  returning * into s;

  return s;
end $$;

revoke execute on function public.set_workout_verification(uuid, text, timestamptz) from anon, public;
grant execute on function public.set_workout_verification(uuid, text, timestamptz) to authenticated;
