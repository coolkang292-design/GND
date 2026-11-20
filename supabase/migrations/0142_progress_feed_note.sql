-- 0142: 레벨업·진화를 피드에 표시하고, 그 알림이 해당 게시물로 가게 한다 (2026-11-20 사용자 요청)
--
-- 왜:
--   레벨업·진화 알림(`level_up`)은 `reference_id`가 비어 있어(운영 143건 중 0건) 누르면 내 정보 탭으로만
--   갔다. 크루원이 받는 알림인데 "누가 어떤 운동 끝에 올랐는지"를 볼 곳이 없었다. 피드에도 레벨업·진화를
--   보여 주는 자리가 없었다.
--
-- 무엇을:
--   ① `workout_sessions.progress_note` — 그 운동으로 레벨업·진화했을 때의 한 줄 문구. 피드 카드가 읽는다.
--      기록 갱신(`record_note`, 0018)과 **같은 방식**이다.
--      ⚠️ 일반 사용자는 이 칸을 못 고친다. `authenticated`의 UPDATE 권한이 열 단위로 정해져 있어서
--         (`record_note`와 같다) 새 열은 자동으로 막힌다 — 가짜 "진화" 표시를 붙일 수 없다.
--   ② `gnd_evolution.notify_progress` — 레벨업·진화를 일으킨 **운동 게시물**을 찾아
--      그 게시물에 문구를 남기고, 크루에게 가는 알림의 `reference_id`로 넣는다.
--      시그니처는 그대로라 호출하는 4곳(`apply_xp_and_progress` · `complete_workout_v2` ·
--      `refresh_my_stage_evolution` …)은 한 줄도 안 바꾼다.
--
-- 게시물을 어떻게 찾나:
--   레벨업은 운동을 끝내는 순간(`complete_workout_v2`)이나 사진 XP 지급 때 일어난다. 그 시점의 호출은 세션 id를
--   안 넘기므로, **이 사람의 가장 최근 크루 공개 운동**을 고른다 — 진행 중(`active`)이거나, 30분 안에 끝난 것.
--   - 크루에게 안 보이는 운동(`visibility`가 group이 아님)은 고르지 않는다. 눌러도 없는 게시물이 되기 때문이다.
--   - 찾지 못하면(운동 밖에서 진화 판정이 도는 `refresh_my_stage_evolution` 등) `reference_id`는 비워 둔다.
--     앱이 그 알림을 `/feed`(맨 위)로 보낸다.
--
-- 안전:
--   - 열 추가(nullable)와 함수 교체뿐이다. 기존 행을 바꾸지 않고 지우지도 않는다.
--   - 옛 앱(아직 이 열을 모른다)에 영향이 없다: 알림이 `reference_id`를 갖게 되지만 옛 앱은 `level_up`을
--     고정 주소(/profile)로 보낸다. 새 앱을 배포하면 게시물로 간다.
--   - 같은 운동에 진화와 레벨업이 겹치면 진화 문구가 이긴다(진화는 레벨업을 겸하는 더 큰 사건이다).

alter table public.workout_sessions
  add column if not exists progress_note text;

comment on column public.workout_sessions.progress_note is
  '0142: 이 운동으로 레벨업·진화했을 때의 문구 (피드 카드 표시용). notify_progress가 쓴다.';

create or replace function gnd_evolution.notify_progress(p_user_id uuid,p_previous_level int,p_level int,p_previous_stage int,p_stage int)
returns void language plpgsql set search_path='' as $fn$
declare nick text; stage_name text; title text; body text; v_note text; v_session uuid;
begin
  if p_level<=p_previous_level and p_stage<=p_previous_stage then return; end if;
  select p.nickname into nick from public.profiles p where p.id=p_user_id;
  if p_stage>p_previous_stage then
    select d.stage_name into stage_name from public.level_definitions d where d.stage_index=p_stage order by level limit 1;
    title:='🎉 '||coalesce(nick,'크루원')||'님이 진화했어요!';
    body:='Lv.'||p_level||' — '||coalesce(stage_name,'다음')||' 단계로 진화했어요 ✨';
    v_note:='🎉 '||coalesce(stage_name,'다음')||' 단계로 진화! (Lv.'||p_level||')';
  else
    title:='⬆️ '||coalesce(nick,'크루원')||'님이 레벨업!';
    body:='Lv.'||p_previous_level||' → Lv.'||p_level||' 달성했어요. 축하해주세요 👏';
    v_note:='⬆️ Lv.'||p_previous_level||' → Lv.'||p_level||' 레벨업';
  end if;

  -- 이 사건을 일으킨 운동 게시물: 크루에게 보이는(visibility=group) 가장 최근 운동 — 진행 중이거나 30분 안에 끝난 것
  select s.id into v_session
    from public.workout_sessions s
   where s.user_id=p_user_id and s.deleted_at is null and s.visibility='group'
     and (s.status='active' or (s.status='completed' and s.completed_at>=now()-interval '30 minutes'))
   order by coalesce(s.completed_at,s.started_at) desc
   limit 1;

  if v_session is not null then
    -- 진화 문구는 레벨업 문구를 덮고, 레벨업 문구는 이미 적힌 문구를 덮지 않는다
    update public.workout_sessions
       set progress_note=v_note
     where id=v_session
       and (p_stage>p_previous_stage or progress_note is null);
  end if;

  insert into public.notifications(user_id,actor_id,type,reference_id,title,body)
    select case when l.user_a=p_user_id then l.user_b else l.user_a end,p_user_id,'level_up',v_session,title,body
    from public.crew_links l where p_user_id in(l.user_a,l.user_b);
end $fn$;
