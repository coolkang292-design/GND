-- 0116: 지난 운동 계획은 기록으로 남긴다 — 수정·삭제·이동 모두 차단 (사용자 지시 2026-10-07)
--
-- 왜. 달력 월간 완료율은 완료일 / (완료일 ∪ 계획일)이다 (2026-10-07 e8fb579).
-- 놓친 계획을 지우거나 미래로 옮기면 분모가 줄어 완료율이 올라간다. 그래서
-- 어제 이전 계획은 고칠 수 없게 한다. 오늘 계획은 그날이 끝날 때까지 바꿀 수 있다.
--
-- 그 전에는: 수정은 RLS(plan_date >= 오늘)로 막혀 있었지만, 삭제 정책에는 날짜
-- 제한이 없었고, 지난 계획을 미래로 옮기는 것도 DB가 막지 않았다.
--
-- ⚠️ 이 파일은 **이미 운영에 적용된 것을 옮겨 적은 것이다.**
--    2026-10-07 다른 세션(GPT/Codex)이 Supabase MCP로 운영 DB에 직접 적용하고
--    파일·앱 코드를 남기지 못한 채 멈췄다. 다음 세션이 2026-10-07 21시경
--    `pnpm db:snapshot`으로 운영의 현행 정의를 뽑아 아래 두 함수를 그대로 옮겼다.
--    픽스처 A 계정으로 행동도 확인했다: 지난 계획 수정·날짜 변경·move RPC·삭제는
--    전부 `past_plan_locked`, 오늘 계획 수정·미래 이동은 성공, 오늘→어제는 `past_plan_date`.
--
-- ⚠️ [미검증] **트리거 이름과 이벤트.** 스냅샷은 함수·정책·인덱스만 뽑고
--    트리거 정의는 뽑지 않는다. 행동상 UPDATE·DELETE에 BEFORE ROW로 걸려 있는 것은
--    확인했지만 이름은 모른다. 아래 이름과 다르면 이 파일을 다시 돌릴 때 같은
--    함수를 부르는 트리거가 하나 더 생긴다(결과는 같지만 중복이다).
--    MCP가 있는 세션에서 `select tgname from pg_trigger where tgrelid =
--    'public.workout_plans'::regclass and not tgisinternal;`로 확인하고 맞춰라.
--
-- 앱 쪽 짝 (같은 날 배포): 달력이 지난 계획에서 삭제·날짜 이동·「남은 일정 다시
-- 잡기」를 숨기고, 거절 코드를 사람 말로 바꾼다 (`plan-save-error.ts`).

-- ── 1. 지난 계획 잠금 트리거 ──────────────────────────────────────
--
-- auth.uid()가 있을 때만 막는다 — 사용자 요청(직접 쿼리든 SECURITY DEFINER
-- RPC든)이 대상이다. 서비스 키·관리 작업(계정 정리 cascade 등)은 통과한다.
--
-- 예외 하나: 원본 세션을 지우면 `source_session_id`가 FK `on delete set null`로
-- 비워진다. 그 UPDATE까지 막으면 지난 세션을 지울 수 없게 되므로, **그 칸만**
-- 바뀐 UPDATE는 통과시킨다.
create or replace function public.guard_past_workout_plan()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_today date;
begin
  -- A deleted source workout may clear its FK without changing the saved plan.
  if tg_op = 'UPDATE' and old.source_session_id is not null
    and new.source_session_id is null
    and (to_jsonb(new) - 'source_session_id' - 'updated_at') =
        (to_jsonb(old) - 'source_session_id' - 'updated_at') then
    return new;
  end if;
  if auth.uid() is not null then
    select (now() at time zone coalesce(p.timezone, 'Asia/Seoul'))::date
      into v_today from public.profiles p where p.id = old.user_id;
    v_today := coalesce(v_today, (now() at time zone 'Asia/Seoul')::date);
    if old.plan_date < v_today then
      raise exception 'past_plan_locked' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and new.plan_date < v_today then
      raise exception 'past_plan_date' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

-- [미검증] 이름 — 위 머리말 참조
create or replace trigger guard_past_workout_plan
  before update or delete on public.workout_plans
  for each row execute function public.guard_past_workout_plan();

-- ── 2. 프로그램 그만두기는 오늘 이후 회차만 지운다 ─────────────────
--
-- 예전에는 그 등록의 계획을 전부 지웠다 — 그만두기가 놓친 회차를 지우는
-- 우회로였다. 이제 지난 회차는 남고, 트리거와도 충돌하지 않는다.
create or replace function public.cancel_program_enrollment(p_enrollment_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_removed int;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- 같은 사용자의 등록 RPC와 한 줄로 세운다 — 취소와 재등록이 겹치면
  -- 계획을 지우는 중에 새 계획이 들어올 수 있다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select status into v_status
  from public.program_enrollments
  where id = p_enrollment_id and user_id = v_user_id
  for update;
  if not found then
    -- 남의 등록도 여기로 온다 — 존재 여부를 알려 주지 않는다
    raise exception 'program_enrollment_not_found';
  end if;
  if v_status <> 'active' then
    raise exception 'program_not_active';
  end if;

  delete from public.workout_plans
  where program_enrollment_id = p_enrollment_id
    and user_id = v_user_id
    and plan_date >= (now() at time zone coalesce(
      (select timezone from public.profiles where id = v_user_id), 'Asia/Seoul'
    ))::date;
  get diagnostics v_removed = row_count;

  -- ⚠️ `cancelled_at`을 같이 채운다. 0066의 check가 둘을 묶어 두었다 —
  --    상태만 바꾸면 행 전체가 거절된다.
  update public.program_enrollments
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_enrollment_id and user_id = v_user_id;

  return v_removed;
end;
$function$;
