-- 0104 — 사진 삭제·재정렬에 필요한 권한 (0103 다음)
--
-- ⚠️ 사용자 승인 후 적용. drop 은 없지만 **권한을 넓히는** 변경이라 0096 이
--    좁혀 둔 면을 건드린다. 무엇이 왜 열리는지 아래 근거를 읽고 승인할 것.

begin;

-- ── 1. 순서 바꾸기 ────────────────────────────────────────────────
--
-- **왜 RPC 인가 — UPDATE 권한을 안 열기 위해서다.**
-- 실측(2026-09-10): authenticated 는 workout_images 에 SELECT·DELETE 와
-- 컬럼 단위 INSERT 만 갖고 있고 **UPDATE grant 도 UPDATE 정책도 없다.**
-- 클라가 직접 순서를 바꾸려면 둘 다 새로 열어야 하는데, 그러면
--   ① 브라우저에서 오는 임의의 PATCH 를 정책 하나로 막아야 하고
--   ② PostgREST 로는 두 행 맞바꾸기가 두 트랜잭션이라 23505 로 깨진다
-- 이 함수는 한 트랜잭션 안에서 전량을 다시 매겨서 둘 다 해결한다.
-- 결과적으로 **테이블 권한은 0096 상태 그대로 남는다.**
create or replace function public.reorder_workout_images(
  p_session_id uuid,
  p_image_ids  uuid[]
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_len   int := coalesce(array_length(p_image_ids, 1), 0);
  v_count int;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  -- 남의 세션은 존재조차 알려주지 않는다 (기존 RPC 들과 같은 문구)
  if not public.owns_workout_session(p_session_id) then
    raise exception 'session_not_found';
  end if;

  -- 같은 id 를 두 번 보내면 update ... from unnest 가 어느 행을 쓸지
  -- 정해지지 않고, 빠진 행이 옛 슬롯에 남아 커밋 때 충돌한다. 먼저 막는다.
  if (select count(distinct t.id) from unnest(p_image_ids) as t(id)) <> v_len then
    raise exception 'duplicate_image_id';
  end if;

  -- **전량과 정확히 같아야 한다.** 부분 목록을 받으면 안 보낸 사진이
  -- 옛 슬롯에 남아 조용히 순서가 어긋난다.
  select count(*) into v_count
    from public.workout_images
   where session_id = p_session_id;
  if v_count <> v_len then
    raise exception 'photo_set_mismatch:%/%', v_len, v_count;
  end if;

  -- 넘어온 id 가 전부 이 세션의 **내 사진**인지 (RLS 우회 함수라 직접 본다)
  if exists (
    select 1 from unnest(p_image_ids) as t(id)
     where not exists (
       select 1 from public.workout_images wi
        where wi.id = t.id
          and wi.session_id = p_session_id
          and wi.user_id = (select auth.uid())
     )
  ) then
    raise exception 'photo_not_found';
  end if;

  -- 맞바꾸는 순간 (session_id, slot) 이 겹친다 — 커밋 때 검사로 미룬다.
  -- ⓘ 아래 UPDATE 는 한 문이라 실측상 이 줄이 없어도 통과한다(0103 주석 참조).
  --   그 통과는 "한 문"이라는 사실에 매달려 있고, 그 사실은 나중에 누가
  --   쉽게 깬다. 문 모양이 바뀌어도 안 깨지도록 명시적으로 미뤄 둔다.
  set constraints public.workout_images_session_slot_key deferred;

  update public.workout_images wi
     set sort_order = (t.ord - 1)::smallint
    from unnest(p_image_ids) with ordinality as t(id, ord)
   where wi.id = t.id
     and wi.session_id = p_session_id;
end
$function$;

revoke all on function public.reorder_workout_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_workout_images(uuid, uuid[]) to authenticated;

-- ── 2. Storage 객체 삭제 ──────────────────────────────────────────
--
-- ⚠️ **실측: storage.objects 에는 DELETE 정책이 하나도 없다** (avatars 포함).
--    지금까지 사진 삭제 경로가 존재한 적이 없다는 뜻이고, 실제로 운영 버킷에
--    workout_images 행이 없는 **고아 객체가 95개** 쌓여 있다(178 객체 / 83 행).
--    §9 "삭제하면 row 와 Storage object 둘 다 정리" 는 이 정책 없이는 불가능하다.
--
-- 여는 범위는 upload 정책과 **똑같다** — 자기 폴더({userId}/...) 안뿐이다.
-- 남의 사진은 경로 첫 칸이 다르므로 이 정책으로 지울 수 없다.
create policy workout_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workout-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;

-- 적용 후 확인 (객체 재조회 — "명령이 성공했다"는 확인이 아니다):
--   select conname, condeferrable, condeferred from pg_constraint
--    where conrelid='public.workout_images'::regclass;
--   select proname, prosecdef, proconfig from pg_proc
--    where proname='reorder_workout_images';
--   select policyname, cmd from pg_policies
--    where schemaname='storage' and tablename='objects' and cmd='DELETE';
