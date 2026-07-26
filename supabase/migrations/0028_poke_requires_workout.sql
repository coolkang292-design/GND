-- 0028: 콕 찌르기 — 오늘 운동한 사람만 찌를 수 있다
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회). 기존 마이그레이션은 수정하지 않는다.
--
-- 왜 (2026-07-26 사용자 요청):
--   지금은 내가 며칠째 안 움직여도 남을 찌를 수 있다. 안 하는 사람이 하는 사람을
--   재촉하는 구조라 콕이 잔소리가 된다. 오늘 운동을 마친 사람에게만 찌를 자격을
--   주면, 콕은 "나도 했으니 너도 하자"는 신호가 된다.
--
-- 유지되는 규칙: 본인 금지 · 크루만 · 같은 대상 24시간 1회 · 상대가 콕 알림을 끄면 거부.
-- 추가되는 규칙: 보내는 사람이 KST 오늘 완료한 운동이 1건 이상 있을 것.
--
-- 판정 기준은 홈 크루 카드가 ✅를 붙일 때 쓰는 기준과 같다
--   (src/lib/social.ts:getTodaysWorkoutUserIds — KST 당일 completed·미삭제).

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
  if not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  -- ⬇ 0028 추가: 오늘 운동을 마친 사람만 찌를 수 있다
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
