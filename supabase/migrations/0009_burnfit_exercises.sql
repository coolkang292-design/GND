-- ============================================================
-- Phase 5.3: burnfit.io 라이브러리 운동 카탈로그 시드 확장
-- 출처: https://burnfit.io/라이브러리/
-- 기존 시드(0004)·매달리기(0008)와 중복되는 종목은 제외.
-- 맨몸운동은 measure(reps/time) 지정. 웨이트·유산소는 measure null.
-- body_part는 기존 제약(가슴/등/하체/어깨/팔/코어/유산소)에 맞춰 매핑.
-- 실행: Supabase Dashboard → SQL Editor에 전체 붙여넣기 → Run
-- ============================================================

insert into public.exercise_catalog (name, body_part, exercise_type, measure) values
  -- ── 하체 (weight) ──
  ('컨벤셔널 데드리프트', '하체', 'weight', null),
  ('바벨 백스쿼트', '하체', 'weight', null),
  ('스미스머신 스플릿 스쿼트', '하체', 'weight', null),
  ('스미스머신 데드리프트', '하체', 'weight', null),
  ('덤벨 런지', '하체', 'weight', null),
  ('프론트 스쿼트', '하체', 'weight', null),
  ('글루트 브릿지', '하체', 'weight', null),
  ('루마니안 데드리프트', '하체', 'weight', null),
  ('피스톨 스쿼트', '하체', 'bodyweight', 'reps'),
  -- ── 어깨 ──
  ('오버헤드 프레스', '어깨', 'weight', null),
  ('덤벨 숄더 프레스', '어깨', 'weight', null),
  ('덤벨 레터럴 레이즈', '어깨', 'weight', null),
  ('아놀드 덤벨 프레스', '어깨', 'weight', null),
  ('업라이트 로우', '어깨', 'weight', null),
  ('핸드스탠드', '어깨', 'bodyweight', 'time'),
  -- ── 가슴 ──
  ('덤벨 벤치프레스', '가슴', 'weight', null),
  ('딥스', '가슴', 'bodyweight', 'reps'),
  -- ── 팔 (weight) ──
  ('덤벨 해머 컬', '팔', 'weight', null),
  ('덤벨 트라이셉 익스텐션', '팔', 'weight', null),
  ('케이블 트라이셉 익스텐션', '팔', 'weight', null),
  ('바벨 리스트 컬', '팔', 'weight', null),
  -- ── 코어 (bodyweight) ──
  ('싯업', '코어', 'bodyweight', 'reps'),
  ('브이 업', '코어', 'bodyweight', 'reps'),
  ('러시안 트위스트', '코어', 'bodyweight', 'reps'),
  ('사이드 플랭크', '코어', 'bodyweight', 'time'),
  ('복근 롤아웃', '코어', 'bodyweight', 'reps'),
  -- ── 등 ──
  ('친업', '등', 'bodyweight', 'reps'),
  ('덤벨 로우', '등', 'weight', null),
  ('하이퍼 익스텐션', '등', 'weight', null),
  ('인버티드 로우', '등', 'bodyweight', 'reps'),
  -- ── 역도 (하체 weight로 매핑) ──
  ('클린', '하체', 'weight', null),
  ('클린 앤 저크', '하체', 'weight', null),
  ('스내치', '하체', 'weight', null),
  ('저크', '하체', 'weight', null),
  -- ── 기능성 ──
  ('케틀벨 스윙', '하체', 'weight', null),
  ('쓰러스터', '하체', 'weight', null),
  ('터키쉬 겟업', '코어', 'weight', null),
  ('버피', '코어', 'bodyweight', 'reps'),
  ('박스 점프', '하체', 'bodyweight', 'reps'),
  -- ── 유산소 ──
  ('트레드밀', '유산소', 'cardio', null),
  ('줄넘기', '유산소', 'cardio', null)
on conflict (name) where created_by is null do nothing;
