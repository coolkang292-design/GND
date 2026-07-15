-- ============================================================
-- Phase 3: 운동 핵심 — exercise_catalog / workout_sessions /
--          workout_exercises / workout_sets + RLS + 상태전이 RPC
-- 계획서 §10(기록)·§13(스키마)·§14(RLS)·§15(RPC) 기준.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

-- ── exercise_catalog: 기본 시드 + 유저 커스텀 ────────────────

create table public.exercise_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  body_part text not null
    check (body_part in ('가슴', '등', '하체', '어깨', '팔', '코어', '유산소')),
  exercise_type text not null
    check (exercise_type in ('weight', 'bodyweight', 'cardio')),
  is_custom boolean not null default false,
  created_by uuid references auth.users (id) on delete cascade, -- null = 기본 시드
  created_at timestamptz not null default now(),
  check (is_custom = (created_by is not null))
);

-- 시드는 전역 유니크, 커스텀은 유저별 유니크
create unique index exercise_catalog_seed_name
  on public.exercise_catalog (name) where created_by is null;
create unique index exercise_catalog_custom_name
  on public.exercise_catalog (created_by, name) where created_by is not null;

-- 기본 시드 (phase0-mockup.html catalog 기준)
insert into public.exercise_catalog (name, body_part, exercise_type) values
  ('벤치프레스', '가슴', 'weight'),
  ('인클라인 벤치프레스', '가슴', 'weight'),
  ('덤벨 플라이', '가슴', 'weight'),
  ('체스트프레스 머신', '가슴', 'weight'),
  ('랫풀다운', '등', 'weight'),
  ('바벨 로우', '등', 'weight'),
  ('DY 로우 머신', '등', 'weight'),
  ('시티드 로우', '등', 'weight'),
  ('데드리프트', '등', 'weight'),
  ('스쿼트', '하체', 'weight'),
  ('레그프레스', '하체', 'weight'),
  ('레그 익스텐션', '하체', 'weight'),
  ('레그 컬', '하체', 'weight'),
  ('힙 쓰러스트', '하체', 'weight'),
  ('숄더프레스', '어깨', 'weight'),
  ('사이드 레터럴 레이즈', '어깨', 'weight'),
  ('페이스풀', '어깨', 'weight'),
  ('바벨 컬', '팔', 'weight'),
  ('덤벨 컬', '팔', 'weight'),
  ('케이블 푸시다운', '팔', 'weight'),
  ('플랭크', '코어', 'bodyweight'),
  ('크런치', '코어', 'bodyweight'),
  ('레그 레이즈', '코어', 'bodyweight'),
  ('풀업', '등', 'bodyweight'),
  ('푸시업', '가슴', 'bodyweight'),
  ('러닝', '유산소', 'cardio'),
  ('걷기', '유산소', 'cardio'),
  ('사이클', '유산소', 'cardio'),
  ('로잉', '유산소', 'cardio');

-- ── workout_sessions ─────────────────────────────────────────

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  workout_type text check (workout_type is null or char_length(workout_type) <= 30),
  title text check (title is null or char_length(title) <= 60),
  started_at timestamptz,          -- RPC(서버시간)만 기록
  completed_at timestamptz,        -- RPC(서버시간)만 기록
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  intensity smallint check (intensity is null or intensity between 1 and 5),
  memo text check (memo is null or char_length(memo) <= 500),
  visibility text not null default 'group' check (visibility in ('group', 'private')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  deleted_at timestamptz,
  verification_status text not null default 'none'
    check (verification_status in ('none', 'photo_uploaded', 'camera_verified')),
  verification_source text,
  server_uploaded_at timestamptz,
  client_captured_at timestamptz,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 핵심 불변식: 동시 active 세션은 유저당 1개 (§13)
create unique index workout_sessions_one_active
  on public.workout_sessions (user_id) where status = 'active';

create index workout_sessions_user_completed
  on public.workout_sessions (user_id, completed_at desc)
  where status = 'completed';

create trigger workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

-- ── workout_exercises ────────────────────────────────────────

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_name text not null check (char_length(exercise_name) between 1 and 40),
  exercise_type text not null
    check (exercise_type in ('weight', 'bodyweight', 'cardio')),
  sort_order int not null default 0,
  memo text check (memo is null or char_length(memo) <= 200),
  previous_workout_exercise_id uuid references public.workout_exercises (id) on delete set null,
  created_at timestamptz not null default now()
);

create index workout_exercises_session on public.workout_exercises (session_id, sort_order);

-- ── workout_sets ─────────────────────────────────────────────

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number int not null check (set_number >= 1),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg >= 0),
  reps int check (reps is null or reps >= 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  distance_meters numeric(9, 1) check (distance_meters is null or distance_meters >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,        -- 트리거(서버시간)만 기록
  unique (workout_exercise_id, set_number)
);

-- 세트 완료 시각은 서버가 진실 — 클라 전달값은 항상 무시
create or replace function public.set_workout_set_completed_at()
returns trigger language plpgsql as $$
begin
  if not new.is_completed then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or not old.is_completed then
    new.completed_at := now();
  else
    new.completed_at := old.completed_at;
  end if;
  return new;
end $$;

create trigger workout_sets_completed_at
  before insert or update on public.workout_sets
  for each row execute function public.set_workout_set_completed_at();

-- ── RLS 헬퍼 (재귀 없는 판정: security definer) ──────────────

create or replace function public.owns_workout_session(sid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from workout_sessions
    where id = sid and user_id = auth.uid()
  )
$$;

-- 크루 공개 조건: visibility=group AND completed AND 미삭제 AND 같은 크루 (§14)
create or replace function public.workout_session_crew_visible(sid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and s.status = 'completed'
      and s.deleted_at is null
      and s.group_id is not null
      and public.is_group_member(s.group_id, auth.uid())
  )
$$;

create or replace function public.owns_workout_exercise(eid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1
    from workout_exercises e
    join workout_sessions s on s.id = e.session_id
    where e.id = eid and s.user_id = auth.uid()
  )
$$;

create or replace function public.workout_exercise_crew_visible(eid uuid)
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from workout_exercises e
    where e.id = eid and public.workout_session_crew_visible(e.session_id)
  )
