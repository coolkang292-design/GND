-- 0081: 프로필 이력 타임라인 + 열람 계측
-- 설계: docs/superpowers/plans/2026-08-19-five-feature-review.md (Phase 0-B)
-- 적용: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회만).
--       0001~0080은 수정하지 않는다.
--
-- ⚠ **배포보다 먼저 Run 해도 안전하다.** 운영에 떠 있는 앱은 새 키를 안 읽고
--   새 테이블도 안 쓴다. RPC는 **기존 키를 그대로 두고 키만 더한다** —
--   옛 클라이언트는 모르는 키를 무시한다.
--
-- ⚠ 되돌리기: `get_crew_member_profile`은 `create or replace`라
--   **0039_crew_link_switchover.sql의 A4 절(173~208줄)을 다시 Run** 하면 원복된다.
--   `profile_views`는 `drop table public.profile_views;`.
--   `shares_any_challenge_with`는 남겨도 무해하다(아무도 안 부르면 그만).
--
-- 무엇을 하나
--   ① shares_any_challenge_with — "이 둘이 같은 챌린지에 있나" (0051의 챌린지판을 사람판으로)
--   ② get_crew_member_profile — 문지기를 넓히고 **이력 3종 + 누적 4종**을 더한다
--   ③ profile_views — 프로필을 **몇 번 열었는지** 남긴다 (없으면 열람권 꼴이 난다)

begin;

-- ════════════════════════════════════════════════════════════
-- ① 같은 챌린지에 있는가 (사람 대 사람)
-- ════════════════════════════════════════════════════════════
--
-- 0051의 `shares_challenge_with(challenge_id, other)`는 **특정 방**을 묻는다.
-- 프로필 시트는 방을 모르고 사람만 안다 — 그래서 "아무 방이든 같이 있나"가 필요하다.
--
-- ⚠ 판정 규칙은 0051과 **똑같이** 맞춘다. 다르게 두면 같은 사람에 대해 랭킹판은
--   보이는데 프로필은 안 보이는(혹은 그 반대) 이상한 상태가 된다:
--     · cancelled 방은 뺀다 — 취소된 방으로 남의 정보를 계속 보면 안 된다
--     · invited(수락 전)도 뺀다 — 초대만 받아 놓고 들여다보는 길이 열린다
create or replace function public.shares_any_challenge_with(p_other uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.challenge_participants mine
    join public.challenge_participants theirs
      on theirs.challenge_id = mine.challenge_id
    join public.challenges c
      on c.id = mine.challenge_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_other
      and mine.status in ('joined', 'dropped')
      and theirs.status in ('joined', 'dropped')
      and c.status <> 'cancelled'
  )
$$;
revoke all on function public.shares_any_challenge_with(uuid) from public, anon;
grant execute on function public.shares_any_challenge_with(uuid)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- ② get_crew_member_profile — 현행 0039(A4)를 대체한다
-- ════════════════════════════════════════════════════════════
--
-- ⚠⚠ **기존 4개 키(totalXp·currentLevel·currentStage·badges)를 그대로 둔다.**
--    `progression.ts`의 `CrewProfileRow`가 그 이름으로 읽는다. 이름을 바꾸면
--    프로필 시트가 레벨 0으로 그려진다.
--
-- ⚠ **문지기를 넓혔다**: 크루 **또는 같은 챌린지**. 옛 판은 크루만 통과시켜서,
--   같은 챌린지 참가자인데 크루가 아닌 사람의 프로필을 누르면 "크루가 아니에요"만
--   나왔다. 챌린지 참가자 명단·랭킹은 0051이 이미 열어 준 정보다 — 같은 사람의
--   프로필만 막는 것은 앞뒤가 안 맞는다.
--
-- ⚠ **RLS를 열지 않는다.** `user_badges`·`xp_transactions`는 본인만 읽는 정책
--   그대로다(0020·0022). 이 함수가 `security definer`라 서버에서 대신 읽는다.
--   정책을 넓히는 것보다 안전하다 — 새는 통로가 이 함수 하나뿐이다.
create or replace function public.get_crew_member_profile(p_target_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_progress user_progress%rowtype;
  v_badges jsonb;
  v_level_ups jsonb;
  v_joined_at timestamptz;
  v_tz text;
  v_count int;
  v_minutes int;
  v_days int;
  v_meters numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- 0081: 크루 **또는** 같은 챌린지 (0039는 크루만이었다)
  if p_target_id <> auth.uid()
     and not public.is_crew_with(p_target_id)
     and not public.shares_any_challenge_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  select * into v_progress from user_progress where user_id = p_target_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'badgeKey', b.badge_key,
               'periodKey', b.period_key,
               'earnedAt', b.earned_at)
             order by b.earned_at
           ), '[]'::jsonb)
    into v_badges
  from user_badges b
  where b.user_id = p_target_id;

  -- ── 가입일 · 타임존 ────────────────────────────────────────
  select p.created_at, coalesce(nullif(p.timezone, ''), 'Asia/Seoul')
    into v_joined_at, v_tz
  from profiles p where p.id = p_target_id;

  -- ── 레벨업 시점 ────────────────────────────────────────────
  --
  -- 전용 기록이 없다. `notifications(type='level_up')`이 있긴 한데 **알림은
  -- 지워질 수 있어서** 진실로 쓸 수 없다. 대신 `xp_transactions`를 시간순으로
  -- 되감아 각 레벨 임계를 **처음 넘은 순간**을 찾는다 — 원장이 남아 있는 한 같은
  -- 답이 나온다.
  --
  -- ⚠ 누적합이 항상 오르지는 않는다(`reverse`는 음수다). 그래서 `min(created_at)`이다 —
  --   "처음 넘은 때"가 레벨업한 때다. 나중에 깎여 내려가도 그 사건은 일어났다.
  -- ⚠ level 1(required_total_xp = 0)은 뺀다. 그건 레벨업이 아니라 가입이다.
  with running as (
    select t.created_at,
           sum(t.amount) over (
             order by t.created_at, t.id
             rows between unbounded preceding and current row
           ) as total
    from xp_transactions t
    where t.user_id = p_target_id
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('level', ld.level, 'at', f.at)
             order by ld.level
           ), '[]'::jsonb)
    into v_level_ups
  from level_definitions ld
  cross join lateral (
    select min(r.created_at) as at from running r
    where r.total >= ld.required_total_xp
  ) f
  where ld.required_total_xp > 0 and f.at is not null;

  -- ── 누적 성과 ──────────────────────────────────────────────
  --
  -- ⚠ 완료 판정은 앱의 `getCompletedSessions`와 **같은 세 조건**이다
  --   (status='completed' · deleted_at is null · completed_at is not null).
  --   하나라도 빠뜨리면 같은 사람의 숫자가 화면마다 갈린다.
  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         count(distinct (s.completed_at at time zone v_tz)::date)
    into v_count, v_minutes, v_days
  from workout_sessions s
  where s.user_id = p_target_id
    and s.status = 'completed'
    and s.deleted_at is null
    and s.completed_at is not null;

  -- ⚠ 완료된 세트만 센다. 담아 놓고 안 한 세트의 거리는 뛴 것이 아니다.
  select coalesce(sum(st.distance_meters), 0)
    into v_meters
  from workout_sessions s
  join workout_exercises e on e.session_id = s.id
  join workout_sets st on st.workout_exercise_id = e.id
  where s.user_id = p_target_id
    and s.status = 'completed'
    and s.deleted_at is null
    and s.completed_at is not null
    and st.is_completed;

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    'badges',       v_badges,
    -- 0081부터
    'joinedAt',       v_joined_at,
    'levelUps',       v_level_ups,
    'workoutCount',   coalesce(v_count, 0),
    'totalMinutes',   coalesce(v_minutes, 0),
    'workoutDays',    coalesce(v_days, 0),
    'distanceMeters', coalesce(v_meters, 0)
  );
