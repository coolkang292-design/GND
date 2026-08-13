-- 0074: 내 루틴이 인터벌 코스를 기억한다 (사용자 지시 2026-08-13)
-- 적용: 사용자가 Supabase SQL Editor에서 이 파일 전체를 한 번 Run한다.
--
-- 왜: 인터벌을 루틴으로 저장하면 **맨몸 4종목만** 남았다. 다시 불러오면
--     음원도 코스도 없는 일반 운동이 된다 — 예정표(0059)와 지난 기록(2026-08-07)은
--     이미 코스를 싣고 다니는데 루틴만 안 실었다. 같은 운동을 어디서 부르느냐에
--     따라 결과가 달라지는 그 문제다.
--
-- 무엇을 더하나
--   · `workout_routines.tabata_minutes smallint` — null 또는 4·8·16
--
-- ⚠️ **컬럼 하나만 더한다.** RLS·인덱스·트리거는 손대지 않는다. 기존 루틴은
--    전부 null이라 지금과 똑같이 동작한다 (null = 일반 운동).
--
-- ⚠️ 값 목록은 `workout_plans.tabata_minutes`(0059)와 **같아야 한다.** 한쪽만
--    늘리면 루틴으로는 저장되는데 예정표로는 안 되는 코스가 생긴다.
--
-- ⚠️ 배포 순서: 이 SQL을 먼저 Run하고 앱을 배포한다. 반대로 하면 저장할 때
--    없는 컬럼을 쓰려다 실패한다.

begin;

alter table public.workout_routines
  add column if not exists tabata_minutes smallint;

alter table public.workout_routines
  drop constraint if exists workout_routines_tabata_minutes_check;
alter table public.workout_routines
  add constraint workout_routines_tabata_minutes_check
  check (tabata_minutes is null or tabata_minutes in (4, 8, 16));

comment on column public.workout_routines.tabata_minutes is
  '전신 인터벌 코스 분수 (4·8·16). null이면 일반 운동 루틴이다. 0059의 workout_plans.tabata_minutes와 같은 규칙.';

commit;

-- ── 적용 확인 (Run 뒤 따로 실행) ────────────────────────────
--
-- 1) 컬럼이 생겼는가 → 1행이어야 한다
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'workout_routines'
--    and column_name = 'tabata_minutes';
--
-- 2) 제약이 4·8·16만 받는가
-- select pg_get_constraintdef(c.oid)
--   from pg_constraint c
--   join pg_class t on t.oid = c.conrelid
--   join pg_namespace n on n.oid = t.relnamespace
--  where n.nspname = 'public'
--    and t.relname = 'workout_routines'
--    and c.conname = 'workout_routines_tabata_minutes_check';
--
-- 3) 기존 루틴이 전부 null인가 → 0행이어야 한다 (아직 아무도 안 넣었다)
-- select count(*) from public.workout_routines where tabata_minutes is not null;
