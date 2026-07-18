# 아침 브리핑 크론 + 알림 설정 토글 + 피드 사진 필터 — 설계 (2026-07-18)

> Phase 7 (계획서 §8·§18). 브레인스토밍으로 확정한 결정을 기록한다.
> 관련: `docs/superpowers/specs/2026-07-17-phase6-social-design.md`(notifications 구조),
> `supabase/migrations/0011_social.sql`(notification_settings)·`0012_record_view_rpc.sql`.

## 0. 범위 (한 사이클에 함께 구현)

1. **아침 브리핑 크론** — 매일 KST 09:00(느슨) 각 유저에게 스트릭 브리핑을 인앱 알림함으로.
2. **알림 설정 UI 토글 5종** — 프로필 탭. 아침 브리핑·응원·찌르기·순위·성과 열람.
3. **알림함 브리핑 카드 불독 아이콘** — 브리핑 카드는 이모지 대신 앱 아이콘 표시.
4. **피드 [📷 사진만] 필터** — 사진 인증 히스토리 모아보기.

**범위 밖**: 웹푸시(P1 — OS 알림·잠금화면 배너는 그때. PWA 앱 아이콘이 자동으로 붙음),
브리핑 시간 선택 UI(구조만 대비, §6), 나머지 알림 타입(workout_started·reaction)의 토글.

## 1. 사용자 결정 (브레인스토밍)

| 질문 | 결정 |
|---|---|
| 발송 대상 | **기록 있는 유저 전부** — 소멸(expired) 유저에게도 재점화 메시지. 완료 세션 0개인 유저만 제외 |
| 내용 범위 | **스트릭 + 크루 한 줄** — 제목=스트릭 단계 카피, 본문=어제 크루 활동 한 줄 |
| 문구 톤 | **기존 카피 재사용** — streak-card의 손실회피+유머 로테이션 메시지를 공용 모듈로 추출 |
| 설정 UI | **토글 5종 전부** (처음 "브리핑만"에서 변경) |
| 구현 방식 | **A. Vercel Cron + API route** (pg_cron 대안 기각 — 도메인 로직 이중화·테스트 불가) |
| 시간 확장성 | MVP 9시 고정, **구조는 시각 매칭 발송기**로(§6) |
| 사진 히스토리 | **피드 필터 칩** (그리드 갤러리·달력식 기각 — 기존 카드 UI 재사용이 최소 비용) |

## 2. 아키텍처 (브리핑 크론)

- **`vercel.json`** (신규): `{"crons": [{"path": "/api/briefing", "schedule": "0 0 * * *"}]}`
  — UTC 00:00 = KST 09:00. **Hobby 플랜: 하루 1회·실행 시각 최대 1시간 오차**(09:00~10:00 도착).
- **`src/app/api/briefing/route.ts`** (신규): GET.
  ① `Authorization: Bearer <CRON_SECRET>` 검증(불일치 401, env 누락 500)
  ② admin 클라이언트로 조회: profiles(id·nickname·timezone), 완료 세션(user_id·completed_at),
     notification_settings, 오늘 발송된 morning_briefing, group_members(크루 한 줄용)
  ③ `buildBriefings`(순수 함수)로 발송 목록 계산
  ④ **유저별로** notifications insert — `dedupe_key` 기준 upsert(ignoreDuplicates)로
     DB 멱등 보장(§3). 일괄 insert 금지: 한 행의 오류가 전체를 실패시키고,
     유저별 try/catch(§8)와 모순되기 때문.
  ⑤ `{sent, skipped, errors}` JSON 응답 — Vercel 크론 로그에서 결과 확인.
- **`src/lib/supabase/admin.ts`** (신규): service_role 클라이언트. **API route 전용** —
  `SUPABASE_SERVICE_ROLE_KEY`는 `NEXT_PUBLIC_` 접두사가 없어 클라 번들에 포함되지 않는다.
  클라이언트 컴포넌트에서 import 금지.
- **`src/lib/domain/briefing.ts`** (신규, TDD): `buildBriefings(users, ...) → 발송 목록`.
  기존 `streakStage`·`currentStreak`(lib/domain/streak.ts) 재사용.
- **`src/lib/domain/streak-messages.ts`** (추출): streak-card.tsx의 `STAGE_MESSAGES`·
  `TODAY_DONE_MESSAGES`·`EXPIRED_MESSAGES` + todayKey 해시 로테이션을 공용 모듈로.
  **카피 데이터는 공용, 채널별 조립은 분리** — 홈 카드는 화면 맥락이 있지만 알림함은
  단독 노출이라, 브리핑 제목은 맥락 단어를 보강해 조립한다
  (예: 홈 "🔥 12일이 위험해요" → 브리핑 "🔥 12일 운동 스트릭이 위험해요").
  완전 동일 문자열을 강제하지 않는다.

env 등록 현황(2026-07-18 완료): `SUPABASE_SERVICE_ROLE_KEY`·`CRON_SECRET` —
로컬 `.env.local` + Vercel Production(Bash printf, 교훈 9 준수). 키 유효성 REST 200 확인.

## 3. 발송 규칙 (buildBriefings 판정 순서)

