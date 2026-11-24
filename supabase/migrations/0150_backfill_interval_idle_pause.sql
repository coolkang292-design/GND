-- 0150 · 8분 인터벌 운동 시간 소급 보정 (2026-11-25, 사용자 승인)
--
-- 원인: 인터벌 음원이 끝나는 순간 무동작 감지가 켜지면서 정지 시작이 5분 지점으로
--       거꾸로 찍혀, 8분 코스가 5분(paused_seconds ≈ 200)으로 기록됐다.
--       앱 수정은 use-idle-guard.ts (감지가 켜지는 순간부터 무동작 시계를 센다).
--
-- 대상: tabata_minutes = 8 · completed · paused_seconds > 0 · duration_minutes = 5 인 12건
--       (실제 경과 약 500초 → 8분). 4분 코스 1건(11/21, 정지 9초)은 다른 사정이라 제외.
-- 챌린지 점수는 저장값이 없고 workout_sessions.duration_minutes에서 계산되므로
-- 이 값만 고치면 따라온다. XP(xp_transactions)는 건드리지 않는다 (별도 결정).
-- workout_sessions_rank_check 트리거는 status 변경에만 반응하므로 알림은 가지 않는다.
--
-- 변경 전 값 (되돌릴 때 사용) — id · duration_minutes · paused_seconds
--   d3e68663-13c0-44b7-bb08-d2d912a87adb · 5 · 206   (2026-10-07)
--   29238024-cec6-45f6-bad3-70e9966d2a7b · 5 · 201   (2026-10-28)
--   0d18f494-2c5a-4a1c-84c9-b25b9d882b24 · 5 · 201   (2026-11-04)
--   950211a5-27f3-4fe3-a310-8a467c366889 · 5 · 201   (2026-11-09)
--   3a0cded0-e1de-4114-ac07-519ac6ffc255 · 5 · 201   (2026-11-10)
--   f0e851fc-a765-4f6a-ad7f-17fa99195ad3 · 5 · 201   (2026-11-11)
--   fc5470b4-0787-4654-8918-61d1df9ed4c8 · 5 · 201   (2026-11-15)
--   1d73c9c0-e598-48be-97ec-b539c721c3aa · 5 · 201   (2026-11-16)
--   7309a05f-f643-417e-8c65-cb41edcf608a · 5 · 201   (2026-11-17)
--   8ae011ce-d8df-4b66-8a66-b827f02d8b79 · 5 · 202   (2026-11-18)
--   37ace448-2f2b-4578-95aa-af9472d6af32 · 5 · 201   (2026-11-23)
--   37f32cc5-11f8-43c3-b195-49249533c840 · 5 · 200   (2026-11-24, 연습 계정 시험 기록)
--
-- 되돌리기: 위 표의 값으로 duration_minutes · paused_seconds를 다시 쓴다.

update public.workout_sessions
set duration_minutes = floor(extract(epoch from (completed_at - started_at)) / 60)::int,
    paused_seconds = 0
where id in (
  'd3e68663-13c0-44b7-bb08-d2d912a87adb',
  '29238024-cec6-45f6-bad3-70e9966d2a7b',
  '0d18f494-2c5a-4a1c-84c9-b25b9d882b24',
  '950211a5-27f3-4fe3-a310-8a467c366889',
  '3a0cded0-e1de-4114-ac07-519ac6ffc255',
  'f0e851fc-a765-4f6a-ad7f-17fa99195ad3',
  'fc5470b4-0787-4654-8918-61d1df9ed4c8',
  '1d73c9c0-e598-48be-97ec-b539c721c3aa',
  '7309a05f-f643-417e-8c65-cb41edcf608a',
  '8ae011ce-d8df-4b66-8a66-b827f02d8b79',
  '37ace448-2f2b-4578-95aa-af9472d6af32',
  '37f32cc5-11f8-43c3-b195-49249533c840'
)
  and tabata_minutes = 8
  and status = 'completed'
  and deleted_at is null
  and paused_seconds > 0
  and duration_minutes = 5;
