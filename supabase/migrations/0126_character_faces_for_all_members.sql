-- 0126: 진화 캐릭터 얼굴을 **관계와 무관하게** 로그인한 사용자에게 보인다 (2026-11-11 사용자 지시)
--
-- 0123의 `get_character_faces`는 크루·그룹·챌린지를 같이 하는 사람만 얼굴을 줬다. 그래서 관계가 없는
-- 사람은 피드의 "OO님이 응원했어요" 같은 줄에서 이모지로 보였다 → "이미지 말고 진화 캐릭터로".
--
-- 이 함수가 내주는 것은 **단계 번호와 외형 이름뿐**이다(이미지 경로를 만드는 재료). 닉네임·기록·
-- 운동 내용은 나가지 않는다. 그래서 관계 조건만 걷고, 아래는 **그대로 둔다**:
--   · 로그인(auth.uid)이 있어야 한다 — anon은 못 부른다 (grant도 authenticated만)
--   · 한 번에 200명까지
--   · 서로 차단한 사이는 제외 (`is_blocked_between`)
--
-- 비파괴: create or replace function (본문만 교체). 권한·소유자는 그대로다.

create or replace function public.get_character_faces(p_user_ids uuid[])
returns table(user_id uuid, stage smallint, variant text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p.id,
         coalesce(up.current_stage, 1)::smallint,
         p.character_variant
  from public.profiles p
  left join public.user_progress up on up.user_id = p.id
  where (select auth.uid()) is not null
    and cardinality(p_user_ids) <= 200
    and p.id = any (p_user_ids)
    and (
      p.id = (select auth.uid())
      or not public.is_blocked_between((select auth.uid()), p.id)
    )
$function$;