유저별로 아래 순서로 판정, 하나라도 걸리면 skip(사유 기록):

1. 완료 세션 0개 → skip (`no_history`)
2. `notification_settings.morning_brief = false` → skip (`opted_out`) — 행 없음 = on
3. `invocationHour !== DEFAULT_BRIEF_HOUR(9)` → skip (`hour_mismatch`) — 향후 시간 선택 대비(§6)
4. 유저 tz 기준 **오늘 이미 morning_briefing 존재** → skip (`already_sent`) — 사전 필터(비용 절약)
5. 통과 → 유저 tz로 `streakStage` 계산 → 단계별 로테이션 카피 선택
   - `expired`도 발송(재점화), `today_done`이면 칭찬 카피, `none`은 1번에서 이미 제외

**멱등성의 최종 보장은 DB가 한다** — 4번 조회는 경쟁 조건(크론 동시 실행 시 둘 다
"없음"을 보고 각각 insert)에 취약하므로 사전 필터일 뿐이다. 진짜 보장:

- 0013에서 `notifications.dedupe_key text`(nullable) + **일반 unique 인덱스** 추가
  (NULL은 unique 충돌 없음 — 기존 알림 타입은 전부 NULL이라 무영향.
  partial index는 PostgREST `on_conflict`와 안 맞으므로 일반 인덱스로).
- 브리핑 insert 시 `dedupe_key = 'morning_briefing:{user_id}:{유저 tz 로컬 날짜}'` +
  upsert(`onConflict: dedupe_key`, `ignoreDuplicates: true`) → 충돌 = 이미 발송으로 집계.
  조회와 insert 사이 경쟁이 사라진다.

**알림 구성**: 제목 = 스트릭 단계 카피(브리핑용 조립, §2). 본문 = 크루 한 줄.
**크루 활동 집계 정의**: 현재 가입한 모든 크루의 멤버(현재 멤버십 기준, 탈퇴·가입 시점
소급 없음) 중 어제(유저 tz) 완료 세션이 있는 사람을 user_id로 중복 제거하고 **본인 제외**한
수 n. n≥1: "어제 크루 친구 n명이 운동했어요 💪", n=0: "어제는 다들 쉬었네요. 오늘 첫 타자
어때요? 🏃". 크루 없는 유저는 본문 생략(제목만).

## 4. 알림 설정 UI (토글 5종)

- 프로필 탭에 "알림 설정" 섹션: 아침 브리핑(매일 오전 9시)·응원·찌르기·순위(챌린지 종료)·성과 열람.
- **`src/lib/notification-settings.ts`** (신규): `getNotificationSettings()`(행 없음 → 전부 true)·
  `updateNotificationSettings(partial)`(upsert). 기존 RLS(본인 행만) 그대로 — 테이블 변경 없음.
- 서버 존중 현황: cheers·pokes(0011 RPC ✅)·record_views(0012 ✅)·morning_brief(이번 route)·
  **ranks만 미존중** → 아래 0013.
- **`supabase/migrations/0013_briefing_dedupe_ranks_setting.sql`** (신규, 소형) — 두 가지:
  ① `notifications.dedupe_key` 컬럼 + unique 인덱스(§3 멱등성)
  ② `finalize_challenge`의 challenge_ended 알림 insert에 `coalesce(ns.ranks, true)` 필터 추가
  (0011 send_cheer와 같은 left join 패턴). **재정의 시 함수 시그니처·반환형·security definer·
  search_path·기존 grant가 그대로인지 회귀 확인**(0011 원문 대조).
  적용 = SQL Editor 수동 1회(기존 절차). **적용·검증 후에 앱 배포**(§9 순서) —
  토글 UI가 먼저 나가고 서버가 무시하는 상태 금지.

## 5. 알림함 브리핑 카드 아이콘

- 현재 알림함(notification-bell.tsx)은 타입별 이모지(morning_briefing: ☀️).
- 브리핑 카드만 이모지 대신 **앱 아이콘 이미지**(`/icons/icon-192.png`, 불독) 표시 —
  "GND가 보낸 브리핑" 아이덴티티. 다른 타입은 기존 이모지 유지.
- OS 알림에 불독이 뜨는 것은 웹푸시(P1)에서 자동 해결됨을 명시해 둔다.

## 6. 향후 확장: 브리핑 시간 선택 (구조만 대비 — 과설계 금지)

- **지금**: `buildBriefings({ invocationHour, users, ... })`에 시각 입력만 두고
  `DEFAULT_BRIEF_HOUR = 9` 상수와 비교. 유저별 `preferredHour` 필드는 **DB 컬럼이 실제로
  생길 때 추가**한다(지금 넣으면 전원 가상 9를 강제하는 유령 구조). TDD 1케이스만:
  invocationHour 7 호출 시 전원 미발송.
- **나중에 시간 선택을 열 때**:
  ① `notification_settings`에 `morning_brief_hour smallint not null default 9` 추가(비파괴)
  ② `buildBriefings`에 유저별 preferredHour 비교 추가 ③ vercel.json에 크론 슬롯 추가
  (예: `/api/briefing` 스케줄 `0 22/23/0 * * *` 3건 — route는 호출 시각으로 hour 판정).
