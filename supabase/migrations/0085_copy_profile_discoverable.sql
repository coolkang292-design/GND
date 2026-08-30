-- 0085: 따라하기 · 프로필 소개/SNS · 공개 챌린지
-- 설계: docs/superpowers/plans/2026-08-31-follow-profile-discoverable.md
-- 적용: Supabase Dashboard -> SQL Editor에 전체 붙여넣고 Run (1회만).
--       0001~0084는 수정하지 않는다.
--
-- 배포보다 먼저 Run 해도 안전하다. 전부 넓히거나(새 컬럼 nullable, 기본값 false)
-- 좁히는(revoke) 변경이다. 운영 앱은 새 컬럼을 안 읽고, revoke는 authenticated로
-- 부르는 경로에 영향이 없다.
--
-- 무엇을 하나
--   1) challenges.discoverable            - 피드에서 참가자를 모집해도 되는가
--   2) profiles.bio / instagram_url / youtube_url  (+ 스킴/길이 CHECK)
--   3) get_crew_member_profile            - 반환 jsonb에 3키 추가 (문지기 그대로)
--   4) list_discoverable_challenges()     - 공개 모집 목록 (최소 반환)
--   5) join_discoverable_challenge(uuid)  - 공개 참가
--   6) join_challenge_with_code(text)     - 기존 링크 참가에 행 잠금 보강
--   7) leave_setup_challenge(uuid)        - setup 단계 나가기 (되돌리기 버튼)
--   8) EXECUTE 권한 잠그기 (신규 + 0082~0084 소급)
--
-- 되돌리기
--   drop function public.list_discoverable_challenges();
--   drop function public.join_discoverable_challenge(uuid);
--   drop function public.leave_setup_challenge(uuid);
--   alter table public.challenges drop column discoverable;
--   alter table public.profiles drop column bio, drop column instagram_url,
--                               drop column youtube_url;
--   get_crew_member_profile / join_challenge_with_code 는 0084 시점 정의를
--   docs/db-current-schema.sql 이력에서 다시 Run 하면 원복된다.

begin;

-- ============================================================
-- 1) challenges.discoverable
-- ============================================================
--
-- 의미는 "챌린지 내부가 공개"가 아니라 **"피드에서 참가자를 모집해도 된다"**다.
--
-- 기본값 false가 핵심이다. 기존 챌린지에는 전부 invite_code가 있으므로
-- "invite_code가 있다 = 공개"로 판단했다면 비공개 챌린지가 전부 노출됐다.

alter table public.challenges
  add column if not exists discoverable boolean not null default false;

-- 목록 RPC가 정확히 이 조건으로 훑는다.
create index if not exists challenges_discoverable_idx
  on public.challenges (start_date, created_at desc)
  where discoverable and status = 'setup';

-- ============================================================
-- 2) profiles - 소개 / Instagram / YouTube
-- ============================================================
--
-- 전부 nullable. 기존 사용자에게 영향 0.
--
-- CHECK를 DB에 거는 이유: profiles는 본인 UPDATE가 열려 있어서 앱 화면을 거치지
-- 않고 REST를 직접 부르는 경로가 있다. 그래서 DB가 **위험한 스킴과 길이**를 막는다.
--
-- 역할 분담을 정확히 해 둔다:
--   DB        - javascript:/data: 같은 스킴 차단 + 길이 상한
--   클라이언트 - Instagram/YouTube **실제 도메인** 검증 (domain/profile-links.ts)
-- 즉 https://evil.com 은 DB에는 저장된다. XSS는 막지만 정합성까지 보장하지는 않는다.

