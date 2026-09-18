-- 0107 — 챌린지 활동 피드: 자르기(limit) 전에 최신순으로 정렬한다 (0095 다음)
--
-- ⓘ 비파괴 변경이다(`create or replace function`, 본문 한 줄 추가). CLAUDE.md
--   §DB 마이그레이션의 "그냥 실행한다" 칸에 해당한다. drop·delete·revoke·기존 행
--   update 가 없다. 응답 모양(jsonb 배열·키)도 그대로라 **운영 중인 앱이 그대로 돈다.**
--
-- **왜 필요한가 — 0095의 `limit 200`이 정렬보다 먼저 걸린다.**
--   서브쿼리에 `order by`가 없어서, 행이 200개를 넘으면 Postgres가 **아무 200개**를
--   고른 뒤에야 바깥 `jsonb_agg(... order by ord desc)`가 정렬한다. 그러면
--     ① "최근 5개"가 최근이 아니고
--     ② 활동 TOP 3의 횟수가 조용히 틀린다 (오류 없이 숫자만 틀린다)
--   2026-09-18 운영 실측: active 챌린지 4개, 최대 70행(3명·9주)이라 아직은 안 터진다.
--   공개 모집(0085~)으로 10명짜리 방이 생기면 4주에 약 280행이라 터진다.
--
-- ⚠️ 본문은 0095가 아니라 **운영 DB의 현행 정의**(`pg_get_functiondef`, 2026-09-18)에서
--    옮겼다. 바뀐 곳은 `limit 200` 바로 위 `order by` 한 줄뿐이다.
--
-- ⚠️ grant/revoke를 다시 쓰지 않는다. `create or replace`는 기존 ACL을 그대로 둔다
--    (postgres·authenticated·service_role에 EXECUTE, anon 없음 — 0095·0096 결과).
--    적용 후 proacl을 다시 조회해 확인한다.

begin;

create or replace function public.get_challenge_activity(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c      public.challenges;
  v_me   uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into c from public.challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;

  /*
    ⚠️⚠️ **active일 때만 연다.** 챌린지가 끝나면(ended·cancelled) 임시 소셜
       권한이 상태 판정만으로 사라진다 — 행을 지워서 권한을 없애지 않는다.
       최종 랭킹·결과는 다른 경로(get_challenge_period_sessions)가 계속 준다.

    ⚠️ 요청자가 **지금 그 방의 유효 참가자**여야 한다. dropped는 제외다.
       존재 자체를 숨기려고 'challenge_not_found'로 뭉갠다(기존 관례와 같다).
  */
  if c.status <> 'active' then raise exception 'challenge_not_found'; end if;
  if not exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = v_me and status = 'joined'
  ) then
    raise exception 'challenge_not_found';
  end if;

  select coalesce(jsonb_agg(row order by ord desc), '[]'::jsonb) into v_rows
  from (
    select
      coalesce(s.completed_at, s.started_at) as ord,
      jsonb_build_object(
        'session_id',   s.id,
        'user_id',      s.user_id,
        -- ⚠️ 개인정보 최소. 닉네임·아바타까지다. 이메일·유입·초대코드는 주지 않는다.
        'nickname',     p.nickname,
        'avatar_url',   p.avatar_url,
        'status',       s.status,
        'title',        s.title,
        'workout_type', s.workout_type,
        'started_at',   s.started_at,
        'completed_at', s.completed_at,
        'has_photo',    exists (select 1 from public.workout_images wi where wi.session_id = s.id),
        'cheer_count',  (select count(*) from public.cheers ch where ch.session_id = s.id),
        'my_cheers',    (select count(*) from public.cheers ch
                          where ch.session_id = s.id and ch.sender_id = v_me),
        'is_mine',      s.user_id = v_me
      ) as row
    from public.workout_sessions s
    join public.challenge_participants cp
      on cp.user_id = s.user_id
     and cp.challenge_id = p_challenge_id
     and cp.status = 'joined'
    join public.profiles p on p.id = s.user_id
    where s.deleted_at is null
      -- ⚠️ 비공개 운동은 챌린지 참가자에게도 열지 않는다. 기존 visibility 의미 존중.
      and s.visibility = 'group'
      and s.status in ('active', 'completed')
      /*
        ⚠️ **챌린지 기간의 운동만.** 같은 챌린지를 한다고 상대의 3개월 전 기록까지
           열면 안 된다. 집계 함수와 같은 창(시작 -1일 ~ 종료 +2일)을 쓴다 —
           시간대 차이로 경계 하루가 잘리는 것을 막으려고 기존이 그렇게 잡았다.
      */
      and coalesce(s.completed_at, s.started_at) >= (c.start_date - 1)::timestamptz
      and coalesce(s.completed_at, s.started_at) <  (c.end_date + 2)::timestamptz
      -- ⚠️ 차단은 양방향으로 가린다. 기존 차단 정책과 같은 원칙.
      and not public.is_blocked_between(v_me, s.user_id)
    -- ⚠️ (0107) 자르기 전에 정렬한다. 이 줄이 없으면 200개를 넘는 순간 "아무 200개"가 된다.
    order by coalesce(s.completed_at, s.started_at) desc
    limit 200
  ) t;

  return v_rows;
end $function$;

comment on function public.get_challenge_activity(uuid) is
  'active 챌린지의 임시 소셜 피드. 기간 내·공개·미삭제 운동만, 유효 참가자만, 차단 제외. ended면 challenge_not_found. 최신순 200개(자르기 전에 정렬). 0095·0107';

commit;

-- 적용 후 확인:
--   select pg_get_functiondef(p.oid), p.proconfig, p.proacl, p.prosecdef
--     from pg_proc p where p.proname = 'get_challenge_activity';
--   → 본문에 'order by coalesce(s.completed_at, s.started_at) desc' 가 있고
--     proacl 이 {postgres=X, authenticated=X, service_role=X} 그대로여야 한다.
