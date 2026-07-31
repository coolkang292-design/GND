-- 0051: 챌린지 참가 ≠ 친구 — 열람을 챌린지 안으로 가둔다 (설계 D5 폐기)
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0050은 수정 금지.
--
-- 사용자 신고 (2026-07-31): "리얼GND에 형이라는 아이디가 포함됨. 저 아이디는
-- 다른 챌린지 멤버인데." → "각각의 챌린지별로 크루원을 따로 묶어야지, 기존
-- 챌린지에 다른 챌린지 팀원을 묶으면 안 되지."
--
-- 실제로 형은 그룹 멤버가 아니었다. 챌린지에 링크로 참가하면서 D5가
-- crew_links를 만들었고, 크루 목록·홈 크루 카드에 떠서 "크루에 들어왔다"로
-- 보인 것이다. crew_links에는 challenge_id가 없어 챌린지가 끝나도 남는다.
--
-- 설계서 §9와 인수인계서 §7이 "공개 챌린지를 도입하면 D5를 반드시 재검토하라"고
-- 적어 둔 지점이 정확히 여기다. D5는 "지인 중심 소규모" 전제 위에서만 성립했다.
--
-- ── 왜 정의자 RPC인가 (RLS를 넓히지 않는 이유) ─────────────────
--
-- 크루 연결이 떠받치던 읽기가 세 겹이다.
--   sessions_select_own_or_crew      랭킹이 남의 세션 행을 읽는 근거
--   workout_session_crew_visible     그 세션의 세트·인증사진
--   profiles_select_own_or_crew      랭킹판 닉네임
--
-- 이 셋에 "같은 챌린지 참가자" arm을 OR로 덧붙이면 작업은 짧지만, 참가자가
-- 서로의 운동 원본을 **직접** 읽게 된다 — 반응(reactions)처럼 그 헬퍼를 타는
-- 곁달린 기능으로 관계가 새어 나간다. 친구가 아닌 사람에게 그만큼 열 이유가 없다.
--
-- 대신 필요한 것만 돌려주는 정의자 함수 두 개로 감싼다. RLS는 한 줄도 안 넓힌다.
-- 점수 계산은 지금 쓰는 TS 함수(foldPeriodStats)를 그대로 쓰므로 SQL로 다시
-- 구현하지 않는다 — 두 벌이 되면 갈라지고, 그게 이 저장소가 parity 스크립트로
-- 막아 온 사고다.
--
-- ── 종료 후에도 결과는 보인다 (사용자 결정) ──────────────────
-- ended 챌린지도 참가자면 최종 순위·닉네임을 볼 수 있다. 자기가 한 대결의
-- 기록이기 때문이다. 그래도 피드·운동 알림은 열리지 않는다 — 그건 크루의 몫이다.
--
-- ⚠ 진행 중인 7월 GND 챌린지는 영향이 없다. 참가자 3명이 이미 서로 크루라
--    (2026-07-27 상호 수락) 어느 경로로든 같은 결과가 나온다.

begin;

-- ── 1. 같은 챌린지에 있는가 ──────────────────────────────────
-- cancelled는 뺀다. 취소된 방으로 남의 정보를 계속 보면 안 된다.
-- invited(수락 전)도 뺀다 — 초대만 받아 놓고 남의 실적을 들여다볼 수 있으면
-- 초대가 열람 수단이 된다.
create or replace function public.shares_challenge_with(p_other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from challenge_participants mine
    join challenge_participants theirs on theirs.challenge_id = mine.challenge_id
    join challenges c on c.id = mine.challenge_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_other
      and mine.status in ('joined', 'dropped')
      and theirs.status in ('joined', 'dropped')
      and c.status <> 'cancelled'
  )
$$;
-- ⚠ revoke하지 않는다. 아래 정의자 함수들이 내부에서 부르고, 앞으로 RLS가
--    쓰게 될 수도 있다 — 정책은 호출자 권한으로 평가되므로 revoke하면 anon
--    요청이 0행이 아니라 42501로 죽는다 (0038 is_crew_with와 같은 이유).