alter table public.profiles
  add column if not exists bio           text,
  add column if not exists instagram_url text,
  add column if not exists youtube_url   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_len_check') then
    alter table public.profiles
      add constraint profiles_bio_len_check
      check (bio is null or char_length(bio) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_instagram_url_check') then
    alter table public.profiles
      add constraint profiles_instagram_url_check
      check (instagram_url is null
             or (instagram_url like 'https://%' and char_length(instagram_url) <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_youtube_url_check') then
    alter table public.profiles
      add constraint profiles_youtube_url_check
      check (youtube_url is null
             or (youtube_url like 'https://%' and char_length(youtube_url) <= 200));
  end if;
end $$;

-- ============================================================
-- 3) get_crew_member_profile - 반환 jsonb에 3키
-- ============================================================
--
-- profiles의 SELECT 정책은 **넓히지 않는다.** 그 테이블에는 invite_code와
-- acquisition_* 가 같이 산다. 이 함수의 문지기(본인/크루/같은 챌린지)를 그대로 두고
-- 반환 키만 늘린다.
--
-- 아래 본문은 운영 스냅샷(docs/db-current-schema.sql)에서 **그대로 추출**해
-- 세 곳만 기계로 끼워 넣은 것이다. 손으로 옮겨 적지 않았다.

CREATE OR REPLACE FUNCTION public.get_crew_member_profile(p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bio       text;
  v_instagram text;
  v_youtube   text;
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
  -- 0085: bio·SNS를 **여기 얹는다.** 이 select는 이미 profiles를 읽고 있어서
  -- 왕복이 늘지 않는다. 별도 조회를 새로 놓으면 문지기가 두 곳으로 갈라진다.
  select p.created_at, coalesce(nullif(p.timezone, ''), 'Asia/Seoul'),
         p.bio, p.instagram_url, p.youtube_url
    into v_joined_at, v_tz, v_bio, v_instagram, v_youtube
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
    'distanceMeters', coalesce(v_meters, 0),
    -- 0085 — 소개·SNS. 문지기(본인/크루/같은 챌린지)는 위에서 이미 통과했다.
    'bio',           v_bio,
    'instagramUrl',  v_instagram,
    'youtubeUrl',    v_youtube
  );
end $function$;

-- ============================================================
-- 4) list_discoverable_challenges - 공개 모집 목록
-- ============================================================
--
-- challenges_select_member 정책이 "참가자 OR 그룹원"이라 비참가자는 목록을 볼 수
-- 없다. 그래서 정의자 RPC로 **최소값만** 낸다.
--
-- 반환하지 않는 것: invite_code, group_id, user_goals, 점수, 랭킹, 참가자 명단,
--                  profiles의 다른 필드.
--
-- participant_count는 status='joined'만 센다. challenge_participants.status는
-- invited / joined / dropped 세 종류라, count(*)로 세면 초대·탈락이 쌓이는 순간
-- 카드 숫자가 부풀어 오른다.
--
-- photo_required는 반환에 **남긴다.** 지금 운영 데이터가 전부 true인 것은 그렇게
-- 만들어 왔을 뿐이고, create_challenge_room(SECURITY DEFINER)이 false를 저장할 수
-- 있다. 데이터의 우연을 구조로 착각하면 나중에 카드가 거짓말을 한다.

create or replace function public.list_discoverable_challenges()
returns table (
  id                uuid,
  name              text,
  start_date        date,
  end_date          date,
  photo_required    boolean,
  participant_count integer,
  host_id           uuid,
  host_nickname     text,
  host_avatar_url   text,
  already_joined    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         c.name,
         c.start_date,
         c.end_date,
         c.photo_required,
         (select count(*)::int
            from challenge_participants cp
           where cp.challenge_id = c.id
             and cp.status = 'joined')                    as participant_count,
         c.created_by                                     as host_id,
         p.nickname                                       as host_nickname,
         p.avatar_url                                     as host_avatar_url,
         exists (select 1 from challenge_participants me
                  where me.challenge_id = c.id
                    and me.user_id = (select auth.uid())
                    and me.status = 'joined')             as already_joined
  from challenges c
  join profiles p on p.id = c.created_by
  where c.discoverable
    and c.status = 'setup'
    and (select auth.uid()) is not null
  order by c.start_date asc, c.created_at desc
  limit 12
$$;

-- ============================================================
-- 5) join_discoverable_challenge - 공개 참가
-- ============================================================
--
-- 잠금이 이 함수의 핵심이다.
--
-- start_challenge는 advisory lock을 **쓰지 않고** challenges 행에 FOR UPDATE를
-- 건다. 그래서 참가 쪽이 advisory lock만 잡으면 **둘은 서로를 전혀 막지 않는다.**
-- 남는 틈:
--     참가자: status=setup 확인
--       -> 방장: start_challenge가 행을 잠그고 active로 변경
--       -> 참가자: 이미 읽은 setup을 믿고 INSERT   = 시작된 챌린지에 중도 합류
--
-- 그래서 **같은 자원(challenges 행)을 FOR UPDATE로** 잡는다. 그러면
--   참가가 먼저 잠금 -> start_challenge가 기다렸다가 새 참가자를 포함해 검사
--   시작이 먼저 잠금 -> 참가가 기다렸다가 active를 읽고 거절
--
-- 참가는 crew 관계를 만들지 않는다 (챌린지 관계 != 크루 관계).

create or replace function public.join_discoverable_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  c     public.challenges;
  v_row public.challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 1차 조회: 공개된 방인가
  if not exists (
    select 1 from public.challenges
    where id = p_challenge_id and discoverable
  ) then
    raise exception 'not_discoverable';
  end if;

  -- 2차: 행을 잠그고 다시 읽는다. start_challenge와 같은 자원이다.
  select * into c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then raise exception 'not_discoverable'; end if;
  -- 방장이 방금 모집을 껐을 수 있다
  if not c.discoverable then raise exception 'not_discoverable'; end if;
  -- 방장이 방금 시작했을 수 있다
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row
  from public.challenge_participants
  where challenge_id = c.id
    and user_id = v_me
  for update;

  if found and v_row.status = 'joined' then
    raise exception 'already_joined';
  end if;

  insert into public.challenge_participants (
    challenge_id, user_id, role, status, joined_at
  ) values (
    c.id, v_me, 'member', 'joined', now()
  )
  on conflict (challenge_id, user_id)
  do update set status = 'joined', joined_at = now();

  return jsonb_build_object(
    'status', 'joined',
    'challengeId', c.id,
    'challengeName', c.name,
    'crewLinked', 0
  );
end $$;

-- ============================================================
-- 6) join_challenge_with_code - 같은 행 잠금 보강
-- ============================================================
--
-- 공개 참가만 고치면 **링크 참가에는 같은 race가 그대로 남는다.**
-- 아래는 0064 정의 그대로이고, 락 이후 재조회에 `for update` 한 줄만 더했다.
-- 기존 advisory lock은 지우지 않는다 - 있던 방어를 빼지 않는다.

