-- 0123: 순위가 내려간 사람 알림 유형 `rank_drop` + 알림 부가 정보 `meta`
-- 계획: docs/superpowers/plans/2026-11-15-challenge-rank-change-notification.md §6-3
--
-- 왜 새 유형인가 — `notifications`에는 URL 컬럼이 없어서 **목적지가 type으로만 정해진다**
-- (0078 설계 §2). 밀린 사람만 기록 탭(`/record?suggest=overtake`)으로 보내려면
-- `rank_change`(챌린지 탭)와 유형이 갈려야 한다.
--
-- 왜 meta인가 — 무엇을 담을지는 화면이 정하지만(서버가 종목을 싣지 않는다), **어떤 목표를
-- 겨냥한 제안이었는지**는 알림이 만들어진 순간에만 안다. 그 목표 종류 하나만 싣는다.
--   예: {"goal_type": "cardio_distance"}
--
-- 비파괴: nullable 컬럼 추가 + 허용목록에 1종 추가. 지금 Run해도 안전하다 —
--   운영에 떠 있는 앱은 이 유형을 모르고, 모르는 유형도 목록에는 뜬다(0088 주석).
--
-- ⚠️ 허용목록은 **목록 전체를 다시 쓰는** 방식이다(0078·0082·0088과 같은 수법).
--    아래는 0088이 확정한 25종 + `rank_drop`이다. 적용 전에 운영의 실제 제약 정의와
--    대조하라(`pg_get_constraintdef`) — 하나라도 빠지면 그 유형의 알림이 조용히 죽는다.
--
-- 되돌리기(순서가 있다): ⓐ `delete from notifications where type='rank_drop';`
--   ⓑ 그 다음 허용목록에서 `rank_drop`을 빼고 다시 Run. ⓒ `alter table ... drop column meta`.
--   ⚠ ⓑ를 먼저 하면 이미 저장된 행 때문에 제약 위반으로 실패한다.

begin;

alter table public.notifications
  add column if not exists meta jsonb;

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
    'workout_suggestion',                                -- 0078
    'comment_received',                                  -- 0082
    'challenge_cancelled', 'challenge_joined',           -- 0088
    'rank_drop'                                          -- 0123 <- 새것
  ));

commit;

notify pgrst, 'reload schema';

-- ── 적용 확인 ────────────────────────────────────────────────
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='notifications' and column_name='meta';   -- 1
--   select pg_get_constraintdef(oid) like '%rank_drop%' from pg_constraint
--    where conname='notifications_type_check';                                            -- true
--   (기존 24종이 그대로인지는 적용 전 정의와 비교한다)
