-- 0041: 응원 포인트 — 보낸 사람에게 10P, 같은 상대에게 KST 하루 1회
-- 설계: docs/superpowers/specs/2026-07-29-cheer-points-design.md
-- 계획: docs/superpowers/plans/2026-07-29-cheer-points.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0040은 수정 금지.
--
-- ⚠ 부분 선택 실행 금지. send_cheer를 드롭했다가 다시 만들기 때문에,
--    중간에 끊기면 응원 기능이 없는 상태로 남는다. 파일 전체를 한 번에 Run하면
--    한 트랜잭션으로 처리되어 그 창이 생기지 않는다.

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
    v_points := public.award_points(
      auth.uid(), 10, 'cheer_sent',
      'cheer',
      s.user_id::text || ':' || (now() at time zone 'Asia/Seoul')::date::text,
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