create or replace function public.join_challenge_with_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_me uuid := auth.uid();
  c public.challenges;
  v_row public.challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into c
  from public.challenges
  where invite_code = upper(trim(p_code));

  if not found then raise exception 'invalid_invite_code'; end if;

  perform pg_advisory_xact_lock(hashtext(c.id::text));

  -- 0085: `for update` 추가. start_challenge가 advisory lock을 쓰지 않고
  --       challenges 행만 잠그기 때문에, 여기서도 같은 행을 잡아야 직렬화된다.
  select * into c from public.challenges where id = c.id for update;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row
  from public.challenge_participants
  where challenge_id = c.id
    and user_id = v_me
  for update;

  if found and v_row.status = 'joined' then
    raise exception 'already_joined';
  end if;

  insert into public.challenge_participants (
    challenge_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    c.id,
    v_me,
    'member',
    'joined',
    now()
  )
  on conflict (challenge_id, user_id)
  do update set status = 'joined', joined_at = now();

  return jsonb_build_object(
    'status', 'joined',
    'challengeId', c.id,
    'challengeName', c.name,
    'crewLinked', 0
  );
end $function$;

-- ============================================================
-- 7) leave_setup_challenge - setup 단계 나가기
-- ============================================================
--
-- challenge_participants에는 SELECT 정책 하나뿐이고 INSERT/UPDATE/DELETE 정책이
-- 아예 없다. 즉 사용자가 직접 나갈 방법이 없었다.
--
-- 초대 링크는 누가 일부러 보내 준 것이라 참을 만했다. 하지만 공개 모집은
-- "발견 -> 참여하기"라 오조작이 필연이다. **되돌리기 버튼이 없는 참가 버튼은
-- 만들면 안 된다.**
--
-- 방장은 나갈 수 없다. 방장이 사라지면 방을 시작할 사람이 없어진다 -
-- 방장은 cancel_challenge로 방을 접는다.

