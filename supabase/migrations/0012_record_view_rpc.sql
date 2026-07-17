-- ============================================================
-- 0012: 꾸준왕 열람권 — view_record RPC (A안: 파생 상태)
-- 주(KST 월요일 시작) 5일(고유 날짜) 운동 → 5일째 완료 시각부터
-- 24시간 유효·1회 사용 열람권. 테이블 없이 열람 순간 판정.
-- 스펙: docs/superpowers/specs/2026-07-17-king-viewing-pass-home-widgets-design.md
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회)
-- ============================================================

-- 직접 쓰기 회수 — 이후 record_views 기록은 view_record RPC만.
-- (0011의 select 정책 "record_views_select_related"는 유지)
revoke insert on public.record_views from authenticated;
drop policy if exists "record_views_insert_own" on public.record_views;

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
  if not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  -- 이번 주(KST 월요일 00:00~) 내 완료 세션을 KST 날짜로 접어,
  -- 5번째 고유 날짜를 만든 첫 완료 시각 = 열람권 획득 시각
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
