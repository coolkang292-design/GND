-- 0080: 유입 출처를 **한 벌 통째로** 고정한다 (0079 후속)
-- 적용: SQL Editor에 전체 붙여넣기 → Run (1회만). 0001~0079는 수정 금지.
--
-- ── 왜 필요한가 (2026-08-17 개발 서버에서 잡았다) ──────────────
--
-- 0079의 `freeze_profile_attribution`은 컬럼마다 `coalesce(old, new)`를 돌린다.
-- 그래서 **첫 접촉 때 비어 있던 칸이 나중 접촉의 값으로 채워진다.**
--
-- 실제로 재현했다. 픽스처 A를 `?utm_source=kakao&utm_medium=social`로 들여보내
-- 프로필을 저장하니 `source=kakao, referrer=null`이 잘 들어갔다. 그 뒤
-- localStorage를 `{source:instagram, referrer:evil.example.com}`으로 바꾸고 다시
-- 저장했더니:
--
--   source   kakao          ← 지켜졌다 (기대대로)
--   medium   social         ← 지켜졌다
--   campaign writepath      ← 지켜졌다
--   referrer evil.example.com  ← ⚠️ **새 값이 들어왔다**
--
-- `source`는 카카오인데 `referrer`는 인스타인 **출처가 섞인 행**이 된다. 첫 접촉
-- 귀속은 한 벌이 같은 순간에서 와야 의미가 있다. 컬럼별로 최선을 다해 채우면
-- 어느 칸도 틀리지 않았는데 행 전체가 거짓이 된다.
--
-- 현실에서 흔하진 않다 — 클라이언트가 저장된 값을 덮어쓰지 않으므로 보통은 같은
-- 객체가 계속 실려 온다. 하지만 기기를 바꾸거나 브라우저 저장소를 비운 뒤 다른
-- 경로로 다시 들어오면 그대로 발생한다.
--
-- ── 무엇을 바꾸나 ───────────────────────────────────────────
--
-- 판정 기준을 **`acquisition_captured_at` 하나**로 모은다. 그 값이 이미 있으면
-- 유입 6칸 전부를 옛 값으로 되돌리고, 없으면 새 값 한 벌을 통째로 받는다.
--
-- ⚠️ `invited_by`는 그대로 `coalesce`다. 이건 유입 계측과 무관하게 RPC가 나중에
--    채우는 값이라 같은 규칙으로 묶으면 안 된다 — 묶으면 초대 링크를 나중에
--    누른 사람의 초대자가 영영 안 적힌다.
--
-- ── Run 시점 ────────────────────────────────────────────────
-- **지금 돌려도 안전하다.** 트리거 함수 교체 하나뿐이고, 더 적게 쓰는 방향이라
-- 기존 행을 건드리지 않는다.

begin;

create or replace function public.freeze_profile_attribution()
returns trigger
language plpgsql
as $$
begin
  -- 초대자는 따로 논다. 유입 계측과 시점이 달라서다(위 주석 참고).
  new.invited_by := coalesce(old.invited_by, new.invited_by);

  -- 유입 6칸은 한 벌이다. 한 번 잡혔으면 통째로 그때 것을 지킨다.
  if old.acquisition_captured_at is not null then
    new.acquisition_source      := old.acquisition_source;
    new.acquisition_medium      := old.acquisition_medium;
    new.acquisition_campaign    := old.acquisition_campaign;
    new.acquisition_referrer    := old.acquisition_referrer;
    new.acquisition_landing     := old.acquisition_landing;
    new.acquisition_captured_at := old.acquisition_captured_at;
  end if;

  return new;
end $$;

commit;

-- 트리거 함수 교체는 PostgREST 스키마 캐시와 무관하지만, 규약대로 붙여 둔다.
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- 적용 확인 (SQL Editor에서 따로 실행)
-- ════════════════════════════════════════════════════════════
--
--   -- ① 함수가 새 정의인가 — 'acquisition_captured_at is not null'이 보여야 한다
--   select prosrc from pg_proc where proname = 'freeze_profile_attribution';
--
--   -- ② 덮어쓰기가 막히는가 (픽스처 A로 시험 → 값이 그대로여야 한다)
--   --    ⚠️ 이 update는 트리거를 타므로 아무것도 바꾸지 못하는 것이 정답이다.
--   update profiles set acquisition_referrer = 'should-not-stick.example'
--    where nickname = 'dev-테스터A';
--   select nickname, acquisition_source, acquisition_referrer
--     from profiles where nickname = 'dev-테스터A';