$$;

-- ── RLS 정책 (§14) ──────────────────────────────────────────

alter table public.exercise_catalog enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

-- exercise_catalog: 시드 + 내 커스텀만 조회, 커스텀은 본인 생성·삭제
create policy "catalog_select_seed_or_own" on public.exercise_catalog
  for select using (created_by is null or created_by = auth.uid());
create policy "catalog_insert_own_custom" on public.exercise_catalog
  for insert with check (is_custom and created_by = auth.uid());
create policy "catalog_delete_own_custom" on public.exercise_catalog
  for delete using (created_by = auth.uid());

-- workout_sessions: 본인 CRUD + 크루원은 공개 완료분만 조회
create policy "sessions_select_own_or_crew" on public.workout_sessions
  for select using (
    user_id = auth.uid()
    or (
      visibility = 'group'
      and status = 'completed'
      and deleted_at is null
      and group_id is not null
      and public.is_group_member(group_id, auth.uid())
    )
  );
create policy "sessions_insert_own_draft" on public.workout_sessions
  for insert with check (
    user_id = auth.uid()
    and status = 'draft'
    and started_at is null
    and completed_at is null
    and (group_id is null or public.is_group_member(group_id, auth.uid()))
  );
create policy "sessions_update_own" on public.workout_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sessions_delete_own" on public.workout_sessions
  for delete using (user_id = auth.uid());

-- workout_exercises / workout_sets: 세션 소유자만 쓰기, 크루 공개분만 읽기
create policy "exercises_select_own_or_crew" on public.workout_exercises
  for select using (
    public.owns_workout_session(session_id)
    or public.workout_session_crew_visible(session_id)
  );
create policy "exercises_insert_own" on public.workout_exercises
  for insert with check (public.owns_workout_session(session_id));
create policy "exercises_update_own" on public.workout_exercises
  for update using (public.owns_workout_session(session_id))
  with check (public.owns_workout_session(session_id));
create policy "exercises_delete_own" on public.workout_exercises
  for delete using (public.owns_workout_session(session_id));

create policy "sets_select_own_or_crew" on public.workout_sets
  for select using (
    public.owns_workout_exercise(workout_exercise_id)
    or public.workout_exercise_crew_visible(workout_exercise_id)
  );
create policy "sets_insert_own" on public.workout_sets
  for insert with check (public.owns_workout_exercise(workout_exercise_id));
create policy "sets_update_own" on public.workout_sets
  for update using (public.owns_workout_exercise(workout_exercise_id))
  with check (public.owns_workout_exercise(workout_exercise_id));
create policy "sets_delete_own" on public.workout_sets
  for delete using (public.owns_workout_exercise(workout_exercise_id));

-- ── 컬럼 권한: 상태·시각 컬럼은 클라 직접 쓰기 금지 (§15) ────
-- status/started_at/completed_at/duration_minutes/verification_* 는
-- RPC(security definer)와 서버만 기록한다.

revoke all on public.exercise_catalog from anon;
revoke all on public.workout_sessions from anon;
revoke all on public.workout_exercises from anon;
revoke all on public.workout_sets from anon;

revoke insert, update on public.workout_sessions from authenticated;
grant insert (id, user_id, group_id, workout_type, title, intensity, memo, visibility, timezone)
  on public.workout_sessions to authenticated;
grant update (group_id, workout_type, title, intensity, memo, visibility, timezone, deleted_at)
  on public.workout_sessions to authenticated;

revoke insert, update on public.workout_sets from authenticated;
grant insert (id, workout_exercise_id, set_number, weight_kg, reps, duration_seconds, distance_meters, is_completed)
  on public.workout_sets to authenticated;
grant update (set_number, weight_kg, reps, duration_seconds, distance_meters, is_completed)
  on public.workout_sets to authenticated;

-- ── 상태전이 RPC (§15) — 단일 트랜잭션, 서버시간이 진실 ──────

create or replace function public.start_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'draft' then
    raise exception 'invalid_status:%', s.status;
  end if;
  if exists (
    select 1 from workout_sessions
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'active_session_exists';
  end if;

  update workout_sessions
  set status = 'active', started_at = now()
  where id = p_session_id
  returning * into s;

  return s;
end $$;

create or replace function public.complete_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'active' then
    raise exception 'invalid_status:%', s.status;
  end if;

  update workout_sessions
  set status = 'completed',
      completed_at = now(),
      duration_minutes = greatest(
        1, round(extract(epoch from now() - s.started_at) / 60)::int
      )
  where id = p_session_id
  returning * into s;

  return s;
end $$;

create or replace function public.cancel_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'session_not_found';
  end if;
  if s.status not in ('draft', 'active') then
    raise exception 'invalid_status:%', s.status;
  end if;

  update workout_sessions
  set status = 'cancelled'
  where id = p_session_id
  returning * into s;

  return s;
end $$;

-- 함수 실행 권한: 로그인(익명 포함) 사용자만
revoke execute on function public.start_workout(uuid) from anon, public;
grant execute on function public.start_workout(uuid) to authenticated;
revoke execute on function public.complete_workout(uuid) from anon, public;
grant execute on function public.complete_workout(uuid) to authenticated;
revoke execute on function public.cancel_workout(uuid) from anon, public;
grant execute on function public.cancel_workout(uuid) to authenticated;
