-- 0038: 크루 연결 그래프 — 닉네임 검색 · 상호 수락 (추가만)
-- 설계: docs/superpowers/specs/2026-07-28-crew-link-graph-design.md
-- 계획: docs/superpowers/plans/2026-07-28-crew-link-graph.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0037은 수정 금지.
--
-- 이 파일은 테이블·판정함수·알림유형·RPC를 "추가"만 한다. 기존 그룹 기반 권한
-- 검사는 그대로라 적용 직후에도 앱은 지금과 똑같이 돈다. 실제 전환은 0039다.
-- 순서를 나눈 이유: 0038만 적용된 상태로 크루 화면을 먼저 배포해 실기기로 확인한
-- 뒤 0039로 전환해야, 문제가 생겨도 되돌릴 지점이 있다.

-- ── 1. 요청 이력 ─────────────────────────────────────────────
create table if not exists public.crew_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint crew_requests_not_self check (requester_id <> addressee_id)
);

-- 진행 중 요청은 방향당 1건. 거절 뒤 재요청은 새 행으로 허용된다.
create unique index if not exists crew_requests_pending_unique
  on public.crew_requests (requester_id, addressee_id)
  where status = 'pending';
create index if not exists crew_requests_inbox_idx
  on public.crew_requests (addressee_id, status);
create index if not exists crew_requests_outbox_idx
  on public.crew_requests (requester_id, status);

-- ── 2. 수락된 연결 ───────────────────────────────────────────
-- user_a < user_b 정규화: 대칭 관계를 두 행으로 저장하면 한쪽만 지워진 반쪽
-- 상태가 생긴다. "쌍 하나 = 행 하나"를 DB가 강제한다.
create table if not exists public.crew_links (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint crew_links_ordered check (user_a < user_b)
);
create index if not exists crew_links_user_b_idx on public.crew_links (user_b);

-- ── 3. RLS — 읽기만 열고 쓰기는 RPC로만 ──────────────────────
alter table public.crew_requests enable row level security;
alter table public.crew_links enable row level security;
revoke all on public.crew_requests from anon, authenticated;
revoke all on public.crew_links from anon, authenticated;
grant select on public.crew_requests to authenticated;
grant select on public.crew_links to authenticated;

drop policy if exists "crew_requests_mine_select" on public.crew_requests;
create policy "crew_requests_mine_select" on public.crew_requests
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "crew_links_mine_select" on public.crew_links;
create policy "crew_links_mine_select" on public.crew_links
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- ── 4. 관계 판정 — 0039가 shares_group_with 자리에 이걸 넣는다 ─
-- RLS 정책이 부르는 판정 함수라 revoke하지 않는다(0001의 shares_group_with와 같다).
-- 정책은 호출자 권한으로 평가되므로 revoke하면 anon 요청이 0행이 아니라 42501로 죽는다.
create or replace function public.is_crew_with(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_links
    where user_a = least((select auth.uid()), uid)
      and user_b = greatest((select auth.uid()), uid)
  )
$$;

-- ── 5. 알림 유형 2종 추가 (0034 목록에 이어붙임) ─────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started', 'cheer_received', 'poke', 'reaction_received',
  'rank_change', 'record_viewed', 'morning_briefing',
  'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
  'level_up', 'app_update',
  'crew_request', 'crew_accepted'
));

-- ── 6. 기존 크루원 자동 연결 ─────────────────────────────────
-- 같은 그룹에 있던 모든 쌍을 연결로 옮긴다. 리얼GND 3명 → 3쌍.
-- crew_links가 비어 있을 때만 돈다 — 이 파일을 다시 Run해도 "해제한 사이"가
-- 되살아나지 않게 하려는 것이다. on conflict만으로는 중복만 막고 삭제는 못 막는다.
-- 프로필 없는 계정(온보딩 미완)은 FK가 막으므로 미리 걸러 낸다.
insert into public.crew_links (user_a, user_b)
select distinct a.user_id, b.user_id
from public.group_members a
join public.group_members b
  on a.group_id = b.group_id and a.user_id < b.user_id
where not exists (select 1 from public.crew_links)
  and exists (select 1 from public.profiles p where p.id = a.user_id)
  and exists (select 1 from public.profiles p where p.id = b.user_id)
on conflict do nothing;
