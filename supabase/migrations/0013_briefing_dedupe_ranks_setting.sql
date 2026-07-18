-- ============================================================
-- 0013: 브리핑 멱등 키 + finalize_challenge ranks 설정 존중
-- 설계: docs/superpowers/specs/2026-07-18-briefing-cron-notification-settings-design.md
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run (1회)
-- ============================================================

-- ── 1. notifications.dedupe_key — 브리핑 중복 방지 (스펙 §3) ──
-- nullable + 일반 unique 인덱스: NULL은 충돌하지 않으므로 기존 알림
-- 타입(전부 NULL)에 무영향. partial index는 PostgREST on_conflict와
-- 안 맞아 일반 인덱스를 쓴다.
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key);

-- ── 2. finalize_challenge — ranks 꺼둔 유저에게 종료 알림 생략 ──
-- 0011 §9 원문 그대로 + 알림 insert에 coalesce(ns.ranks, true) 필터.
-- (행 없음 = 알림 on 관례. 시그니처·definer·search_path 불변 → grant 유지)
create or replace function public.finalize_challenge(p_challenge_id uuid)
returns public.challenges
language plpgsql volatile security definer set search_path = public as $$
declare
  c challenges;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c from challenges
  where id = p_challenge_id
  for update;

  if not found or not is_group_member(c.group_id, auth.uid()) then
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

  insert into notifications (user_id, actor_id, type, reference_id, title, body)
  select distinct ug.user_id, auth.uid(), 'challenge_ended', c.id,
         '챌린지 "' || c.name || '" 종료 🏁',
         '시상대에서 결과를 확인해보세요!'
  from user_goals ug
  left join notification_settings ns on ns.user_id = ug.user_id
  where ug.challenge_id = c.id
    and coalesce(ns.ranks, true);

  return c;
end $$;
