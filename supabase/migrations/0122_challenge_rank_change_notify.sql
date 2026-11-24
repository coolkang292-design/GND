-- 0122: 챌린지 등수 변동 알림 — 직전 순위 스냅샷 + 운동 완료 신호
-- 계획: docs/superpowers/plans/2026-11-15-challenge-rank-change-notification.md
--
-- 비파괴만 담는다: 새 테이블 · 새 함수 · 새 트리거. 기존 행·함수·정책을 건드리지 않는다.
-- 알림 유형 `rank_change`는 0011부터 허용목록에 있다 — 제약 변경 없음.
--
-- 흐름
--   운동 완료(workout_sessions.status → completed)
--     → 이 트리거가 pg_net으로 /api/challenge/rank-check 호출 (0016 푸시 트리거와 같은 패턴)
--     → 서버(TS, 화면과 같은 `getActiveChallengeRanking`)가 순위를 계산
--     → `claim_rank_snapshot`이 새 순위를 저장하고 **직전 순위를 돌려준다** (원자적)
--     → 서버가 달라진 것을 알림(`rank_change`)으로 insert → 0016 트리거가 푸시까지 보낸다
--
-- ⚠️ 순위 계산을 SQL로 복제하지 않는다. 점수식·5단 타이브레이크는 TS 한 벌이다
--    (goal-score.ts 주석 참조). 이 마이그레이션은 "기억"(스냅샷)과 "신호"(트리거)만 만든다.
-- ⚠️ 서버 라우트는 session_id만 받고 DB를 재조회한다 — 위조 호출이 와도 순위가 실제로
--    바뀐 경우에만 알림이 만들어지고, 스냅샷 선점이 원자적이라 중복 발송도 없다.

begin;

-- ============================================================
-- 1) 직전 순위 스냅샷
-- ============================================================
create table if not exists public.challenge_rank_snapshots (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  rank         int  not null check (rank >= 1),
  -- 이 방에서 이 사람에게 마지막으로 등수 알림을 보낸 시각 — 쿨다운 판정
  notified_at  timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.challenge_rank_snapshots enable row level security;
-- 정책을 일부러 만들지 않는다: service_role(서버 라우트)만 읽고 쓴다.
-- 순위는 `live_ranking`이 꺼진 방에서 진행 중 비공개다 — 클라이언트가 직접 읽으면 안 된다.
revoke all on public.challenge_rank_snapshots from anon, authenticated;

comment on table public.challenge_rank_snapshots is
  '등수 변동 알림용 직전 순위 (0122). service_role 전용 — 클라이언트 접근 없음.';

-- ============================================================
-- 2) 스냅샷 선점 — 새 순위를 저장하고 직전 순위를 돌려준다
-- ============================================================
--
-- 두 요청이 동시에 와도 한쪽만 "직전 순위와 다르다"를 본다:
-- challenges 행을 FOR UPDATE로 잠그고, 읽기와 쓰기를 한 트랜잭션에서 한다.
-- (그래서 중복 알림이 안 난다 — 두 번째 요청은 이미 새 순위를 직전으로 읽는다.)
--
-- p_next: [{"user_id": "...", "rank": 1}, ...]
-- 반환:   [{"user_id": "...", "rank": 2, "notified_at": "..."|null}, ...]  ← 저장 **전** 값
create or replace function public.claim_rank_snapshot(
  p_challenge_id uuid,
  p_next jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
begin
  perform 1 from public.challenges where id = p_challenge_id for update;
  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id,
           'rank', s.rank,
           'notified_at', s.notified_at)), '[]'::jsonb)
    into v_prev
    from public.challenge_rank_snapshots s
   where s.challenge_id = p_challenge_id;

  -- 새 순위 저장 (notified_at은 보존)
  insert into public.challenge_rank_snapshots (challenge_id, user_id, rank, updated_at)
  select p_challenge_id, (e->>'user_id')::uuid, (e->>'rank')::int, now()
    from jsonb_array_elements(p_next) e
  on conflict (challenge_id, user_id)
  do update set rank = excluded.rank, updated_at = now();

  -- 명단에서 빠진 사람(탈락 등)은 지운다
  delete from public.challenge_rank_snapshots s
   where s.challenge_id = p_challenge_id
     and s.user_id not in (
       select (e->>'user_id')::uuid from jsonb_array_elements(p_next) e
     );

  return v_prev;
end;
$$;

revoke all on function public.claim_rank_snapshot(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_rank_snapshot(uuid, jsonb) to service_role;

-- ============================================================
-- 3) 운동 완료 → 서버 라우트 호출
-- ============================================================
--
-- 0016(dispatch_push_notification)과 같은 방식이다. 트리거는 어떤 예외도 삼켜
-- **운동 완료를 절대 막지 않는다.** pg_net은 비동기라 완료 응답을 늦추지도 않는다.
create or replace function public.dispatch_rank_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://gnd-one.vercel.app/api/challenge/rank-check',
      body := jsonb_build_object('session_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.dispatch_rank_check() from public, anon, authenticated;

drop trigger if exists workout_sessions_rank_check on public.workout_sessions;
create trigger workout_sessions_rank_check
  after update of status on public.workout_sessions
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.dispatch_rank_check();

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (객체 재조회) ──────────────────────────────────
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='challenge_rank_snapshots';       -- 1
--   select relrowsecurity from pg_class
--    where oid='public.challenge_rank_snapshots'::regclass;                       -- true
--   select count(*) from pg_policies
--    where tablename='challenge_rank_snapshots';                                  -- 0
--   select has_function_privilege('anon','public.claim_rank_snapshot(uuid,jsonb)','execute'),
--          has_function_privilege('authenticated','public.claim_rank_snapshot(uuid,jsonb)','execute'),
--          has_function_privilege('service_role','public.claim_rank_snapshot(uuid,jsonb)','execute');
--                                                                                 -- false,false,true
--   select tgname from pg_trigger where tgname='workout_sessions_rank_check';     -- 1행
--   select proconfig from pg_proc where proname in ('claim_rank_snapshot','dispatch_rank_check');
--                                                                                 -- search_path="" 둘 다
--
-- ── 되돌리기 ────────────────────────────────────────────────
--   drop trigger workout_sessions_rank_check on public.workout_sessions;
--   drop function public.dispatch_rank_check();
--   drop function public.claim_rank_snapshot(uuid, jsonb);
--   drop table public.challenge_rank_snapshots;
