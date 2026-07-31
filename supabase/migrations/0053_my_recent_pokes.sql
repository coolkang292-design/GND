-- 0053: 내가 최근 24시간 안에 찌른 상대 목록
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0052는 수정 금지.
--
-- 왜 필요한가. 홈 크루 카드의 "✅ 찌름" 표시가 **화면이 기억하는 값**뿐이었다.
-- 앱을 껐다 켜면 그 기억이 사라져, 이미 찌른 사람에게도 콕 버튼이 다시
-- 눌리는 것처럼 보였다. 눌러 봐야 서버가 poke_cooldown으로 막으니 헛걸음만
-- 하게 된다. (2026-07-31 사용자 보고)
--
-- 화면이 서버에 물어볼 방법이 없었다. 찌른 기록은 notifications에 남는데
-- notifications_select_own(0011:153)이 `user_id = auth.uid()` — **받는 사람만**
-- 읽게 한다. 내가 보낸 콕은 상대방 앞으로 된 행이라 내가 못 읽는다.
--
-- 정책을 넓히는 대신(그러면 내가 actor인 모든 알림이 열린다) 필요한 것만
-- 돌려주는 정의자 함수를 둔다. 나가는 값은 상대 uuid뿐이다.

begin;

-- ⚠ 쿨다운 조건은 poke_user(현행 0039:67-71)와 **글자 그대로 같아야 한다.**
--    여기만 '12 hours'로 바꾸면 화면은 "찌를 수 있다"는데 서버는 막는,
--    지금 고치려는 것과 똑같은 어긋남이 반대 방향으로 생긴다.
--    poke_user의 조건을 바꿀 일이 생기면 이 함수도 같이 바꿔라.
create or replace function public.get_my_recent_pokes()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select n.user_id
  from public.notifications n
  where n.type = 'poke'
    and n.actor_id = (select auth.uid())
    and n.created_at > now() - interval '24 hours'
$$;

revoke all on function public.get_my_recent_pokes() from public, anon;
grant execute on function public.get_my_recent_pokes() to authenticated;

commit;

-- PostgREST 스키마 캐시 리로드. 새 함수라 이게 없으면 앱이 PGRST202로 받는다.
notify pgrst, 'reload schema';

-- 적용 확인 (SQL Editor에서 따로 실행):
--   select proname, pg_get_function_result(oid) from pg_proc
--   where proname = 'get_my_recent_pokes';
--   → setof uuid
--
--   select count(*) from notifications
--   where type = 'poke' and created_at > now() - interval '24 hours';
--   → 이 값이 0이면 아직 아무도 안 찔렀다는 뜻이라 화면 확인이 무의미하다.
--     먼저 콕을 한 번 보낸 뒤 확인할 것.
