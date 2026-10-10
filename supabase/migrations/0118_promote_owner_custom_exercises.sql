-- 0118: 운영자(앱 주인)가 직접 만든 운동 15개를 기본(공용) 운동으로 전환
-- 사용자 지시(2026-10-10): "내가 직접 등록한 운동을 모두 공용으로". 이름 정리안·합치기는
-- 사용자가 확인했다.
--
-- 두 가지 처리
--   · promote (13개): **같은 ID를 기본 운동으로 바꾼다.** 그림 연결표가 이 ID들을 이미 쓰고
--     있고, 새 행을 만들면 만든 사람 목록에 같은 운동이 두 번 뜬다. 영어·오타 이름은
--     공용 표기로 바꾼다(YTW → 인클라인 YTW 레이즈 등).
--   · merge (2개): 기존 기본 운동과 같은 동작(같은 그림)이라 그 기본 운동으로 합치고
--     직접 운동 행은 지운다. 시티드 케이블 로우 → 시티드 로우,
--     덤벨 인클라인(그림 = 인클라인 덤벨 프레스) → 인클라인 덤벨 벤치프레스.
--
-- 왜 기록·예정표·루틴도 고치나. `workout_exercises`는 카탈로그 ID 없이 **이름만** 저장하고,
-- 앱과 목표 집계 함수(0007·0008)는 이름으로 카탈로그를 찾는다. 예정표·루틴 jsonb는
-- 이름·부위·종류·measure·`isCustom`을 들고 있다. 카탈로그만 바꾸면 옛 이름으로 남은
-- 기록이 아무 데도 안 붙는다.
--
-- 운영 대조 (2026-10-10, 서비스 키 읽기 전용 — 만든 사람 본인 행만 조회):
--   · 15개 모두 만든 사람 1명, 아래 옛 이름·부위·종류 그대로
--   · 새 공용 이름 13개는 기본 운동 335개(2026-10-05 스냅샷)와 띄어쓰기 무시해도 안 겹친다
--   · 합칠 대상 「시티드 로우」「인클라인 덤벨 벤치프레스」는 기본 운동에 있다
--   · 다른 사용자 데이터는 조회하지 않았다. 다른 사용자가 같은 이름으로 직접 운동을 만들어
--     뒀다면 그 사람 목록에 같은 이름이 둘 보일 수 있다(유일성은 기본/사용자별로 따로라
--     DB 오류는 없다).
--
-- 지운 직접 운동의 그림 파일(e62f53c9·bc0e833c)은 앱 배포에서 연결표·public/에서 뺀다.
-- 앱을 **먼저** 배포해도 안전하다: 전환 전 직접 운동은 본인 카탈로그 ID로 그림을 찾고,
-- 전환 후 기본 운동은 이름으로 찾는다(연결표가 둘 다 같은 ID를 가리킨다).
--
-- 비파괴·재실행 안전: 이미 전환된 행(기본 운동 + 새 이름)·이미 합쳐진 행(삭제됨)은 건너뛴다.
-- 하나라도 예상과 다르면 전체가 롤백된다(DO 블록 하나 = 트랜잭션 하나).
-- 예정표 잠금 트리거(0116)는 auth.uid()가 있을 때만 막으므로 SQL Editor 실행은 통과한다.
-- 0001~0117은 수정 금지.

do $$
declare
  v_owner constant uuid := '4fa751c8-8ee6-4e74-bcac-68f963ff032f';
  m       record;
  v_row   public.exercise_catalog;
  v_tgt   public.exercise_catalog;
  v_new   jsonb;   -- 예정표·루틴 항목에 덮어쓸 값
  v_n     int;
