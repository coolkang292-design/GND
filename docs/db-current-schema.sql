-- 운영 DB 현행 스키마 스냅샷 — 자동 생성물. 손으로 고치지 마라.
-- 생성: node scripts/dump-schema-snapshot.mjs
--
-- 이 파일은 **읽기용 참조**다. 여기를 고쳐도 DB는 안 바뀐다 —
-- 변경은 supabase/migrations/에 새 번호 파일을 만들어 사용자가 Run한다.
--
-- 쓰는 법: 함수·정책의 '현행' 정의가 필요할 때 마이그레이션 51개를
-- 뒤지지 말고 이 파일을 검색하라. 마이그레이션을 적용한 뒤에는 다시 뽑아라.
--
-- 함수 95개 · 정책 78개 · 인덱스 97개

-- ════════════════════════════════════════════════════════════
-- 함수
-- ════════════════════════════════════════════════════════════

-- ── accept_challenge_invite ──
CREATE OR REPLACE FUNCTION public.accept_challenge_invite(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_me uuid := auth.uid();
  c public.challenges;
  v_row public.challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- 챌린지 단위 직렬화. crew_links는 더 이상 안 만들지만, 두 사람이 동시에
  -- 수락할 때 상태 전이가 엇갈리지 않게 락은 유지한다.
  perform pg_advisory_xact_lock(hashtext(p_challenge_id::text));

  select * into c from public.challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  select * into v_row
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_me
  for update;

  if not found then raise exception 'not_invited'; end if;
  if v_row.status = 'joined' then raise exception 'already_joined'; end if;
  if v_row.status = 'dropped' then raise exception 'dropped'; end if;

  update public.challenge_participants
     set status = 'joined', joined_at = now()
   where challenge_id = p_challenge_id
     and user_id = v_me;

  -- 0051: crewLinked를 0으로 고정한다. 필드를 지우면 옛 클라이언트가 깨진다.
  return jsonb_build_object('status', 'joined', 'crewLinked', 0);
end $function$;

-- ── accept_crew_request ──
CREATE OR REPLACE FUNCTION public.accept_crew_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_req crew_requests%rowtype;
  v_nick text;
  v_other uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
 
  -- 잠금 키를 얻기 위한 사전 읽기(락 없음). 상대가 requester인지 addressee인지
  -- 아직 모르므로 행을 한 번 읽어서만 판단하고, 실제 검증은 아래에서 다시 한다.
  select * into v_req from crew_requests where id = p_request_id;
  if not found then raise exception 'not_addressee'; end if;
  v_other := case when v_req.requester_id = v_me then v_req.addressee_id else v_req.requester_id end;
 
  -- 쌍 단위 직렬화. 이게 없으면 (a) 서로 동시에 수락할 때 락 순서가 엇갈려
  -- 40P01 데드락, (b) 서로 동시에 요청할 때 역방향을 못 봐서 자동수락이 불발,
  -- (c) 빠른 두 번 탭이 request_exists 대신 23505를 그대로 뱉는다.
  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_other)::text || greatest(v_me, v_other)::text)
  );
 
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> v_me then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'not_pending';
  end if;
 
  -- 0079: 출처는 '검색', 먼저 연 쪽은 요청을 보낸 사람이다.
  insert into crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_req.requester_id, v_req.addressee_id),
          greatest(v_req.requester_id, v_req.addressee_id),
          'search', v_req.requester_id)
  on conflict do nothing;
 
  update crew_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id;
 
  -- 반대 방향에 남아 있던 pending도 함께 닫는다. 안 닫으면 이미 크루가 된
  -- 뒤에도 상대 받은함에 요청이 남아 "수락" 버튼이 계속 보인다.
  update crew_requests
     set status = 'accepted', responded_at = now()
   where requester_id = v_req.addressee_id
     and addressee_id = v_req.requester_id
     and status = 'pending';
 
  -- ⚠️ 여기서는 profiles.invited_by를 채우지 않는다. 검색으로 맺는 쪽은 **둘 다
  --    이미 가입한 사람**이라 "데려왔다"가 성립하지 않는다. 유입 귀속은 신규가
  --    링크를 타고 들어온 경우에만 의미가 있다(3-2 · 3-3).
 
  select nickname into v_nick from profiles where id = v_me;
  -- 알림 실패가 연결까지 되돌리면 안 된다. 연결이 본체고 알림은 곁가지다.
  -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 통째로 롤백시킨 전례가 있다.)
  begin
    perform notify(
      v_req.requester_id, v_me, 'crew_accepted', p_request_id,
      coalesce(v_nick, '누군가') || '님과 크루가 됐어요 🤝',
      '이제 서로의 운동 소식을 받아볼 수 있어요'
    );
  exception when others then null;
  end;
  return jsonb_build_object('status', 'accepted');
end $function$;

-- ── accept_friend_invite ──
CREATE OR REPLACE FUNCTION public.accept_friend_invite(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_me         uuid := (select auth.uid());
  v_owner      uuid;
  v_owner_nick text;
  v_my_nick    text;
  v_existed    boolean;
  v_had_links  boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
 
  select id, nickname into v_owner, v_owner_nick
  from public.profiles
  where invite_code = upper(trim(p_code));
 
  -- ⚠️ 이 예외 이름을 바꾸지 마라. `/invite/[code]`가 이 코드를 보고 **옛 그룹
  --    코드로 재시도**한다(하위 호환). 이름이 바뀌면 카카오톡에 뿌려진 옛 링크가
  --    전부 "잘못된 초대"가 된다.
  if not found then raise exception 'invalid_friend_code'; end if;
  if v_owner = v_me then raise exception 'self_invite'; end if;
 
  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_owner)::text || greatest(v_me, v_owner)::text)
  );
 
  -- 이미 친구였는지 **먼저** 본다. insert 뒤에 보면 항상 true다 —
  -- 알림을 두 번 보내지 않으려면 이 순서여야 한다.
  select exists (
    select 1 from public.crew_links
    where user_a = least(v_me, v_owner) and user_b = greatest(v_me, v_owner)
  ) into v_existed;
 
  -- 0079: **insert 전에** 재야 한다. 뒤에서 재면 방금 만든 링크가 잡혀 항상
  -- true가 되고, invited_by가 영영 안 채워진다.
  select exists (
    select 1 from public.crew_links where user_a = v_me or user_b = v_me
  ) into v_had_links;
 
  insert into public.crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_me, v_owner), greatest(v_me, v_owner), 'invite_link', v_owner)
  on conflict do nothing;
 
  -- 반대 방향에 남아 있던 pending 요청도 닫는다. 안 닫으면 이미 친구가 된 뒤에도
  -- 받은함에 "수락" 버튼이 남는다 (accept_crew_request와 같은 규약).
  update public.crew_requests
     set status = 'accepted', responded_at = now()
   where status = 'pending'
     and ((requester_id = v_me and addressee_id = v_owner)
       or (requester_id = v_owner and addressee_id = v_me));
 
  -- 0079: **이 링크가 내 첫 연결일 때만** 초대자로 적는다. 이미 크루가 있는
  -- 사람이 남의 링크를 눌렀다고 그 사람이 나를 데려온 것은 아니다.
  if not v_had_links then
    update public.profiles
       set invited_by = v_owner
     where id = v_me and invited_by is null;
  end if;
 
  if not v_existed then
    select nickname into v_my_nick from public.profiles where id = v_me;
    -- 알림 실패가 연결까지 되돌리면 안 된다. 연결이 본체고 알림은 곁가지다.
    -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 통째로 롤백시킨 전례가 있다.)
    begin
      perform public.notify(
        v_owner, v_me, 'crew_accepted', null,
        coalesce(v_my_nick, '누군가') || '님과 크루가 됐어요 🤝',
        '초대 링크로 들어왔어요. 이제 서로의 운동 소식을 받아볼 수 있어요'
      );
    exception when others then null;
    end;
  end if;
 
  return jsonb_build_object(
    'ownerId', v_owner,
    'nickname', v_owner_nick,
    'alreadyFriends', v_existed
  );
end $function$;

-- ── admin_schema_snapshot ──
CREATE OR REPLACE FUNCTION public.admin_schema_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'functions', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', p.proname, 'definition', pg_get_functiondef(p.oid))
        order by p.proname
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'          -- 집계·윈도우 함수 제외, 일반 함수만
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table', tablename, 'name', policyname, 'cmd', cmd,
          'roles', roles, 'using', qual, 'check', with_check
        )
        order by tablename, policyname
      )
      from pg_policies where schemaname = 'public'
    ), '[]'::jsonb),
    'indexes', coalesce((
      select jsonb_agg(
        jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef)
        order by tablename, indexname
      )
      from pg_indexes where schemaname = 'public'
    ), '[]'::jsonb)
  )
$function$;

-- ── apply_xp_and_progress ──
CREATE OR REPLACE FUNCTION public.apply_xp_and_progress(p_user_id uuid, p_amount integer, p_reason text, p_reward_group text, p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inserted boolean := false;
  v_prev_xp int; v_new_xp int;
  v_prev_level int; v_new_level int;
  v_prev_stage int; v_new_stage int;
  v_reward record; v_unlocked jsonb := '[]'::jsonb;
  v_new_unlock int; v_shield_ins int; v_shield_amt int;
  v_nick text; v_stage_name text; v_title text; v_body text;
begin
  insert into user_progress (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select total_xp, current_level, current_stage
    into v_prev_xp, v_prev_level, v_prev_stage
  from user_progress where user_id = p_user_id for update;
  v_new_xp := v_prev_xp;

  -- 1) 원장 insert (중복 방지 인덱스가 병렬/재시도 방어)
  begin
    insert into xp_transactions
      (user_id, amount, transaction_type, reason, reward_group,
       source_type, source_id, effective_date, rule_version, metadata)
    values (p_user_id, p_amount, 'earn', p_reason, p_reward_group,
            p_source_type, p_source_id, p_effective_date, 'xp_v1', coalesce(p_metadata, '{}'::jsonb));
    v_inserted := true;
    v_new_xp := v_prev_xp + p_amount;
  exception when unique_violation then
    v_inserted := false; -- 이미 지급됨 → 진행 변경 없음
  end;

  if not v_inserted then
    return jsonb_build_object('inserted', false, 'amount', 0,
      'newTotalXp', v_prev_xp, 'previousLevel', v_prev_level, 'newLevel', v_prev_level,
      'previousStage', v_prev_stage, 'newStage', v_prev_stage,
      'levelUp', false, 'stageUp', false, 'unlockedRewards', '[]'::jsonb);
  end if;

  -- 2) 레벨/단계 재계산 (컷 = level_definitions)
  select level, stage_index into v_new_level, v_new_stage
  from level_definitions where required_total_xp <= v_new_xp
  order by required_total_xp desc limit 1;

  update user_progress set
    total_xp = v_new_xp, current_level = v_new_level, current_stage = v_new_stage,
    last_level_up_at = case when v_new_level > v_prev_level then now() else last_level_up_at end,
    last_stage_up_at = case when v_new_stage > v_prev_stage then now() else last_stage_up_at end,
    updated_at = now()
  where user_id = p_user_id;

  -- 3) 통과한 레벨 보상 (prev < lv <= new) — 한 번에 여러 레벨도 모두 지급
  for v_reward in
    select level, reward_key, reward_label from level_definitions
    where level > v_prev_level and level <= v_new_level and reward_key is not null
    order by level asc
  loop
    insert into user_unlocks (user_id, unlock_key, source_level)
    values (p_user_id, v_reward.reward_key, v_reward.level)
    on conflict (user_id, unlock_key) do nothing;
    get diagnostics v_new_unlock = row_count;

    if v_new_unlock > 0 then
      v_unlocked := v_unlocked || jsonb_build_object('key', v_reward.reward_key, 'label', v_reward.reward_label);

      if v_reward.reward_key like 'streak_shield%' or v_reward.reward_key = 'eternal_flame' then
        v_shield_amt := case when v_reward.level >= 31 then 3 when v_reward.level >= 25 then 2 else 1 end;
        insert into streak_shield_transactions (user_id, amount, reason, source_type, source_id)
        values (p_user_id, v_shield_amt, 'level_reward', 'level', v_reward.level::text)
        on conflict (user_id, reason, source_type, source_id) do nothing;
        get diagnostics v_shield_ins = row_count;
        if v_shield_ins > 0 then
          update user_progress set streak_shield_count = streak_shield_count + v_shield_amt
          where user_id = p_user_id;
        end if;
      end if;
    end if;
  end loop;

  -- ⬇ 4) 0029: 레벨이 올랐으면 크루 전원에게 알린다.
  --    크루가 없으면(혼자모드) select가 0행이라 아무 일도 일어나지 않는다.
  if v_new_level > v_prev_level then
    select nickname into v_nick from profiles where id = p_user_id;
    select stage_name into v_stage_name
    from level_definitions where level = v_new_level;

    if v_new_stage > v_prev_stage then
      v_title := '🎉 ' || coalesce(v_nick, '크루원') || '님이 진화했어요!';
      -- 단계명 뒤에 '단계로'를 붙여 받침에 따른 조사 문제를 피한다
      v_body := 'Lv.' || v_new_level || ' 달성 — '
                || coalesce(v_stage_name, '다음') || ' 단계로 진화했어요 ✨';
    else
      v_title := '⬆️ ' || coalesce(v_nick, '크루원') || '님이 레벨업!';
      v_body := 'Lv.' || v_prev_level || ' → Lv.' || v_new_level
                || ' 달성했어요. 축하해주세요 👏';
    end if;

    -- reference_id는 uuid 컬럼이다. 타입 없는 null을 select 목록에 그대로 두면
    -- Postgres가 text로 추론해 42804로 죽고, 완료 트랜잭션 전체가 롤백된다.
    -- 0039로 팬아웃을 바꿔도 이 캐스트는 그대로 둔다.
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select case when l.user_a = p_user_id then l.user_b else l.user_a end,
           p_user_id, 'level_up', null::uuid, v_title, v_body
    from crew_links l                                    -- 0039
    where p_user_id in (l.user_a, l.user_b);
  end if;

  return jsonb_build_object('inserted', true, 'amount', p_amount,
    'newTotalXp', v_new_xp, 'previousLevel', v_prev_level, 'newLevel', v_new_level,
    'previousStage', v_prev_stage, 'newStage', v_new_stage,
    'levelUp', v_new_level > v_prev_level, 'stageUp', v_new_stage > v_prev_stage,
    'unlockedRewards', v_unlocked);
end $function$;

-- ── approve_challenge_goals ──
CREATE OR REPLACE FUNCTION public.approve_challenge_goals(p_challenge_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c challenges; v_missing int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  -- 0046: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  -- 전원 목표 세팅 전에는 동의 불가 (목표가 확정돼야 동의가 의미 있음).
  -- 0046: group_members → challenge_participants(joined). 참가하지 않은
  -- 크루원의 목표를 기다리면 동의가 영영 불가능해진다.
  select count(*) into v_missing from challenge_participants cp
  where cp.challenge_id = p_challenge_id
    and cp.status = 'joined'
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = cp.user_id);
  if v_missing > 0 then raise exception 'kpi_incomplete'; end if;

  insert into challenge_goal_approvals (challenge_id, approver_id)
  values (p_challenge_id, auth.uid())
  on conflict (challenge_id, approver_id) do nothing;
end $function$;

-- ── autofinalize_due_challenges ──
CREATE OR REPLACE FUNCTION public.autofinalize_due_challenges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_ended int := 0;
  c record;
