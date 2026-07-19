-- 0017: 닉네임 중복 가입 방지 (2026-07-19 스칼레또 2중 가입 재발 방지)
-- 공백 정리 + 대소문자 무시 기준으로 닉네임을 크루 전체에서 유일하게 강제한다.
-- 적용 전 중복 행이 있으면 실패하므로, 중복 계정 정리 후에 적용할 것.

create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(trim(nickname)));
