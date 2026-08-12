-- 0067: 프로그램 운동 진행 보존과 세트 노력 피드백
-- 설계: docs/superpowers/plans/2026-08-12-program-guided-workout.md
-- 적용: 사용자 승인 뒤 SQL Editor에 전체 붙여넣기 -> Run.
--       (드롭/생성을 전부 if exists로 감쌌으므로 두 번 Run해도 안전하다.)
--
-- ⚠️ 이 파일이 적용되기 전에는 실 DB 검사 스크립트를 돌리지 않는다.
-- ⚠️ 적용 뒤에는 `pnpm db:snapshot`으로 docs/db-current-schema.sql을 다시 뽑아라.
--    현재 스냅샷은 0066 **적용 전** 것이라 program_enrollments가 들어 있지 않다.
--
-- 무엇을 왜 넣는가
--
--  ① workout_sessions에 프로그램 메타 4개
--     18회 진행률의 원천이 `workout_plans`뿐이면, 사용자가 완료한 계획 행을
--     지우는 순간 "몇 회차까지 했는지"가 사라진다. 완료 시점에 세션으로
--     **복사**해 두면 계획 행이 없어도 진행률이 남는다.
--
--  ② workout_sets.effort_feedback
--     다음 회차 권장 무게(`nextProgramLoad`)의 유일한 입력이다. 로컬 draft에만
--     두면 앱을 지우거나 기기를 바꾼 순간 추천이 처음으로 되돌아간다.

begin;

-- ── ① enrollment 소유 확인 헬퍼 ─────────────────────────────
-- 정책 식은 호출자 권한으로 돈다. program_enrollments의 SELECT 정책에 기대는
-- 대신 owns_workout_session과 같은 security definer 헬퍼로 명시한다.

create or replace function public.owns_program_enrollment(eid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from program_enrollments
    where id = eid and user_id = auth.uid()
  )
$function$;

comment on function public.owns_program_enrollment(uuid) is
  '이 프로그램 등록이 현재 사용자 것인가. workout_sessions insert 정책이 쓴다.';

grant execute on function public.owns_program_enrollment(uuid) to authenticated;

-- ── ② 완료 세션에 남기는 프로그램 진행 ──────────────────────
-- 컬럼 이름·제약은 0066의 workout_plans와 **같은 모양**으로 맞춘다.
-- 두 곳이 갈리면 계획→세션 복사에서 조용히 잘린다.

alter table public.workout_sessions
  add column if not exists program_enrollment_id uuid
    references public.program_enrollments (id) on delete set null,
  add column if not exists program_week smallint
    check (program_week between 1 and 6),
  add column if not exists program_session smallint
    check (program_session between 1 and 3),
  add column if not exists program_template_version int
    check (program_template_version between 1 and 10000);

-- FK가 ON DELETE SET NULL이라 등록을 지우면 왼쪽이 null이 되고 제약은 통과한다
-- (0066 workout_plans_program_meta_complete와 같은 규칙).
alter table public.workout_sessions
  drop constraint if exists workout_sessions_program_meta_complete;
alter table public.workout_sessions
  add constraint workout_sessions_program_meta_complete check (
    program_enrollment_id is null
    or (
      program_week is not null
      and program_session is not null
      and program_template_version is not null
    )
  );

-- 18회 중 몇 회를 마쳤는지 세는 질의용. 프로그램 세션만 담는 부분 인덱스다.
create index if not exists workout_sessions_program_progress
  on public.workout_sessions (program_enrollment_id, program_week, program_session)
  where program_enrollment_id is not null;

comment on column public.workout_sessions.program_enrollment_id is
  '이 운동이 속한 공식 프로그램 등록. 계획 행을 지워도 진행률이 남는다 (0067).';

-- 0004는 컬럼 목록 grant 방식이다. 새 컬럼은 별도 grant가 없으면 insert가 막힌다
-- (0019 tabata_minutes와 같은 이유). 시작할 때 한 번만 쓰므로 update는 주지 않는다.
grant insert (
  program_enrollment_id,
  program_week,
  program_session,
  program_template_version
) on public.workout_sessions to authenticated;

-- ── ③ 남의 등록을 자기 세션에 붙이지 못하게 ─────────────────
-- 기존 check를 그대로 두고 enrollment 소유 조건만 더한다.
-- 현행 정의 출처: docs/db-current-schema.sql `sessions_insert_own_draft`
--   ((user_id = auth.uid()) AND (status = 'draft') AND (started_at IS NULL)
--    AND (completed_at IS NULL) AND ((group_id IS NULL) OR is_group_member(...)))

drop policy if exists "sessions_insert_own_draft" on public.workout_sessions;
create policy "sessions_insert_own_draft" on public.workout_sessions
  for insert with check (
    user_id = auth.uid()
    and status = 'draft'
    and started_at is null
    and completed_at is null
    and (group_id is null or public.is_group_member(group_id, auth.uid()))
    and (
      program_enrollment_id is null
      or public.owns_program_enrollment(program_enrollment_id)
    )
  );

-- ── ④ 세트 노력 피드백 ──────────────────────────────────────
-- 값은 src/lib/domain/program-load.ts의 EffortFeedback과 같아야 한다.
-- 한쪽만 바꾸면 저장이 400으로 막힌다.

alter table public.workout_sets
  add column if not exists effort_feedback text
    check (
      effort_feedback is null
      or effort_feedback in ('too_light', 'on_target', 'too_heavy')
    );

comment on column public.workout_sets.effort_feedback is
  '첫·마지막 세트에서 받은 체감. 다음 회차 권장 무게의 입력이다 (0067).';

-- 세트는 완료 시점에 한 번 insert된다. 나중에 고치는 경로가 없으므로 update는
-- 주지 않는다 — 필요해지면 그때 새 번호 파일에서 grant한다.
grant insert (effort_feedback) on public.workout_sets to authenticated;

commit;

-- ── 적용 확인 (Run 뒤 아래를 따로 실행해 결과를 확인한다) ────
--
-- 1) 컬럼 5개가 생겼는가 → 5행
-- select table_name, column_name
--   from information_schema.columns
--  where (table_name = 'workout_sessions'
--         and column_name in ('program_enrollment_id', 'program_week',
--                             'program_session', 'program_template_version'))
--     or (table_name = 'workout_sets' and column_name = 'effort_feedback')
--  order by table_name, column_name;
--
-- 2) insert 권한이 붙었는가 → 5행
-- select table_name, column_name
--   from information_schema.column_privileges
--  where grantee = 'authenticated' and privilege_type = 'INSERT'
--    and ((table_name = 'workout_sessions' and column_name like 'program\_%')
--         or (table_name = 'workout_sets' and column_name = 'effort_feedback'))
--  order by table_name, column_name;
--
-- 3) update 권한은 안 붙었는가 → 0행이어야 한다
-- select table_name, column_name
--   from information_schema.column_privileges
--  where grantee = 'authenticated' and privilege_type = 'UPDATE'
--    and ((table_name = 'workout_sessions' and column_name like 'program\_%')
--         or (table_name = 'workout_sets' and column_name = 'effort_feedback'));
--
-- 4) insert 정책에 enrollment 조건이 들어갔는가 → 1행
-- select policyname, with_check
--   from pg_policies
--  where tablename = 'workout_sessions'
--    and policyname = 'sessions_insert_own_draft';
