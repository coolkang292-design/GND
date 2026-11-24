-- 0119 — analytics_events.client_kind (2026-11-09)
--
-- 왜: 11/6~7 "유입 증가"의 신규 계정 42개 중 36개가 HeadlessChrome(자동화)이었다.
--     앱이 접속 환경을 남기지 않아 admin 퍼널이 봇과 사람을 못 가렸고, "인앱 브라우저에서
--     카카오·구글 로그인이 막히는가"도 데이터로 답할 수 없었다.
--
-- ⓘ **추가만 한다.** nullable 컬럼 1개. 기존 행·정책·제약·grant는 건드리지 않는다.
--   (테이블 단위 `grant insert`가 이미 있어 새 컬럼도 저장된다 — 0093.)
-- ⚠️ 값은 분류 코드 7개뿐이다. UA 원문을 저장하지 않는다.
-- ⚠️ **앱 배포 전에 적용해야 한다.** 새 앱은 insert에 이 컬럼을 보낸다. 없으면 PostgREST가
--    거부해서 퍼널 이벤트가 통째로 사라진다(계측은 던지지 않고 조용히 실패한다).

alter table public.analytics_events
  add column if not exists client_kind text
  check (
    client_kind is null or client_kind in (
      'automation', 'inapp_kakao', 'inapp_instagram', 'inapp_facebook',
      'inapp_naver', 'inapp_other', 'browser'
    )
  );

comment on column public.analytics_events.client_kind is
  '접속 환경 분류 (0119). automation = 헤드리스/웹드라이버. 이전 행은 null(미분류).';

-- 적용 후 확인:
--   select column_name, data_type from information_schema.columns
--    where table_name = 'analytics_events' and column_name = 'client_kind';
