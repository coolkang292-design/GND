-- 0105 — 마지막 사진을 지웠을 때 인증 상태를 되돌린다 (0103·0104 다음)
--
-- ⓘ 비파괴 변경이다(새 함수 + grant). CLAUDE.md §DB 마이그레이션의 "그냥 실행한다"
--   칸에 해당한다. drop·delete·revoke·기존 행 update 가 없다.
--
-- **왜 필요한가 — 계획서의 가정이 틀렸다.**
-- 2026-09-10 계획서 §1-2(d)는 "workout_sessions 에 sessions_update_own 정책이 있으니
-- 클라가 verification_status 를 직접 되돌릴 수 있다"고 적었다. 정책은 맞지만
-- **0096 이 컬럼 단위 UPDATE grant 를 좁혀 놨다** — authenticated 가 쓸 수 있는 칸은
--   deleted_at · group_id · intensity · memo · timezone · title · visibility · workout_type
-- 여덟 개뿐이고 verification_status 는 없다. 정책이 통과해도 grant 에서 막힌다.
--
-- ⛔ **그렇다고 grant 를 넓히지 않는다.** verification_status 를 클라가 쓸 수 있게 되면
--    사진 한 장 없이 'camera_verified' 를 박아 넣을 수 있다 — 인증이라는 말이 무의미해진다.
--    set_workout_verification 이 SECURITY DEFINER 인 이유가 정확히 그것이다.
--
-- **왜 그냥 두면 안 되는가.** 사진을 전부 지웠는데 상태가 남으면
--   ① 달력·피드 스탬프가 🔥 를 계속 그린다 (화면이 거짓말한다)
--   ② 챌린지 집계는 exists(workout_images) 를 보므로 빠진다 → 서버와 화면이 어긋난다
-- 계획 §9 의 "서버와 화면의 인증 상태가 어긋나면 안 된다"가 이 둘을 금지한다.

begin;

create or replace function public.clear_workout_verification(p_session_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  s public.workout_sessions;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  select * into s from public.workout_sessions
   where id = p_session_id and user_id = (select auth.uid())
   for update;
  if not found then
    raise exception 'session_not_found';
  end if;

  -- ⛔ **이 함수는 내려가기만 한다.** 사진이 한 장이라도 남아 있으면 거절한다.
  --    그래서 "인증을 지우고 다시 올려 등급을 바꾸는" 식으로 악용할 수 없고,
  --    실수로 불러도 멀쩡한 인증을 못 지운다. set_workout_verification 이
  --    image_not_found 로 올라가는 것을 막는 것과 정확히 대칭이다.
  if exists (
    select 1 from public.workout_images
     where session_id = p_session_id and user_id = (select auth.uid())
  ) then
    raise exception 'photo_still_exists';
  end if;

  update public.workout_sessions
     set verification_status = 'none',
         verification_source = null,
         server_uploaded_at  = null,
         client_captured_at  = null
   where id = p_session_id
   returning * into s;

  return s;
end
$function$;

revoke all on function public.clear_workout_verification(uuid) from public, anon;
grant execute on function public.clear_workout_verification(uuid) to authenticated;

commit;

-- 적용 후 확인:
--   select proname, prosecdef, proconfig, proacl from pg_proc
--    where proname = 'clear_workout_verification';
