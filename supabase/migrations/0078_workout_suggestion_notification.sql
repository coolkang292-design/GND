-- 0078: 계획 없는 날 운동 제안 알림 유형
-- 설계: docs/superpowers/specs/2026-08-16-empty-day-workout-suggestion-design.md
-- 적용: Supabase SQL Editor에 전체 붙여넣기 → Run (1회만)
--
-- ⚠ notifications_type_check는 **허용목록** 방식이라 목록 **전체**를 다시 써야 한다.
--   0077의 목록을 그대로 베끼고 workout_suggestion 한 줄만 더했다.
--   하나라도 빠지면 그 유형의 알림이 조용히 죽는다.
--
-- ⚠ **지금 Run해도 안전하다.** 운영에 떠 있는 앱은 이 유형을 아직 안 쓰므로
--   아무 변화가 없다. CLAUDE.md의 "지금 돌려도 안전한 것" 쪽이다
--   (level_definitions UPDATE 같은 "배포 뒤에 돌려야 하는 것"이 아니다).
--
-- ⚠ 되돌릴 때는 **행을 먼저 지우고** 제약을 되돌린다. 순서를 뒤집으면
--   이미 저장된 workout_suggestion 행 때문에 제약 추가가 위반으로 실패한다.

begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
    'level_up', 'app_update',
    'crew_request', 'crew_accepted',                     -- 0038
    'challenge_invite',                                  -- 0042
    'bug_reported', 'bug_fixed',                         -- 0052
    'challenge_peek_unlocked',                           -- 0054
    'challenge_starting_soon', 'challenge_dropped',      -- 0077
    'workout_suggestion'                                 -- 0078
  ));

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 (SQL Editor에서 따로 실행) ─────────────────────
--
-- (1) 새 유형이 허용목록에 들어갔나 — 1이 나와야 한다
--   select count(*) from pg_constraint
--   where conname = 'notifications_type_check'
--     and pg_get_constraintdef(oid) like '%workout_suggestion%';
--
-- (2) 되돌리기 — **순서가 있다.**
--   ⓐ 새 유형으로 저장된 알림을 지운다
--      delete from notifications where type = 'workout_suggestion';
--   ⓑ 그 다음에야 제약을 위 목록에서 마지막 줄만 빼고 다시 Run 한다.
--   ⚠ ⓑ를 먼저 하면 이미 저장된 행 때문에 제약 위반으로 실패한다.
