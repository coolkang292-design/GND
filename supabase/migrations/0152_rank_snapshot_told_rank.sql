-- 0152: 등수 스냅샷에 "마지막으로 알려준 순위"(told_rank)를 더한다
-- 계획: docs/superpowers/plans/2026-11-15-challenge-rank-change-notification.md §10-1
--
-- ── 왜 ──────────────────────────────────────────────────────────
--   `rank`는 **마지막으로 계산한** 순위다. 계산할 때마다 전원 것이 덮인다(0139 claim_rank_snapshot).
--   그래서 30분 쿨다운으로 알림을 건너뛴 사람의 변화는 그 자리에서 **영영 사라졌다**.
--   2026-11-26 08:01: 08:01:14 전원에게 "오뎅 1위" → 14초 뒤 사진 반영으로 실제는 낭만 1위,
--   그런데 전원이 쿨다운이라 아무도 못 들었고 스냅샷은 새 순위로 덮였다.
--   `told_rank`는 그 사람이 **실제로 들은** 순위다. 받은 사람만 갱신한다(서버 라우트).
--   다음 계산 때 "들은 순위 ≠ 지금 순위"면 쿨다운이 끝난 사람에게 전해진다(`planRankChange`).
--
-- ── 무엇을 ───────────────────────────────────────────────────────
--   1) nullable 컬럼 추가 — null = 아직 알려준 적 없음(라우트는 그때 `rank`를 들은 것으로 본다)
--   2) claim_rank_snapshot 응답에 `told_rank` 키를 더한다. 저장·삭제 동작은 그대로다
--      (`on conflict ... do update set rank`는 told_rank를 건드리지 않는다 — 의도).
--
-- 비파괴: nullable add column + 함수 본문 교체(키 하나 추가). 기존 행 값은 바꾸지 않는다.
-- 운영 앱(옛 라우트)은 새 키를 무시하므로 **앱 배포보다 먼저** 적용해도 안전하다.
-- ⚠️ 반대로 새 라우트는 told_rank 컬럼에 쓰므로 **이 파일이 먼저** 적용돼 있어야 한다.

begin;

alter table public.challenge_rank_snapshots
  add column if not exists told_rank int check (told_rank is null or told_rank >= 1);

comment on column public.challenge_rank_snapshots.told_rank is
  '그 사람에게 마지막으로 알려준 순위 (0152). 알림을 받은 사람만 갱신. null = 아직 안 알림';

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
           'notified_at', s.notified_at,
           'told_rank', s.told_rank)), '[]'::jsonb)
    into v_prev
    from public.challenge_rank_snapshots s
   where s.challenge_id = p_challenge_id;

  insert into public.challenge_rank_snapshots (challenge_id, user_id, rank, updated_at)
  select p_challenge_id, (e->>'user_id')::uuid, (e->>'rank')::int, now()
    from jsonb_array_elements(p_next) e
  on conflict (challenge_id, user_id)
  do update set rank = excluded.rank, updated_at = now();

  delete from public.challenge_rank_snapshots s
   where s.challenge_id = p_challenge_id
     and s.user_id not in (
       select (e->>'user_id')::uuid from jsonb_array_elements(p_next) e
     );

  return v_prev;
end;
$$;

-- 권한은 0139 그대로(create or replace는 권한을 유지한다) — 아래 확인 쿼리로 재조회한다
revoke all on function public.claim_rank_snapshot(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_rank_snapshot(uuid, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (객체 재조회) ──────────────────────────────────
--   select data_type, is_nullable from information_schema.columns
--    where table_name='challenge_rank_snapshots' and column_name='told_rank';   -- integer, YES
--   select pg_get_functiondef('public.claim_rank_snapshot(uuid,jsonb)'::regprocedure) like '%told_rank%'; -- true
--   select has_function_privilege('authenticated','public.claim_rank_snapshot(uuid,jsonb)','execute'),
--          has_function_privilege('service_role','public.claim_rank_snapshot(uuid,jsonb)','execute'); -- false,true
--
-- ── 되돌리기 ────────────────────────────────────────────────
--   0139의 claim_rank_snapshot 본문으로 create or replace → alter table ... drop column told_rank
--   (drop column은 파괴적 — 승인 후)
--
-- ── 기록 (2026-11-27) ───────────────────────────────────────
--   리허설(raise exception으로 되돌림, 픽스처 방): 1회차 기준선 → A에 told_rank=1 → 2회차 순위 뒤집기
--     → 직전 응답에 told_rank 키(A=1, B=null) · 저장 후 A rank=2·told_rank=1 보존. 되돌린 뒤 컬럼 0·함수 옛 본문 확인.
--   MCP 적용 후 재조회: integer·nullable · 본문에 told_rank · search_path="" · anon/auth 실행권 없음 · service_role 있음
