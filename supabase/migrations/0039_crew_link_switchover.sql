-- 0039: 크루 연결로 전환 — 관계 판정 · 알림 팬아웃 · 세션/이벤트 RLS
-- 설계: docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
-- 계획: docs/superpowers/plans/2026-07-28-crew-link-graph.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0038은 수정 금지.
--
-- 이 파일부터 "크루"의 뜻이 바뀐다: 같은 그룹 → 서로 수락한 사이.
-- 0038이 is_crew_with와 데이터(기존 3쌍)를 이미 만들어 뒀으므로 여기서는 판정만 갈아끼운다.
--
-- 함수 본문은 SQL Editor의 pg_get_functiondef로 뽑은 현행 정의를 그대로 옮긴 것이며
-- (DB와 마이그레이션 파일이 일치함을 2026-07-28에 확인), 바뀐 줄에 -- 0039 주석을 달았다.
--
-- ⚠ 그룹은 지우지 않는다. 챌린지가 아직 그룹 기반이라 groups·group_members·
--    challenges 관련 정책과 is_group_member 호출은 전부 그대로 둔다.

-- ════════════════════════════════════════════════════════════
-- A. 관계 판정 (4곳)
-- ════════════════════════════════════════════════════════════

-- ── A1. profiles SELECT — 그룹 조건은 한시적으로 남긴다 ───────
-- 챌린지 랭킹판에 참가자 닉네임이 떠야 하기 때문이다. 챌린지를 크루 초대
-- 기반으로 개편할 때 or shares_group_with(id)를 지운다. 이 경로로 새는 것은
-- 닉네임·아바타뿐이고 레벨·배지·기록·세션은 아래에서 전부 크루 전용이 된다.
--
-- ⚠ 정책 이름은 0001:80의 "profiles_select_own_or_crew"다. 이름이 한 글자라도
--    다르면 drop이 조용히 아무것도 안 지우고, 옛 그룹 정책이 살아남은 채 새
--    정책이 OR로 붙어 전환이 무효가 된다. (RLS 정책은 서로 OR로 합쳐진다.)
--    0001은 to 절이 없다(= to public). 그 형태를 그대로 유지한다.
drop policy if exists "profiles_select_own_or_crew" on public.profiles;
create policy "profiles_select_own_or_crew" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_crew_with(id)          -- 0039
    or public.shares_group_with(id)     -- 챌린지 랭킹판용, 한시적
  );

