-- 0110 — 목표를 다 세우면 "M/D부터 시작해요" 알림 (사용자 결정 D4, 2026-09-18)
--
-- ⓘ 비파괴 변경이다(새 함수 + grant). drop·delete·revoke(기존 권한)·기존 행 update가 없다.
--
-- **사용자 결정 D4:** 모집 기간(= 시작일 전, `setup`) 안에 목표를 다 세운 사람은
--   ① 그 자리에서 "며칠부터 시작해요" 알림을 받고
--   ② 시작일이 되면 알림과 함께 자동으로 시작한다.
--
-- ②는 **이미 있다** — 이 파일이 새로 만드는 것은 ①뿐이다.
--   · 시작일 전날 09시: `remind_upcoming_challenges` → "내일 챌린지가 시작돼요"
--   · 시작일:          `autostart_due_challenges` → 목표 없는 사람은 dropped,
--                      남은 사람에게 "🏁 챌린지가 시작됐어요"
--
-- **왜 트리거가 아니라 RPC인가.** `saveMyGoals`는 DELETE 후 INSERT라 트리거면
--   행마다 불린다(dedupe로 막을 수는 있다). 더 큰 이유는 **트리거는 REST로도
--   스키마 스냅샷으로도 안 보인다**는 것이다(CLAUDE.md — 0090 트리거 두 개가 그랬다).
--   저장 경로는 `saveMyGoals` 하나뿐이라 거기서 부르면 된다.
--
-- **알림 유형은 새로 만들지 않는다.** `challenge_starting_soon`(0077)을 쓴다 —
--   아이콘 ⏰, 딥링크 `/challenge?open=<챌린지 id>`가 이미 붙어 있다(`push.ts`).
--   `notifications_type_check`를 넓히지 않아도 된다.
--   중복은 `dedupe_key`가 막는다. 전날 예고(`challenge_starting_soon:<cid>:<uid>`)와
--   **접두어가 달라서** 둘 다 간다 — 목표 완료 알림은 챌린지당 한 번뿐이다
--   (목표를 고쳐 다시 저장해도 또 가지 않는다).

begin;

create or replace function public.notify_challenge_goal_ready(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_me    uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  c       public.challenges;
  v_title text;
  v_n     int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into c from public.challenges where id = p_challenge_id;

  -- 참가(joined)한 사람만. invited·dropped·남의 챌린지는 존재 자체를 숨긴다.
  if not found or not exists (
    select 1 from public.challenge_participants cp
     where cp.challenge_id = p_challenge_id
       and cp.user_id = v_me
       and cp.status = 'joined'
  ) then
    raise exception 'challenge_not_found';
  end if;

  -- 모집 기간(setup)에만. 시작한 뒤에 "며칠부터 시작해요"는 거짓말이다.
  -- 오류가 아니라 '안 보냄'으로 돌려준다 — 저장은 이미 성공했다.
  if c.status <> 'setup' then
    return jsonb_build_object('sent', false, 'reason', 'not_setup');
  end if;

  -- 목표가 실제로 있어야 "목표 설정 완료"다. 화면을 믿지 않는다.
  if not exists (
    select 1 from public.user_goals ug
     where ug.challenge_id = p_challenge_id and ug.user_id = v_me
  ) then
    raise exception 'no_goals';
  end if;

  -- 시작일이 오늘 이전이어도 setup일 수 있다(크론 전). 그때는 '오늘'이라 말한다 —
  -- 다음 화면 진입이나 09시 크론이 곧 시작시킨다.
  v_title := case
    when c.start_date <= v_today     then '오늘 챌린지가 시작돼요 🏁'
    when c.start_date = v_today + 1  then '내일부터 챌린지가 시작돼요 🏁'
    else to_char(c.start_date, 'FMMM/FMDD') || '부터 챌린지가 시작돼요 🏁'
  end;

  insert into public.notifications
    (user_id, actor_id, type, reference_id, title, body, dedupe_key)
  values (
    v_me, null, 'challenge_starting_soon', c.id,
    v_title,
    c.name || ' · 목표 설정 완료! 시작하면 다시 알려드릴게요',
    'challenge_goal_ready:' || c.id::text || ':' || v_me::text
  )
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;

  return jsonb_build_object('sent', v_n > 0, 'startDate', c.start_date);
end
$function$;

revoke all on function public.notify_challenge_goal_ready(uuid) from public, anon;
grant execute on function public.notify_challenge_goal_ready(uuid) to authenticated;

commit;

-- 적용 후 확인:
--   select proname, prosecdef, proconfig, proacl from pg_proc
--    where proname = 'notify_challenge_goal_ready';
