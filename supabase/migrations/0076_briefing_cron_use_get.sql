-- 0076: 브리핑 크론이 POST가 아니라 GET으로 부르게 고친다
-- 설계: docs/superpowers/specs/2026-08-13-personalized-briefing-time-design.md
--
-- ⚠️ **0075의 버그 수정이다.** 0075는 `net.http_post`를 썼는데 `/api/briefing`은
--    **GET만** 받는다(`export async function GET`). 그래서 잡이 돌아도 매번
--    **405 Method Not Allowed**로 튕긴다. 2026-08-14 실측:
--
--      id 1468 | status_code 405 | 02:03:02   ← http_post 수동 발사
--
--    0016(푸시 트리거)이 `http_post`를 쓰길래 그대로 따라 쓴 것이 원인이다.
--    `/api/push/notify`는 POST를 받지만 `/api/briefing`은 아니다.
--    **엔드포인트마다 메서드를 확인하고 써라.**
--
-- ⚠️ Vercel Cron도 GET으로 부른다. 그래서 라우트를 GET으로 두고 **부르는 쪽을**
--    고치는 것이 맞다 — POST 핸들러를 새로 만들면 같은 일을 하는 입구가 둘이 된다.
--
-- ⚠️ 타임아웃을 늘렸다. `net.http_get`의 기본값은 5초인데 브리핑은 전체 세션을
--    페이지네이션으로 읽고 사람 수만큼 INSERT한다. 타임아웃이 나도 Vercel 쪽 실행은
--    끝까지 가지만, 응답 코드를 못 받으면 **진단이 불가능해진다**(0075를 이틀 헤맨 이유가
--    정확히 그런 종류였다).
--
-- 적용: SQL Editor에 전체 붙여넣기 → Run. 멱등하다.

select cron.unschedule('briefing-dispatch')
where exists (select 1 from cron.job where jobname = 'briefing-dispatch');

-- ⚠️ 주기(30분)는 `notify-time.ts`의 `SLOT_MINUTES`와 한 벌이다.
--    한쪽만 바꾸면 슬롯이 통째로 비어 그 시간대 사용자가 알림을 못 받는다.
select cron.schedule(
  'briefing-dispatch',
  '*/30 * * * *',
  $job$
  select net.http_get(
    url := 'https://gnd-one.vercel.app/api/briefing',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'briefing_cron_secret'
      )
    ),
    timeout_milliseconds := 20000
  );
  $job$
);

-- ── 확인 ──────────────────────────────────────────────────────────────
--
-- ⚠️ `cron.job_run_details`에는 `jobname`이 **없다**(0075 주석의 확인 쿼리가 틀렸다).
--    `cron.job`과 조인해야 한다.
--
--   select d.start_time, d.status, d.return_message
--   from cron.job_run_details d
--   join cron.job j on j.jobid = d.jobid
--   where j.jobname = 'briefing-dispatch'
--   order by d.start_time desc limit 10;
--
--   select id, status_code, created, left(content, 200)
--   from net._http_response order by created desc limit 5;
--
-- 200이면 정상. 405면 아직 POST로 부르고 있는 것이고, 401이면 Vault 값이
-- Vercel `CRON_SECRET`과 다르다.
--
-- 지금 바로 확인하려면 (아무의 슬롯도 아닌 시각이면 실제 발송은 0건이라 안전하다):
--   select net.http_get(
--     url := 'https://gnd-one.vercel.app/api/briefing',
--     headers := jsonb_build_object('Authorization',
--       'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
--                     where name = 'briefing_cron_secret')),
--     timeout_milliseconds := 20000);
