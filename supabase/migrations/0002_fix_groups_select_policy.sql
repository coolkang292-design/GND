-- ============================================================
-- 0002: groups SELECT 정책 수정
-- 문제: INSERT ... RETURNING은 반환 행에 SELECT 정책을 적용한다.
--       그룹 생성 시점엔 owner의 멤버십 행이 아직 없어 RETURNING이
--       42501로 실패 → create_group RPC 전체 롤백.
-- 수정: owner는 멤버십과 무관하게 자기 그룹을 항상 조회 가능.
-- 실행: Supabase Dashboard → SQL Editor에 붙여넣기 → Run
-- ============================================================

drop policy "groups_select_member" on public.groups;

create policy "groups_select_member_or_owner" on public.groups
  for select using (
    owner_id = auth.uid()
    or public.is_group_member(id, auth.uid())
  );

-- 디버깅 과정에서 생긴 쓰레기 그룹 정리
delete from public.groups where invite_code like 'GND-DBG%';
