-- 0034: 알림 type에 'app_update'(배포·업데이트 소식) 추가
-- 적용: SQL Editor에 붙여넣고 Run. 여러 번 돌려도 안전(제약 재정의만).
--
-- 왜: 배포 내용을 알림으로 띄우고 클릭 시 /whats-new 상세로 보내기 위한 새 알림 유형.
--     notifications_type_check가 허용 목록 방식이라, 새 type을 쓰려면 목록에 더해야 한다.
-- 0022~0033은 수정 금지. 이 파일이 다음 번호(0034).

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'workout_started', 'cheer_received', 'poke', 'reaction_received',
    'rank_change', 'record_viewed', 'morning_briefing',
    'challenge_started', 'challenge_ended', 'record_beaten', 'badge_earned',
    'level_up', 'app_update'
  ));
