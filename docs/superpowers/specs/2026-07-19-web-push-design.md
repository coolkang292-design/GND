# 웹 푸시 알림 설계

## 목표

앱이 꺼져 있거나 폰이 잠겨 있어도 GND 알림(브리핑·응원·찌르기·반응·순위 등 알림함에 쌓이는 전부)을 기기 잠금화면 푸시로 받는다. 앱 내 알림함은 지금 그대로 유지한다.

## 사용자 결정

- 푸시 범위: **알림함에 저장되는 모든 알림** (2026-07-19 확정).
- 기존 프로필 알림 토글 5종이 그대로 적용된다 — 알림 생성 RPC·크론이 이미 토글을 존중해 행을 만들므로, 저장된 알림은 전부 푸시해도 설정이 지켜진다.

## 아키텍처

알림 저장 → DB 트리거 → 발송 API → 기기 푸시. 클라이언트 코드 경로 추가 없이 기존 알림 저장에 자동으로 얹힌다.

### 1. DB (`supabase/migrations/0016_push_subscriptions.sql`, 사용자 SQL Editor 적용)

- `push_subscriptions`: id·user_id(default auth.uid, profiles FK cascade)·endpoint(unique)·p256dh·auth·created_at. RLS는 본인 행만 select/insert/update/delete, anon 차단.
- `notifications.pushed_at timestamptz` 컬럼 추가 — 중복 발송 방지 마커.
- `pg_net` 확장 + `notifications` AFTER INSERT 트리거: `net.http_post('https://gnd-one.vercel.app/api/push/notify', {id})` 비동기 호출. 트리거는 예외를 삼켜 알림 저장을 절대 막지 않는다.

### 2. 발송 API (`src/app/api/push/notify/route.ts`)

- POST `{id}` — 인증 헤더 없음. 대신 **DB 재조회가 진실**: service_role로 알림 행을 읽어 실재하는 알림만 발송하므로 위조 요청으로는 아무것도 보낼 수 없다.
- 재생 공격 방어: `pushed_at is null`인 행만 `now()`로 마킹하며 원자적으로 선점(이미 마킹됐으면 skip). 생성 10분 이후 행은 발송하지 않는다.
- 수신자의 `push_subscriptions` 전부에 `web-push`(VAPID)로 발송. 404/410 응답 구독은 즉시 삭제(만료 기기 자동 정리). 발송 실패는 응답에 집계만 하고 오류 전파 없음.

### 3. 도메인 (`src/lib/domain/push.ts`, TDD)

- `pushPayloadFor(notification)`: title(없으면 "GND")·body·탭 이동 url(type별: 응원/찌르기/브리핑→/home, 반응→/feed, 순위/챌린지→/challenge, 성과열람→/home).
- `shouldDispatchPush({createdAt, pushedAt, now})`: 미발송 + 10분 이내만 true.

### 4. 서비스워커 (`public/sw.js`)

- `push`: 페이로드의 title/body/아이콘(`/icons/icon-192.png`)으로 `showNotification`.
- `notificationclick`: 알림 닫고 열린 창 focus, 없으면 페이로드 url로 `openWindow`.

### 5. 클라이언트 (`src/lib/push.ts` + UI)

- `getPushStatus()`: unsupported / not-subscribed / subscribed / denied.
- `enablePush(userId)`: 사용자 버튼 제스처에서 권한 요청 → `pushManager.subscribe`(공개 VAPID 키) → 구독을 `push_subscriptions`에 upsert. `disablePush()`: 구독 해제 + 행 삭제.
- 프로필 탭 알림 설정에 **"기기 푸시 알림"** 행(켜기/끄기, denied면 안내 문구). 홈에 미구독 시 1회성 켜기 안내 카드(닫으면 localStorage로 다시 안 봄).
- 실패 격리: 푸시 관련 실패는 화면 오류로 새지 않는다(비프음과 같은 원칙).

### 6. 키·환경변수

- `web-push generate-vapid-keys` 1회 생성 → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(클라)·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`(mailto) — `.env.local` + Vercel Production env(**Bash printf 등록, 교훈 9**).

## 제약

- 아이폰: iOS 16.4+ 그리고 **홈 화면에 설치한 앱에서만** 푸시 수신 가능(사파리 탭 불가) → 크루 안내서에 설치 필수 강조 갱신.
- 안드로이드 크롬: 브라우저·설치 앱 모두 가능.
- Vercel Hobby 크론 제약은 기존과 동일(브리핑 하루 1회) — 푸시는 발송 방식만 추가.

## 테스트

- 도메인 TDD: payload 구성(타입별 url·title 폴백)·발송 판정(중복·10분 창).
- `scripts/push-rls-test.mjs`(실 DB, 0016 적용 후): 본인 구독 CRUD 허용, 타인 조회·삭제 차단, anon 차단.
- 운영 검증: 잘못된 id·재전송 → skip 확인, 수동 브리핑 curl → 실기기 잠금화면 수신 확인.
- 전체 게이트(unit·typecheck·lint·build·기존 실 DB 4종) 후 배포.

## 제외 범위

- 알림별 개별 푸시 세분 설정(기존 5종 토글 재사용으로 충분)
- 푸시 소리·진동 커스텀, 이미지 첨부
- 구형 iOS(<16.4)·인앱 브라우저 지원
