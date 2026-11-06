-- 0123: 아바타용 캐릭터 정보 조회 (단계 + 외형)
--
-- 챌린지·크루 화면의 원형 아바타가 사진이 없는 사람을 진화 캐릭터 얼굴로 그리려면
-- 그 사람의 현재 단계(user_progress.current_stage)와 외형(profiles.character_variant)이
-- 필요하다. user_progress는 본인만 읽히고(user_progress_own_select), profiles는
-- 크루·같은 그룹까지만 열려 있어 **같은 챌린지 참가자**는 어느 쪽으로도 못 읽는다.
--
-- 읽을 수 있는 사람은 기존 가시성 규칙과 **같은 범위**로 좁힌다:
--   본인 · 크루 · 같은 그룹 · 같은 챌린지(취소 제외) 참가자 — 차단 관계는 제외.
-- 내놓는 값은 단계(1~7)와 외형(male/female) 둘뿐이다. XP·레벨·기록은 내놓지 않는다.
--
-- 추가만 하는 변경이다(새 함수). 기존 테이블·정책·함수는 건드리지 않는다.
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
      or (
        not public.is_blocked_between((select auth.uid()), p.id)
        and (
          public.is_crew_with(p.id)
          or public.shares_group_with(p.id)
          or public.shares_any_challenge_with(p.id)
        )
      )
    )
$function$;

revoke all on function public.get_character_faces(uuid[]) from public, anon;
grant execute on function public.get_character_faces(uuid[]) to authenticated;