-- ── A2. poke_user — 콕 찌르기 (현행: 0028) ───────────────────
create or replace function public.poke_user(p_target_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
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
end $$;
revoke execute on function public.poke_user(uuid) from anon, public;
grant execute on function public.poke_user(uuid) to authenticated;

-- ── A3. view_record — 꾸준왕 열람권 (현행: 0012) ──────────────
-- record_views에는 insert 정책이 없다. 0012가 authenticated의 insert 권한을
-- 회수하고 정책도 지웠기 때문이다 — 이 정의자 함수가 유일한 쓰기 경로다.
-- 그래서 고칠 곳은 정책이 아니라 아래 판정 한 줄뿐이다.
create or replace function public.view_record(p_target_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
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
end $$;
revoke all on function public.view_record(uuid) from public, anon;
grant execute on function public.view_record(uuid) to authenticated;

-- ── A4. get_crew_member_profile — 크루원 프로필 (현행: 0032) ──
create or replace function public.get_crew_member_profile(p_target_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_progress user_progress%rowtype;
  v_badges jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- 0039: 그룹 → 크루 연결
  if p_target_id <> auth.uid() and not public.is_crew_with(p_target_id) then
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

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    'badges',       v_badges
  );
end $$;
revoke all on function public.get_crew_member_profile(uuid) from public, anon;
grant execute on function public.get_crew_member_profile(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
-- B. 알림 팬아웃 (3곳)
--    셋이 서로 다른 마이그레이션에 흩어져 있다. 하나를 빠뜨려도 나머지 둘이
--    동작해서 눈치채기 어렵다. 배지 획득(evaluate_badges, 0036)은 본인에게만
--    가므로 손대지 않는다.
-- ════════════════════════════════════════════════════════════

-- ── B1. start_workout — 운동 시작 (현행: 0011) ────────────────
create or replace function public.start_workout(p_session_id uuid)
returns public.workout_sessions
language plpgsql volatile security definer set search_path = public as $$
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
end $$;
revoke execute on function public.start_workout(uuid) from anon, public;
grant execute on function public.start_workout(uuid) to authenticated;

-- ── B2. mark_record_beaten — 기록 갱신 (현행: 0032) ───────────
create or replace function public.mark_record_beaten(
  p_session_id uuid, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on function public.mark_record_beaten(uuid, text) from public, anon;
grant execute on function public.mark_record_beaten(uuid, text) to authenticated;

-- ── B3. apply_xp_and_progress — 레벨업 (현행: 0029) ───────────
create or replace function public.apply_xp_and_progress(
  p_user_id uuid, p_amount int, p_reason text, p_reward_group text,
  p_source_type text, p_source_id text, p_effective_date date, p_metadata jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
end $$;
revoke all on function public.apply_xp_and_progress(uuid, int, text, text, text, text, date, jsonb)
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- C. 세션·이벤트 열람 (헬퍼 2 + 정책 1 + 응원 RPC 1)
--    두 헬퍼가 서로 다른 것을 연다. 하나만 고치면 반쪽만 열린다.
--      workout_session_crew_visible → 완료 세션의 세트·인증사진·리액션
--      session_crew_shared          → 상태 무관 workout_events·cheers
-- ════════════════════════════════════════════════════════════

-- ── C1. workout_session_crew_visible (현행: 0004) ─────────────
-- 이 함수가 운동·세트·인증사진·리액션까지 연쇄로 열어 준다. 아래 C3 정책만
-- 바꾸고 이 함수를 안 바꾸면 피드에 껍데기(제목만)가 뜬다.
-- group_id is not null 조건을 함께 뺀다 — 혼자모드 세션도 크루에게 열려야 한다.
--
-- ⚠ s.user_id = auth.uid() 분기를 반드시 남겨야 한다. 옛 판정
--   is_group_member(s.group_id, auth.uid())는 세션 주인 본인도 그 그룹의
--   group_members 행을 갖고 있으므로 "내 세션"에 true였다. is_crew_with는
--   crew_links의 check (user_a < user_b) 때문에 자기 자신에겐 구조적으로 항상
--   false라, 이 분기가 없으면 판정이 뒤집힌다. 그러면 reactions 정책 두 개가
--   앞단에 self 분기를 갖고 있지 않아서(0011:124·128 — 거기 user_id는 세션
--   주인이 아니라 "반응을 누른 사람"이다) 이렇게 된다:
--     · 내 운동 카드의 반응 카운트가 크루가 눌렀는데도 0으로 표시된다
--       (알림은 notify_reaction 트리거가 definer라 계속 와서 눈치채기 어렵다)
--     · 내 카드에 내가 반응을 남기면 42501로 거부된다
--   scripts/rls-test.mjs:450 "본인 세션 반응은 허용"이 이 동작을 보장한다.
create or replace function public.workout_session_crew_visible(sid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and s.status = 'completed'
      and s.deleted_at is null
      and (s.user_id = (select auth.uid())    -- 0039: 0004가 갖고 있던 자기접근 복원
           or public.is_crew_with(s.user_id)) -- 0039
  )
$$;

-- ── C2. session_crew_shared (현행: 0011) ──────────────────────
-- 상태 무관 "같은 크루의 세션인가". workout_events SELECT(진행 중 카드의
-- 판정 원천)와 cheers SELECT가 이걸 부른다. 계획서에 빠져 있던 곳이다 —
-- 안 고치면 크루끼리 서로의 "운동 중" 카드와 응원이 보이지 않는다.
-- C1과 같은 이유로 자기접근을 남긴다. 지금 호출부 두 곳은 앞단에 self 분기가
-- 있어(0011:118 workout_events.user_id = 세션 주인, 0011:141 receiver_id)
-- 없어도 당장은 무해하지만, 헬퍼 의미가 뒤집힌 채 남으면 다음 호출부에서 같은
-- 함정이 재발한다. 옛 is_group_member 판정도 본인에게 true였다.
create or replace function public.session_crew_shared(sid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workout_sessions s
    where s.id = sid
      and s.visibility = 'group'
      and (s.user_id = (select auth.uid())    -- 0039: 자기접근 복원
           or public.is_crew_with(s.user_id)) -- 0039
  )
$$;

-- ── C3. workout_sessions SELECT 정책 (현행: 0004:215) ─────────
-- sessions_insert_own_draft는 손대지 않는다 — 그룹은 챌린지 몫으로 남는다.
drop policy if exists "sessions_select_own_or_crew" on public.workout_sessions;
create policy "sessions_select_own_or_crew" on public.workout_sessions
  for select using (
    user_id = auth.uid()
    or (
      visibility = 'group'
      and status = 'completed'
      and deleted_at is null
      and public.is_crew_with(user_id)     -- 0039
    )
  );

-- ── C4. send_cheer — 응원 (현행: 0011) ────────────────────────
-- 계획서에 빠져 있던 곳이다. 안 고치면 크루끼리 응원을 보낼 때
-- session_not_found로 막히고, 혼자모드 세션은 영영 응원받지 못한다.
create or replace function public.send_cheer(
  p_session_id uuid, p_cheer_type text, p_message text default null
) returns public.cheers
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  c cheers;
  v_count int;
  v_last timestamptz;
  v_nick text;
  v_wants boolean;
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

  return c;
end $$;
revoke execute on function public.send_cheer(uuid, text, text) from anon, public;
grant execute on function public.send_cheer(uuid, text, text) to authenticated;
