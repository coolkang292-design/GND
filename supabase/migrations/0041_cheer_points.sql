-- 0041: 응원 포인트 — 보낸 사람에게 10P, 같은 상대에게 KST 하루 1회
-- 설계: docs/superpowers/specs/2026-07-29-cheer-points-design.md
-- 계획: docs/superpowers/plans/2026-07-29-cheer-points.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0040은 수정 금지.
--
-- ⚠ 부분 선택 실행 금지. send_cheer를 드롭했다가 다시 만들기 때문에,
--    중간에 끊기면 응원 기능이 없는 상태로 남는다. 이 파일은 begin;~commit;으로
--    명시적으로 감싼다 — "전체를 붙여넣으면 한 트랜잭션"이라는 건 simple query
--    protocol의 동작이라 클라이언트에 따라 달라질 수 있어, 여기 기대지 않는다.
--    명시적 트랜잭션은 부분 실행도 막는다: begin;부터 잘린 조각은 커밋되지
--    않고, begin; 없이 뒷부분만 돌리면 남는 commit;에서 에러가 나 그 자리에
--    멈춘다. 어느 쪽이든 절반만 적용되는 일은 없다.
--
-- 되돌리기(하는 법): 0039_crew_link_switchover.sql:509-579를 그대로 다시
--    붙여넣어 send_cheer를 public.cheers 반환으로 되돌리고,
--    point_transactions_reason_check를 5개 값(cheer_sent 제외)으로 되돌리면
--    된다. 위험은 낮다 — 현재 배포된 클라이언트는 RPC 응답 바디를 버리고
--    에러 여부만 보므로, 예전의 단순 cheers 반환 모양으로 돌아가도 그대로
--    잘 동작한다.

begin;

-- ── 1. 포인트 사유에 cheer_sent 추가 ─────────────────────────
-- ⚠ 기존 5개 값을 하나도 빠뜨리면 안 된다. 빠뜨리면 그 값을 쓰는 기존 지급이
--    조용히 죽는다 (workout_completed·badge_earned는 매일 쓰인다).
alter table public.point_transactions
  drop constraint if exists point_transactions_reason_check;
alter table public.point_transactions
  add constraint point_transactions_reason_check check (reason in (
    'workout_completed', 'badge_earned', 'item_purchase',
    'refund', 'admin_adjustment',
    'cheer_sent'                                     -- 0041
  ));

-- ── 2. send_cheer 재정의 ─────────────────────────────────────
-- 현행 정의는 0039:509다(0011:319가 아니다). 아래는 그 본문에
--   (a) 포인트 지급 블록 (예외 격리)
--   (b) 반환 타입 변경 public.cheers → jsonb
-- 두 가지만 얹은 것이다. 바뀐 줄에 -- 0041 주석을 달았다.
--
-- 반환 타입이 바뀌므로 create or replace로는 안 되고 drop이 먼저다.
drop function if exists public.send_cheer(uuid, text, text);

