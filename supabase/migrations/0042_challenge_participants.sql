-- 0042: 챌린지 방 (1/3 · 추가만) — 참가자 테이블 · 초대 RPC · 백필
-- 설계: docs/superpowers/specs/2026-07-29-challenge-rooms-design.md
-- 계획: docs/superpowers/plans/2026-07-30-challenge-rooms-0042.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0041은 수정 금지.
--
-- 이 파일은 테이블·RPC·백필을 "추가"만 한다. 기존 challenges·user_goals·
-- groups 경로는 한 줄도 건드리지 않으므로, 적용 직후에도 앱은 지금과 똑같이
-- 돈다. 실제 전환은 0043이다.
--
-- 순서를 나눈 이유: 0042만 적용된 상태로 실기기 확인을 한 뒤 0043으로 넘어가야
-- 문제가 생겨도 되돌릴 지점이 있다. 0038→0039에서 검증된 방식이다.
--
-- ⚠ 부분 선택 실행 금지. 이 파일은 begin;~commit;으로 명시적으로 감싼다.
--    begin;부터 잘린 조각은 커밋되지 않고, begin; 없이 뒷부분만 돌리면 남는
--    commit;에서 에러가 나 그 자리에 멈춘다. 어느 쪽이든 절반만 적용되는 일은
--    없다.
--
-- 되돌리기: challenge_participants를 drop하고 아래 RPC들을 drop하고, 알림유형
--    CHECK를 0038:77의 15종으로 되돌리면 된다. 앱이 이 테이블을 읽지 않으므로
--    위험이 없다.

begin;

-- ── 1. 참가자 테이블 ────────────────────────────────────────
-- groups/group_members가 하던 "명단" 역할을 챌린지가 직접 한다.
--
-- status 세 값의 뜻:
--   invited — 초대됐고 아직 응답 없음
--   joined  — 수락함. 목표까지 세우면 참가 확정
--   dropped — 시작 시점에 목표가 없어 명단에서 빠짐 (설계 §4.2)
--
-- dropped를 두는 이유: 행을 지우면 수락 때 맺어진 crew_links의 근거가 사라져
-- "왜 이 사람이 내 크루지"를 설명할 수 없다. 랭킹·집계에서는 빠지지만 이력은
-- 남긴다.
create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'joined', 'dropped')),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- "내가 낀 챌린지" 조회용 (RLS 정책과 화면 목록이 둘 다 이 방향으로 탄다)
create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, status);

-- 챌린지당 host는 1명 — 취소 권한이 갈리면 안 된다
create unique index if not exists challenge_participants_one_host
  on public.challenge_participants (challenge_id) where role = 'host';

-- ── 2. RLS — 읽기만 열고 쓰기는 RPC로만 ─────────────────────
-- 0038과 같은 방식이다. 직접 insert를 허용하면 초대 없이 남의 챌린지에
-- 참가자로 끼어들 수 있다.
alter table public.challenge_participants enable row level security;
revoke all on public.challenge_participants from anon, authenticated;
grant select on public.challenge_participants to authenticated;

-- 판정 함수를 먼저 만든다. 정책 안에서 같은 테이블을 서브쿼리로 읽으면
-- 무한 재귀(42P17)가 된다 — security definer 함수로 우회한다.
create or replace function public.is_challenge_participant(cid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.challenge_participants
    where challenge_id = cid and user_id = uid
  )
$$;
-- ⚠ revoke하지 않는다. RLS 정책이 부르는 판정 함수는 호출자 권한으로 평가되므로
--    revoke하면 anon 요청이 0행이 아니라 42501로 죽는다 (0038의 is_crew_with와
--    같은 이유 — 0038:64 주석 참조).

drop policy if exists "challenge_participants_select_member" on public.challenge_participants;
create policy "challenge_participants_select_member" on public.challenge_participants
  for select to authenticated
  using (public.is_challenge_participant(challenge_id, auth.uid()));

-- ── 3. 알림 유형 challenge_invite 추가 ──────────────────────
-- ⚠ 기존 15종을 하나도 빠뜨리면 안 된다. 빠뜨리면 그 유형을 쓰는 기존 알림이
--    조용히 죽는다. 아래 목록은 현행(0038:77)에 challenge_invite만 더한 것이다.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'workout_started', 'cheer_received', 'poke', 'reaction_received',
  'rank_change', 'record_viewed', 'morning_briefing',
  'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
  'level_up', 'app_update',
  'crew_request', 'crew_accepted',
  'challenge_invite'                                   -- 0042
));

commit;

-- ── 적용 전/후 확인 (SQL Editor에서 따로 실행) ───────────────
--   select count(*) from public.challenge_participants;
--   select role, status, count(*) from public.challenge_participants group by 1, 2;
--   → 백필(6절)이 채운 행. 전부 joined이고 host는 챌린지 수와 같아야 한다.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'notifications_type_check';
--   → 16종. challenge_invite가 있고 기존 15종이 전부 살아 있어야 한다.
--     하나라도 빠지면 그 유형의 알림이 조용히 죽는다.
