-- 0103 — workout_images 다중 사진 (운동 1회 = 게시물 1개, 사진 최대 5장)
--
-- ⚠️⚠️ 고위험: 기존 UNIQUE(session_id) 제거를 포함한다. CLAUDE.md §DB 마이그레이션의
--       "멈춘다" 칸(drop constraint)에 해당하므로 **사용자 승인 후에만** 적용한다.
--
-- 왜 지금 돌려도 안전한가 (운영 앱은 아직 옛 코드다):
--   sort_order 의 default 가 0 이라, 옛 앱이 sort_order 없이 넣던 insert 는
--   그대로 0 슬롯에 들어간다. 같은 세션에 두 번째를 넣으려 하면 예전엔
--   workout_images_session_id_key 로 23505 가 났고 지금은
--   workout_images_session_slot_key 로 23505 가 난다 — 둘 다 "duplicate" 라
--   verification-photo.tsx / late-photo-button.tsx 의 문구 분기가 그대로 걸린다.
--   즉 이 마이그레이션만 적용된 상태에서 운영 앱의 동작은 **바뀌지 않는다.**

begin;

-- 1) 세션당 1장 제약 해제 ─ 이 기능의 전부다
alter table public.workout_images
  drop constraint workout_images_session_id_key;

-- 2) 정렬 슬롯. default 0 이 backfill 을 겸한다.
--    적용 시점 실측(2026-09-10): 83행 / 83세션 = 세션당 정확히 1장이라
--    전부 0 으로 들어가고 충돌이 없다. 별도 UPDATE 문이 필요 없다.
alter table public.workout_images
  add column sort_order smallint not null default 0;

-- 3) 슬롯 범위가 곧 장수 상한이다.
--    0..4 (5칸) + 아래 UNIQUE 가 짝을 이루면 세션당 6행이 물리적으로 불가능하다.
--    트리거를 새로 만들지 않고 상한을 DB 에 박는 유일한 방법이라 이 조합을 쓴다.
alter table public.workout_images
  add constraint workout_images_sort_order_range
  check (sort_order between 0 and 4);

-- 4) 같은 세션에 같은 슬롯 두 장 금지.
--
--    ⚠️ DEFERRABLE 은 **보험이다. 근거를 실측해 두니 지우지 마라.**
--       순서 바꾸기는 슬롯을 맞바꾸는 일이라 문 중간에 (session, slot) 이
--       잠깐 겹친다. 2026-09-10 에 운영 서버(PG 17.6) pg_temp 로 리허설한
--       결과, **단일 UPDATE 문이면 immediate 여도 통과했다** — 5장 한 칸
--       밀기(i=i+1 모양)까지 성공했다. 즉 지금 reorder_workout_images() 의
--       한 문짜리 구현에는 deferrable 이 없어도 된다.
--       그런데도 붙여 두는 이유: 재정렬을 **두 문으로 쪼개는 순간** 두
--       트랜잭션이 되어 즉시 23505 로 죽는데, 그 실패는 5장을 채운 사람만
--       밟아서 개발 중에 안 보인다. 문 개수에 의존하는 정확성을 코드에
--       남기지 않으려고 제약 쪽에 못을 박는다.
--    ⓘ initially immediate 다 — 평범한 insert 는 예전처럼 즉시 실패한다.
alter table public.workout_images
  add constraint workout_images_session_slot_key
  unique (session_id, sort_order) deferrable initially immediate;

-- 5) 클라가 슬롯을 지정해 넣을 수 있어야 한다.
--    ⚠️ 0096 의 **컬럼 단위 INSERT grant** 규약을 지킨다 — 테이블 전체가 아니라
--       sort_order 한 칸만 연다. server_uploaded_at 은 계속 닫혀 있어서
--       rls-test.mjs 의 "server_uploaded_at 클라 직접 쓰기 불가" 단언이 살아 있다
--       (그 단언은 UNIQUE 가 아니라 컬럼 권한에 기대고 있었다 — 실측 확인함).
grant insert (sort_order) on public.workout_images to authenticated;

commit;