begin
  for m in
    select * from (values
      -- (id, 옛 이름, 새 이름, 처리)
      ('3d9264b3-b67c-40ee-9385-fad0d8fb786b'::uuid, 'YTW',                          '인클라인 YTW 레이즈',               'promote'),
      ('ba21558a-58db-4e58-a055-12309b9a438b'::uuid, '벤드 레터럴 레이즈',            '맨몸 벤트오버 레터럴 레이즈',        'promote'),
      ('e6a6598d-8597-4d22-8d81-ef2265e0c168'::uuid, '불가리안 스플릿 스쿼트',        '불가리안 스플릿 스쿼트',             'promote'),
      ('b79eef2a-2e72-4d00-836a-c5559de8669d'::uuid, 'Scapular Push-up Plus',         '스캐풀러 푸시업 플러스',             'promote'),
      ('cb431896-1837-45d7-afed-e31cee522974'::uuid, '흉추 익스텐션',                 '흉추 익스텐션',                      'promote'),
      ('ac897fe5-30df-466b-a190-e0a660a545c3'::uuid, '도어웨이 가슴 스트레칭',        '도어웨이 가슴 스트레칭',             'promote'),
      ('b84bb13d-7323-42d4-b97e-f220d261432c'::uuid, 'Wall Slide',                    '월 슬라이드',                        'promote'),
      ('90033d48-4db9-40bd-bd3f-3b8e1cbb55d1'::uuid, '아이소 레터럴 인클라인 프레스머신', '아이소 레터럴 인클라인 프레스 머신', 'promote'),
      ('4f47934b-e7a8-4618-8d24-085ebc297dde'::uuid, '밴드 바이셉 컬',                '밴드 바이셉 컬',                     'promote'),
      ('3ac56225-c8be-49bb-9997-5360e651882d'::uuid, '밴드 풀어파트',                 '밴드 풀어파트',                      'promote'),
      ('e5835092-9ce2-4cd6-ae4e-e71cde1d7583'::uuid, '밴드 스쿼트',                   '밴드 스쿼트',                        'promote'),
      ('bef0d91e-ea01-4817-b00e-e5978a5bdbe8'::uuid, '밴드 레터럴 레이즈',            '밴드 레터럴 레이즈',                 'promote'),
      ('aaf1b8e3-e12e-4d6f-846c-c1fd2cec768d'::uuid, '밴드 시티드 로우',              '밴드 시티드 로우',                   'promote'),
      ('e62f53c9-bb53-4f0d-b89a-9e7ad6fe77b9'::uuid, '시티드 케이블 로우',            '시티드 로우',                        'merge'),
      ('bc0e833c-985d-4cf3-8a01-024a071bcfcd'::uuid, '덤벨 인클라인',                 '인클라인 덤벨 벤치프레스',           'merge')
    ) as t(id, old_name, new_name, action)
  loop
    select * into v_row from public.exercise_catalog where id = m.id;

    -- ── 이미 끝난 것 건너뛰기 ──
    if m.action = 'promote' and found and not v_row.is_custom then
      if v_row.name <> m.new_name then
        raise exception '0118: % 이미 기본 운동인데 이름이 다르다: %', m.id, v_row.name;
      end if;
      raise notice '0118: % 이미 전환됨 — 건너뜀', m.new_name;
      continue;
    end if;
    if m.action = 'merge' and not found then
      if not exists (select 1 from public.exercise_catalog
                     where created_by is null and name = m.new_name) then
        raise exception '0118: % 가 없는데 합칠 대상 % 도 없다', m.id, m.new_name;
      end if;
      raise notice '0118: % 이미 합쳐짐 — 건너뜀', m.old_name;
      continue;
    end if;

    -- ── 예상과 같은지 ──
    if not found then
      raise exception '0118: 대상 운동 % (%) 이 없다', m.id, m.old_name;
    end if;
    if not v_row.is_custom or v_row.created_by is distinct from v_owner then
      raise exception '0118: % 는 예상한 직접 운동이 아니다', m.id;
    end if;
    if v_row.name <> m.old_name then
      raise exception '0118: % 이름이 예상과 다르다: % (기대 %)', m.id, v_row.name, m.old_name;
    end if;

    -- ── 카탈로그 ──
    if m.action = 'promote' then
      if exists (select 1 from public.exercise_catalog
                 where created_by is null and name = m.new_name) then
        raise exception '0118: 같은 이름의 기본 운동이 이미 있다: %', m.new_name;
      end if;
      -- check: is_custom = (created_by is not null)
      update public.exercise_catalog
         set name = m.new_name, is_custom = false, created_by = null
       where id = m.id;
      v_new := jsonb_build_object('name', m.new_name, 'isCustom', false);
    else
      select * into v_tgt from public.exercise_catalog
       where created_by is null and name = m.new_name;
      if not found then
        raise exception '0118: 합칠 기본 운동이 없다: %', m.new_name;
      end if;
      delete from public.exercise_catalog where id = m.id;
      v_new := jsonb_build_object(
        'name', v_tgt.name, 'isCustom', false, 'bodyPart', v_tgt.body_part,
        'exerciseType', v_tgt.exercise_type, 'measure', to_jsonb(v_tgt.measure));
    end if;

    -- ── 만든 사람의 운동 기록 이름 ──
    update public.workout_exercises we
       set exercise_name = m.new_name
      from public.workout_sessions s
     where we.session_id = s.id
       and s.user_id = v_owner
       and we.exercise_name = m.old_name;
    get diagnostics v_n = row_count;

    -- ── 만든 사람의 예정표·루틴 jsonb 항목 ──
    update public.workout_plans p
       set exercises = (
         select jsonb_agg(case when e->>'name' = m.old_name then e || v_new else e end
                          order by ord)
           from jsonb_array_elements(p.exercises) with ordinality as t(e, ord))
     where p.user_id = v_owner
       and p.exercises @> jsonb_build_array(jsonb_build_object('name', m.old_name));

    update public.workout_routines r
       set exercises = (
         select jsonb_agg(case when e->>'name' = m.old_name then e || v_new else e end
                          order by ord)
           from jsonb_array_elements(r.exercises) with ordinality as t(e, ord))
     where r.user_id = v_owner
       and r.exercises @> jsonb_build_array(jsonb_build_object('name', m.old_name));

    raise notice '0118: % → % (%) · 기록 % 행', m.old_name, m.new_name, m.action, v_n;
  end loop;
end $$;

-- 확인용 (실행 후): 만든 사람에게 남은 직접 운동 = 0, 새 기본 운동 13개
-- select count(*) from public.exercise_catalog where created_by = '4fa751c8-8ee6-4e74-bcac-68f963ff032f';
-- select name from public.exercise_catalog where id in ('3d9264b3-b67c-40ee-9385-fad0d8fb786b', '90033d48-4db9-40bd-bd3f-3b8e1cbb55d1') and created_by is null;