-- ── 2. 챌린지 참가자 프로필 ──────────────────────────────────
-- 랭킹판 닉네임용. profiles RLS를 넓히는 대신 필요한 컬럼만 돌려준다.
create or replace function public.get_challenge_participant_profiles(p_challenge_id uuid)
returns table (id uuid, nickname text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar_url
  from challenge_participants cp
  join profiles p on p.id = cp.user_id
  where cp.challenge_id = p_challenge_id
    and cp.status in ('joined', 'dropped')
    -- 부르는 사람이 그 챌린지 참가자여야 한다. 아니면 빈 결과다.
    and public.is_challenge_participant(p_challenge_id, (select auth.uid()))
$$;
revoke all on function public.get_challenge_participant_profiles(uuid) from public, anon;
grant execute on function public.get_challenge_participant_profiles(uuid) to authenticated;

-- ── 3. 챌린지 기간 세션 ──────────────────────────────────────
-- getPeriodStatsByUser가 먹던 것과 **같은 모양**을 돌려준다. 클라가 지금처럼
-- foldPeriodStats로 접는다 — 점수 계산을 SQL에 복제하지 않는다.
--
-- 기간창은 앱과 같은 규칙이다(시작일 -1일 ~ 종료일 +2일, UTC). 최종 판정은
-- foldPeriodStats가 KST 날짜로 다시 하므로 여기서는 넉넉히 담는다.
create or replace function public.get_challenge_period_sessions(p_challenge_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c challenges;
  v_rows jsonb;
begin
  select * into c from challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'user_id', s.user_id,
      'completed_at', s.completed_at,
      'tabata_minutes', s.tabata_minutes,
      'workout_exercises', coalesce((
        select jsonb_agg(jsonb_build_object(
          'exercise_type', we.exercise_type,
          'exercise_name', we.exercise_name,
          'body_part', we.body_part,
          'workout_sets', coalesce((
            select jsonb_agg(jsonb_build_object(
              'weight_kg', ws.weight_kg,
              'reps', ws.reps,
              'distance_meters', ws.distance_meters,
              'duration_seconds', ws.duration_seconds,
              'is_completed', ws.is_completed
            ))
            from workout_sets ws where ws.workout_exercise_id = we.id
          ), '[]'::jsonb)
        ))
        from workout_exercises we where we.session_id = s.id
      ), '[]'::jsonb)
    ) as row
    from workout_sessions s
    join challenge_participants cp
      on cp.user_id = s.user_id
     and cp.challenge_id = p_challenge_id
     and cp.status in ('joined', 'dropped')
    where s.status = 'completed'
      and s.deleted_at is null
      and s.completed_at >= (c.start_date - 1)::timestamptz
      and s.completed_at <  (c.end_date + 2)::timestamptz
      -- 사진 인증 필수 챌린지는 사진 있는 세션만 (앱의 workout_images!inner와 같다)
      and (
        not c.photo_required
        or exists (select 1 from workout_images wi where wi.session_id = s.id)
      )
  ) t;

  return v_rows;
end $$;
revoke all on function public.get_challenge_period_sessions(uuid) from public, anon;
grant execute on function public.get_challenge_period_sessions(uuid) to authenticated;

-- ── 4. D5 폐기 — 챌린지 참가가 친구를 만들지 않는다 ──────────
-- accept_challenge_invite에서 crew_links 생성만 걷어낸다. 나머지는 현행 그대로.
create or replace function public.accept_challenge_invite(p_challenge_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_row challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 챌린지 단위 직렬화. crew_links는 더 이상 안 만들지만, 두 사람이 동시에
  -- 수락할 때 상태 전이가 엇갈리지 않게 락은 유지한다.
  perform pg_advisory_xact_lock(hashtext(p_challenge_id::text));

  select * into c from challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me for update;
  if not found then raise exception 'not_invited'; end if;
  if v_row.status = 'joined' then raise exception 'already_joined'; end if;
  if v_row.status = 'dropped' then raise exception 'dropped'; end if;

  update challenge_participants
     set status = 'joined', joined_at = now()
   where challenge_id = p_challenge_id and user_id = v_me;

  -- 0051: crewLinked를 0으로 고정한다. 필드를 지우면 옛 클라이언트가 깨진다.
  return jsonb_build_object('status', 'joined', 'crewLinked', 0);
end $$;
revoke all on function public.accept_challenge_invite(uuid) from public, anon;
grant execute on function public.accept_challenge_invite(uuid) to authenticated;

-- 링크 참가도 같다.
create or replace function public.join_challenge_with_code(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_row challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into c from challenges where invite_code = upper(trim(p_code));
  if not found then raise exception 'invalid_invite_code'; end if;

  perform pg_advisory_xact_lock(hashtext(c.id::text));

  select * into c from challenges where id = c.id;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row from challenge_participants
  where challenge_id = c.id and user_id = v_me for update;
  if found and v_row.status = 'joined' then
    raise exception 'already_joined';
  end if;

  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'member', 'joined', now())
  on conflict (challenge_id, user_id)
  do update set status = 'joined', joined_at = now();

  return jsonb_build_object(
    'status', 'joined', 'challengeId', c.id, 'challengeName', c.name,
    'crewLinked', 0
  );
end $$;
revoke all on function public.join_challenge_with_code(text) from public, anon;
grant execute on function public.join_challenge_with_code(text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 두 참가 RPC에 crew_links가 남아 있지 않아야 한다 — 둘 다 false
--   select proname, pg_get_functiondef(oid) ilike '%crew_links%' as still_links
--   from pg_proc where proname in ('accept_challenge_invite','join_challenge_with_code');
--
-- (2) 새 함수 3개
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname in
--     ('shares_challenge_with','get_challenge_participant_profiles','get_challenge_period_sessions');
--
-- (3) 실사용 크루 연결 3쌍은 그대로 (챌린지가 만든 것이 아니라 상호 수락)
--   select count(*) from crew_links;   → 3
