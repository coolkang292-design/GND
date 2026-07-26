-- 0026: 크루원 프로필 — 같은 그룹이면 서로의 레벨·배지를 읽는다
-- 설계: docs/superpowers/specs/2026-07-26-crew-member-profile-sheet-design.md
-- 계획: docs/superpowers/plans/2026-07-26-crew-member-profile-sheet.md
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 기존 마이그레이션은 수정 금지.
--
-- 왜 RPC인가:
--  · user_progress·user_badges는 본인 전용 RLS(0022·0020)라 남의 행이 안 내려온다.
--  · 레벨과 배지를 한 번에 돌려줘 시트가 왕복 1회로 열리고,
--    권한 검사(shares_group_with)가 한 곳에만 존재한다.
--
-- 반환의 currentLevel·currentStage는 서버 캐시값이다. 화면 표시는 클라이언트가
-- totalXp로 다시 계산한다(내 정보 화면과 같은 함수를 써야 숫자가 어긋나지 않는다).
-- 두 값이 갈라지면 캐시가 깨진 것이므로 scripts/crew-profile-check.mjs가 교차 검증한다.

create or replace function public.get_crew_member_profile(p_target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_progress user_progress%rowtype;
  v_badges jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_id <> auth.uid() and not shares_group_with(p_target_id) then
    raise exception 'not_crew';
  end if;

  -- 행이 없으면(운동 이력 0인 신규 유저) 전 필드 null → 아래 coalesce가 0 XP로 만든다
  select * into v_progress
  from user_progress
  where user_id = p_target_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('badgeKey', b.badge_key, 'earnedAt', b.earned_at)
             order by b.earned_at
           ),
           '[]'::jsonb
         )
    into v_badges
  from user_badges b
  where b.user_id = p_target_id;

  return jsonb_build_object(
    'totalXp',      coalesce(v_progress.total_xp, 0),
    'currentLevel', coalesce(v_progress.current_level, 1),
    'currentStage', coalesce(v_progress.current_stage, 1),
    'badges',       v_badges
  );
end $$;

revoke all on function public.get_crew_member_profile(uuid) from public, anon;
grant execute on function public.get_crew_member_profile(uuid) to authenticated;
