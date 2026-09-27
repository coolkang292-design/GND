-- 0112 — GND AI 코치 V1 (2026-09-28)
--
-- 설계: docs/superpowers/specs/2026-09-28-ai-coach-v1-design.md
--
-- ⓘ **추가만 한다.** 새 테이블 3개 · 새 컬럼 1개 · 이벤트 허용목록 넓히기.
--   기존 행·기존 컬럼·complete_workout_v2·XP/포인트/배지 함수는 건드리지 않는다.
--   `drop constraint`가 하나 있다(⑤ analytics_events) — 0109와 같은 "넓히기" 패턴이다.
--
-- ⛔ **이 파일을 적용하기 전에 앱을 배포하지 마라.** 새 앱은 세트를 저장할 때
--    `client_completed_at`을 보낸다. 컬럼·grant가 없으면 PostgREST가 거부한다.
--    (`workout.ts`의 `saveSessionExercises`가 그 경우 그 칸을 빼고 한 번 재시도하지만,
--     그건 사고 방지용 안전망이지 순서를 무시해도 된다는 뜻이 아니다.)

begin;

-- ── ① 세트 완료 시각 (기기 시계) ─────────────────────────────
--
-- 왜 `completed_at`을 쓰지 않나: 0004 트리거가 **서버 시각으로 덮어쓰고**, 세트는
-- 운동 종료 때 한 번에 insert된다. 그래서 모든 세트의 completed_at이 종료 시각과 같다.
-- 휴식·세트 간격을 재려면 기기가 누른 순간을 따로 받아야 한다.
--
-- ⚠️ 기기 시계라 **진실이 아니다.** 분석 엔진은 세트 사이 간격(상대값)만 쓰고,
--    너무 짧거나(몰아서 체크) 너무 길면(앱 방치) suspect로 떨어뜨린다.
-- ⚠️ 세트는 크루가 읽을 수 있다(sets_select_own_or_crew). 시각은 민감 정보가 아니라 둔다.

alter table public.workout_sets
  add column if not exists client_completed_at timestamptz;

comment on column public.workout_sets.client_completed_at is
  '기기에서 세트 완료를 누른 시각 (0112). 서버 completed_at과 다르다 — 분석 보조 신호일 뿐이다.';

-- 0004가 insert를 컬럼 단위로만 열어 뒀다. 새 칸도 따로 열어야 저장된다.
grant insert (client_completed_at) on public.workout_sets to authenticated;

-- ── ② 목표 프로필 ───────────────────────────────────────────
--
-- AI 코치가 "같은 기록도 목표에 따라 다르게" 읽기 위한 최상위 조건.
-- user_goals(챌린지 목표)·program_enrollments.level_at_start(프로그램 난이도)와는 별개다.

