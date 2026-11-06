-- 0122: 성장 7단계 표시 이름 재구성 (2026-11-06 사용자 승인)
-- stage_key·레벨·필요 XP는 그대로 — 이름 문자열만 바꾼다.
-- 코드 미러(src/lib/domain/progression.ts STAGES)와 같아야 한다(xp-test.mjs가 대조).
update public.level_definitions set stage_name = case stage_index
  when 1 then '개노답'
  when 2 then '꿈틀러'
  when 3 then '시동러'
  when 4 then '꾸준러'
  when 5 then '불꽃러'
  when 6 then '대장'
  when 7 then '전설'
end
where stage_index between 1 and 7;