create function public.send_cheer(
  p_session_id uuid, p_cheer_type text, p_message text default null
) returns jsonb                                      -- 0041: cheers → jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s workout_sessions;
  c cheers;
  v_count int;
  v_last timestamptz;
  v_nick text;
  v_wants boolean;
  v_points int := 0;                                 -- 0041
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from workout_sessions where id = p_session_id;

  -- 0039: 그룹 소속 → 크루 연결. group_id 조건도 함께 뺀다.
  --
  -- ⚠ 판정을 세 토막으로 나눈 이유. 옛 is_group_member(s.group_id, auth.uid())는
  --   세션 주인 본인에게 true라 본인 응원 시도가 이 관문을 통과해 아래
  --   own_session에 걸렸다. is_crew_with는 자기 자신에게 항상 false라, 한 덩어리로
  --   두면 본인 시도가 own_session이 아니라 session_not_found로 나가고 own_session
  --   블록이 도달 불가능한 죽은 코드가 된다.
  --   scripts/rls-test.mjs:403 "본인 세션 응원 금지 (own_session)"이 이걸 잡는다.
  if not found or s.visibility <> 'group' then
    raise exception 'session_not_found';
  end if;
  if s.user_id = auth.uid() then
    raise exception 'own_session';
  end if;
  if not public.is_crew_with(s.user_id) then
    raise exception 'session_not_found';
  end if;
  if s.status <> 'active' then
    raise exception 'not_active';
  end if;

  select count(*), max(created_at) into v_count, v_last
  from cheers where session_id = p_session_id and sender_id = auth.uid();

  if v_count >= 3 then
    raise exception 'cheer_limit';
  end if;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    raise exception 'cheer_cooldown';
  end if;

  insert into cheers (session_id, sender_id, receiver_id, cheer_type, message)
  values (p_session_id, auth.uid(), s.user_id, p_cheer_type, p_message)
  returning * into c;

  -- ⬇ 0041: 포인트 지급. 실패해도 응원을 취소하지 않는다.
  --
  -- 감싸는 이유: award_points가 예상 못 한 오류를 내면 전체 트랜잭션이
  -- 롤백되어 위의 cheers insert까지 사라진다. 설계 D5는 "포인트가 안 나가도
  -- 응원은 성공"이다.
  --
  -- 하루 1회 상한은 여기 코드가 아니라 원장의 유니크 인덱스가 만든다
  -- (0031:77 — user_id, reason, source_type, source_id). source_id를
  -- "받는사람:KST날짜"로 잡았으므로 그날 두 번째 호출은 유니크 충돌이 되고
  -- award_points가 그걸 잡아 0을 반환한다(0032:96). 즉 아래 exception 블록에
  -- 걸리는 것은 그 밖의 예외뿐이다.
  --
  -- ⚠ 격리 범위는 이 호출 하나뿐이다. 넓히면 위의 권한·상태 검사 실패까지
  --    삼켜서 비크루가 응원에 성공하게 된다.
  begin
    -- to_char로 날짜를 굳이 문자열화하는 이유: date::text는 DateStyle GUC를
    -- 거친다. 기본값(ISO, MDY)에서는 2026-07-29가 나오지만 세션의 DateStyle이
    -- SQL이나 German이면 07/29/2026처럼 다르게 나와, 같은 KST 하루인데
    -- source_id가 갈려 하루 상한이 조용히 2회로 늘어난다. to_char은 GUC와
    -- 무관하게 고정 포맷을 낸다 — 0032:116(evaluate_badges)의 v_today와 동일한
    -- 이유로 동일한 방식을 쓴다.
    v_points := public.award_points(
      auth.uid(), 10, 'cheer_sent',
      'cheer',
      s.user_id::text || ':' || to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'),
      null::numeric,
      jsonb_build_object('session_id', p_session_id, 'cheer_type', p_cheer_type));
  exception when others then
    v_points := 0;
    -- warning은 트랜잭션을 중단시키지 않으면서 Postgres 로그에 남는다.
    -- 조용히 삼키면 지급이 언제부터 멈췄는지 아무도 모른다.
    raise warning 'cheer_points_failed: sender=% receiver=% sqlstate=% msg=%',
      auth.uid(), s.user_id, sqlstate, sqlerrm;
  end;

  -- 수신자가 응원 알림을 꺼둔 경우: 응원 행은 남기고 알림만 생략
  select coalesce(ns.cheers, true) into v_wants
  from (select true) one
  left join notification_settings ns on ns.user_id = s.user_id;

  if v_wants then
    select nickname into v_nick from profiles where id = auth.uid();
    perform notify(
      s.user_id, auth.uid(), 'cheer_received', c.id,
      coalesce(v_nick, '크루원') || '님의 응원 📣',
      coalesce(p_message, p_cheer_type)
    );
  end if;

  -- 0041: 클라이언트가 지급 여부를 추측하지 않도록 실제 결과를 함께 돌려준다.
  return jsonb_build_object('cheer', to_jsonb(c), 'points_awarded', v_points);
end $$;

-- ⚠ drop이 권한도 함께 지웠으므로 반드시 다시 준다.
revoke execute on function public.send_cheer(uuid, text, text) from anon, public;
grant execute on function public.send_cheer(uuid, text, text) to authenticated;

commit;

-- PostgREST는 함수 시그니처를 캐시한다. Supabase의 DDL 이벤트 트리거가
-- 스키마 캐시를 비동기로 재로딩하므로, 커밋 직후 짧은 창 동안 PostgREST가
-- 여전히 send_cheer가 public.cheers를 반환한다고 알고 있어 PGRST202로
-- 응답할 수 있다. 배포된 클라이언트는 응답 바디는 버려도 에러는 그대로
-- 보여주므로, 그 창에서 보낸 응원은 사용자에게 실패로 보인다. 재로딩을
-- 명시적으로 요청해 그 창을 최대한 좁힌다.
notify pgrst, 'reload schema';

-- ── 적용 전/후 확인 (SQL Editor에서 따로 실행) ────────────────
-- 이 마이그레이션이 조용히 반쪽만 성공할 수 있는 지점은 위 1번의
-- drop constraint if exists다. point_transactions_reason_check라는 이름이
-- Postgres가 실제로 생성한 이름과 다르면 drop이 조용히 no-op되고, add는
-- 새 이름으로 성공해 reason 제약이 2개가 된다. 그러면 옛 5개 값짜리 제약이
-- 여전히 살아 있어 'cheer_sent'를 거부하고, award_points가 check_violation을
-- 낸다 — 그런데 위에서 일부러 만든 exception 격리가 그 오류를 그대로
-- 삼킨다. 결과: 응원은 정상적으로 되고, 포인트만 영원히 0이고, HTTP는
-- 200이고, 화면 어디에도 이상 신호가 없다.
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.point_transactions'::regclass and contype = 'c';
--   → 정확히 2행. reason 쪽 이름이 point_transactions_reason_check가 아니면
--     위 drop이 조용히 no-op이 되고 제약이 3개가 된다. 그러면 award_points가
--     check_violation을 내는데 아래 exception 블록이 그걸 삼켜서, 응원은 되고
--     포인트만 영영 0이 된다 — 화면에는 아무 이상이 없어 보인다.
--
--   select p.proname, pg_get_function_result(p.oid), r.rolname as owner, p.proacl
--   from pg_proc p join pg_roles r on r.oid = p.proowner
--   where p.proname = 'send_cheer';
--   → jsonb · owner postgres · authenticated=X/postgres (PUBLIC 실행권 없음)
