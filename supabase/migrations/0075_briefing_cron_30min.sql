-- 0075: 알림 시각 개인화 — 30분마다 브리핑 디스패처를 깨운다 (pg_cron)
-- 설계: docs/superpowers/specs/2026-08-13-personalized-briefing-time-design.md
--
-- ⚠️ **앱 배포 뒤에 돌려라.** 이 잡은 운영 URL(`/api/briefing`)을 부른다. 개인화
--    코드가 배포되기 전에 켜면 옛 코드(전원 09:00)를 30분마다 부르게 된다 —
--    dedupe_key가 있어 중복 발송은 안 나지만 의미 없는 호출이 48배로 늘어난다.
--
-- ⚠️ **왜 Vercel 크론이 아니라 DB인가.** Vercel Hobby 요금제는 크론을 하루 1회로
--    제한한다. 개인화는 각자의 슬롯(예: 18:30)에 호출이 와야 성립하므로 하루 1회로는
--    그 시각에 걸린 사람만 받는다. Supabase는 무료 요금제에서도 pg_cron을 쓸 수 있고,
--    `pg_net`은 0016(푸시 트리거)이 이미 깔아 뒀다 — 늘어나는 인프라가 없다.
--
--    발송 경로는 그대로다:
--      pg_cron → /api/briefing → notifications INSERT
--        → 0016 트리거 → /api/push/notify → 기기 푸시
--
-- ⚠️ **판정 로직을 SQL로 옮기지 마라.** "누구에게 보낼지"는 TypeScript
--    (`buildBriefings`·`estimateNotifyMinute`)에 있고 단위 테스트가 지킨다.
--    여기서 다시 구현하면 두 벌이 되어 갈린다 — 이 저장소가 `start_challenge`를
--    세 번 덮어쓰며 겪은 그 사고다. DB는 **알람시계 역할만** 한다.

-- ── 1단계: 비밀키를 Vault에 넣는다 (사용자가 값 넣어 먼저 실행) ──────────
--
-- ⚠️ 이 파일에 CRON_SECRET을 적지 마라. 저장소에 올라간다.
--    Vercel 환경변수의 CRON_SECRET과 **같은 값**이어야 한다.
--
--   select vault.create_secret('여기에_CRON_SECRET_값', 'briefing_cron_secret');
--
-- 이미 넣었다면 갱신:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'briefing_cron_secret'),
--     '새_값'
--   );

-- ── 2단계: 스케줄 등록 ────────────────────────────────────────────────

create extension if not exists pg_cron;

-- 같은 이름으로 다시 걸 때를 대비해 먼저 지운다 (없으면 조용히 넘어간다).
select cron.unschedule('briefing-dispatch')
where exists (select 1 from cron.job where jobname = 'briefing-dispatch');

-- ⚠️ 주기(30분)는 `notify-time.ts`의 `SLOT_MINUTES`와 **한 벌**이다.
--    한쪽만 바꾸면 슬롯이 통째로 비어 그 시간대 사용자가 알림을 못 받는다.
select cron.schedule(
  'briefing-dispatch',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := 'https://gnd-one.vercel.app/api/briefing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'briefing_cron_secret'
      )
    )
  );
  $job$
);

-- ── 확인용 (Run 후 눈으로 본다) ───────────────────────────────────────
--
-- 등록됐는지:
--   select jobid, jobname, schedule, active from cron.job;
--
-- 실제로 돌았는지 (최근 10건):
--   select runid, status, return_message, start_time
--   from cron.job_run_details
--   where jobname = 'briefing-dispatch'
--   order by start_time desc limit 10;
--
-- 응답이 200인지 (pg_net은 비동기라 몇 초 뒤에 채워진다):
--   select id, status_code, content
--   from net._http_response
--   order by created desc limit 10;
--
-- ⚠️ 401이면 Vault의 값이 Vercel의 CRON_SECRET과 다르다.
-- ⚠️ 실제 발송 확인은 알림 행으로 한다:
--   select user_id, title, created_at
--   from notifications
--   where type = 'morning_briefing'
--   order by created_at desc limit 20;
