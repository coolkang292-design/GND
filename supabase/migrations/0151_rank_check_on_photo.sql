-- 0151: 운동 사진이 저장·삭제될 때도 등수 변동을 다시 잰다
-- 0139의 빈틈을 메운다. 앱 코드 변경 없음 — 같은 서버 라우트(/api/challenge/rank-check)를 한 번 더 부른다.
--
-- ── 무슨 일이 있었나 (2026-11-26 07:12) ─────────────────────────────
--   사진 필수 방(`photo_required`)에서는 **사진이 있어야** 운동이 점수에 들어간다
--   (`get_challenge_period_sessions`의 `exists (select 1 from workout_images ...)`).
--   그런데 0139 트리거는 **완료 순간**(status → completed)에만 등수를 잰다.
--   앱은 완료 뒤 12~21초 지나서 인증 사진을 올리므로, 그 순간엔 방금 한 운동이 점수에 없다.
--     · 내 운동은 내 완료 때 반영되지 않고, **다음 사람이 운동을 끝낼 때** 뒤늦게 반영된다
--     · 그때 다음 사람의 운동은 또 사진이 없어 빠진다
--   결과: 11/25 21:31 낭만송곳니 운동이 11/26 07:12 오뎅끼데스까 완료 때 반영되면서,
--   방금 운동해서 1위를 지킨 사람에게 "2위로 밀렸어요"가 나갔다(실제는 1위 유지).
--   11/25 18:39 "오뎅끼데스까님이 1위 됐어요"도 사실은 그날 07:10의 일이었다(11시간 지연).
--
-- ── 원리 ────────────────────────────────────────────────────────
--   등수는 "점수에 들어가는 운동 목록"이 바뀔 때만 바뀐다. 사진 필수 방에서는 사진의
--   생김·사라짐이 그 목록을 바꾼다. 그래서 그 순간에도 재 본다.
--   라우트는 session_id만 받고 DB를 다시 읽으며, `claim_rank_snapshot`이 원자적이라
--   완료·사진 호출이 겹쳐도 **바뀐 쪽 한 번만** 알림이 나간다(0139 머리주석).
--
-- ── 거르는 것 (트리거 안에서) ───────────────────────────────────────
--   · 운동 중(active)에 찍은 사진 — 아직 완료 전이라 라우트가 어차피 건너뛴다.
--     부르지 않는다(완료 트리거가 그때 잰다).
--   · 지워진 세션(deleted_at)·없는 세션(연쇄 삭제) — 부르지 않는다.
--
-- 비파괴: 새 함수 1 · 새 트리거 1. 기존 함수·트리거·행을 건드리지 않는다.
-- ⚠️ 운동 완료·사진 저장을 **절대 막지 않는다** — 0139/0016과 같이 모든 예외를 삼킨다.
--    pg_net은 비동기라 사진 저장 응답도 늦추지 않는다.

begin;

create or replace function public.dispatch_rank_check_on_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid := coalesce(new.session_id, old.session_id);
begin
  begin
    if exists (
      select 1 from public.workout_sessions s
       where s.id = v_session_id
         and s.status = 'completed'
         and s.deleted_at is null
    ) then
      perform net.http_post(
        url := 'https://gnd-one.vercel.app/api/challenge/rank-check',
        body := jsonb_build_object('session_id', v_session_id),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    null;
  end;
  return null;  -- AFTER 트리거 — 반환값은 쓰이지 않는다
end;
$$;

revoke all on function public.dispatch_rank_check_on_photo() from public, anon, authenticated;

drop trigger if exists workout_images_rank_check on public.workout_images;
create trigger workout_images_rank_check
  after insert or delete on public.workout_images
  for each row
  execute function public.dispatch_rank_check_on_photo();

commit;

-- ── 적용 확인 (객체 재조회) ──────────────────────────────────
--   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'workout_images_rank_check';
--     -- AFTER INSERT OR DELETE ON public.workout_images FOR EACH ROW ...
--   select proconfig, prosecdef from pg_proc where proname = 'dispatch_rank_check_on_photo';
--     -- {search_path=""}, true
--   select has_function_privilege('authenticated','public.dispatch_rank_check_on_photo()','execute'); -- false
--
-- ── 리허설 (되돌리는 트랜잭션) ─────────────────────────────────
--   begin; insert into workout_images(...) 완료 세션 → net.http_request_queue에 1행,
--          취소 세션 → 0행, 사진 삭제 → 1행 더; rollback;
--   2026-11-26 실행 결과(픽스처 A 세션, raise exception으로 전부 되돌림):
--     insert_completed=1 cancelled=0 after_delete=2 body={"session_id": "<완료 세션>"}
--     되돌린 뒤 트리거 0 · 함수 0 · 리허설 사진 0 · 대기 요청 0 확인
--   적용(MCP apply_migration) 뒤 재조회: 트리거 정의 위와 같음 · search_path="" ·
--     security definer · anon/authenticated 실행 권한 없음 · 0139 트리거 그대로
--
-- ── 되돌리기 ────────────────────────────────────────────────
--   drop trigger workout_images_rank_check on public.workout_images;
--   drop function public.dispatch_rank_check_on_photo();