create or replace function public.leave_setup_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  c     public.challenges;
  v_row public.challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 참가/시작과 같은 자원을 잡는다
  select * into c from public.challenges where id = p_challenge_id for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;
  if c.created_by = v_me then raise exception 'host_cannot_leave'; end if;

  select * into v_row
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me
  for update;
  if not found then raise exception 'not_participant'; end if;

  -- 내 목표와 동의를 먼저 걷는다. 남기면 시작 게이트(kpi_incomplete /
  -- consent_incomplete)가 이미 나간 사람을 계속 기다린다.
  delete from public.user_goals
   where challenge_id = p_challenge_id and user_id = v_me;

  delete from public.challenge_participants
   where challenge_id = p_challenge_id and user_id = v_me;

  return jsonb_build_object('status', 'left', 'challengeId', p_challenge_id);
end $$;

-- ============================================================
-- 8) EXECUTE 권한 - 신규 + 0082~0084 소급
-- ============================================================
--
-- Postgres는 함수에 **PUBLIC EXECUTE를 기본으로 준다.** 0082~0084에서
-- `grant ... to authenticated`만 쓰고 PUBLIC을 걷지 않아서, 아래 셋이 지금
-- anon에게도 열려 있다. 새는 데이터는 없지만(auth.uid()가 null이면 예외 또는
-- 0행) **다음 사람이 이 패턴을 복사하면 그때는 샌다.**

revoke execute on function public.list_discoverable_challenges()          from public, anon;
revoke execute on function public.join_discoverable_challenge(uuid)       from public, anon;
revoke execute on function public.leave_setup_challenge(uuid)             from public, anon;
revoke execute on function public.post_session_comment(uuid, text, uuid)  from public, anon;
revoke execute on function public.edit_session_comment(uuid, text)        from public, anon;
revoke execute on function public.get_session_actor_profiles(uuid[])      from public, anon;

grant execute on function public.list_discoverable_challenges()          to authenticated;
grant execute on function public.join_discoverable_challenge(uuid)       to authenticated;
grant execute on function public.leave_setup_challenge(uuid)             to authenticated;
grant execute on function public.post_session_comment(uuid, text, uuid)  to authenticated;
grant execute on function public.edit_session_comment(uuid, text)        to authenticated;
grant execute on function public.get_session_actor_profiles(uuid[])      to authenticated;
grant execute on function public.get_crew_member_profile(uuid)           to authenticated;
grant execute on function public.join_challenge_with_code(text)          to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 컬럼 4개 - 4가 나와야 한다
--   select count(*) from information_schema.columns
--   where (table_name='challenges' and column_name='discoverable')
--      or (table_name='profiles' and column_name in ('bio','instagram_url','youtube_url'));
--
-- (2) 기존 챌린지가 전부 비공개인가 - 0이어야 한다
--   select count(*) from challenges where discoverable;
--
-- (3) 신규 RPC 3개 - 3
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname in
--     ('list_discoverable_challenges','join_discoverable_challenge','leave_setup_challenge');
--
-- (4) anon EXECUTE가 남아 있나 - **0이어야 한다**
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('list_discoverable_challenges','join_discoverable_challenge',
--                       'leave_setup_challenge','post_session_comment',
--                       'edit_session_comment','get_session_actor_profiles')
--     and array_to_string(p.proacl,',') like '%anon=X%';
--
-- (5) 프로필 함수가 3키를 내는가 - true
--   select (get_crew_member_profile(auth.uid()) ? 'bio');   -- 로그인한 세션에서
--
-- (6) 링크 참가에 행 잠금이 들어갔나 - true
--   select pg_get_functiondef(oid) ilike '%where id = c.id for update%'
--   from pg_proc where proname='join_challenge_with_code';