end $$;
revoke all on function public.get_crew_member_profile(uuid) from public, anon;
grant execute on function public.get_crew_member_profile(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- ③ profile_views — 프로필을 몇 번 열었는지
-- ════════════════════════════════════════════════════════════
--
-- ⚠⚠ **이게 없으면 이 기능이 쓰이는지 영원히 알 수 없다.**
--    꾸준왕 열람권은 만든 지 한 달이 넘도록 `record_views` **0행**이었는데,
--    그걸 알 수 있었던 이유가 **테이블이 있었기 때문**이다. 화면 이벤트 계측이
--    이 앱에 한 건도 없어서(2026-08-19 확인) 다른 방법이 없다.
--
-- ⚠ `record_views`(열람권)와 **다른 테이블**이다. 섞으면 열람권 통계가 오염된다.
--    열람권은 "주 5일 운동해야 열리는 권리"고 이건 그냥 프로필 카드를 연 것이다.
--
-- ⚠ **알림을 보내지 않는다.** `record_views`는 'record_viewed' 알림을 띄우지만
--    이건 계측 전용이다. 프로필을 열 때마다 상대 폰이 울리면 아무도 안 누른다.
create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  -- 어느 화면에서 눌렀나. 0건이 나왔을 때 **어느 진입점이 안 보이는지** 알아야 한다.
  source text not null check (source in ('feed', 'crew', 'home', 'challenge')),
  created_at timestamptz not null default now(),
  constraint profile_views_not_self check (viewer_id <> target_id)
);
create index if not exists profile_views_target_time_idx
  on public.profile_views (target_id, created_at desc);
create index if not exists profile_views_time_idx
  on public.profile_views (created_at desc);

alter table public.profile_views enable row level security;

drop policy if exists "profile_views_insert_own" on public.profile_views;
create policy "profile_views_insert_own" on public.profile_views
  for insert to authenticated with check (viewer_id = auth.uid());

-- 본인이 남긴 행만 보인다. "누가 나를 봤는지"는 화면에 없다 — 관리자 집계는
-- service_role로 읽으므로 이 정책의 영향을 받지 않는다.
drop policy if exists "profile_views_select_own" on public.profile_views;
create policy "profile_views_select_own" on public.profile_views
  for select to authenticated using (viewer_id = auth.uid());

revoke all on public.profile_views from anon;
grant select on public.profile_views to authenticated;
-- created_at은 default(서버시간)만 허용 — 클라가 시각을 지어내지 못하게 한다
grant insert (id, viewer_id, target_id, source) on public.profile_views to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) RPC가 새 키를 돌려주나 — 본인 프로필로 부르면 문지기를 안 탄다
--   select public.get_crew_member_profile(auth.uid());
--   → joinedAt · levelUps · workoutCount · totalMinutes · workoutDays · distanceMeters
--
-- (2) 표가 생겼나 — 1이 나와야 한다
--   select count(*) from information_schema.tables
--   where table_schema = 'public' and table_name = 'profile_views';
--
-- (3) 문지기가 넓어졌나 — 함수 본문에 새 조건이 들어갔는지
--   select pg_get_functiondef('public.get_crew_member_profile(uuid)'::regprocedure)
--          like '%shares_any_challenge_with%';
