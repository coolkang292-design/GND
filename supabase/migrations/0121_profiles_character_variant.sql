-- 0121: 캐릭터 외형(character_variant)
-- 운영 DB에는 2026-11-06에 MCP로 이미 적용됨 (스칼레또·아라짱 = 'female', 나머지 'male').
-- 레벨·XP와 무관하다. 앱은 이 값으로 이미지 경로만 고른다
-- (/characters/char-N.png ↔ /characters/female/char-N.png).
alter table public.profiles
  add column if not exists character_variant text not null default 'male'
  check (character_variant in ('male', 'female'));