begin
  for c in
    select ch.id from challenges ch
    where ch.status = 'active' and ch.end_date < v_today
    order by ch.end_date
    for update
  loop
    update challenges set status = 'ended' where id = c.id;
    v_ended := v_ended + 1;
    begin
      perform notify(
        cp.user_id, null, 'challenge_ended', c.id,
        '🏆 결과가 나왔어요', '챌린지 탭에서 최종 순위를 확인하세요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('ended', v_ended);
end $function$;

-- ── autostart_due_challenges ──
CREATE OR REPLACE FUNCTION public.autostart_due_challenges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_started int := 0;
  v_dropped int := 0;
  v_dropped_ids uuid[];
  c record;
begin
  for c in
    select ch.id, ch.name from challenges ch
    where ch.status = 'setup' and ch.start_date <= v_today
    order by ch.start_date
    for update
  loop
    -- 목표 0개인 joined는 명단에서 뺀다 (설계 §4.2). 행은 남긴다 — 지우면
    -- 수락 때 맺어진 crew_links의 근거가 사라진다.
    with dropped as (
      update challenge_participants cp
         set status = 'dropped'
       where cp.challenge_id = c.id
         and cp.status = 'joined'
         and not exists (
           select 1 from user_goals ug
           where ug.challenge_id = c.id and ug.user_id = cp.user_id
         )
      returning cp.user_id
    )
    select coalesce(array_agg(user_id), '{}'::uuid[]) into v_dropped_ids from dropped;
    v_dropped := v_dropped + coalesce(array_length(v_dropped_ids, 1), 0);

    -- 미응답 초대는 만료시킨다
    delete from challenge_participants
    where challenge_id = c.id and status = 'invited';

    update challenges set status = 'active' where id = c.id;
    v_started := v_started + 1;

    -- 남은 참가자에게 시작 알림
    begin
      perform notify(
        cp.user_id, null, 'challenge_started', c.id,
        '🏁 챌린지가 시작됐어요', '오늘부터 기록이 반영돼요'
      ) from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined';
    exception when others then null;
    end;

    -- 0077: **빠진 사람에게도 말해 준다.** 조용히 사라지지 않게.
    -- ⚠ `unnest(arr) u`로 쓰면 별칭 `u`가 테이블이자 컬럼이라 모호하다.
    --   `as t(uid)`로 컬럼 이름을 못 박는다.
    begin
      perform notify(
        t.uid, null, 'challenge_dropped', c.id,
        '이번 챌린지에선 빠졌어요',
        c.name || ' · 목표를 세우지 않아 이번 회차 집계에서 빠졌어요. 다음엔 함께해요'
      ) from unnest(v_dropped_ids) as t(uid);
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object('started', v_started, 'dropped', v_dropped);
end $function$;

-- ── award_points ──
CREATE OR REPLACE FUNCTION public.award_points(p_user_id uuid, p_amount integer, p_reason text, p_source_type text, p_source_id text, p_multiplier numeric, p_metadata jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance int;
begin
  if p_amount <= 0 then return 0; end if;

  insert into user_wallet (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select balance into v_balance from user_wallet where user_id = p_user_id for update;

  begin
    insert into point_transactions
      (user_id, amount, transaction_type, reason, source_type, source_id,
       multiplier, balance_after, metadata)
    values (p_user_id, p_amount, 'earn', p_reason, p_source_type, p_source_id,
            p_multiplier, v_balance + p_amount, coalesce(p_metadata, '{}'::jsonb));
  exception when unique_violation then
    return 0; -- 이미 지급됨
  end;

  update user_wallet
  set balance = balance + p_amount,
      lifetime_earned = lifetime_earned + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  return p_amount;
end $function$;

-- ── award_workout_photo_xp ──
CREATE OR REPLACE FUNCTION public.award_workout_photo_xp(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s workout_sessions;
  v_eff date;
  v_prog jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid();
  if not found then raise exception 'session_not_found'; end if;
  if s.status <> 'completed' or s.deleted_at is not null then
    raise exception 'invalid_status';
  end if;

  if not exists (
    select 1 from workout_images wi
    where wi.session_id = p_session_id and wi.user_id = s.user_id and wi.image_path is not null
  ) then
    return jsonb_build_object('awarded', false, 'reason', 'no_photo');
  end if;

  if s.completed_at < now() - interval '30 minutes' then
    return jsonb_build_object('awarded', false, 'reason', 'too_late');
  end if;

  if not exists (
    select 1 from xp_transactions
    where user_id = s.user_id and source_type = 'workout'
      and source_id = p_session_id::text and reason = 'workout_completed'
  ) then
    return jsonb_build_object('awarded', false, 'reason', 'not_daily_workout');
  end if;

  v_eff := (s.completed_at at time zone 'Asia/Seoul')::date;

  v_prog := public.apply_xp_and_progress(
    s.user_id, 10, 'workout_photo', null,
    'workout', p_session_id::text, v_eff, jsonb_build_object('photo_xp', 10));

  if not (v_prog->>'inserted')::boolean then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;

  return jsonb_build_object('awarded', true, 'xpAwarded', 10,
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards');
end $function$;

-- ── badge_metrics ──
CREATE OR REPLACE FUNCTION public.badge_metrics(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'workout_count', coalesce(count(*), 0),
    'total_minutes', coalesce(sum(s.duration_minutes), 0),
    'record_beaten', coalesce(count(*) filter (where s.record_note is not null), 0)
  ) into v
  from workout_sessions s
  where s.user_id = p_user_id and s.status = 'completed' and s.deleted_at is null;

  v := v
    || jsonb_build_object('streak_days', public.current_streak_days(p_user_id))
    || (
      select jsonb_build_object(
        'weight_volume_kg', coalesce(sum(
          case when we.exercise_type = 'weight'
               then coalesce(ws.weight_kg, 0) * coalesce(ws.reps, 0) else 0 end), 0),
        'cardio_distance_m', coalesce(sum(
          case when we.exercise_type = 'cardio'
               then coalesce(ws.distance_meters, 0) else 0 end), 0))
      from workout_sets ws
      join workout_exercises we on we.id = ws.workout_exercise_id
      join workout_sessions s on s.id = we.session_id
      where s.user_id = p_user_id and s.status = 'completed'
        and s.deleted_at is null and ws.is_completed
    );
  return v;
end $function$;

-- ── block_user ──
CREATE OR REPLACE FUNCTION public.block_user(p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_block'; end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_me, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- 오가던 요청 정리. 양방향 모두.
  delete from public.crew_requests
  where status = 'pending'
    and ((requester_id = v_me and addressee_id = p_target_id)
      or (requester_id = p_target_id and addressee_id = v_me));

  return jsonb_build_object('status', 'blocked');
end $function$;

-- ── cancel_challenge ──
CREATE OR REPLACE FUNCTION public.cancel_challenge(p_challenge_id uuid)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      challenges;
  r      record;
  v_nick text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id and created_by = auth.uid()
  for update;

  if not found then
    raise exception 'challenge_not_found';
  end if;
  if c.status not in ('setup', 'active') then
    raise exception 'invalid_status:%', c.status;
  end if;

  -- ⚠️ 알림 대상을 **상태를 바꾸기 전에** 모은다. 참가자 행은 그대로 남지만,
  --    순서를 뒤집으면 나중에 정리 로직이 붙었을 때 조용히 0명이 된다.
  select nickname into v_nick from profiles where id = auth.uid();

  update challenges set status = 'cancelled'
  where id = p_challenge_id
  returning * into c;

  -- ── 0088: 취소 알림 ────────────────────────────────────────
  --
  -- 여기가 비어 있었다. 취소하면 **아무 말 없이 방이 사라졌다.** 아는 사람끼리는
  -- 밖에서 전했겠지만, 공개 모집으로 들어온 사람은 목표까지 세워 두고도 이유를
  -- 알 길이 없다.
  for r in
    select cp.user_id
    from challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.status = 'joined'
  loop
    continue when r.user_id = auth.uid();   -- 취소한 본인에게는 안 보낸다
    perform notify(
      r.user_id,
      auth.uid(),
      'challenge_cancelled',
      p_challenge_id,
      '💤 ' || c.name || ' 취소됨',
      coalesce(v_nick, '방장') || '님이 챌린지를 취소했어요'
    );
  end loop;

  return c;
end $function$;

-- ── cancel_crew_request ──
CREATE OR REPLACE FUNCTION public.cancel_crew_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_req crew_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_requester';
  end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  update crew_requests set status = 'canceled', responded_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'canceled');
end $function$;

-- ── cancel_program_enrollment ──
CREATE OR REPLACE FUNCTION public.cancel_program_enrollment(p_enrollment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_removed int;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 같은 사용자의 등록 RPC와 한 줄로 세운다 — 취소와 재등록이 겹치면
  -- 계획을 지우는 중에 새 계획이 들어올 수 있다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select status into v_status
  from public.program_enrollments
  where id = p_enrollment_id and user_id = v_user_id
  for update;
  if not found then
    -- 남의 등록도 여기로 온다 — 존재 여부를 알려 주지 않는다
    raise exception 'program_enrollment_not_found';
  end if;
  if v_status <> 'active' then
    raise exception 'program_not_active';
  end if;

  delete from public.workout_plans
  where program_enrollment_id = p_enrollment_id
    and user_id = v_user_id;
  get diagnostics v_removed = row_count;

  -- ⚠️ `cancelled_at`을 같이 채운다. 0066의 check가 둘을 묶어 두었다 —
  --    상태만 바꾸면 행 전체가 거절된다.
  update public.program_enrollments
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_enrollment_id and user_id = v_user_id;

  return v_removed;
end;
$function$;

-- ── cancel_workout ──
CREATE OR REPLACE FUNCTION public.cancel_workout(p_session_id uuid)
 RETURNS workout_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- draft 취소는 시작 안 한 세션이라 이벤트 남기지 않음
  if s.started_at is not null then
    insert into workout_events (session_id, user_id, event_type)
    values (s.id, s.user_id, 'workout_cancelled');
  end if;

  return s;
end $function$;

-- ── challenge_in_setup ──
CREATE OR REPLACE FUNCTION public.challenge_in_setup(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from challenges where id = cid and status = 'setup'
  )
$function$;

-- ── challenge_is_active ──
CREATE OR REPLACE FUNCTION public.challenge_is_active(cid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from challenges where id = cid and status = 'active'
  )
$function$;

-- ── clear_profile_invited_by_on_insert ──
CREATE OR REPLACE FUNCTION public.clear_profile_invited_by_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.invited_by := null;
  return new;
end $function$;

-- ── complete_workout ──
CREATE OR REPLACE FUNCTION public.complete_workout(p_session_id uuid)
 RETURNS workout_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into workout_events (session_id, user_id, event_type)
  values (s.id, s.user_id, 'workout_completed');

  return s;
end $function$;

-- ── complete_workout_v2 ──
CREATE OR REPLACE FUNCTION public.complete_workout_v2(p_session_id uuid, p_paused_seconds integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s workout_sessions;
  v_dur int; v_valid boolean; v_tabata boolean;
  v_eff date; v_has_daily boolean;
  v_base int := 0; v_time int := 0; v_plan int := 0; v_rec int := 0; v_photo int := 0;
  v_total int := 0;
  v_prog jsonb; v_orig int;
  v_streak int; v_mult numeric; v_points int := 0; v_badges jsonb := '[]'::jsonb;
  v_elapsed int; v_paused int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from workout_sessions
  where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'session_not_found'; end if;

  if s.status = 'cancelled' then
    raise exception 'invalid_status:cancelled';
  elsif s.status = 'completed' then
    select amount into v_orig from xp_transactions
    where user_id = s.user_id and reason = 'workout_completed'
      and source_type = 'workout' and source_id = p_session_id::text
    limit 1;
    return (
      select jsonb_build_object(
        'idempotentReplay', true, 'awarded', false,
        'originalXpAwarded', coalesce(v_orig, 0),
        'currentTotalXp', up.total_xp, 'currentLevel', up.current_level,
        'currentStage', up.current_stage, 'rejectionReason', 'XP_ALREADY_AWARDED')
      from user_progress up where up.user_id = s.user_id
    );
  elsif s.status <> 'active' then
    raise exception 'invalid_status:%', s.status;
  end if;

  -- ⬇ 0055: 정지 시간은 클라이언트가 보내는 값이므로 0 ~ 실제 경과초로 클램프한다.
  --   과대 신고해도 자기 XP만 줄고, 음수 duration은 생기지 않는다.
  v_elapsed := floor(extract(epoch from now() - s.started_at))::int;
  v_paused := least(greatest(coalesce(p_paused_seconds, 0), 0), greatest(v_elapsed, 0));

  update workout_sessions
  set status = 'completed', completed_at = now(),
      paused_seconds = v_paused,
      duration_minutes = greatest(0, floor((v_elapsed - v_paused) / 60.0))::int
  where id = p_session_id
  returning * into s;

  insert into workout_events (session_id, user_id, event_type)
  values (s.id, s.user_id, 'workout_completed');

  v_dur := s.duration_minutes;
  v_tabata := s.tabata_minutes is not null;
  v_valid := public.is_valid_workout(p_session_id)
             and s.started_at is not null and s.completed_at is not null
             and v_dur >= 0 and v_dur < 360;

  v_eff := (now() at time zone 'Asia/Seoul')::date;
  select exists (
    select 1 from xp_transactions
    where user_id = s.user_id and transaction_type = 'earn'
      and reward_group = 'daily_workout' and effective_date = v_eff
  ) into v_has_daily;

  if v_valid and not v_has_daily then
    v_base := 100;
    v_time := case when v_dur >= 90 then 40 when v_dur >= 60 then 30
                   when v_dur >= 40 then 20 when v_dur >= 20 then 10 else 0 end;
    if not v_tabata then
      v_plan := 0;
      -- 0027: 완료 세트는 실적(횟수·시간·거리)이 하나라도 있으면 충족
      v_rec := case when exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
        ) and not exists (
          select 1 from workout_sets ws join workout_exercises we on we.id = ws.workout_exercise_id
          where we.session_id = p_session_id and ws.is_completed
            and ws.reps is null
            and coalesce(ws.duration_seconds, 0) <= 0
            and coalesce(ws.distance_meters, 0) <= 0
        ) then 10 else 0 end;
    end if;
    v_photo := case when exists (
      select 1 from workout_images wi
      where wi.session_id = p_session_id and wi.user_id = s.user_id and wi.image_path is not null
    ) then 10 else 0 end;
    v_total := v_base + v_time + v_plan + v_rec + v_photo;
  end if;

  if v_total > 0 then
    v_prog := public.apply_xp_and_progress(
      s.user_id, v_total, 'workout_completed', 'daily_workout',
      'workout', p_session_id::text, v_eff,
      jsonb_build_object('base_xp', v_base, 'duration_xp', v_time, 'plan_xp', v_plan,
        'record_xp', v_rec, 'photo_xp', v_photo, 'duration_minutes', v_dur,
        'duration_source', 'server_elapsed', 'is_tabata', v_tabata,
        'paused_seconds', v_paused));
    if not (v_prog->>'inserted')::boolean then v_total := 0; end if;
  else
    insert into user_progress (user_id) values (s.user_id) on conflict (user_id) do nothing;
    select jsonb_build_object('newTotalXp', total_xp, 'previousLevel', current_level,
      'newLevel', current_level, 'previousStage', current_stage, 'newStage', current_stage,
      'levelUp', false, 'stageUp', false, 'unlockedRewards', '[]'::jsonb)
    into v_prog from user_progress where user_id = s.user_id;
  end if;

  -- ⬇ 0032 추가: 운동 포인트. XP와 같은 조건(그날 첫 유효 운동)에서만 준다.
  --   포인트만 무제한이면 하루에 짧게 여러 번 끊어 하는 악용이 생긴다.
  v_streak := public.current_streak_days(s.user_id);
  v_mult := public.point_multiplier(v_streak);
  if v_total > 0 then
    v_points := public.award_points(
      s.user_id, floor(100 * v_mult)::int, 'workout_completed',
      'workout', p_session_id::text, v_mult,
      jsonb_build_object('base', 100, 'streak_days', v_streak));
  end if;

  -- ⬇ 0032 추가: 배지 판정. 포인트 지급 뒤라 배지 보너스가 위에 쌓인다.
  v_badges := public.evaluate_badges(s.user_id);

  -- ⬇ 0065: 열람창 알림. 판정 규칙은 `notify_challenge_peek_unlock`이 갖는다.
  --   예전에는 이 자리에 조건이 통째로 박혀 있었고 "오늘 포함 5연속"만 봤다 —
  --   그래서 5일을 채운 뒤로는 연속이 끊길 때까지 **매일** 알림이 갔다.
  --   viewing-pass.ts의 challengePassStatus와 **같은 판정**이어야 한다.
  perform public.notify_challenge_peek_unlock(s.user_id);

  return jsonb_build_object(
    'idempotentReplay', false,
    'awarded', v_total > 0, 'xpAwarded', v_total,
    'breakdown', jsonb_build_object('baseXp', v_base, 'durationXp', v_time,
      'planXp', v_plan, 'recordXp', v_rec, 'photoXp', v_photo),
    'newTotalXp', v_prog->'newTotalXp',
    'previousLevel', v_prog->'previousLevel', 'newLevel', v_prog->'newLevel',
    'previousStage', v_prog->'previousStage', 'newStage', v_prog->'newStage',
    'levelUp', v_prog->'levelUp', 'stageUp', v_prog->'stageUp',
    'unlockedRewards', v_prog->'unlockedRewards',
    'pointsAwarded', v_points, 'pointMultiplier', v_mult, 'streakDays', v_streak,
    'newBadges', v_badges,
    'pausedSeconds', v_paused
  );
end $function$;

-- ── create_challenge_room ──
CREATE OR REPLACE FUNCTION public.create_challenge_room(p_name text, p_start_date date, p_end_date date, p_photo_required boolean DEFAULT true)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_group uuid;
  v_code  text;
  c       challenges;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_start_date > p_end_date then raise exception 'invalid_period'; end if;

  -- ⚠ joined_at이다. created_at이 아니다 (0001:32). 0042가 여기서 틀렸다.
  select gm.group_id into v_group
  from group_members gm where gm.user_id = v_me
  order by gm.joined_at limit 1;

  -- 0062: 옛 동작은 여기서 `raise exception 'no_group_yet'`이었다.
  -- 이제는 본인용 그룹을 만들어 준다.
  --
  -- ⚠️ `create_group()`을 호출하지 않는다. 그 함수는 security definer가 아니고
  --    자체 재시도 루프를 갖고 있어, 정의자 함수 안에서 부르면 권한 맥락이
  --    섞인다. 여기서 직접 insert하고 코드 충돌만 재시도한다.
  --
  -- ⚠️ 이름을 사용자에게 묻지 않는다. 홈 카드가 그룹 이름을 **쓰지 않기로**
  --    이미 정했으므로(2026-08-07) 화면에 드러나지 않는다. 물으면 챌린지를
  --    만들려던 사람에게 무관한 질문을 강요하게 된다.
  if v_group is null then
    for i in 1..10 loop
      begin
        insert into groups (name, invite_code, owner_id)
        values ('내 크루', generate_invite_code(), v_me)
        returning id into v_group;
        exit;
      exception when unique_violation then
        if i >= 10 then raise; end if;
      end;
    end loop;

    insert into group_members (group_id, user_id, role)
    values (v_group, v_me, 'owner')
    on conflict (group_id, user_id) do nothing;
  end if;

  -- 0064: 방을 만들 때 초대 코드를 같이 넣는다.
  --
  -- ⚠️ 유니크 충돌은 32^5분의 1이지만 조용히 넘기면 안 된다. 몇 번 다시 뽑고
  --    그래도 안 되면 예외를 낸다 — `issue_challenge_invite_code`와 같은 규칙이다.
  --    ⚠️ **코드를 못 뽑았다고 챌린지 생성을 통째로 실패시키지는 않는다.**
  --    코드는 나중에 초대 시트에서 다시 발급할 수 있지만(setup이면), 방이
  --    안 만들어지면 사용자는 아무것도 못 한다. 우선순위가 다르다.
  for i in 1..10 loop
    begin
      v_code := public.generate_invite_code();
      insert into challenges (
        group_id, name, start_date, end_date, photo_required, created_by, invite_code
      )
      values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me, v_code)
      returning * into c;
      exit;
    exception when unique_violation then
      if i >= 10 then
        -- 코드 없이라도 방은 만든다. 초대 시트가 나중에 다시 시도한다.
        insert into challenges (
          group_id, name, start_date, end_date, photo_required, created_by
        )
        values (v_group, p_name, p_start_date, p_end_date, p_photo_required, v_me)
        returning * into c;
        exit;
      end if;
    end;
  end loop;

  insert into challenge_participants (challenge_id, user_id, role, status, joined_at)
  values (c.id, v_me, 'host', 'joined', now());

  return c;
end $function$;

-- ── create_group ──
CREATE OR REPLACE FUNCTION public.create_group(p_name text)
 RETURNS groups
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  g public.groups;
  attempts int := 0;
begin
  loop
    begin
      insert into groups (name, invite_code, owner_id)
      values (trim(p_name), generate_invite_code(), auth.uid())
      returning * into g;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 5 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'owner');

  return g;
end $function$;

-- ── create_program_enrollment ──
CREATE OR REPLACE FUNCTION public.create_program_enrollment(p_program_key text, p_program_version integer, p_title_snapshot text, p_level_at_start text, p_start_date date, p_timezone text, p_preferred_slots jsonb, p_plans jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment_id uuid := pg_catalog.gen_random_uuid();
  v_today date;
  v_plan jsonb;
  v_plan_index bigint;
  v_plan_date date;
  v_scheduled_at timestamptz;
  v_previous_date date := null;
  v_dates date[] := array[]::date[];
  v_conflict_date date;
  v_week int;
  v_session int;
  v_exercise jsonb;
  v_set jsonb;
  v_prescription jsonb;
  v_bad_count int;
  v_local_time text;
  v_tabata_minutes smallint;
  v_is_interval boolean;
  v_interval_plans int := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 같은 사용자의 RPC끼리는 충돌 검증과 삽입을 한 줄로 세운다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if p_program_key is null
    or p_program_key <> btrim(p_program_key)
    or p_program_key !~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$'
    or char_length(p_program_key) > 60 then
    raise exception 'program_invalid_key';
  end if;
  if p_program_version is null or p_program_version not between 1 and 10000 then
    raise exception 'program_invalid_version';
  end if;
  if p_title_snapshot is null
    or char_length(btrim(p_title_snapshot)) not between 1 and 80 then
    raise exception 'program_invalid_title';
  end if;
  if p_level_at_start is null
    or p_level_at_start not in ('beginner', 'moderate', 'experienced') then
    raise exception 'program_invalid_level';
  end if;
  if p_timezone is null
    or char_length(btrim(p_timezone)) not between 1 and 60
    or not exists (
      select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_timezone
    ) then
    raise exception 'program_invalid_timezone';
  end if;

  v_today := (now() at time zone p_timezone)::date;
  if p_start_date is null
    or p_start_date < v_today
    or p_start_date > v_today + 365 then
    raise exception 'program_invalid_start_date';
  end if;

  if p_preferred_slots is null
    or jsonb_typeof(p_preferred_slots) <> 'array'
    or jsonb_array_length(p_preferred_slots) not between 2 and 5
    or octet_length(p_preferred_slots::text) > 2000 then
    raise exception 'program_slots_count';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_preferred_slots) slot
    where jsonb_typeof(slot) is distinct from 'object'
      or not (slot ?& array['weekday', 'time'])
      or jsonb_typeof(slot->'weekday') is distinct from 'number'
      or (slot->>'weekday') !~ '^[0-6]$'
      or jsonb_typeof(slot->'time') is distinct from 'string'
      or (slot->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception 'program_invalid_slot';
  end if;
  select count(distinct (slot->>'weekday')::int)
    into v_bad_count
  from jsonb_array_elements(p_preferred_slots) slot;
  if v_bad_count <> jsonb_array_length(p_preferred_slots) then
    raise exception 'program_slot_weekday_duplicate';
  end if;
  -- 0069: 요일 간격 제한 제거 (사용자 확정 2026-08-12).
  --       서로 다른 요일 3개 조건은 바로 위에서 이미 지킨다.

  if p_plans is null
    or jsonb_typeof(p_plans) <> 'array'
    or jsonb_array_length(p_plans) <> 18
    or octet_length(p_plans::text) > 512000 then
    raise exception 'program_plans_count';
  end if;

  for v_plan, v_plan_index in
    select value, ordinality
    from jsonb_array_elements(p_plans) with ordinality
  loop
    if jsonb_typeof(v_plan) is distinct from 'object'
      or not (v_plan ?& array[
        'plan_date', 'scheduled_at', 'week', 'session', 'template_key',
        'title', 'exercises'
      ])
      or jsonb_typeof(v_plan->'week') is distinct from 'number'
      or (v_plan->>'week') !~ '^[1-6]$'
      or jsonb_typeof(v_plan->'session') is distinct from 'number'
      or (v_plan->>'session') !~ '^[1-3]$' then
      raise exception 'program_invalid_slot_meta';
    end if;
    v_week := (v_plan->>'week')::int;
    v_session := (v_plan->>'session')::int;
    if v_week <> ((v_plan_index - 1) / 3)::int + 1
      or v_session <> ((v_plan_index - 1) % 3)::int + 1
      or jsonb_typeof(v_plan->'template_key') is distinct from 'string'
      or v_plan->>'template_key' <> (array['A', 'B', 'C'])[v_session] then
      raise exception 'program_invalid_slot_order';
    end if;
    if jsonb_typeof(v_plan->'plan_date') is distinct from 'string'
      or (v_plan->>'plan_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'program_invalid_plan_date';
    end if;
    begin
      v_plan_date := (v_plan->>'plan_date')::date;
    exception when others then
      raise exception 'program_invalid_plan_date';
    end;
    if v_plan_date::text <> v_plan->>'plan_date'
      or v_plan_date < v_today
      or v_plan_date < p_start_date
      or v_plan_date > p_start_date + 180 then
      raise exception 'program_invalid_plan_date';
    end if;
    if v_plan_date = any(v_dates) then
      raise exception 'program_plan_date_duplicate:%', v_plan_date;
    end if;
    -- 0069: 같은 날 두 회차와 날짜 역행만 막는다
    if v_previous_date is not null and v_plan_date - v_previous_date < 1 then
      raise exception 'program_plan_date_order';
    end if;
    v_dates := array_append(v_dates, v_plan_date);
    v_previous_date := v_plan_date;

    if jsonb_typeof(v_plan->'scheduled_at') is distinct from 'string' then
      raise exception 'program_invalid_scheduled_at';
    end if;
    begin
      v_scheduled_at := (v_plan->>'scheduled_at')::timestamptz;
    exception when others then
      raise exception 'program_invalid_scheduled_at';
    end;
    if (v_scheduled_at at time zone p_timezone)::date <> v_plan_date then
      raise exception 'program_scheduled_date_mismatch';
    end if;
    v_local_time := to_char(v_scheduled_at at time zone p_timezone, 'HH24:MI');
    if not exists (
      select 1 from jsonb_array_elements(p_preferred_slots) slot
      where slot->>'time' = v_local_time
    ) then
      raise exception 'program_scheduled_time_mismatch';
    end if;

    -- 0070: `tabata_minutes`가 있으면 인터벌 회차다. 이 한 컬럼이 판별자다.
    if v_plan ? 'tabata_minutes'
      and v_plan->'tabata_minutes' is distinct from 'null'::jsonb then
      if jsonb_typeof(v_plan->'tabata_minutes') is distinct from 'number'
        or (v_plan->>'tabata_minutes') not in ('4', '8', '16') then
        raise exception 'program_invalid_tabata_minutes';
      end if;
      v_tabata_minutes := (v_plan->>'tabata_minutes')::smallint;
    else
      v_tabata_minutes := null;
    end if;
    v_is_interval := v_tabata_minutes is not null;
    if v_is_interval then
      v_interval_plans := v_interval_plans + 1;
    end if;

    if jsonb_typeof(v_plan->'title') is distinct from 'string'
      or char_length(btrim(v_plan->>'title')) not between 1 and 80 then
      raise exception 'program_invalid_plan_title';
    end if;
    if jsonb_typeof(v_plan->'exercises') is distinct from 'array'
      or (v_is_interval
          and jsonb_array_length(v_plan->'exercises') <> 4)
      or (not v_is_interval
          and jsonb_array_length(v_plan->'exercises') not between 5 and 6)
      or octet_length((v_plan->'exercises')::text) > 200000 then
      raise exception 'program_invalid_exercises';
    end if;

    for v_exercise in select value from jsonb_array_elements(v_plan->'exercises')
    loop
      if jsonb_typeof(v_exercise) is distinct from 'object'
        or not (v_exercise ?& array[
          'name', 'bodyPart', 'exerciseType', 'measure', 'isCustom', 'sets'
        ])
        or (not v_is_interval and not (v_exercise ? 'prescription'))
        or jsonb_typeof(v_exercise->'name') is distinct from 'string'
        or char_length(btrim(v_exercise->>'name')) not between 1 and 40
        or jsonb_typeof(v_exercise->'bodyPart') is distinct from 'string'
        or v_exercise->>'bodyPart' not in ('가슴','등','하체','어깨','팔','코어','유산소')
        or jsonb_typeof(v_exercise->'exerciseType') is distinct from 'string'
        or v_exercise->>'exerciseType' not in ('weight','bodyweight','cardio')
        or not (v_exercise ? 'measure')
        or not (
          v_exercise->'measure' = 'null'::jsonb
          or v_exercise->>'measure' in ('reps','time')
        )
        or jsonb_typeof(v_exercise->'isCustom') is distinct from 'boolean'
        or (v_exercise->>'isCustom')::boolean
        or jsonb_typeof(v_exercise->'sets') is distinct from 'array'
        or (v_is_interval
            and jsonb_array_length(v_exercise->'sets') <> 1)
        or (not v_is_interval
            and jsonb_array_length(v_exercise->'sets') not between 1 and 4)
        or (not v_is_interval
            and jsonb_typeof(v_exercise->'prescription')
                is distinct from 'object') then
        raise exception 'program_invalid_exercise_shape';
      end if;

      for v_set in select value from jsonb_array_elements(v_exercise->'sets')
      loop
        if jsonb_typeof(v_set) is distinct from 'object'
          or not (v_set ?& array[
            'weightKg', 'reps', 'distanceKm', 'durationMin'
          ])
          or jsonb_typeof(v_set->'weightKg') is distinct from 'number'
          or (v_set->>'weightKg')::numeric < 0
          or jsonb_typeof(v_set->'reps') is distinct from 'number'
          or (v_set->>'reps')::numeric < 0
          or jsonb_typeof(v_set->'distanceKm') is distinct from 'number'
          or (v_set->>'distanceKm')::numeric < 0
          or jsonb_typeof(v_set->'durationMin') is distinct from 'number'
          or (v_set->>'durationMin')::numeric < 0 then
          raise exception 'program_invalid_set_shape';
        end if;
      end loop;

      -- 인터벌은 20초/10초를 음원이 정한다 — 처방을 요구하지 않는다
      if not v_is_interval then
        v_prescription := v_exercise->'prescription';
        if not (v_prescription ?& array[
            'repsMin', 'repsMax', 'targetRir', 'restSeconds', 'loadStepKg'
          ])
          or jsonb_typeof(v_prescription->'repsMin') is distinct from 'number'
          or (v_prescription->>'repsMin') !~ '^[0-9]+$'
          or (v_prescription->>'repsMin')::int not between 1 and 100
          or jsonb_typeof(v_prescription->'repsMax') is distinct from 'number'
          or (v_prescription->>'repsMax') !~ '^[0-9]+$'
          or (v_prescription->>'repsMax')::int not between 1 and 100
          or (v_prescription->>'repsMin')::int > (v_prescription->>'repsMax')::int
          or jsonb_typeof(v_prescription->'targetRir') is distinct from 'number'
          or (v_prescription->>'targetRir') not in ('1','2','3')
          or jsonb_typeof(v_prescription->'restSeconds') is distinct from 'number'
          or (v_prescription->>'restSeconds') !~ '^[0-9]+$'
          or (v_prescription->>'restSeconds')::int not between 60 and 300
          or jsonb_typeof(v_prescription->'loadStepKg') is distinct from 'number'
          or (v_prescription->>'loadStepKg') not in ('1','2.5','5') then
          raise exception 'program_invalid_prescription';
        end if;
      end if;
    end loop;
  end loop;

  -- 한 등록 안에 두 모양이 섞이면 진행률·재배치·무게 추천이 회차마다 갈라진다
  if v_interval_plans not in (0, 18) then
    raise exception 'program_mixed_plan_kinds';
  end if;

  if exists (
    select 1 from public.program_enrollments
    where user_id = v_user_id
      and program_key = p_program_key
      and program_version = p_program_version
      and status = 'active'
  ) then
    raise exception 'program_already_active';
  end if;

  select min(plan_date) into v_conflict_date
  from public.workout_plans
  where user_id = v_user_id and plan_date = any(v_dates);
  if v_conflict_date is not null then
    raise exception 'program_plan_date_taken:%', v_conflict_date;
  end if;

  begin
    insert into public.program_enrollments (
      id, user_id, program_key, program_version, title_snapshot,
      level_at_start, start_date, timezone, preferred_slots
    ) values (
      v_enrollment_id, v_user_id, p_program_key, p_program_version,
      btrim(p_title_snapshot), p_level_at_start, p_start_date, p_timezone,
      p_preferred_slots
    );
  exception when unique_violation then
    raise exception 'program_already_active';
  end;

  for v_plan in select value from jsonb_array_elements(p_plans)
  loop
    begin
      insert into public.workout_plans (
        user_id, plan_date, source_session_id, exercises, title, scheduled_at,
        tabata_minutes,
        program_enrollment_id, program_week, program_session,
        program_template_version
      ) values (
        v_user_id,
        (v_plan->>'plan_date')::date,
        null,
        v_plan->'exercises',
        btrim(v_plan->>'title'),
        (v_plan->>'scheduled_at')::timestamptz,
        case
          when v_plan ? 'tabata_minutes'
            and v_plan->'tabata_minutes' is distinct from 'null'::jsonb
          then (v_plan->>'tabata_minutes')::smallint
        end,
        v_enrollment_id,
        (v_plan->>'week')::smallint,
        (v_plan->>'session')::smallint,
        p_program_version
      );
    exception when unique_violation then
      raise exception 'program_plan_date_taken:%', v_plan->>'plan_date';
    end;
  end loop;

  return v_enrollment_id;
end;
$function$;

-- ── current_streak_days ──
CREATE OR REPLACE FUNCTION public.current_streak_days(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_last date;
  v_count int := 0;
  v_prev date := null;
  r record;
begin
  select max((completed_at at time zone 'Asia/Seoul')::date) into v_last
  from workout_sessions
  where user_id = p_user_id and status = 'completed'
    and deleted_at is null and completed_at is not null;

  if v_last is null or (v_today - v_last) >= 5 then
    return 0;
  end if;

  for r in
    select distinct (completed_at at time zone 'Asia/Seoul')::date as d
    from workout_sessions
    where user_id = p_user_id and status = 'completed'
      and deleted_at is null and completed_at is not null
    order by d desc
  loop
    if v_prev is not null and (v_prev - r.d) >= 5 then
      exit;
    end if;
    v_count := v_count + 1;
    v_prev := r.d;
  end loop;

  return v_count;
end $function$;

-- ── decline_challenge_invite ──
CREATE OR REPLACE FUNCTION public.decline_challenge_invite(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_row challenge_participants;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_row from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me for update;
  if not found then raise exception 'not_invited'; end if;
  if v_row.status <> 'invited' then raise exception 'not_invited'; end if;

  delete from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_me;

  return jsonb_build_object('status', 'declined');
end $function$;

-- ── dispatch_push_notification ──
CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform net.http_post(
      url := 'https://gnd-one.vercel.app/api/push/notify',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null; -- 푸시 실패는 알림 저장에 영향 없음
  end;
  return new;
end;
$function$;

-- ── edit_session_comment ──
CREATE OR REPLACE FUNCTION public.edit_session_comment(p_comment_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      cheers;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'comment_empty';
  end if;
  if char_length(v_body) > 200 then
    raise exception 'comment_too_long';
  end if;

  select * into c from cheers where id = p_comment_id;
  if not found then
    raise exception 'comment_not_found';
  end if;

  -- 본인 것만. `cheers_delete_own`과 같은 기준이다.
  if c.sender_id <> auth.uid() then
    raise exception 'not_author';
  end if;

  -- ⚠️ 말이 없는 이모지 응원은 고칠 몸통이 없다. 여기서 막지 않으면
  --    "🔥 응원"이 갑자기 문장으로 바뀌어 머리줄 집계에서 사라진다.
  if c.message is null then
    raise exception 'comment_not_found';
  end if;

  -- ⚠️ 그 세션이 아직 보이는지 다시 본다. 크루가 끊긴 뒤에도 옛 댓글을 계속
  --    고칠 수 있으면, 상대 화면에 내 새 문장이 꽂힌다.
  if not public.workout_session_crew_visible(c.session_id) then
    raise exception 'session_not_found';
  end if;

  update cheers
     set message = v_body,
         edited_at = now()
   where id = p_comment_id
  returning * into c;

  -- 알림은 보내지 않는다. 고칠 때마다 알림이 가면 도배 경로가 된다.
  return jsonb_build_object('id', c.id, 'edited_at', c.edited_at);
end $function$;

-- ── enforce_goal_raise_only ──
CREATE OR REPLACE FUNCTION public.enforce_goal_raise_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- setup 단계에서는 지금까지처럼 무엇이든 고칠 수 있다. 아직 시작 전이라
  -- 남과 비교되는 숫자가 없다.
  if not public.challenge_is_active(new.challenge_id) then
    return new;
  end if;

  -- 소속을 바꿔 다른 챌린지로 옮기는 길도 막는다.
  if new.challenge_id is distinct from old.challenge_id
     or new.group_id is distinct from old.group_id
     or new.user_id is distinct from old.user_id then
    raise exception 'goal_locked';
  end if;

  if new.goal_type is distinct from old.goal_type then
    raise exception 'goal_type_locked';
  end if;

  if new.qualifier is distinct from old.qualifier then
    raise exception 'goal_qualifier_locked';
  end if;

  -- 분모를 낮추는 길. 같거나 커야 한다.
  if coalesce(new.planned_days, 0) < coalesce(old.planned_days, 0) then
    raise exception 'goal_planned_days_lowered';
  end if;

  -- 본론. 같거나 커야 한다 — 같은 값 저장(멱등)은 통과시킨다.
  if new.target_value < old.target_value then
    raise exception 'goal_lowered';
  end if;

  return new;
end $function$;

-- ── enforce_routine_slot_limit ──
CREATE OR REPLACE FUNCTION public.enforce_routine_slot_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_level int;
  v_limit int;
  v_count int;
begin
  -- ⚠️ coalesce가 두 겹인 이유: 컬럼 NULL과 '행 자체가 없음'은 다른 경우다.
  -- user_progress 행이 없는 신규 사용자는 select ... into가 v_level을 NULL로
  -- 남기는데, 그러면 level <= v_level이 항상 false라 한도가 조용히 3으로
  -- 굳어 레벨을 올려도 슬롯이 안 늘어난다.
  select coalesce(current_level, 1) into v_level
    from user_progress where user_id = new.user_id;
  v_level := coalesce(v_level, 1);

  select 3 + count(*) into v_limit
    from level_definitions
    where reward_key in ('routine_slot_1', 'routine_slot_2')
      and level <= v_level;

  select count(*) into v_count
    from workout_routines where user_id = new.user_id;

  if v_count >= v_limit then
    raise exception 'routine_slot_limit:%', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- ── evaluate_badges ──
CREATE OR REPLACE FUNCTION public.evaluate_badges(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
  v_metrics jsonb;
  v_new jsonb := '[]'::jsonb;
  v_value numeric;
  v_period text;
  v_inserted int;
  v_count int;
  d record;
begin
  v_metrics := public.badge_metrics(p_user_id);

  for d in
    select * from badge_definitions where status = 'active' order by sort_order
  loop
    v_value := (v_metrics ->> d.metric_key)::numeric;

    if d.repeatable then
      if v_value <= 0 or (v_value::bigint % d.repeat_step::bigint) <> 0 then
        continue;
      end if;
      v_period := v_today;
    else
      if v_value < d.threshold then
        continue;
      end if;
      v_period := 'lifetime';
    end if;

    insert into user_badges (user_id, badge_key, period_key)
    values (p_user_id, d.badge_key, v_period)
    on conflict (user_id, badge_key, period_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then continue; end if;

    perform public.award_points(
      p_user_id, d.point_reward, 'badge_earned',
      'badge', d.badge_key || ':' || v_period, null,
      jsonb_build_object('tier', d.tier, 'metric', d.metric_key));

    v_new := v_new || jsonb_build_object(
      'badgeKey', d.badge_key, 'emoji', d.emoji, 'name', d.name,
      'tier', d.tier, 'points', d.point_reward);
  end loop;

  v_count := jsonb_array_length(v_new);
  if v_count > 0 then
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (p_user_id, p_user_id, 'badge_earned', null,
            '🏅 배지 획득!',
            (v_new -> 0 ->> 'emoji') || ' ' || (v_new -> 0 ->> 'name')
              || case when v_count > 1
                      then ' 외 ' || (v_count - 1) || '개'
                      else '' end);
  end if;

  return v_new;
end $function$;

-- ── finalize_challenge ──
CREATE OR REPLACE FUNCTION public.finalize_challenge(p_challenge_id uuid)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c challenges;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id
  for update;

  -- 0046: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'active' then
    raise exception 'invalid_status:%', c.status;
  end if;
  if c.end_date >= (now() at time zone 'Asia/Seoul')::date then
    raise exception 'not_ended_yet';
  end if;

  update challenges set status = 'ended'
  where id = p_challenge_id
  returning * into c;
  return c;
end $function$;

-- ── freeze_profile_attribution ──
CREATE OR REPLACE FUNCTION public.freeze_profile_attribution()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- 초대자는 따로 논다. 유입 계측과 시점이 달라서다(위 주석 참고).
  new.invited_by := coalesce(old.invited_by, new.invited_by);

  -- 유입 6칸은 한 벌이다. 한 번 잡혔으면 통째로 그때 것을 지킨다.
  if old.acquisition_captured_at is not null then
    new.acquisition_source      := old.acquisition_source;
    new.acquisition_medium      := old.acquisition_medium;
    new.acquisition_campaign    := old.acquisition_campaign;
    new.acquisition_referrer    := old.acquisition_referrer;
    new.acquisition_landing     := old.acquisition_landing;
    new.acquisition_captured_at := old.acquisition_captured_at;
  end if;

  return new;
end $function$;

-- ── generate_invite_code ──
CREATE OR REPLACE FUNCTION public.generate_invite_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..5 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'GND-' || code;
end $function$;

-- ── get_challenge_participant_profiles ──
CREATE OR REPLACE FUNCTION public.get_challenge_participant_profiles(p_challenge_id uuid)
 RETURNS TABLE(id uuid, nickname text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.id, p.nickname, p.avatar_url
  from public.challenge_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.challenge_id = p_challenge_id
    and cp.status in ('joined', 'dropped')
    -- 정식 참가자만 같은 챌린지 명단을 읽는다. 관리자 서버는 같은 RPC를 쓴다.
    and (
      (select auth.role()) = 'service_role'
      or public.shares_challenge_with(
        p_challenge_id,
        (select auth.uid())
      )
    )
$function$;

-- ── get_challenge_period_sessions ──
CREATE OR REPLACE FUNCTION public.get_challenge_period_sessions(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c public.challenges;
  v_rows jsonb;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.shares_challenge_with(
       p_challenge_id,
       (select auth.uid())
     ) then
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
            from public.workout_sets ws where ws.workout_exercise_id = we.id
          ), '[]'::jsonb)
        ))
        from public.workout_exercises we where we.session_id = s.id
      ), '[]'::jsonb)
    ) as row
    from public.workout_sessions s
    join public.challenge_participants cp
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
        or exists (
          select 1
          from public.workout_images wi
          where wi.session_id = s.id
        )
      )
  ) t;

  return v_rows;
end $function$;

-- ── get_crew_member_profile ──
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

-- ── get_incoming_crew_requests ──
CREATE OR REPLACE FUNCTION public.get_incoming_crew_requests()
 RETURNS TABLE(request_id uuid, requester_id uuid, nickname text, avatar_url text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.requester_id, p.nickname, p.avatar_url, r.created_at
  from public.crew_requests r
  join public.profiles p on p.id = r.requester_id
  where r.addressee_id = (select auth.uid()) and r.status = 'pending'
  order by r.created_at desc
$function$;

-- ── get_my_badge_metrics ──
CREATE OR REPLACE FUNCTION public.get_my_badge_metrics()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.badge_metrics(auth.uid());
$function$;

-- ── get_my_crew ──
CREATE OR REPLACE FUNCTION public.get_my_crew()
 RETURNS TABLE(id uuid, nickname text, avatar_url text, total_xp integer, current_level smallint, current_stage smallint, linked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.nickname, p.avatar_url,
         coalesce(up.total_xp, 0),
         coalesce(up.current_level, 1::smallint),
         coalesce(up.current_stage, 1::smallint),
         l.created_at
  from public.crew_links l
  join public.profiles p
    on p.id = case when l.user_a = (select auth.uid()) then l.user_b else l.user_a end
  left join public.user_progress up on up.user_id = p.id
  where (select auth.uid()) in (l.user_a, l.user_b)
    and not public.is_blocked_between((select auth.uid()), p.id)  -- 0089
  order by p.nickname
$function$;

-- ── get_my_recent_pokes ──
CREATE OR REPLACE FUNCTION public.get_my_recent_pokes()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select n.user_id
  from public.notifications n
  where n.type = 'poke'
    and n.actor_id = (select auth.uid())
    and n.created_at > now() - interval '24 hours'
$function$;

-- ── get_session_actor_profiles ──
CREATE OR REPLACE FUNCTION public.get_session_actor_profiles(p_session_ids uuid[])
 RETURNS TABLE(id uuid, nickname text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 댓글·응원 중 **말이 있는 것**을 남긴 사람.
  -- 말 없는 이모지 응원은 화면에서 `🔥3` 익명 집계라 이름이 필요 없다 —
  -- 필요 없는 노출은 하지 않는다.
  select distinct p.id, p.nickname, p.avatar_url
  from cheers c
  join profiles p on p.id = c.sender_id
  where c.session_id = any(p_session_ids)
    and c.message is not null
    -- ⚠⚠ **이 줄이 문지기다.** SECURITY DEFINER라 RLS를 지나친다.
    --    `cheers_select_related`가 쓰는 것과 **같은 함수**를 쓴다 →
    --    규칙은 하나다: 댓글을 읽을 수 있으면 이름도 읽을 수 있다.
    --    `auth.uid()`는 정의자가 아니라 **호출자**의 JWT를 본다.
    and public.session_crew_shared(c.session_id)

  union

  -- 좋아요를 누른 사람 (0084).
  select distinct p.id, p.nickname, p.avatar_url
  from reactions rx
  join profiles p on p.id = rx.user_id
  where rx.session_id = any(p_session_ids)
    -- 좋아요 읽기 정책(`reactions_select_visible`)이 쓰는 것과 **같은 함수**다.
    -- cheers 쪽과 함수가 다른 이유: 정책이 원래 다른 것을 쓴다
    -- (reactions는 `workout_session_crew_visible`, cheers는 `session_crew_shared`).
    -- 각자 자기 정책과 맞춰야 "보이는데 이름은 안 나오는" 어긋남이 안 생긴다.
    and public.workout_session_crew_visible(rx.session_id)
$function$;

-- ── invite_to_challenge ──
CREATE OR REPLACE FUNCTION public.invite_to_challenge(p_challenge_id uuid, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  c challenges;
  v_nick text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_invite'; end if;

  select * into c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'challenge_not_found'; end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  if not exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = v_me and role = 'host'
  ) then
    raise exception 'not_host';
  end if;

  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;

  -- 이미 초대했거나 참가 중이면 알린다. 조용히 넘기면 화면이 "보냈어요"를
  -- 두 번 띄우고 사용자는 상대가 왜 안 들어오는지 모른다.
  if exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = p_target_id
  ) then
    raise exception 'already_invited';
  end if;

  insert into challenge_participants (challenge_id, user_id, role, status, invited_by)
  values (p_challenge_id, p_target_id, 'member', 'invited', v_me);

  select nickname into v_nick from profiles where id = v_me;
  -- 알림 실패가 초대를 되돌리면 안 된다. 초대가 본체고 알림은 곁가지다.
  -- (0029에서 알림 insert 하나가 운동 완료 트랜잭션을 롤백시킨 전례가 있다.)
  begin
    perform notify(
      p_target_id, v_me, 'challenge_invite', p_challenge_id,
      coalesce(v_nick, '크루원') || '님이 챌린지에 초대했어요 🏆',
      c.name || ' · ' || to_char(c.start_date, 'MM/DD') || '~' || to_char(c.end_date, 'MM/DD')
    );
  exception when others then null;
  end;

  return jsonb_build_object('status', 'invited');
end $function$;

-- ── is_blocked_between ──
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_a uuid, p_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  )
$function$;

-- ── is_challenge_participant ──
CREATE OR REPLACE FUNCTION public.is_challenge_participant(cid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.challenge_participants
    where challenge_id = cid and user_id = uid
  )
$function$;

-- ── is_crew_with ──
CREATE OR REPLACE FUNCTION public.is_crew_with(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.crew_links
    where user_a = least((select auth.uid()), uid)
      and user_b = greatest((select auth.uid()), uid)
  )
  and not public.is_blocked_between((select auth.uid()), uid)  -- 0089
$function$;

-- ── is_group_member ──
CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = uid
  )
$function$;

-- ── is_valid_workout ──
CREATE OR REPLACE FUNCTION public.is_valid_workout(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tabata_minutes int; v_owner uuid;
  v_completed_sets int; v_cardio_time int;
begin
  select tabata_minutes, user_id into v_tabata_minutes, v_owner
  from workout_sessions where id = p_session_id;
  if not found or v_owner <> auth.uid() then
    raise exception 'not_owner';
  end if;

  -- 1) 타바타: 완료 자체로 유효
  if v_tabata_minutes is not null then
    return true;
  end if;

  -- 2) 완료 세트 3개 이상: 웨이트/근력 기존 기준
  select count(*) into v_completed_sets
  from workout_sets ws
  join workout_exercises we on we.id = ws.workout_exercise_id
  where we.session_id = p_session_id and ws.is_completed;
  if v_completed_sets >= 3 then
    return true;
  end if;

  -- 3) 유산소·시간 종목: 실제 거리 또는 시간이 기록된 완료 세트가 있으면 유효
  select count(*) into v_cardio_time
  from workout_sets ws
  join workout_exercises we on we.id = ws.workout_exercise_id
  where we.session_id = p_session_id and ws.is_completed
    and (coalesce(ws.distance_meters, 0) > 0 or coalesce(ws.duration_seconds, 0) > 0);
  return v_cardio_time >= 1;
end $function$;

-- ── issue_challenge_invite_code ──
CREATE OR REPLACE FUNCTION public.issue_challenge_invite_code(p_challenge_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c challenges;
  v_code text;
  i int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into c from challenges where id = p_challenge_id for update;
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;
  if not exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid() and role = 'host'
  ) then
    raise exception 'not_host';
  end if;

  if c.invite_code is not null then return c.invite_code; end if;

  -- 유니크 충돌은 32^5 = 3355만 분의 1이지만, 났을 때 조용히 실패하면 안 되므로
  -- 몇 번 다시 뽑고 그래도 안 되면 예외를 낸다.
  for i in 1..10 loop
    v_code := public.generate_invite_code();
    begin
      update challenges set invite_code = v_code where id = p_challenge_id;
      return v_code;
    exception when unique_violation then
      -- 다음 루프에서 다시 뽑는다
    end;
  end loop;
  raise exception 'code_generation_failed';
end $function$;

-- ── issue_my_invite_code ──
CREATE OR REPLACE FUNCTION public.issue_my_invite_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_me   uuid := (select auth.uid());
  v_code text;
  i      int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select invite_code into v_code from public.profiles where id = v_me;
  if v_code is not null then return v_code; end if;

  -- 프로필이 없으면 코드를 붙일 곳이 없다. 온보딩을 먼저 마쳐야 한다.
  if not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'no_profile';
  end if;

  for i in 1..10 loop
    v_code := public.generate_invite_code();

    -- ⚠️ 그룹 코드와 겹치면 버린다. 겹친 채로 두면 `/invite/[code]`가 친구 코드를
    --    먼저 찾으므로 그 그룹의 초대 링크가 **조용히 친구 초대로 바뀐다.**
    if exists (select 1 from public.groups where invite_code = v_code) then
      continue;
    end if;

    begin
      update public.profiles set invite_code = v_code where id = v_me;
      return v_code;
    exception when unique_violation then
      -- 같은 코드를 다른 사람이 먼저 가져갔다(31^5 공간이라 드물다). 다시 뽑는다.
      null;
    end;
  end loop;

  raise exception 'code_generation_failed';
end $function$;

-- ── join_challenge_as_newcomer ──
CREATE OR REPLACE FUNCTION public.join_challenge_as_newcomer(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_me        uuid := (select auth.uid());
  v_result    jsonb;
  v_challenge uuid;
  v_host      uuid;
  v_host_nick text;
  v_my_nick   text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
 
  -- ── 신입 가드 ────────────────────────────────────────────
  --
  -- ⚠️ **참가 전에 센다.** 참가 뒤에 세면 challenge_participants가 1행이 되어
  --    조건이 뒤집히고, 그러면 누구든 이 함수로 친구가 될 수 있다 = D5다.
  --
  -- ⚠️ 두 조건 중 하나라도 빼지 마라.
  --    crew_links 0건  : 이미 친구가 있는 사람 = 기존 사용자
  --    participants 0건: 다른 챌린지에 있는 사람 = 0051이 신고한 바로 그 경우
  if exists (
    select 1 from public.crew_links
    where user_a = v_me or user_b = v_me
  ) then
    raise exception 'not_newcomer';
  end if;
 
  if exists (
    select 1 from public.challenge_participants where user_id = v_me
  ) then
    raise exception 'not_newcomer';
  end if;
 
  -- ── 참가 ─────────────────────────────────────────────────
  --
  -- ⚠️ 참가 절차를 **베끼지 않는다.** advisory lock · status='setup' 검사 ·
  --    upsert가 한 벌만 존재해야 한다. 이 저장소는 start_challenge를 세 곳에
  --    복사해 두고 0045~0047로 세 번 고친 전례가 있다.
  --
  -- 여기서 예외가 나면(invalid_invite_code · invalid_status · already_joined)
  -- 트랜잭션 전체가 롤백된다 — **챌린지에 못 들어갔는데 친구만 된 상태가 없다.**
  v_result := public.join_challenge_with_code(p_code);
  v_challenge := (v_result ->> 'challengeId')::uuid;
 
  -- ── 방장과 연결 ──────────────────────────────────────────
  select cp.user_id into v_host
  from public.challenge_participants cp
  where cp.challenge_id = v_challenge and cp.role = 'host'
  order by cp.joined_at nulls last
  limit 1;
 
  -- 방장이 없는 방은 있을 수 없지만(create_challenge_room이 같은 트랜잭션에서
  -- 넣는다), 없으면 챌린지 참가만 하고 조용히 끝낸다. 친구 연결이 없다고 참가를
  -- 되돌릴 이유는 없다.
  if v_host is null or v_host = v_me then
    return v_result || jsonb_build_object('crewLinked', 0);
  end if;
 
  perform pg_advisory_xact_lock(
    hashtext(least(v_me, v_host)::text || greatest(v_me, v_host)::text)
  );
 
  -- 0079: 출처는 '챌린지', 먼저 연 쪽은 방장이다.
  insert into public.crew_links (user_a, user_b, origin, initiated_by)
  values (least(v_me, v_host), greatest(v_me, v_host), 'challenge', v_host)
  on conflict do nothing;
 
  -- 0079: 위 신입 가드가 **crew_links 0건**을 이미 보장한다 —
  -- 이 경로로 온 사람은 정의상 신규라 여기서 다시 재지 않는다.
  update public.profiles
     set invited_by = v_host
   where id = v_me and invited_by is null;
 
  select nickname into v_host_nick from public.profiles where id = v_host;
  select nickname into v_my_nick   from public.profiles where id = v_me;
 
  -- 알림 실패가 연결·참가까지 되돌리면 안 된다.
  begin
    perform public.notify(
      v_host, v_me, 'crew_accepted', v_challenge,
      coalesce(v_my_nick, '누군가') || '님이 챌린지에 들어오고 친구가 됐어요 🤝',
      '초대 링크로 GND를 처음 시작했어요'
    );
  exception when others then null;
  end;
 
  return v_result || jsonb_build_object(
    'crewLinked', 1,
    'hostId', v_host,
    'hostNickname', v_host_nick
  );
end $function$;

-- ── join_challenge_with_code ──
CREATE OR REPLACE FUNCTION public.join_challenge_with_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

-- ── join_discoverable_challenge ──
CREATE OR REPLACE FUNCTION public.join_discoverable_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_me   uuid := auth.uid();
  c      public.challenges;
  v_row  public.challenge_participants;
  v_nick text;
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
  --
  -- ⚠️⚠️ advisory lock으로 바꾸지 마라. `start_challenge`는 advisory lock을
  --    쓰지 않고 challenges 행에 FOR UPDATE를 건다 — 다른 자원을 잡으면 둘이
  --    서로를 전혀 막지 않아 **시작된 챌린지에 중도 합류**가 생긴다.
  select * into c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then raise exception 'not_discoverable'; end if;
  if not c.discoverable then raise exception 'not_discoverable'; end if;
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

  -- 0088: 방장에게 알린다
  if c.created_by <> v_me then
    select nickname into v_nick from profiles where id = v_me;
    perform notify(
      c.created_by,
      v_me,
      'challenge_joined',
      c.id,
      coalesce(v_nick, '크루원') || '님이 참가했어요 🙌',
      c.name
    );
  end if;

  return jsonb_build_object(
    'status', 'joined',
    'challengeId', c.id,
    'challengeName', c.name,
    'crewLinked', 0
  );
end $function$;

-- ── join_group_with_code ──
CREATE OR REPLACE FUNCTION public.join_group_with_code(p_code text)
 RETURNS TABLE(group_id uuid, group_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into g from groups
  where invite_code = upper(trim(p_code));

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return query select g.id, g.name;
end $function$;

-- ── leave_setup_challenge ──
CREATE OR REPLACE FUNCTION public.leave_setup_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- ── list_blocked_users ──
CREATE OR REPLACE FUNCTION public.list_blocked_users()
 RETURNS TABLE(id uuid, nickname text, avatar_url text, blocked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.nickname, p.avatar_url, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$function$;

-- ── list_discoverable_challenges ──
CREATE OR REPLACE FUNCTION public.list_discoverable_challenges()
 RETURNS TABLE(id uuid, name text, recruit_note text, recruit_image_url text, start_date date, end_date date, photo_required boolean, participant_count integer, host_id uuid, host_nickname text, host_avatar_url text, already_joined boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id,
         c.name,
         c.recruit_note,
         c.recruit_image_url,
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
    -- 0089: 7일 만료. recruit_opened_at이 없는 옛 행은 created_at으로 눈감아 준다.
    and coalesce(c.recruit_opened_at, c.created_at) > now() - interval '7 days'
    -- 0089: 차단한/차단당한 방장의 글은 안 보인다
    and not public.is_blocked_between((select auth.uid()), c.created_by)
  order by c.start_date asc, c.created_at desc
  limit 12
$function$;

-- ── mark_record_beaten ──
CREATE OR REPLACE FUNCTION public.mark_record_beaten(p_session_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session workout_sessions%rowtype;
  v_nickname text;
begin
  select * into v_session from workout_sessions where id = p_session_id;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'not_owner';
  end if;
  if v_session.status <> 'completed' or v_session.deleted_at is not null then
    raise exception 'invalid_status';
  end if;
  if v_session.record_note is not null then
    raise exception 'already_marked';
  end if;
  if p_note is null or length(trim(p_note)) = 0 or length(p_note) > 80 then
    raise exception 'invalid_note';
  end if;

  update workout_sessions set record_note = p_note where id = p_session_id;

  select nickname into v_nickname from profiles where id = v_session.user_id;

  -- 0039: 크루 연결 기준. crew_links는 쌍당 1행이라 distinct가 필요 없다.
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select case when l.user_a = v_session.user_id then l.user_b else l.user_a end,
    v_session.user_id, 'record_beaten', p_session_id,
    '🏅 기록 갱신! 칭찬해주세요',
    coalesce(v_nickname, '크루원') || '님이 ' || p_note
      || '. 칭찬 한마디 남겨주세요! 👏'
  from crew_links l
  where v_session.user_id in (l.user_a, l.user_b);

  -- 배지는 evaluate_badges가 판정한다. 임계값은 badge_definitions가 단일 원천이다.
  perform public.evaluate_badges(v_session.user_id);
end $function$;

-- ── move_workout_plan ──
CREATE OR REPLACE FUNCTION public.move_workout_plan(p_plan_id uuid, p_target_date date, p_replace boolean DEFAULT false)
 RETURNS workout_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan public.workout_plans%rowtype;
  v_existing_id uuid;
  v_existing_enrollment_id uuid;
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select (now() at time zone coalesce(p.timezone, 'Asia/Seoul'))::date
    into v_today
  from public.profiles p
  where p.id = auth.uid();
  v_today := coalesce(v_today, (now() at time zone 'Asia/Seoul')::date);

  if p_target_date < v_today then
    raise exception 'past_plan_date';
  end if;

  select * into v_plan
  from public.workout_plans
  where id = p_plan_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'plan_not_found';
  end if;
  if v_plan.program_enrollment_id is not null then
    raise exception 'program_plan_use_reschedule';
  end if;

  select id, program_enrollment_id
    into v_existing_id, v_existing_enrollment_id
  from public.workout_plans
  where user_id = auth.uid()
    and plan_date = p_target_date
    and id <> p_plan_id
  for update;

  if v_existing_id is not null and not coalesce(p_replace, false) then
    raise exception 'plan_date_taken';
  end if;

  if v_existing_enrollment_id is not null then
    raise exception 'program_plan_use_reschedule';
  end if;

  if v_existing_id is not null then
    delete from public.workout_plans where id = v_existing_id;
  end if;

  update public.workout_plans
  set plan_date = p_target_date,
      scheduled_at = null
  where id = p_plan_id
  returning * into v_plan;

  return v_plan;
end;
$function$;

-- ── notify ──
CREATE OR REPLACE FUNCTION public.notify(p_user_id uuid, p_actor_id uuid, p_type text, p_reference_id uuid, p_title text, p_body text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  values (p_user_id, p_actor_id, p_type, p_reference_id, p_title, p_body)
$function$;

-- ── notify_bug_report_watchers ──
CREATE OR REPLACE FUNCTION public.notify_bug_report_watchers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w           record;
  v_nickname  text;
  v_actor     uuid;
  v_body      text;
begin
  -- 신고자에게 프로필이 없을 수 있다(온보딩에서 막힌 사람). notifications.actor_id는
  -- profiles를 가리키므로 그대로 넣으면 FK 위반으로 **신고 자체가 실패한다.**
  select nickname into v_nickname from profiles where id = new.user_id;
  v_actor := case when v_nickname is null then null else new.user_id end;

  v_body := left(new.message, 160)
         || coalesce(' — ' || new.route, '');

  for w in select user_id from bug_report_watchers loop
    -- 자기가 신고한 것을 자기가 알림받는 건 소음이다. 관리자도 크루의 한 명이다.
    continue when w.user_id = new.user_id;

    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    values (
      w.user_id,
      v_actor,
      'bug_reported',
      new.id,
      '🐞 새 신고 · ' || coalesce(v_nickname, '이름 없는 사용자'),
      v_body
    );
  end loop;

  return new;
end $function$;

-- ── notify_challenge_peek_unlock ──
CREATE OR REPLACE FUNCTION public.notify_challenge_peek_unlock(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today     date := (now() at time zone 'Asia/Seoul')::date;
  v_challenge uuid;
  v_last_use  date;
  v_consec    int := 0;
  v_day       date;
begin
  -- 참가 중인 active 챌린지가 있을 때만 의미가 있다.
  select c.id into v_challenge
  from challenge_participants cp
  join challenges c on c.id = cp.challenge_id
  where cp.user_id = p_user_id and c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_challenge is null then return; end if;

  -- 이 챌린지에서 마지막으로 **쓴** 날. 없으면 null.
  select max(pick_date) into v_last_use
  from challenge_peek_picks
  where viewer_id = p_user_id and challenge_id = v_challenge;

  -- 오늘 쓴 것은 카운터를 끊지 않는다 (오늘 창은 유지된다).
  if v_last_use = v_today then
    v_last_use := null;
  end if;

  -- 오늘부터 뒤로 연속 운동일을 센다. 마지막으로 쓴 날에 닿으면 멈춘다 —
  -- 그날과 그 이전은 이미 보상으로 바뀐 날들이라 이번 블록에 안 쳐 준다.
  --
  -- ⚠️ current_streak_days를 쓰지 마라. 그건 "간격 5일 미만이면 이어짐"이라
  --    빈 날이 있어도 이어진 것으로 센다. 열람 조건은 **엄밀 연속**이다.
  for i in 0..364 loop
    v_day := v_today - i;
    exit when v_last_use is not null and v_day <= v_last_use;
    exit when not exists (
      select 1 from workout_sessions w
      where w.user_id = p_user_id
        and w.status = 'completed'
        and w.deleted_at is null
        and w.completed_at is not null
        and (w.completed_at at time zone 'Asia/Seoul')::date = v_day
    );
    v_consec := v_consec + 1;
  end loop;

  if v_consec < 5 then return; end if;

  -- dedupe_key로 하루 1건만. 열람창 자체가 KST 하루에 하나뿐이다.
  insert into notifications (user_id, type, reference_id, title, body, dedupe_key)
  values (
    p_user_id, 'challenge_peek_unlocked', v_challenge,
    '🎟️ 챌린지 성과 열람 2시간 시작!',
    '5일 연속 운동 달성! 지금부터 2시간 동안 챌린지 탭에서 참가자 한 명의 성과를 볼 수 있어요.',
    'peek_unlock:' || p_user_id::text || ':' || v_today::text
  )
  on conflict (dedupe_key) do nothing;
end $function$;

-- ── notify_reaction ──
CREATE OR REPLACE FUNCTION public.notify_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_nick text;
begin
  select user_id into v_owner from workout_sessions where id = new.session_id;
  if v_owner is not null and v_owner <> new.user_id then
    select nickname into v_nick from profiles where id = new.user_id;
    perform notify(
      v_owner, new.user_id, 'reaction_received', new.session_id,
      coalesce(v_nick, '크루원') || '님이 내 운동에 반응했어요',
      new.reaction_type
    );
  end if;
  return new;
end $function$;

-- ── owns_program_enrollment ──
CREATE OR REPLACE FUNCTION public.owns_program_enrollment(eid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.program_enrollments
     where id = eid
       and user_id = auth.uid()
  )
$function$;

-- ── owns_workout_exercise ──
CREATE OR REPLACE FUNCTION public.owns_workout_exercise(eid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from workout_exercises e
    join workout_sessions s on s.id = e.session_id
    where e.id = eid and s.user_id = auth.uid()
  )
$function$;

-- ── owns_workout_session ──
CREATE OR REPLACE FUNCTION public.owns_workout_session(sid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from workout_sessions
    where id = sid and user_id = auth.uid()
  )
$function$;

-- ── pending_bug_report_count ──
CREATE OR REPLACE FUNCTION public.pending_bug_report_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from bug_reports where status = 'new';
$function$;

-- ── pick_challenge_peek ──
CREATE OR REPLACE FUNCTION public.pick_challenge_peek(p_challenge_id uuid, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_group uuid;
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  v_target uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_pick'; end if;

  select group_id into v_group from challenges
  where id = p_challenge_id and status = 'active';
  if not found then raise exception 'challenge_not_active'; end if;

  -- 보는 사람도 대상도 그 챌린지의 실제 참가자여야 한다. 그룹 소속만으로는
  -- 부족하다 — 목표를 세우지 않은 사람은 순위표에 아예 없어서 고르면 빈 카드가 된다.
  if not exists (
    select 1 from user_goals
    where challenge_id = p_challenge_id and user_id = v_me
  ) then
    raise exception 'not_participant';
  end if;
  if not exists (
    select 1 from user_goals
    where challenge_id = p_challenge_id and user_id = p_target_id
  ) then
    raise exception 'target_not_participant';
  end if;

  insert into challenge_peek_picks (viewer_id, challenge_id, pick_date, target_id)
  values (v_me, p_challenge_id, v_date, p_target_id)
  on conflict (viewer_id, challenge_id, pick_date) do nothing;

  select target_id into v_target from challenge_peek_picks
  where viewer_id = v_me
    and challenge_id = p_challenge_id
    and pick_date = v_date;

  -- locked = 이미 다른 사람을 골라 뒀다는 뜻. 화면은 이걸로 "오늘은 ○○님만
  -- 볼 수 있어요"를 띄운다.
  return jsonb_build_object(
    'targetId', v_target,
    'locked', v_target is distinct from p_target_id
  );
end $function$;

-- ── point_multiplier ──
CREATE OR REPLACE FUNCTION public.point_multiplier(p_streak integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_streak >= 25 then 4.0
    when p_streak >= 15 then 3.0
    when p_streak >= 10 then 2.0
    when p_streak >= 5  then 1.5
    else 1.0
  end::numeric
$function$;

-- ── poke_user ──
CREATE OR REPLACE FUNCTION public.poke_user(p_target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nick text;
  v_wants boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'self_poke';
  end if;
  if not public.is_crew_with(p_target_id) then  -- 0039: 그룹 → 크루 연결
    raise exception 'not_crew';
  end if;

  -- ⬇ 0028: 오늘 운동을 마친 사람만 찌를 수 있다
  if not exists (
    select 1 from workout_sessions
    where user_id = auth.uid()
      and status = 'completed'
      and deleted_at is null
      and completed_at is not null
      and (completed_at at time zone 'Asia/Seoul')::date
          = (now() at time zone 'Asia/Seoul')::date
  ) then
    raise exception 'poke_requires_workout';
  end if;

  if exists (
    select 1 from notifications
    where type = 'poke' and actor_id = auth.uid() and user_id = p_target_id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'poke_cooldown';
  end if;

  select coalesce(ns.pokes, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = p_target_id;
  if not v_wants then
    raise exception 'pokes_disabled';
  end if;

  select nickname into v_nick from profiles where id = auth.uid();
  perform notify(
    p_target_id, auth.uid(), 'poke', null,
    coalesce(v_nick, '크루원') || '님이 콕 찔렀어요 👉',
    '오늘 운동 어때요?'
  );
end $function$;

-- ── post_session_comment ──
CREATE OR REPLACE FUNCTION public.post_session_comment(p_session_id uuid, p_body text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        workout_sessions;
  c        cheers;
  v_owner  uuid;
  v_parent uuid := null;
  v_last   timestamptz;
  v_nick   text;
  v_body   text;
  r        record;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'comment_empty';
  end if;
  if char_length(v_body) > 200 then
    raise exception 'comment_too_long';
  end if;

  select * into s from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  -- 완료 · visibility='group' · deleted_at is null · (본인 또는 크루).
  -- **피드가 보여주는 조건과 정확히 같다** — 보이는 것에만 댓글이 달린다.
  if not public.workout_session_crew_visible(p_session_id) then
    raise exception 'session_not_found';
  end if;

  v_owner := s.user_id;

  -- ── 부모 댓글 정규화 (0084) ────────────────────────────────
  if p_parent_id is not null then
    -- ⚠️ **같은 세션인지 반드시 본다.** 안 보면 남의 글 댓글을 부모로 지정해
    --    이 세션 스레드에 끼워 넣을 수 있다(스레드 오염).
    -- ⚠️ 말이 있는 행만 부모가 될 수 있다 — 말 없는 이모지 응원은 화면에서
    --    `🔥3` 익명 집계라 답글이 붙을 자리가 없다.
    select coalesce(parent_id, id) into v_parent   -- ← 2단계 평탄화
    from cheers
    where id = p_parent_id
      and session_id = p_session_id
      and message is not null;

    if v_parent is null then
      raise exception 'parent_not_found';
    end if;
  end if;

  -- 도배 방어. 응원의 3회 제한과 달리 총량은 안 막는다(대화니까).
  select max(created_at) into v_last
  from cheers
  where session_id = p_session_id
    and sender_id = auth.uid()
    and cheer_type = 'comment';
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'comment_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message, parent_id)
  values (p_session_id, auth.uid(), v_owner, 'comment', v_body, v_parent)
  returning * into c;

  select nickname into v_nick from profiles where id = auth.uid();

  -- 팬아웃: 세션 주인 + 앞선 댓글 작성자 전원. union이 중복을 접는다.
  --
  -- ⚠️ 주인에게만 보내면 안 된다. `cheers.receiver_id`가 세션 주인이라,
  --    B가 A 글에 댓글 → A 알림 → **A가 답글 → receiver가 또 A라서 B는 영영
  --    모른다.** 왕복이 안 닫힌다.
  for r in
    select v_owner as uid
    union
    select ch.sender_id
    from cheers ch
    where ch.session_id = p_session_id
      and ch.cheer_type = 'comment'
  loop
    continue when r.uid = auth.uid();          -- 내가 쓴 글을 나에게 알리지 않는다
    continue when r.uid is null;

    -- 행이 없으면 true (0011 관례)
    if coalesce(
         (select ns.comments from notification_settings ns where ns.user_id = r.uid),
         true
       ) then
      perform notify(
        r.uid,
        auth.uid(),
        'comment_received',
        p_session_id,                          -- ⚠ 세션 id다. 딥링크가 이걸 쓴다
        coalesce(v_nick, '크루원') ||
          case when v_parent is not null then '님이 답글을 남겼어요 💬'
               when r.uid = v_owner       then '님이 내 운동에 댓글을 남겼어요 💬'
               else                            '님도 이 운동에 댓글을 남겼어요 💬'
          end,
        left(v_body, 120)
      );
    end if;
  end loop;

  return jsonb_build_object('id', c.id, 'created_at', c.created_at,
                            'parent_id', c.parent_id);
end $function$;

-- ── reject_crew_request ──
CREATE OR REPLACE FUNCTION public.reject_crew_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_req crew_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_req from crew_requests where id = p_request_id for update;
  if not found or v_req.addressee_id <> auth.uid() then
    raise exception 'not_addressee';
  end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  update crew_requests set status = 'rejected', responded_at = now()
   where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end $function$;

-- ── remind_upcoming_challenges ──
CREATE OR REPLACE FUNCTION public.remind_upcoming_challenges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tomorrow date := ((now() at time zone 'Asia/Seoul')::date + 1);
  v_sent int := 0;
  v_n int;
  c record;
  p record;
begin
  for c in
    select ch.id, ch.name from challenges ch
    where ch.status = 'setup' and ch.start_date = v_tomorrow
  loop
    for p in
      select cp.user_id,
             exists (
               select 1 from user_goals ug
               where ug.challenge_id = c.id and ug.user_id = cp.user_id
             ) as has_goal
      from challenge_participants cp
      where cp.challenge_id = c.id and cp.status = 'joined'
    loop
      insert into notifications
        (user_id, actor_id, type, reference_id, title, body, dedupe_key)
      values (
        p.user_id, null, 'challenge_starting_soon', c.id,
        case when p.has_goal
             then '내일 챌린지가 시작돼요 🏁'
             else '내일 시작! 목표를 아직 안 세웠어요 🎯' end,
        case when p.has_goal
             then c.name || ' · 내일부터 기록이 반영돼요'
             else c.name || ' · 오늘 안에 목표를 세우지 않으면 이번 챌린지에선 빠져요' end,
        'challenge_starting_soon:' || c.id::text || ':' || p.user_id::text
      )
      on conflict (dedupe_key) do nothing;
      get diagnostics v_n = row_count;
      v_sent := v_sent + v_n;
    end loop;
  end loop;

  return jsonb_build_object('sent', v_sent);
end $function$;

-- ── remove_crew ──
CREATE OR REPLACE FUNCTION public.remove_crew(p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from crew_links
   where user_a = least(auth.uid(), p_target_id)
     and user_b = greatest(auth.uid(), p_target_id);
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'not_crew'; end if;
  return jsonb_build_object('status', 'removed');
end $function$;

-- ── report_user ──
CREATE OR REPLACE FUNCTION public.report_user(p_target_id uuid, p_reason text, p_note text DEFAULT NULL::text, p_challenge_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_report'; end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;
  if p_reason not in ('spam', 'harassment', 'inappropriate', 'fake', 'other') then
    raise exception 'invalid_reason';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'note_too_long';
  end if;

  -- 같은 상대에 대해 처리 안 된 신고가 이미 있으면 조용히 그것을 돌려준다.
  -- 오류로 만들면 "이미 신고함"이 화면에 뜨는데, 신고자는 대개 그걸 실패로
  -- 읽고 다시 누른다. 접수됐다고 말하는 편이 정확하고 덜 불안하다.
  select id into v_id from public.user_reports
  where reporter_id = v_me and target_id = p_target_id and status = 'open'
  limit 1;
  if found then
    return jsonb_build_object('status', 'already_open', 'reportId', v_id);
  end if;

  insert into public.user_reports (reporter_id, target_id, challenge_id, reason, note)
  values (v_me, p_target_id, p_challenge_id, p_reason, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;

  return jsonb_build_object('status', 'received', 'reportId', v_id);
end $function$;

-- ── reschedule_program_plans ──
CREATE OR REPLACE FUNCTION public.reschedule_program_plans(p_enrollment_id uuid, p_moves jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments%rowtype;
  v_today date;
  v_move jsonb;
  v_move_index bigint;
  v_plan_id uuid;
  v_plan_ids uuid[] := array[]::uuid[];
  v_target_date date;
  v_target_dates date[] := array[]::date[];
  v_scheduled_at timestamptz;
  v_conflict_date date;
  v_bad_count int;
  v_temp_date date;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_enrollment_id is null then
    raise exception 'program_enrollment_not_found';
  end if;
  if p_moves is null
    or jsonb_typeof(p_moves) <> 'array'
    or jsonb_array_length(p_moves) not between 1 and 18
    or octet_length(p_moves::text) > 100000 then
    raise exception 'program_invalid_moves';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select * into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
    and user_id = v_user_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'program_enrollment_not_found';
  end if;
  v_today := (now() at time zone v_enrollment.timezone)::date;

  for v_move, v_move_index in
    select value, ordinality
    from jsonb_array_elements(p_moves) with ordinality
  loop
    if jsonb_typeof(v_move) is distinct from 'object'
      or not (v_move ?& array['plan_id', 'plan_date', 'scheduled_at'])
      or jsonb_typeof(v_move->'plan_id') is distinct from 'string'
      or (v_move->>'plan_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'program_invalid_plan_id';
    end if;
    v_plan_id := (v_move->>'plan_id')::uuid;
    if v_plan_id = any(v_plan_ids) then
      raise exception 'program_move_plan_duplicate';
    end if;
    if not exists (
      select 1 from public.workout_plans
      where id = v_plan_id
        and user_id = v_user_id
        and program_enrollment_id = p_enrollment_id
    ) then
      raise exception 'program_plan_not_found';
    end if;
    v_plan_ids := array_append(v_plan_ids, v_plan_id);

    if jsonb_typeof(v_move->'plan_date') is distinct from 'string'
      or (v_move->>'plan_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'program_invalid_plan_date';
    end if;
    begin
      v_target_date := (v_move->>'plan_date')::date;
    exception when others then
      raise exception 'program_invalid_plan_date';
    end;
    if v_target_date::text <> v_move->>'plan_date'
      or v_target_date < v_today
      or v_target_date > v_today + 730 then
      raise exception 'program_invalid_plan_date';
    end if;
    if v_target_date = any(v_target_dates) then
      raise exception 'program_plan_date_duplicate:%', v_target_date;
    end if;
    v_target_dates := array_append(v_target_dates, v_target_date);

    if jsonb_typeof(v_move->'scheduled_at') is distinct from 'string' then
      raise exception 'program_invalid_scheduled_at';
    end if;
    begin
      v_scheduled_at := (v_move->>'scheduled_at')::timestamptz;
    exception when others then
      raise exception 'program_invalid_scheduled_at';
    end;
    if (v_scheduled_at at time zone v_enrollment.timezone)::date <> v_target_date then
      raise exception 'program_scheduled_date_mismatch';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_enrollment.preferred_slots) slot
      where slot->>'time' = to_char(
        v_scheduled_at at time zone v_enrollment.timezone,
        'HH24:MI'
      )
    ) then
      raise exception 'program_scheduled_time_mismatch';
    end if;
  end loop;

  -- 옮기는 행 자신의 기존 날짜는 충돌에서 제외한다. 옮기지 않는 같은 프로그램
  -- 회차와 다른 모든 계획은 그대로 충돌 대상이다.
  select min(plan_date) into v_conflict_date
  from public.workout_plans
  where user_id = v_user_id
    and plan_date = any(v_target_dates)
    and not (id = any(v_plan_ids));
  if v_conflict_date is not null then
    raise exception 'program_plan_date_taken:%', v_conflict_date;
  end if;

  -- 실제 UPDATE 전에 최종 주차·회차 순서를 검증한다.
  -- 0069: 예전에는 최소 48시간(2일)을 요구했다. 이제 같은 날 두 회차와
  --       날짜 역행만 막는다 — 연속 3일은 사용자가 고를 수 있다.
  select count(*) into v_bad_count
  from (
    select final_date,
      lag(final_date) over (order by program_week, program_session) as previous_date
    from (
      select wp.program_week, wp.program_session,
        coalesce(
          (
            select (move->>'plan_date')::date
            from jsonb_array_elements(p_moves) move
            where (move->>'plan_id')::uuid = wp.id
          ),
          wp.plan_date
        ) as final_date
      from public.workout_plans wp
      where wp.user_id = v_user_id
        and wp.program_enrollment_id = p_enrollment_id
    ) final_rows
  ) ordered_rows
  where previous_date is not null
    and final_date - previous_date < 1;  -- 0069
  if v_bad_count > 0 then
    raise exception 'program_plan_date_order';
  end if;

  -- 기존 enrollment 안에서 날짜를 서로 넘겨받는 연쇄 이동도 허용하려고 잠시
  -- 사용자에게 허용하지 않는 9999년 임시 날짜로 옮긴 뒤 최종 날짜를 쓴다.
  if exists (
    select 1 from public.workout_plans
    where user_id = v_user_id
      and plan_date between date '9999-01-01' and date '9999-01-18'
      and not (id = any(v_plan_ids))
  ) then
    raise exception 'program_temp_date_taken';
  end if;

  for v_move, v_move_index in
    select value, ordinality
    from jsonb_array_elements(p_moves) with ordinality
  loop
    v_temp_date := date '9999-01-01' + (v_move_index::int - 1);
    update public.workout_plans
    set plan_date = v_temp_date,
        scheduled_at = v_temp_date::timestamp at time zone v_enrollment.timezone
    where id = (v_move->>'plan_id')::uuid
      and user_id = v_user_id
      and program_enrollment_id = p_enrollment_id;
  end loop;

  for v_move in select value from jsonb_array_elements(p_moves)
  loop
    update public.workout_plans
    set plan_date = (v_move->>'plan_date')::date,
        scheduled_at = (v_move->>'scheduled_at')::timestamptz
    where id = (v_move->>'plan_id')::uuid
      and user_id = v_user_id
      and program_enrollment_id = p_enrollment_id;
    if not found then
      raise exception 'program_plan_not_found';
    end if;
  end loop;
end;
$function$;

-- ── search_profile_by_nickname ──
CREATE OR REPLACE FUNCTION public.search_profile_by_nickname(p_nickname text)
 RETURNS TABLE(id uuid, nickname text, avatar_url text, relation text, request_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id, p.nickname, p.avatar_url,
    case
      when p.id = (select auth.uid())         then 'self'
      when public.is_crew_with(p.id)          then 'crew'
      when r_out.id is not null               then 'request_sent'
      when r_in.id is not null                then 'request_received'
      else 'none'
    end,
    case
      when p.id = (select auth.uid())    then null::uuid
      when public.is_crew_with(p.id)     then null::uuid
      else coalesce(r_out.id, r_in.id)
    end
  from public.profiles p
  left join public.crew_requests r_out
    on r_out.requester_id = (select auth.uid())
   and r_out.addressee_id = p.id
   and r_out.status = 'pending'
  left join public.crew_requests r_in
    on r_in.requester_id = p.id
   and r_in.addressee_id = (select auth.uid())
   and r_in.status = 'pending'
  where (select auth.uid()) is not null
    and btrim(p_nickname) <> ''
    and lower(btrim(p.nickname)) = lower(btrim(p_nickname))
  order by p.created_at
  limit 1
$function$;

-- ── send_cheer ──
CREATE OR REPLACE FUNCTION public.send_cheer(p_session_id uuid, p_cheer_type text, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s workout_sessions;
  c cheers;
  v_count int;
  v_last timestamptz;
  v_nick text;
  v_wants boolean;
  v_points int := 0;                                 -- 0041
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions where id = p_session_id;

  -- 0039: 그룹 소속 → 크루 연결. group_id 조건도 함께 뺀다.
  --
  -- ⚠ 판정을 세 토막으로 나눈 이유. 옛 is_group_member(s.group_id, auth.uid())는
  --   세션 주인 본인에게 true라 본인 응원 시도가 이 관문을 통과해 아래
  --   own_session에 걸렸다. is_crew_with는 자기 자신에게 항상 false라, 한 덩어리로
  --   두면 본인 시도가 own_session이 아니라 session_not_found로 나가고 own_session
  --   블록이 도달 불가능한 죽은 코드가 된다.
  --   scripts/rls-test.mjs:403 "본인 세션 응원 금지 (own_session)"이 이걸 잡는다.
  if not found or s.visibility <> 'group' then
    raise exception 'session_not_found';
  end if;
  if s.user_id = auth.uid() then
    raise exception 'own_session';
  end if;
  if not public.is_crew_with(s.user_id) then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'active' then
    raise exception 'not_active';
  end if;

  select count(*), max(created_at) into v_count, v_last
  from cheers where session_id = p_session_id and sender_id = auth.uid();

  if v_count >= 3 then
    raise exception 'cheer_limit';
  end if;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'cheer_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message)
  values (p_session_id, auth.uid(), s.user_id, p_cheer_type, p_message)
  returning * into c;

  -- ⬇ 0041: 포인트 지급. 실패해도 응원을 취소하지 않는다.
  --
  -- 감싸는 이유: award_points가 예상 못 한 오류를 내면 전체 트랜잭션이
  -- 롤백되어 위의 cheers insert까지 사라진다. 설계 D5는 "포인트가 안 나가도
  -- 응원은 성공"이다.
  --
  -- 하루 1회 상한은 여기 코드가 아니라 원장의 유니크 인덱스가 만든다
  -- (0031:77 — user_id, reason, source_type, source_id). source_id를
  -- "받는사람:KST날짜"로 잡았으므로 그날 두 번째 호출은 유니크 충돌이 되고
  -- award_points가 그걸 잡아 0을 반환한다(0032:96). 즉 아래 exception 블록에
  -- 걸리는 것은 그 밖의 예외뿐이다.
  --
  -- ⚠ 격리 범위는 이 호출 하나뿐이다. 넓히면 위의 권한·상태 검사 실패까지
  --    삼켜서 비크루가 응원에 성공하게 된다.
  begin
    -- to_char로 날짜를 굳이 문자열화하는 이유: date::text는 DateStyle GUC를
    -- 거친다. 기본값(ISO, MDY)에서는 2026-07-29가 나오지만 세션의 DateStyle이
    -- SQL이나 German이면 07/29/2026처럼 다르게 나와, 같은 KST 하루인데
    -- source_id가 갈려 하루 상한이 조용히 2회로 늘어난다. to_char은 GUC와
    -- 무관하게 고정 포맷을 낸다 — 0032:116(evaluate_badges)의 v_today와 동일한
    -- 이유로 동일한 방식을 쓴다.
    v_points := public.award_points(
      auth.uid(), 10, 'cheer_sent',
      'cheer',
      s.user_id::text || ':' || to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'),
      null::numeric,
      jsonb_build_object('session_id', p_session_id, 'cheer_type', p_cheer_type));
  exception when others then
    v_points := 0;
    -- warning은 트랜잭션을 중단시키지 않으면서 Postgres 로그에 남는다.
    -- 조용히 삼키면 지급이 언제부터 멈췄는지 아무도 모른다.
    raise warning 'cheer_points_failed: sender=% receiver=% sqlstate=% msg=%',
      auth.uid(), s.user_id, sqlstate, sqlerrm;
  end;

  -- 수신자가 응원 알림을 꺼둔 경우: 응원 행은 남기고 알림만 생략
  select coalesce(ns.cheers, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = s.user_id;

  if v_wants then
    select nickname into v_nick from profiles where id = auth.uid();
    perform notify(
      s.user_id, auth.uid(), 'cheer_received', c.id,
      coalesce(v_nick, '크루원') || '님의 응원 📣',
      coalesce(p_message, p_cheer_type)
    );
  end if;

  -- 0041: 클라이언트가 지급 여부를 추측하지 않도록 실제 결과를 함께 돌려준다.
  return jsonb_build_object('cheer', to_jsonb(c), 'points_awarded', v_points);
end $function$;

-- ── send_crew_request ──
CREATE OR REPLACE FUNCTION public.send_crew_request(p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
  v_nick text;
  v_reverse crew_requests%rowtype;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_target_id = v_me then raise exception 'self_request'; end if;

  -- 0089: 차단 관문. 아래 어떤 검사보다 먼저다.
  if exists (select 1 from public.user_blocks
             where blocker_id = v_me and blocked_id = p_target_id) then
    raise exception 'blocked_by_me';
  end if;
  if exists (select 1 from public.user_blocks
             where blocker_id = p_target_id and blocked_id = v_me) then
    raise exception 'request_exists';  -- 일부러 숨긴다 (D7과 같은 결)
  end if;

  -- 쌍 단위 직렬화. 이게 없으면 (a) 서로 동시에 수락할 때 락 순서가 엇갈려
  -- 40P01 데드락, (b) 서로 동시에 요청할 때 역방향을 못 봐서 자동수락이 불발,
  -- (c) 빠른 두 번 탭이 request_exists 대신 23505를 그대로 뱉는다.
  perform pg_advisory_xact_lock(
    hashtext(least(v_me, p_target_id)::text || greatest(v_me, p_target_id)::text)
  );

  if not exists (select 1 from profiles where id = p_target_id) then
    raise exception 'target_not_found';
  end if;
  if public.is_crew_with(p_target_id) then raise exception 'already_crew'; end if;

  -- 거절당한 뒤 7일은 같은 사람에게 다시 못 보낸다. 거절은 조용히 처리되고(D7)
  -- 이 가드가 없으면 요청↔거절을 무한 반복하며 상대에게 알림을 계속 꽂을 수 있다.
  -- 콕 찌르기의 24h 쿨다운(0011)과 같은 결의 장치다.
  -- 에러 코드를 request_exists로 재사용하는 이유: 보내는 쪽에 "이미 요청을
  -- 보냈어요"로만 보여야 거절당했다는 사실이 드러나지 않는다(D7 유지).
  if exists (
    select 1 from crew_requests
    where requester_id = v_me
      and addressee_id = p_target_id
      and status = 'rejected'
      and responded_at > now() - interval '7 days'
  ) then
    raise exception 'request_exists';
  end if;

  -- 역방향 pending이 있으면 양쪽이 서로를 원한 것이다 → 즉시 맺는다.
  select * into v_reverse from crew_requests
  where requester_id = p_target_id and addressee_id = v_me
    and status = 'pending'
  limit 1;
  if found then
    perform public.accept_crew_request(v_reverse.id);
    return jsonb_build_object('status', 'accepted', 'requestId', v_reverse.id);
  end if;

  if exists (select 1 from crew_requests
             where requester_id = v_me and addressee_id = p_target_id
               and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into crew_requests (requester_id, addressee_id)
  values (v_me, p_target_id)
  returning id into v_id;

  select nickname into v_nick from profiles where id = v_me;
  perform notify(
    p_target_id, v_me, 'crew_request', v_id,
    coalesce(v_nick, '누군가') || '님이 크루 요청을 보냈어요 🤝',
    '수락하면 서로의 운동 소식을 받아볼 수 있어요'
  );
  return jsonb_build_object('status', 'pending', 'requestId', v_id);
end $function$;

-- ── session_crew_shared ──
CREATE OR REPLACE FUNCTION public.session_crew_shared(sid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and (s.user_id = (select auth.uid())    -- 0039: 자기접근 복원
           or public.is_crew_with(s.user_id)) -- 0039
  )
$function$;

-- ── set_recruit_opened_at ──
CREATE OR REPLACE FUNCTION public.set_recruit_opened_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- ⚠️ INSERT일 때 OLD는 없다. TG_OP로 명시적으로 가른다 — old.discoverable을
  --    그냥 읽으면 구현에 기대는 코드가 된다.
  if not coalesce(new.discoverable, false) then
    new.recruit_opened_at := null;           -- 닫혀 있으면 항상 비운다
                                             -- (다시 열면 새로 7일을 준다)
  elsif tg_op = 'INSERT' then
    new.recruit_opened_at := now();          -- 처음부터 공개로 만든 경우
  elsif coalesce(old.discoverable, false) is distinct from true then
    new.recruit_opened_at := now();          -- 닫힘 → 열림
  end if;                                    -- 열림 → 열림은 그대로 둔다
  return new;
end $function$;

-- ── set_updated_at ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$;

-- ── set_workout_set_completed_at ──
CREATE OR REPLACE FUNCTION public.set_workout_set_completed_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not new.is_completed then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or not old.is_completed then
    new.completed_at := now();
  else
    new.completed_at := old.completed_at;
  end if;
  return new;
end $function$;

-- ── set_workout_verification ──
CREATE OR REPLACE FUNCTION public.set_workout_verification(p_session_id uuid, p_source text, p_client_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS workout_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

-- ── shares_any_challenge_with ──
CREATE OR REPLACE FUNCTION public.shares_any_challenge_with(p_other uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ── shares_challenge_with ──
CREATE OR REPLACE FUNCTION public.shares_challenge_with(p_challenge_id uuid, p_other uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.challenge_participants mine
    join public.challenge_participants theirs
      on theirs.challenge_id = mine.challenge_id
    join public.challenges c
      on c.id = mine.challenge_id
    where mine.challenge_id = p_challenge_id
      and mine.user_id = (select auth.uid())
      and theirs.user_id = p_other
      and mine.status in ('joined', 'dropped')
      and theirs.status in ('joined', 'dropped')
      and c.status <> 'cancelled'
  )
$function$;

-- ── shares_group_with ──
CREATE OR REPLACE FUNCTION public.shares_group_with(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from group_members mine
    join group_members theirs on mine.group_id = theirs.group_id
    where mine.user_id = auth.uid() and theirs.user_id = uid
  )
$function$;

-- ── start_challenge ──
CREATE OR REPLACE FUNCTION public.start_challenge(p_challenge_id uuid)
 RETURNS challenges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r      record;
  v_nick text; c challenges; total int; missing int; approvals int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id for update;
  -- 0045: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  if c.status <> 'setup' then raise exception 'invalid_status:%', c.status; end if;

  -- 0045: group_members → challenge_participants (joined만)
  select count(*) into total from challenge_participants cp
  where cp.challenge_id = p_challenge_id and cp.status = 'joined';

  -- 참가자가 0명인 상태로 시작되면 랭킹도 집계도 빈 껍데기가 된다.
  -- create_challenge_room이 방장을 host·joined로 넣으므로 정상 경로에선 1 이상이다.
  if total = 0 then raise exception 'no_participants'; end if;

  select count(*) into missing from challenge_participants cp
  where cp.challenge_id = p_challenge_id
    and cp.status = 'joined'
    and not exists (select 1 from user_goals ug
                    where ug.challenge_id = p_challenge_id and ug.user_id = cp.user_id);
  if missing > 0 then raise exception 'kpi_incomplete:%/%', total - missing, total; end if;

  -- 전원 동의 게이트 (0025). 대상만 참가자로 바뀐다.
  select count(*) into approvals from challenge_goal_approvals a
  where a.challenge_id = p_challenge_id
    and exists (select 1 from challenge_participants cp
                where cp.challenge_id = p_challenge_id
                  and cp.user_id = a.approver_id
                  and cp.status = 'joined');
  if approvals < total then raise exception 'consent_incomplete:%/%', approvals, total; end if;

  update challenges set status = 'active' where id = p_challenge_id returning * into c;

  -- ── 0088: 시작 알림 ────────────────────────────────────────
  --
  -- 여기가 비어 있었다. `autostart_due_challenges`(예정일 도래)에만 알림이 붙어
  -- 있어서, **방장이 `지금 바로 시작하기`로 직접 시작하면 아무도 몰랐다.**
  -- 공개 모집으로 모르는 사람이 들어오면서 이게 진짜 문제가 된다 — 밖에서 말로
  -- 전할 사이가 아니다.
  --
  -- ⚠️ 중복 알림은 안 난다. `autostart_due_challenges`는 `setup`인 방만 올리는데,
  --    여기까지 왔으면 이미 `active`라 그 cron이 이 방을 건드리지 않는다.
  select nickname into v_nick from profiles where id = auth.uid();

  for r in
    select cp.user_id
    from challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.status = 'joined'
  loop
    continue when r.user_id = auth.uid();   -- 시작한 본인에게는 안 보낸다
    perform notify(
      r.user_id,
      auth.uid(),
      'challenge_started',
      p_challenge_id,                        -- ⚠ 챌린지 id다. 딥링크가 이걸 쓴다
      '🚀 ' || c.name || ' 시작!',
      coalesce(v_nick, '방장') || '님이 챌린지를 시작했어요'
    );
  end loop;

  return c;
end $function$;

-- ── start_workout ──
CREATE OR REPLACE FUNCTION public.start_workout(p_session_id uuid)
 RETURNS workout_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s workout_sessions;
  v_nick text;
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

  insert into workout_events (session_id, user_id, event_type)
  values (s.id, s.user_id, 'workout_started');

  -- 0039: 크루 연결 기준. group_id 조건을 뺀 이유 — 혼자모드 유저는 group_id가
  -- null이라 지금까지 시작 알림이 한 건도 나가지 않았다. "혼자 시작 → 나중에
  -- 크루 추가" 흐름을 실제로 성립시키는 부분이다.
  if s.visibility = 'group' then
    select nickname into v_nick from profiles where id = s.user_id;
    insert into notifications (user_id, actor_id, type, reference_id, title, body)
    select case when l.user_a = s.user_id then l.user_b else l.user_a end,
           s.user_id, 'workout_started', s.id,
           coalesce(v_nick, '크루원') || '님이 운동을 시작했어요 💪',
           '응원을 보내볼까요?'
    from crew_links l
    where s.user_id in (l.user_a, l.user_b);
  end if;

  return s;
end $function$;

-- ── submit_bug_report ──
CREATE OR REPLACE FUNCTION public.submit_bug_report(p_message text, p_route text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb, p_trail jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_msg      text;
  v_existing uuid;
  v_recent   int;
  v_context  jsonb;
  v_trail    jsonb;
  v_id       uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  v_msg := btrim(coalesce(p_message, ''));
  if char_length(v_msg) < 2    then raise exception 'message_too_short'; end if;
  if char_length(v_msg) > 1000 then raise exception 'message_too_long';  end if;

  -- 중복 흡수 — 2분 내 같은 사람·같은 문장이면 **기존 신고 id를 그대로 돌려준다.**
  -- 버튼 연타나 네트워크 재시도가 신고를 늘리면 안 되고, 사용자에게 에러를 보여줄
  -- 일도 아니다(그 사람 입장에선 접수된 게 맞다).
  select id into v_existing
  from bug_reports
  where user_id = v_me
    and message = v_msg
    and created_at > now() - interval '2 minutes'
  order by created_at desc
  limit 1;
  if found then return v_existing; end if;

  -- 레이트 리밋 — 스팸보다 오작동(무한 재시도 루프) 방어가 목적이다.
  select count(*) into v_recent
  from bug_reports
  where user_id = v_me and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then raise exception 'rate_limited'; end if;

  -- context: 객체가 아니면 버린다. 8KB 넘으면 거부한다.
  v_context := coalesce(p_context, '{}'::jsonb);
  if jsonb_typeof(v_context) <> 'object' then v_context := '{}'::jsonb; end if;
  if pg_column_size(v_context) > 8192 then raise exception 'context_too_large'; end if;

  -- trail: 배열이 아니면 버린다. **앞에서부터 30개**만 남긴다(클라이언트가 최신순으로
  -- 보낸다 — bug-trail.ts의 readTrail()이 그 순서를 보장한다).
  v_trail := coalesce(p_trail, '[]'::jsonb);
  if jsonb_typeof(v_trail) <> 'array' then v_trail := '[]'::jsonb; end if;
  if jsonb_array_length(v_trail) > 30 then
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_trail
    from jsonb_array_elements(v_trail) with ordinality as t(e, ord)
    where ord <= 30;
  end if;
  if pg_column_size(v_trail) > 32768 then raise exception 'trail_too_large'; end if;

  insert into bug_reports (user_id, message, route, context, trail)
  values (
    v_me,
    v_msg,
    nullif(btrim(coalesce(p_route, '')), ''),
    v_context,
    v_trail
  )
  returning id into v_id;

  return v_id;
end $function$;

-- ── unapprove_challenge_goals ──
CREATE OR REPLACE FUNCTION public.unapprove_challenge_goals(p_challenge_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c challenges;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into c from challenges where id = p_challenge_id;
  -- 0046: is_group_member → is_challenge_participant
  if not found or not public.is_challenge_participant(p_challenge_id, auth.uid()) then
    raise exception 'challenge_not_found';
  end if;
  delete from challenge_goal_approvals
  where challenge_id = p_challenge_id and approver_id = auth.uid();
end $function$;

-- ── unblock_user ──
CREATE OR REPLACE FUNCTION public.unblock_user(p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  delete from public.user_blocks
  where blocker_id = v_me and blocked_id = p_target_id;
  -- 크루 링크는 지운 적이 없으므로, 해제하면 관계가 그대로 돌아온다.
  return jsonb_build_object('status', 'unblocked');
end $function$;

-- ── view_record ──
CREATE OR REPLACE FUNCTION public.view_record(p_target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fifth_at timestamptz;
  v_nick text;
  v_wants boolean;
  v_challenge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_id = auth.uid() then
    raise exception 'self_view';
  end if;
  if not public.is_crew_with(p_target_id) then  -- 0039: 그룹 → 크루 연결
    raise exception 'not_crew';
  end if;

  -- 이번 주(KST 월요일 00:00~) 내 완료 세션을 KST 날짜로 접어,
  -- 5번째 고유 날짜를 만든 첫 완료 시각 = 열람권 풀린 시각
  select day_first into v_fifth_at from (
    select min(completed_at) as day_first,
           row_number() over (order by min(completed_at)) as rn
    from workout_sessions
    where user_id = auth.uid()
      and status = 'completed' and deleted_at is null
      and completed_at >=
        date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    group by (completed_at at time zone 'Asia/Seoul')::date
  ) d where rn = 5;

  if v_fifth_at is null then
    raise exception 'not_eligible';
  end if;
  if now() >= v_fifth_at + interval '24 hours' then
    raise exception 'pass_expired';
  end if;
  if exists (
    select 1 from record_views
    where viewer_id = auth.uid() and viewed_at >= v_fifth_at
  ) then
    raise exception 'pass_used';
  end if;

  -- 둘이 함께 속한 크루의 진행 중 챌린지 (없으면 null)
  -- 챌린지는 아직 그룹 기반이므로 이 조회는 group_members 그대로 둔다.
  select c.id into v_challenge_id
  from challenges c
  where c.status = 'active'
    and exists (select 1 from group_members gm
                where gm.group_id = c.group_id and gm.user_id = auth.uid())
    and exists (select 1 from group_members gm
                where gm.group_id = c.group_id and gm.user_id = p_target_id)
  limit 1;

  insert into record_views (viewer_id, target_id, challenge_id)
  values (auth.uid(), p_target_id, v_challenge_id);

  -- 행 없음 = 알림 on (0011 notification_settings 관례)
  select coalesce(ns.record_views, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = p_target_id;

  if v_wants then
    select nickname into v_nick from profiles where id = auth.uid();
    perform notify(
      p_target_id, auth.uid(), 'record_viewed', null,
      coalesce(v_nick, '크루원') || '님이 회원님의 기록을 확인했어요 👀',
      null
    );
  end if;
end $function$;

-- ── workout_exercise_crew_visible ──
CREATE OR REPLACE FUNCTION public.workout_exercise_crew_visible(eid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from workout_exercises e
    where e.id = eid and public.workout_session_crew_visible(e.session_id)
  )
$function$;

-- ── workout_session_crew_visible ──
CREATE OR REPLACE FUNCTION public.workout_session_crew_visible(sid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and s.status = 'completed'
      and s.deleted_at is null
      and (s.user_id = (select auth.uid())    -- 0039: 0004가 갖고 있던 자기접근 복원
           or public.is_crew_with(s.user_id)) -- 0039
  )
$function$;

-- ════════════════════════════════════════════════════════════
-- RLS 정책
-- ════════════════════════════════════════════════════════════

-- ── badge_definitions ──
-- badge_definitions_read  [SELECT]  roles=authenticated
--   using  : true
-- ── bug_reports ──
-- bug_reports_select_own  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── challenge_goal_approvals ──
-- approvals_select_crew  [SELECT]  roles=public
--   using  : (is_challenge_participant(challenge_id, auth.uid()) OR (EXISTS ( SELECT 1
   FROM challenges c
  WHERE ((c.id = challenge_goal_approvals.challenge_id) AND is_group_member(c.group_id, auth.uid())))))
-- ── challenge_participants ──
-- challenge_participants_select_member  [SELECT]  roles=authenticated
--   using  : is_challenge_participant(challenge_id, auth.uid())
-- ── challenge_peek_picks ──
-- challenge_peek_picks_own_select  [SELECT]  roles=authenticated
--   using  : (viewer_id = auth.uid())
-- ── challenges ──
-- challenges_delete_creator_setup  [DELETE]  roles=public
--   using  : ((created_by = auth.uid()) AND (status = 'setup'::text))
-- challenges_insert_member  [INSERT]  roles=public
--   check  : ((created_by = auth.uid()) AND is_group_member(group_id, auth.uid()) AND (status = 'setup'::text) AND (photo_required = true))
-- challenges_select_member  [SELECT]  roles=public
--   using  : (is_challenge_participant(id, auth.uid()) OR is_group_member(group_id, auth.uid()))
-- challenges_update_creator  [UPDATE]  roles=public
--   using  : (created_by = auth.uid())
--   check  : (created_by = auth.uid())
-- ── cheers ──
-- cheers_delete_own  [DELETE]  roles=authenticated
--   using  : (sender_id = auth.uid())
-- cheers_select_related  [SELECT]  roles=authenticated
--   using  : ((sender_id = auth.uid()) OR (receiver_id = auth.uid()) OR session_crew_shared(session_id))
-- ── crew_links ──
-- crew_links_mine_select  [SELECT]  roles=authenticated
--   using  : ((user_a = auth.uid()) OR (user_b = auth.uid()))
-- ── crew_requests ──
-- crew_requests_mine_select  [SELECT]  roles=authenticated
--   using  : ((requester_id = auth.uid()) OR (addressee_id = auth.uid()))
-- ── exercise_catalog ──
-- catalog_delete_own_custom  [DELETE]  roles=public
--   using  : (created_by = auth.uid())
-- catalog_insert_own_custom  [INSERT]  roles=public
--   check  : (is_custom AND (created_by = auth.uid()))
-- catalog_select_seed_or_own  [SELECT]  roles=public
--   using  : ((created_by IS NULL) OR (created_by = auth.uid()))
-- ── group_members ──
-- group_members_delete_self_or_owner  [DELETE]  roles=public
--   using  : ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.owner_id = auth.uid())))))
-- group_members_insert_owner_self  [INSERT]  roles=public
--   check  : ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.owner_id = auth.uid())))))
-- group_members_select_member  [SELECT]  roles=public
--   using  : is_group_member(group_id, auth.uid())
-- ── groups ──
-- groups_delete_owner  [DELETE]  roles=public
--   using  : (owner_id = auth.uid())
-- groups_insert_owner  [INSERT]  roles=public
--   check  : (owner_id = auth.uid())
-- groups_select_member_or_owner  [SELECT]  roles=public
--   using  : ((owner_id = auth.uid()) OR is_group_member(id, auth.uid()))
-- groups_update_owner  [UPDATE]  roles=public
--   using  : (owner_id = auth.uid())
--   check  : (owner_id = auth.uid())
-- ── level_definitions ──
-- level_definitions_read  [SELECT]  roles=authenticated
--   using  : true
-- ── notification_settings ──
-- notif_settings_own  [ALL]  roles=authenticated
--   using  : (user_id = auth.uid())
--   check  : (user_id = auth.uid())
-- ── notifications ──
-- notifications_select_own  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- notifications_update_own  [UPDATE]  roles=authenticated
--   using  : (user_id = auth.uid())
--   check  : (user_id = auth.uid())
-- ── point_transactions ──
-- point_transactions_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── profile_views ──
-- profile_views_insert_own  [INSERT]  roles=authenticated
--   check  : (viewer_id = auth.uid())
-- profile_views_select_own  [SELECT]  roles=authenticated
--   using  : (viewer_id = auth.uid())
-- ── profiles ──
-- profiles_insert_own  [INSERT]  roles=public
--   check  : (id = auth.uid())
-- profiles_select_own_or_crew  [SELECT]  roles=public
--   using  : ((id = auth.uid()) OR is_crew_with(id) OR shares_group_with(id))
-- profiles_update_own  [UPDATE]  roles=public
--   using  : (id = auth.uid())
--   check  : (id = auth.uid())
-- ── program_enrollments ──
-- program_enrollments_delete_own  [DELETE]  roles=public
--   using  : (user_id = auth.uid())
-- program_enrollments_insert_own  [INSERT]  roles=public
--   check  : (user_id = auth.uid())
-- program_enrollments_select_own  [SELECT]  roles=public
--   using  : (user_id = auth.uid())
-- program_enrollments_update_own  [UPDATE]  roles=public
--   using  : (user_id = auth.uid())
--   check  : (user_id = auth.uid())
-- ── push_subscriptions ──
-- push_subscriptions_own  [ALL]  roles=authenticated
--   using  : (user_id = auth.uid())
--   check  : (user_id = auth.uid())
-- ── reactions ──
-- reactions_delete_own  [DELETE]  roles=authenticated
--   using  : (user_id = auth.uid())
-- reactions_insert_crew  [INSERT]  roles=authenticated
--   check  : ((user_id = auth.uid()) AND workout_session_crew_visible(session_id))
-- reactions_select_visible  [SELECT]  roles=authenticated
--   using  : ((user_id = auth.uid()) OR workout_session_crew_visible(session_id))
-- ── record_views ──
-- record_views_select_related  [SELECT]  roles=authenticated
--   using  : ((viewer_id = auth.uid()) OR (target_id = auth.uid()))
-- ── streak_shield_transactions ──
-- streak_shield_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── user_badges ──
-- user_badges_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── user_blocks ──
-- user_blocks_select_own  [SELECT]  roles=authenticated
--   using  : (blocker_id = ( SELECT auth.uid() AS uid))
-- ── user_goals ──
-- goals_delete_own_setup  [DELETE]  roles=public
--   using  : ((user_id = auth.uid()) AND challenge_in_setup(challenge_id))
-- goals_insert_own_setup  [INSERT]  roles=public
--   check  : ((user_id = auth.uid()) AND challenge_in_setup(challenge_id) AND (EXISTS ( SELECT 1
   FROM challenges c
  WHERE ((c.id = user_goals.challenge_id) AND (c.group_id = user_goals.group_id)))) AND (is_challenge_participant(challenge_id, auth.uid()) OR is_group_member(group_id, auth.uid())))
-- goals_select_member  [SELECT]  roles=public
--   using  : (is_challenge_participant(challenge_id, auth.uid()) OR is_group_member(group_id, auth.uid()))
-- goals_update_own_setup  [UPDATE]  roles=public
--   using  : ((user_id = ( SELECT auth.uid() AS uid)) AND (challenge_in_setup(challenge_id) OR challenge_is_active(challenge_id)))
--   check  : ((user_id = ( SELECT auth.uid() AS uid)) AND (challenge_in_setup(challenge_id) OR challenge_is_active(challenge_id)))
-- ── user_progress ──
-- user_progress_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── user_reports ──
-- user_reports_select_own  [SELECT]  roles=authenticated
--   using  : (reporter_id = ( SELECT auth.uid() AS uid))
-- ── user_unlocks ──
-- user_unlocks_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── user_wallet ──
-- user_wallet_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())
-- ── workout_events ──
-- events_select_own_or_crew  [SELECT]  roles=authenticated
--   using  : ((user_id = auth.uid()) OR session_crew_shared(session_id))
-- ── workout_exercises ──
-- exercises_delete_own  [DELETE]  roles=public
--   using  : owns_workout_session(session_id)
-- exercises_insert_own  [INSERT]  roles=public
--   check  : owns_workout_session(session_id)
-- exercises_select_own_or_crew  [SELECT]  roles=public
--   using  : (owns_workout_session(session_id) OR workout_session_crew_visible(session_id))
-- exercises_update_own  [UPDATE]  roles=public
--   using  : owns_workout_session(session_id)
--   check  : owns_workout_session(session_id)
-- ── workout_images ──
-- images_delete_own  [DELETE]  roles=public
--   using  : (user_id = auth.uid())
-- images_insert_own  [INSERT]  roles=public
--   check  : ((user_id = auth.uid()) AND owns_workout_session(session_id) AND ((storage.foldername(image_path))[1] = (auth.uid())::text) AND ((storage.foldername(image_path))[2] = (session_id)::text) AND (EXISTS ( SELECT 1
   FROM storage.objects stored
  WHERE ((stored.bucket_id = 'workout-images'::text) AND (stored.name = workout_images.image_path)))))
-- images_select_own_or_crew  [SELECT]  roles=public
--   using  : ((user_id = auth.uid()) OR workout_session_crew_visible(session_id))
-- ── workout_plans ──
-- workout_plans_delete_own  [DELETE]  roles=public
--   using  : (user_id = auth.uid())
-- workout_plans_insert_own  [INSERT]  roles=public
--   check  : ((user_id = auth.uid()) AND (program_enrollment_id IS NULL) AND (program_week IS NULL) AND (program_session IS NULL) AND (program_template_version IS NULL) AND ((source_session_id IS NULL) OR owns_workout_session(source_session_id)) AND (plan_date >= ((now() AT TIME ZONE COALESCE(( SELECT profiles.timezone
   FROM profiles
  WHERE (profiles.id = auth.uid())), 'Asia/Seoul'::text)))::date))
-- workout_plans_select_own  [SELECT]  roles=public
--   using  : (user_id = auth.uid())
-- workout_plans_update_own  [UPDATE]  roles=public
--   using  : ((user_id = auth.uid()) AND (program_enrollment_id IS NULL))
--   check  : ((user_id = auth.uid()) AND (program_enrollment_id IS NULL) AND (program_week IS NULL) AND (program_session IS NULL) AND (program_template_version IS NULL) AND ((source_session_id IS NULL) OR owns_workout_session(source_session_id)) AND (plan_date >= ((now() AT TIME ZONE COALESCE(( SELECT profiles.timezone
   FROM profiles
  WHERE (profiles.id = auth.uid())), 'Asia/Seoul'::text)))::date))
-- ── workout_routines ──
-- workout_routines_delete_own  [DELETE]  roles=public
--   using  : (user_id = auth.uid())
-- workout_routines_insert_own  [INSERT]  roles=public
--   check  : (user_id = auth.uid())
-- workout_routines_select_own  [SELECT]  roles=public
--   using  : (user_id = auth.uid())
-- workout_routines_update_own  [UPDATE]  roles=public
--   using  : (user_id = auth.uid())
--   check  : (user_id = auth.uid())
-- ── workout_sessions ──
-- sessions_delete_own  [DELETE]  roles=public
--   using  : (user_id = auth.uid())
-- sessions_insert_own_draft  [INSERT]  roles=public
--   check  : ((user_id = auth.uid()) AND (status = 'draft'::text) AND (started_at IS NULL) AND (completed_at IS NULL) AND ((group_id IS NULL) OR is_group_member(group_id, auth.uid())) AND ((program_enrollment_id IS NULL) OR owns_program_enrollment(program_enrollment_id)))
-- sessions_select_own_or_crew  [SELECT]  roles=public
--   using  : ((user_id = auth.uid()) OR ((visibility = 'group'::text) AND (status = 'completed'::text) AND (deleted_at IS NULL) AND is_crew_with(user_id)))
-- sessions_update_own  [UPDATE]  roles=public
--   using  : (user_id = auth.uid())
--   check  : (user_id = auth.uid())
-- ── workout_sets ──
-- sets_delete_own  [DELETE]  roles=public
--   using  : owns_workout_exercise(workout_exercise_id)
-- sets_insert_own  [INSERT]  roles=public
--   check  : owns_workout_exercise(workout_exercise_id)
-- sets_select_own_or_crew  [SELECT]  roles=public
--   using  : (owns_workout_exercise(workout_exercise_id) OR workout_exercise_crew_visible(workout_exercise_id))
-- sets_update_own  [UPDATE]  roles=public
--   using  : owns_workout_exercise(workout_exercise_id)
--   check  : owns_workout_exercise(workout_exercise_id)
-- ── xp_transactions ──
-- xp_transactions_own_select  [SELECT]  roles=authenticated
--   using  : (user_id = auth.uid())

-- ════════════════════════════════════════════════════════════
-- 인덱스
-- ════════════════════════════════════════════════════════════

-- CREATE UNIQUE INDEX badge_definitions_pkey ON public.badge_definitions USING btree (badge_key);
-- CREATE UNIQUE INDEX bug_report_watchers_pkey ON public.bug_report_watchers USING btree (user_id);
-- CREATE UNIQUE INDEX bug_reports_pkey ON public.bug_reports USING btree (id);
-- CREATE INDEX bug_reports_status_time_idx ON public.bug_reports USING btree (status, created_at DESC);
-- CREATE INDEX bug_reports_user_time_idx ON public.bug_reports USING btree (user_id, created_at DESC);
-- CREATE UNIQUE INDEX challenge_goal_approvals_pkey ON public.challenge_goal_approvals USING btree (challenge_id, approver_id);
-- CREATE UNIQUE INDEX challenge_participants_one_host ON public.challenge_participants USING btree (challenge_id) WHERE (role = 'host'::text);
-- CREATE UNIQUE INDEX challenge_participants_pkey ON public.challenge_participants USING btree (challenge_id, user_id);
-- CREATE INDEX challenge_participants_user_idx ON public.challenge_participants USING btree (user_id, status);
-- CREATE UNIQUE INDEX challenge_peek_picks_pkey ON public.challenge_peek_picks USING btree (viewer_id, challenge_id, pick_date);
-- CREATE INDEX challenges_discoverable_idx ON public.challenges USING btree (start_date, created_at DESC) WHERE (discoverable AND (status = 'setup'::text));
-- CREATE UNIQUE INDEX challenges_invite_code_key ON public.challenges USING btree (invite_code) WHERE (invite_code IS NOT NULL);
-- CREATE UNIQUE INDEX challenges_one_open_recruit_per_host ON public.challenges USING btree (created_by) WHERE (discoverable AND (status = 'setup'::text));
-- CREATE UNIQUE INDEX challenges_pkey ON public.challenges USING btree (id);
-- CREATE INDEX cheers_parent_idx ON public.cheers USING btree (parent_id) WHERE (parent_id IS NOT NULL);
-- CREATE UNIQUE INDEX cheers_pkey ON public.cheers USING btree (id);
-- CREATE INDEX cheers_session_created_idx ON public.cheers USING btree (session_id, created_at);
-- CREATE INDEX cheers_session_sender_idx ON public.cheers USING btree (session_id, sender_id, created_at DESC);
-- CREATE INDEX crew_links_initiated_by_idx ON public.crew_links USING btree (initiated_by);
-- CREATE INDEX crew_links_origin_idx ON public.crew_links USING btree (origin);
-- CREATE UNIQUE INDEX crew_links_pkey ON public.crew_links USING btree (user_a, user_b);
-- CREATE INDEX crew_links_user_b_idx ON public.crew_links USING btree (user_b);
-- CREATE INDEX crew_requests_inbox_idx ON public.crew_requests USING btree (addressee_id, status);
-- CREATE INDEX crew_requests_outbox_idx ON public.crew_requests USING btree (requester_id, status);
-- CREATE UNIQUE INDEX crew_requests_pending_unique ON public.crew_requests USING btree (requester_id, addressee_id) WHERE (status = 'pending'::text);
-- CREATE UNIQUE INDEX crew_requests_pkey ON public.crew_requests USING btree (id);
-- CREATE UNIQUE INDEX exercise_catalog_custom_name ON public.exercise_catalog USING btree (created_by, name) WHERE (created_by IS NOT NULL);
-- CREATE UNIQUE INDEX exercise_catalog_pkey ON public.exercise_catalog USING btree (id);
-- CREATE UNIQUE INDEX exercise_catalog_seed_name ON public.exercise_catalog USING btree (name) WHERE (created_by IS NULL);
-- CREATE UNIQUE INDEX group_members_group_id_user_id_key ON public.group_members USING btree (group_id, user_id);
-- CREATE UNIQUE INDEX group_members_pkey ON public.group_members USING btree (id);
-- CREATE UNIQUE INDEX groups_invite_code_key ON public.groups USING btree (invite_code);
-- CREATE UNIQUE INDEX groups_pkey ON public.groups USING btree (id);
-- CREATE UNIQUE INDEX level_definitions_pkey ON public.level_definitions USING btree (level);
-- CREATE UNIQUE INDEX level_definitions_required_xp_unique ON public.level_definitions USING btree (required_total_xp);
-- CREATE UNIQUE INDEX notification_settings_pkey ON public.notification_settings USING btree (user_id);
-- CREATE UNIQUE INDEX notifications_dedupe_key_uidx ON public.notifications USING btree (dedupe_key);
-- CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);
-- CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
-- CREATE INDEX notifications_user_time_idx ON public.notifications USING btree (user_id, created_at DESC);
-- CREATE UNIQUE INDEX point_transactions_pkey ON public.point_transactions USING btree (id);
-- CREATE UNIQUE INDEX point_transactions_source_unique ON public.point_transactions USING btree (user_id, reason, source_type, source_id) WHERE (transaction_type = 'earn'::text);
-- CREATE INDEX point_transactions_user_recent ON public.point_transactions USING btree (user_id, created_at DESC);
-- CREATE UNIQUE INDEX profile_views_pkey ON public.profile_views USING btree (id);
-- CREATE INDEX profile_views_target_time_idx ON public.profile_views USING btree (target_id, created_at DESC);
-- CREATE INDEX profile_views_time_idx ON public.profile_views USING btree (created_at DESC);
-- CREATE UNIQUE INDEX profiles_invite_code_unique ON public.profiles USING btree (invite_code) WHERE (invite_code IS NOT NULL);
-- CREATE INDEX profiles_invited_by_idx ON public.profiles USING btree (invited_by);
-- CREATE UNIQUE INDEX profiles_nickname_unique ON public.profiles USING btree (lower(TRIM(BOTH FROM nickname)));
-- CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
-- CREATE UNIQUE INDEX program_enrollments_one_active_version ON public.program_enrollments USING btree (user_id, program_key, program_version) WHERE (status = 'active'::text);
-- CREATE UNIQUE INDEX program_enrollments_pkey ON public.program_enrollments USING btree (id);
-- CREATE INDEX program_enrollments_user_recent ON public.program_enrollments USING btree (user_id, created_at DESC);
-- CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint);
-- CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id);
-- CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);
-- CREATE UNIQUE INDEX reactions_pkey ON public.reactions USING btree (id);
-- CREATE UNIQUE INDEX reactions_session_id_user_id_reaction_type_key ON public.reactions USING btree (session_id, user_id, reaction_type);
-- CREATE INDEX reactions_session_idx ON public.reactions USING btree (session_id);
-- CREATE UNIQUE INDEX record_views_pkey ON public.record_views USING btree (id);
-- CREATE UNIQUE INDEX streak_shield_source_unique ON public.streak_shield_transactions USING btree (user_id, reason, source_type, source_id);
-- CREATE UNIQUE INDEX streak_shield_transactions_pkey ON public.streak_shield_transactions USING btree (id);
-- CREATE UNIQUE INDEX user_badges_pkey ON public.user_badges USING btree (user_id, badge_key, period_key);
-- CREATE INDEX user_blocks_blocked_idx ON public.user_blocks USING btree (blocked_id);
-- CREATE UNIQUE INDEX user_blocks_pkey ON public.user_blocks USING btree (blocker_id, blocked_id);
-- CREATE UNIQUE INDEX user_goals_pkey ON public.user_goals USING btree (id);
-- CREATE UNIQUE INDEX user_goals_user_id_challenge_id_goal_type_key ON public.user_goals USING btree (user_id, challenge_id, goal_type);
-- CREATE UNIQUE INDEX user_progress_pkey ON public.user_progress USING btree (user_id);
-- CREATE UNIQUE INDEX user_reports_one_open_per_pair ON public.user_reports USING btree (reporter_id, target_id) WHERE (status = 'open'::text);
-- CREATE INDEX user_reports_open_idx ON public.user_reports USING btree (created_at DESC) WHERE (status = 'open'::text);
-- CREATE UNIQUE INDEX user_reports_pkey ON public.user_reports USING btree (id);
-- CREATE UNIQUE INDEX user_unlocks_pkey ON public.user_unlocks USING btree (user_id, unlock_key);
-- CREATE UNIQUE INDEX user_wallet_pkey ON public.user_wallet USING btree (user_id);
-- CREATE UNIQUE INDEX workout_events_pkey ON public.workout_events USING btree (id);
-- CREATE INDEX workout_events_session_idx ON public.workout_events USING btree (session_id);
-- CREATE INDEX workout_events_user_time_idx ON public.workout_events USING btree (user_id, created_at DESC);
-- CREATE UNIQUE INDEX workout_exercises_pkey ON public.workout_exercises USING btree (id);
-- CREATE INDEX workout_exercises_session ON public.workout_exercises USING btree (session_id, sort_order);
-- CREATE UNIQUE INDEX workout_images_pkey ON public.workout_images USING btree (id);
-- CREATE UNIQUE INDEX workout_images_session_id_key ON public.workout_images USING btree (session_id);
-- CREATE UNIQUE INDEX workout_plans_pkey ON public.workout_plans USING btree (id);
-- CREATE UNIQUE INDEX workout_plans_program_slot ON public.workout_plans USING btree (program_enrollment_id, program_week, program_session) WHERE (program_enrollment_id IS NOT NULL);
-- CREATE INDEX workout_plans_user_date ON public.workout_plans USING btree (user_id, plan_date);
-- CREATE UNIQUE INDEX workout_plans_user_id_plan_date_key ON public.workout_plans USING btree (user_id, plan_date);
-- CREATE UNIQUE INDEX workout_routines_pkey ON public.workout_routines USING btree (id);
-- CREATE UNIQUE INDEX workout_routines_user_name ON public.workout_routines USING btree (user_id, name);
-- CREATE INDEX workout_routines_user_updated ON public.workout_routines USING btree (user_id, updated_at DESC);
-- CREATE UNIQUE INDEX workout_sessions_one_active ON public.workout_sessions USING btree (user_id) WHERE (status = 'active'::text);
-- CREATE UNIQUE INDEX workout_sessions_pkey ON public.workout_sessions USING btree (id);
-- CREATE INDEX workout_sessions_program_progress ON public.workout_sessions USING btree (program_enrollment_id, program_week, program_session) WHERE (program_enrollment_id IS NOT NULL);
-- CREATE INDEX workout_sessions_user_completed ON public.workout_sessions USING btree (user_id, completed_at DESC) WHERE (status = 'completed'::text);
-- CREATE UNIQUE INDEX workout_sets_pkey ON public.workout_sets USING btree (id);
-- CREATE UNIQUE INDEX workout_sets_workout_exercise_id_set_number_key ON public.workout_sets USING btree (workout_exercise_id, set_number);
-- CREATE UNIQUE INDEX xp_daily_workout_reward_unique ON public.xp_transactions USING btree (user_id, effective_date, reward_group) WHERE ((transaction_type = 'earn'::text) AND (reward_group = 'daily_workout'::text));
-- CREATE UNIQUE INDEX xp_transactions_pkey ON public.xp_transactions USING btree (id);
-- CREATE UNIQUE INDEX xp_transactions_source_unique ON public.xp_transactions USING btree (user_id, reason, source_type, source_id) WHERE (transaction_type = 'earn'::text);
-- CREATE INDEX xp_transactions_user_recent ON public.xp_transactions USING btree (user_id, created_at DESC);
