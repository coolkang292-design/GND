-- 0143: 레벨업·진화를 글자 한 줄이 아니라 **구조화된 값**으로 저장한다 (2026-11-20, 사용자 시안)
--
-- 왜:
--   0142는 게시물에 `progress_note`(글자 한 줄)만 남겼다. 시안은 피드 카드에 **캐릭터 그림 + "꾸준러로 진화 /
--   Lv.16 달성"**을 보여 주고, 알림함에는 **"시동러 → 꾸준러"**를 보여 준다. 그림은 단계 번호가 있어야 고르고,
--   "A → B"는 이전 단계 이름이 있어야 만든다. 글자에서 거꾸로 뽑으면 깨지기 쉬우므로 값 그대로 저장한다.
--
-- 무엇을:
--   ① `workout_sessions.progress_event jsonb` — {kind, level, prevLevel, stage, stageName, prevStage, prevStageName}
--      · kind = 'evolution'(진화) | 'level_up'(레벨업만)
--      ⚠️ 일반 사용자는 이 칸도 못 고친다(열 단위 UPDATE 권한 — 새 열은 자동으로 막힌다).
--   ② `gnd_evolution.notify_progress` — 위 값을 게시물에 남기고, 진화 알림의 본문을 시안대로
--      "시동러 → 꾸준러 · Lv.16"으로 만든다. (레벨업 알림 본문은 그대로.)
--
-- 안전: 열 추가(nullable) + 함수 교체뿐. 기존 행을 바꾸지 않는다. `progress_note`는 그대로 남긴다
--       (옛 앱·값이 없는 행의 대체 표시).
--       같은 운동에서 진화와 레벨업이 겹치면 진화가 이긴다(0142와 같은 규칙).

alter table public.workout_sessions
  add column if not exists progress_event jsonb;

comment on column public.workout_sessions.progress_event is
  '0143: 이 운동으로 레벨업·진화했을 때의 구조화된 값 (피드 카드 배지용). notify_progress가 쓴다.';

create or replace function gnd_evolution.notify_progress(p_user_id uuid,p_previous_level int,p_level int,p_previous_stage int,p_stage int)
returns void language plpgsql set search_path='' as $fn$
declare nick text; stage_name text; prev_stage_name text; title text; body text; v_note text; v_event jsonb; v_session uuid;
begin
  if p_level<=p_previous_level and p_stage<=p_previous_stage then return; end if;
  select p.nickname into nick from public.profiles p where p.id=p_user_id;

  select d.stage_name into stage_name from public.level_definitions d where d.stage_index=p_stage order by level limit 1;
  select d.stage_name into prev_stage_name from public.level_definitions d where d.stage_index=p_previous_stage order by level limit 1;

  if p_stage>p_previous_stage then
    title:='🎉 '||coalesce(nick,'크루원')||'님이 진화했어요!';
    body:=coalesce(prev_stage_name,'이전 단계')||' → '||coalesce(stage_name,'다음 단계')||' · Lv.'||p_level;
    v_note:='🎉 '||coalesce(stage_name,'다음')||' 단계로 진화! (Lv.'||p_level||')';
    v_event:=jsonb_build_object('kind','evolution','level',p_level,'prevLevel',p_previous_level,
      'stage',p_stage,'stageName',stage_name,'prevStage',p_previous_stage,'prevStageName',prev_stage_name);
  else
    title:='⬆️ '||coalesce(nick,'크루원')||'님이 레벨업!';
    body:='Lv.'||p_previous_level||' → Lv.'||p_level||' 달성했어요. 축하해주세요 👏';
    v_note:='⬆️ Lv.'||p_previous_level||' → Lv.'||p_level||' 레벨업';
    v_event:=jsonb_build_object('kind','level_up','level',p_level,'prevLevel',p_previous_level,
      'stage',p_stage,'stageName',stage_name,'prevStage',p_previous_stage,'prevStageName',prev_stage_name);
  end if;

  -- 이 사건을 일으킨 운동 게시물 (0142와 같다): 크루에게 보이는 가장 최근 운동 — 진행 중이거나 30분 안에 끝난 것
  select s.id into v_session
    from public.workout_sessions s
   where s.user_id=p_user_id and s.deleted_at is null and s.visibility='group'
     and (s.status='active' or (s.status='completed' and s.completed_at>=now()-interval '30 minutes'))
   order by coalesce(s.completed_at,s.started_at) desc
   limit 1;

  if v_session is not null then
    -- 진화는 레벨업을 덮고, 레벨업은 이미 적힌 값을 덮지 않는다
    update public.workout_sessions
       set progress_note=v_note, progress_event=v_event
     where id=v_session
       and (p_stage>p_previous_stage or progress_event is null);
  end if;

  insert into public.notifications(user_id,actor_id,type,reference_id,title,body)
    select case when l.user_a=p_user_id then l.user_b else l.user_a end,p_user_id,'level_up',v_session,title,body
    from public.crew_links l where p_user_id in(l.user_a,l.user_b);
end $fn$;