- **제약 (Vercel 공식 문서 2026-06 확인)**: **Hobby도 프로젝트당 크론 100개** — 단, 각 크론은
  **하루 1회 이하**(더 잦은 표현식은 배포 실패)이고 실행 시각은 **지정 시각부터 최대 59분
  오차**(9시 지정 → 09:00~09:59). 따라서 7·8·9시 선택지는 Hobby로 충분하고,
  **정각 발송이 필요할 때만** Pro(분 단위 정밀도) 또는 외부 스케줄러를 검토한다.
  멱등성(§3)이 있어 어떤 스케줄 조합에도 중복 발송 없음.

## 7. 피드 [📷 사진만] 필터

- **UI**: 피드 상단(오늘 운동 카운트 아래) 필터 칩 [전체] [📷 사진만]. 탭 내 state
  (새로고침 시 전체 복귀 — 단순 유지). "사진만"이면 인증사진 있는 완료 운동만
  날짜별 그룹핑·카드·반응·더보기 페이지네이션 전부 그대로.
- **데이터**: **쿼리 레벨 필터**(클라에서 현재 페이지 10개만 거르면 "사진 없음" 오표시) —
  기존 피드 조회에 workout_images **exists 조건**을 건 별도 조회 경로 + 별도 페이지네이션.
  확인 조건: ① 정렬 기준 전체 피드와 동일 ② 커서는 완료 세션 기준(이미지 기준 아님)
  ③ 카드 중복 없음 — 0005의 세션당 사진 1장 unique 제약이라 join 중복 위험은 없지만
  exists 패턴으로 원천 차단 ④ 공개 규칙(크루 공개·signed URL)은 기존 피드와 동일 경로 재사용.
- **도메인**: `groupByDay` 재사용. 필터는 쿼리 레벨 — 신규 순수 함수 최소(필터 유틸 1~2케이스).
- 참고: 프로덕션은 새 오리진이라 사진 히스토리는 실사용이 쌓이며 채워진다.

## 8. 에러 처리

- route: **유저별 insert + 유저별 try/catch** — 한 명의 실패가 다른 유저 발송을 막지 않는다.
  실패는 `errors`에 수집해 응답(Vercel 로그로 확인).
- CRON_SECRET 불일치 401 · env 누락 500(명시 메시지). 크루 3~5명 규모 — 기본 10s 함수 제한 내 충분.
- **당일 재시도 없음(MVP 트레이드오프)**: Vercel은 실패한 크론을 재시도하지 않고 호출 자체가
  드물게 누락될 수도 있다. 실패·누락된 당일 브리핑은 그날 누락으로 확정되고 다음 날부터 정상
  재개된다. 3~5명 인앱 알림 규모에서 수용 가능. ("다음 크론이 커버" 아님 — 다음 크론은 내일이다.)

## 9. 테스트·검증

- **TDD** `lib/domain/briefing.ts` 10~12케이스: no_history/opted_out/already_sent skip ·
  hour_mismatch(invocationHour 7 → 전원 미발송) · 단계별 카피 선택 · expired 발송 ·
  today_done 칭찬 · 크루 0명/n명 본문 · **다중 크루 중복 인원 1명 계산** · **본인 제외**
  (어제 나만 운동 → 친구 0명) · tz 어제 경계(자정 직후) · 로테이션 결정성(같은 날 같은 문구).
- streak-messages 추출은 기존 streak-card 동작 불변 — 기존 unit이 회귀 감지.
- 피드 필터: 필터 유틸 TDD 1~2케이스 + 실기기 확인.
- **DB 통합 검사 (service_role 스크립트)**: 같은 dedupe_key 2회 upsert → 알림 1개(경쟁 조건
  방어는 unit으로 불가 — 실 DB로만 검증).
- **RLS**: 신규 검사 1건 — ranks 꺼둔 유저는 finalize 시 challenge_ended 미수신(0013 검증).
  클라의 notifications insert 차단은 기존 107케이스에 포함.
- **배포 순서 (엄수)**: 0013 SQL Editor 적용 → dedupe·RLS·finalize 회귀 검증 →
  그다음 앱 배포. 토글 UI가 서버 존중보다 먼저 나가는 상태 금지(§4).
- **수동 검증 순서**: 로컬 dev에서 curl(Bearer) 호출 → 폰 알림함에 브리핑+불독 아이콘 확인 →
  같은 날 재호출 시 미발송(dedupe) 확인 → 토글 off 후 재호출 시 미발송 확인 → 배포 →
  프로덕션 curl 1회 → 다음날 아침 크론 자동 실행 로그 확인.
  lint·typecheck·build·unit(131+α)·RLS(107+1).
- **커밋 분리 권장**: ①카피 공용화 ②briefing 도메인 TDD ③0013+DB 검증 ④route+admin
  ⑤알림설정 UI ⑥불독 아이콘 ⑦사진 필터 — 실패 시 원인 격리. 커밋은 검증 통과 후
  (실기기 확인 항목은 폰 확인 후).
