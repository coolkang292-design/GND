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
  ④ notifications 일괄 insert(type=`morning_briefing`)
  ⑤ `{sent, skipped, errors}` JSON 응답 — Vercel 크론 로그에서 결과 확인.
- **`src/lib/supabase/admin.ts`** (신규): service_role 클라이언트. **API route 전용** —
  `SUPABASE_SERVICE_ROLE_KEY`는 `NEXT_PUBLIC_` 접두사가 없어 클라 번들에 포함되지 않는다.
  클라이언트 컴포넌트에서 import 금지.
- **`src/lib/domain/briefing.ts`** (신규, TDD): `buildBriefings(users, ...) → 발송 목록`.
  기존 `streakStage`·`currentStreak`(lib/domain/streak.ts) 재사용.
- **`src/lib/domain/streak-messages.ts`** (추출): streak-card.tsx의 `STAGE_MESSAGES`·
  `TODAY_DONE_MESSAGES`·`EXPIRED_MESSAGES` + todayKey 해시 로테이션을 공용 모듈로.
  홈 카드와 브리핑이 같은 카피를 사용 — 문구 관리 한 곳.

env 등록 현황(2026-07-18 완료): `SUPABASE_SERVICE_ROLE_KEY`·`CRON_SECRET` —
로컬 `.env.local` + Vercel Production(Bash printf, 교훈 9 준수). 키 유효성 REST 200 확인.

## 3. 발송 규칙 (buildBriefings 판정 순서)

유저별로 아래 순서로 판정, 하나라도 걸리면 skip(사유 기록):

1. 완료 세션 0개 → skip (`no_history`)
2. `notification_settings.morning_brief = false` → skip (`opted_out`) — 행 없음 = on
3. `preferredHour !== invocationHour` → skip (`hour_mismatch`) — MVP에선 전원 기본값 9라 통과(§6)
4. 유저 tz 기준 **오늘 이미 morning_briefing 존재** → skip (`already_sent`) —
   멱등성: Hobby 크론 중복 실행·수동 재호출·향후 다중 크론 슬롯에 안전
5. 통과 → 유저 tz로 `streakStage` 계산 → 단계별 로테이션 카피 선택
   - `expired`도 발송(재점화), `today_done`이면 칭찬 카피, `none`은 1번에서 이미 제외

**알림 구성**: 제목 = 스트릭 단계 카피 한 줄(로테이션). 본문 = 크루 한 줄 —
어제(유저 tz) 같은 크루에서 완료 세션 있는 고유 인원 n. n≥1: "어제 크루 n명이 운동했어요 💪",
n=0: "어제는 다들 쉬었네요. 오늘 첫 타자 어때요? 🏃". 크루 없는 유저는 본문 생략(제목만).

## 4. 알림 설정 UI (토글 5종)

- 프로필 탭에 "알림 설정" 섹션: 아침 브리핑(매일 오전 9시)·응원·찌르기·순위(챌린지 종료)·성과 열람.
- **`src/lib/notification-settings.ts`** (신규): `getNotificationSettings()`(행 없음 → 전부 true)·
  `updateNotificationSettings(partial)`(upsert). 기존 RLS(본인 행만) 그대로 — 테이블 변경 없음.
- 서버 존중 현황: cheers·pokes(0011 RPC ✅)·record_views(0012 ✅)·morning_brief(이번 route)·
  **ranks만 미존중** → 아래 0013.
- **`supabase/migrations/0013_finalize_ranks_setting.sql`** (신규, 소형):
  `finalize_challenge`의 challenge_ended 알림 insert에 `coalesce(ns.ranks, true)` 필터 추가
  (0011 send_cheer와 같은 left join 패턴). 적용 = SQL Editor 수동 1회(기존 절차).

## 5. 알림함 브리핑 카드 아이콘

