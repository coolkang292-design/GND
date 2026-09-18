-- 0109 — 챌린지 퍼널 이벤트 3종 (챌린지 목표 단순화 2026-09-18)
--
-- ⓘ 제약을 **넓히기만** 한다. 기존 5종은 그대로다. `drop constraint`가 들어가서
--   **사용자 승인 후** 적용했다. `analytics_events_insert_own` 정책은 건드리지 않는다.
--
-- ⛔ **DB가 이미 아는 것은 여기 기록하지 않는다** (0093의 원칙, `analytics-events.ts`).
--    그래서 계획서가 검토한 7개 중 4개는 뺐다 —
--      챌린지 생성 = challenges.created_by · created_at
--      참가       = challenge_participants.joined_at
--      목표 저장   = user_goals (행 존재)
--      첫 운동     = workout_sessions (챌린지 기간 안)
--    남은 3개는 **눌렀지만 끝내지 않은 것**이라 기존 테이블에 흔적이 없다.
--
-- ⚠️ `unique (user_id, event_name)`이라 **사용자당 평생 1번**만 남는다.
--    "이 사람이 한 번이라도 X를 해 봤나"를 세는 퍼널이다. 횟수가 아니다.

begin;

alter table public.analytics_events
  drop constraint analytics_events_event_name_check;

alter table public.analytics_events
  add constraint analytics_events_event_name_check check (
    event_name = any (array[
      'landing_opened',
      'onboarding_started',
      'identity_link_started',
      'identity_link_failed',
      'challenge_viewed',
      'challenge_create_started', -- 0109: 만들기 화면을 열었다 (만들었는지는 challenges가 안다)
      'challenge_share_started',  -- 0109: 초대 공유를 눌렀다 (링크로 누가 왔는지는 participants가 안다)
      'challenge_goal_started'    -- 0109: 목표 화면을 열었다 (저장했는지는 user_goals가 안다)
    ]::text[])
  );

commit;

-- 적용 후 확인:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'analytics_events_event_name_check';