create table if not exists public.training_profiles (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  primary_goal text not null
    check (primary_goal in ('hypertrophy', 'strength', 'fat_loss', 'conditioning', 'general_fitness')),
  experience_level text not null
    check (experience_level in ('beginner', 'intermediate', 'advanced')),
  sessions_per_week smallint not null check (sessions_per_week between 1 and 7),
  session_minutes smallint not null check (session_minutes between 10 and 240),
  training_location text not null
    check (training_location in ('gym', 'home', 'outdoor', 'mixed')),
  -- 부위 이름은 exercise_catalog.body_part와 **같은 한국어 값**을 쓴다
  priority_body_parts text[] not null default '{}'
    check (
      priority_body_parts <@ array['가슴', '등', '하체', '어깨', '팔', '코어', '유산소']::text[]
      and cardinality(priority_body_parts) <= 3
    ),
  -- 불편하거나 아픈 부위 (선택). AI에게는 **보내지 않는다** — 증량 차단에만 쓴다
  limitation_body_parts text[] not null default '{}'
    check (
      limitation_body_parts <@ array['가슴', '등', '하체', '어깨', '팔', '코어']::text[]
    ),
  current_weight_kg numeric(5, 1)
    check (current_weight_kg is null or current_weight_kg between 20 and 300),
  target_weight_kg numeric(5, 1)
    check (target_weight_kg is null or target_weight_kg between 20 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_profiles_updated_at
  before update on public.training_profiles
  for each row execute function public.set_updated_at();

alter table public.training_profiles enable row level security;

revoke all on public.training_profiles from public, anon, authenticated;
grant select on public.training_profiles to authenticated;
grant insert (
  user_id, primary_goal, experience_level, sessions_per_week, session_minutes,
  training_location, priority_body_parts, limitation_body_parts,
  current_weight_kg, target_weight_kg
) on public.training_profiles to authenticated;
grant update (
  primary_goal, experience_level, sessions_per_week, session_minutes,
  training_location, priority_body_parts, limitation_body_parts,
  current_weight_kg, target_weight_kg
) on public.training_profiles to authenticated;
grant select, insert, update, delete on public.training_profiles to service_role;

create policy "training_profiles_select_own" on public.training_profiles
  for select to authenticated using (user_id = auth.uid());
create policy "training_profiles_insert_own" on public.training_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "training_profiles_update_own" on public.training_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── ③ 운동 직후 체감 (세션 단위) ─────────────────────────────
--
-- ⚠️ workout_sessions에 칸을 더하지 않은 이유: 세션은 크루가 읽는다.
--    통증·컨디션은 본인만 봐야 한다.
-- 체감 5단계는 0067의 3단계(too_light·on_target·too_heavy)를 **확장한** 이름이다.

create table if not exists public.workout_session_feedback (
  session_id uuid primary key
    references public.workout_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  overall_effort text
    check (
      overall_effort is null
      or overall_effort in ('too_light', 'light', 'on_target', 'heavy', 'too_heavy')
    ),
  flags text[] not null default '{}'
    check (flags <@ array['pain', 'low_condition', 'short_time', 'equipment_unavailable']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_session_feedback_user_recent
  on public.workout_session_feedback (user_id, created_at desc);

create trigger workout_session_feedback_updated_at
  before update on public.workout_session_feedback
  for each row execute function public.set_updated_at();

alter table public.workout_session_feedback enable row level security;

revoke all on public.workout_session_feedback from public, anon, authenticated;
grant select on public.workout_session_feedback to authenticated;
grant insert (session_id, user_id, overall_effort, flags)
  on public.workout_session_feedback to authenticated;
grant update (overall_effort, flags)
  on public.workout_session_feedback to authenticated;
grant select, insert, update, delete on public.workout_session_feedback to service_role;

-- SECURITY INVOKER 서브쿼리다 — workout_sessions의 RLS가 본인 행을 보여 준다.
-- 새 definer 함수를 만들지 않는다 (명령문 §37).
create policy "workout_session_feedback_select_own" on public.workout_session_feedback
  for select to authenticated using (user_id = auth.uid());
create policy "workout_session_feedback_insert_own" on public.workout_session_feedback
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.workout_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
        and s.status = 'completed'
    )
  );
create policy "workout_session_feedback_update_own" on public.workout_session_feedback
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── ④ AI 코치 결과 ──────────────────────────────────────────
--
-- 세션당 한 행(session_id = PK) — **중복 호출 방지의 진짜 방어선**이다.
-- 클라이언트는 읽기만 한다. 쓰기는 /api/workout-feedback이 service role로 한다.
-- 판정 품질을 나중에 비교하려고 model·prompt_version·algorithm_version을 남긴다.

create table if not exists public.workout_ai_feedback (
  session_id uuid primary key
    references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'completed', 'failed')),
  attempt_count smallint not null default 1 check (attempt_count between 1 and 10),
  metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metrics) = 'object' and octet_length(metrics::text) <= 60000),
  feedback jsonb
    check (
      feedback is null
      or (jsonb_typeof(feedback) = 'object' and octet_length(feedback::text) <= 20000)
    ),
  model text check (model is null or char_length(model) between 1 and 80),
  prompt_version text not null check (char_length(prompt_version) between 1 and 60),
  algorithm_version text not null check (char_length(algorithm_version) between 1 and 60),
  error_code text check (error_code is null or char_length(error_code) between 1 and 64),
  generated_at timestamptz,
  -- 사용자에게 결과를 처음 내준 시각 — 열람률 KPI (analytics_events는 평생 1행이라 못 잰다)
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'completed' and feedback is not null and generated_at is not null)
    or (status <> 'completed' and feedback is null)
  )
);

create index if not exists workout_ai_feedback_user_recent
  on public.workout_ai_feedback (user_id, created_at desc);

create trigger workout_ai_feedback_updated_at
  before update on public.workout_ai_feedback
  for each row execute function public.set_updated_at();

alter table public.workout_ai_feedback enable row level security;

revoke all on public.workout_ai_feedback from public, anon, authenticated;
grant select on public.workout_ai_feedback to authenticated;
grant select, insert, update, delete on public.workout_ai_feedback to service_role;

create policy "workout_ai_feedback_select_own" on public.workout_ai_feedback
  for select to authenticated using (user_id = auth.uid());

-- ── ⑤ 계측: 목표 설정을 열었다 ──────────────────────────────
--
-- ⓘ 넓히기만 한다. 끝냈는지는 training_profiles.created_at이 안다 (0093 원칙).
--    생성 성공률·열람률·체감 응답률은 ③④ 테이블에서 센다 — 여기 넣지 않는다.

alter table public.analytics_events
  drop constraint analytics_events_event_name_check;

alter table public.analytics_events
  add constraint analytics_events_event_name_check check (
    event_name = any (array[
      'landing_opened',
      'onboarding_started',
      'identity_link_started',
      'identity_link_failed',
      'challenge_viewed',
      'challenge_create_started',
      'challenge_share_started',
      'challenge_goal_started',
      'ai_coach_onboarding_started' -- 0112: AI 코치 목표 설정 시트를 열었다
    ]::text[])
  );

commit;

-- 적용 후 확인:
--   select column_name from information_schema.columns
--    where table_name = 'workout_sets' and column_name = 'client_completed_at';
--   select tablename, rowsecurity from pg_tables
--    where tablename in ('training_profiles','workout_session_feedback','workout_ai_feedback');
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'analytics_events_event_name_check';
--   그리고 node scripts/dump-schema-snapshot.mjs 로 스냅샷 갱신