- 현재 알림함(notification-bell.tsx)은 타입별 이모지(morning_briefing: ☀️).
- 브리핑 카드만 이모지 대신 **앱 아이콘 이미지**(`/icons/icon-192.png`, 불독) 표시 —
  "GND가 보낸 브리핑" 아이덴티티. 다른 타입은 기존 이모지 유지.
- OS 알림에 불독이 뜨는 것은 웹푸시(P1)에서 자동 해결됨을 명시해 둔다.

## 6. 향후 확장: 브리핑 시간 선택 (구조만 대비)

- **지금**: `buildBriefings`가 `invocationHour`·유저별 `preferredHour`(코드 기본값 9)를 받아
  `preferredHour === invocationHour`일 때만 발송. TDD로 "7시 선호 유저는 9시 호출에 미발송" 검증.
- **나중에 시간 선택을 열 때**:
  ① `notification_settings`에 `morning_brief_hour smallint not null default 9` 추가(비파괴)
  ② route가 그 값을 읽도록 한 줄 변경 ③ vercel.json에 크론 슬롯 추가.
- **제약**: 크론 슬롯 = 시각당 1개. **Hobby 플랜은 프로젝트당 크론 2개** → 선택지 2개(예: 8/9시)가
  상한. 7/8/9시 3개는 Pro($20/월) 또는 외부 스케줄러(cron-job.org 등이 route 호출) 필요.
  멱등성(§3-4)이 있어 어떤 스케줄 조합에도 중복 발송 없음.

## 7. 피드 [📷 사진만] 필터

- **UI**: 피드 상단(오늘 운동 카운트 아래) 필터 칩 [전체] [📷 사진만]. 탭 내 state
  (새로고침 시 전체 복귀 — 단순 유지). "사진만"이면 인증사진 있는 완료 운동만
  날짜별 그룹핑·카드·반응·더보기 페이지네이션 전부 그대로.
- **데이터**: 기존 피드 조회에 "workout_images 존재" 조건을 건 조회 경로 추가.
  페이지네이션 기준 동일(더보기로 과거 사진 인증까지 소급).
- **도메인**: `groupByDay` 재사용. 필터는 쿼리 레벨 — 신규 순수 함수 최소(필터 유틸 1~2케이스).
- 참고: 프로덕션은 새 오리진이라 사진 히스토리는 실사용이 쌓이며 채워진다.

## 8. 에러 처리

- route: 유저 1명 실패가 전체를 죽이지 않게 유저별 try/catch, `errors`에 수집해 응답.
- CRON_SECRET 불일치 401 · env 누락 500(명시 메시지). 크루 3~5명 규모 — 기본 10s 함수 제한 내 충분.
- 알림 insert는 일괄이되 실패 시 유저 단위로 재시도 없이 다음 크론에 맡김(멱등성이 커버).

## 9. 테스트·검증

- **TDD** `lib/domain/briefing.ts` 8~10케이스: no_history/opted_out/already_sent skip ·
  hour_mismatch(7시 선호·9시 호출) · 단계별 카피 선택 · expired 발송 · today_done 칭찬 ·
  크루 0명/n명 본문 · tz 어제 경계(자정 직후) · 로테이션 결정성(같은 날 같은 문구).
- streak-messages 추출은 기존 streak-card 동작 불변 — 기존 unit이 회귀 감지.
- 피드 필터: 필터 유틸 TDD 1~2케이스 + 실기기 확인.
- **RLS**: 신규 검사 1건 — ranks 꺼둔 유저는 finalize 시 challenge_ended 미수신(0013 검증).
  클라의 notifications insert 차단은 기존 107케이스에 포함.
- **수동 검증 순서**: 로컬 dev에서 curl(Bearer) 호출 → 폰 알림함에 브리핑+불독 아이콘 확인 →
  토글 off 후 재호출 시 미발송 확인 → 배포 → 프로덕션 curl 1회 → 다음날 아침 크론 자동 실행
  로그 확인. lint·typecheck·build·unit(131+α)·RLS(107+1).
- 커밋은 실기기 확인 통과 후(메모리: 검증→폰 확인→커밋).
