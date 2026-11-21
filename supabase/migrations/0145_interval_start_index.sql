-- 0145: 인터벌 블록이 순서표의 어디서 시작하는지 (설계 2026-11-22)
--
-- 지금까지 인터벌 세션은 "종목 0~3번 = 인터벌 블록, 4번~ = 이어하기"로 약속돼 있었다
-- (앱 코드 `src/lib/domain/tabata.ts`). 웨이트 → 인터벌 → 유산소처럼 블록이 가운데나
-- 뒤에 오려면 **시작 위치를 어딘가에 적어야** 한다. 이 칸이 그것이다.
--
--   NULL   = 0번부터 (이 칸이 생기기 전의 모든 인터벌 세션 · 일반 운동)
--   N >= 0 = N번부터 4개가 블록
--
-- ⚠️ 기존 행을 바꾸지 않는다. 빈 칸은 "0"으로 읽으므로 옛 기록 56건은 그대로다.
-- ⚠️ 시작할 때 한 번만 쓴다 (세션을 만들 때 insert). update 권한은 주지 않는다 —
--    0067(program_*)·0019(tabata_minutes)와 같은 이유: 운동 도중 바뀌면 저장된
--    `sort_order`와 어긋난다.
-- ⚠️ DB 함수는 이 칸을 읽지 않는다. 인터벌 판정은 계속 `tabata_minutes is not null`
--    한 칸이다(is_valid_workout·complete_workout_v2). 위치 규칙은 앱 코드에만 있다.

alter table public.workout_sessions
  add column if not exists interval_start_index smallint;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_interval_start_index_check;
alter table public.workout_sessions
  add constraint workout_sessions_interval_start_index_check
  check (
    interval_start_index is null
    or (interval_start_index between 0 and 60 and tabata_minutes is not null)
  );

comment on column public.workout_sessions.interval_start_index is
  '인터벌 블록(종목 4개)의 시작 위치(0부터). NULL이면 0번부터 — 이 칸이 생기기 전 기록 (0145).';

-- 0004는 컬럼 목록 grant 방식이다. 새 컬럼은 별도 grant가 없으면 insert가 막힌다.
grant insert (interval_start_index) on public.workout_sessions to authenticated;
