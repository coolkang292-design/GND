-- 0016: 웹 푸시 — 구독 저장 + 알림 INSERT 시 발송 API 호출 트리거
-- 설계: docs/superpowers/specs/2026-07-19-web-push-design.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만)

-- ── 기기 푸시 구독 (본인 전용) ──────────────────────────────

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 중복 발송 방지 마커 ────────────────────────────────────

alter table public.notifications
  add column if not exists pushed_at timestamptz;

-- ── 알림 INSERT → 발송 API 비동기 호출 (pg_net) ─────────────
-- 발송 API는 받은 id로 행을 service_role 재조회하므로 위조 호출은 무해.
-- 트리거는 어떤 예외도 삼켜 알림 저장을 절대 막지 않는다.

create extension if not exists pg_net;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push_notification();
