# Phase 6 소셜 설계 (피드·반응·응원·찌르기·알림)

2026-07-17. 근거: 계획서 §9(소셜)·§13(스키마)·§14(RLS)·§15(RPC)·§18(Phase 6).
사용자 승인 방식: 이 스펙 검토 + 0011 SQL Editor 적용 = 설계 승인으로 간주(자동 진행 선호).

## 범위

**포함 (Phase 6.1~6.2, 이번 계획):**
1. 마이그레이션 0011: `workout_events`·`reactions`·`cheers`·`notifications`·`notification_settings`·`record_views` + RLS + RPC/트리거
2. 그룹 피드: 크루 공개 completed 최신순 — 인증사진(signed URL)·요약(볼륨·시간)·현재 스트릭·반응
3. 이모지 반응 fire/clap/like: 토글(추가·취소)·중복방지(unique)·낙관적 UI
4. 운동 시작 알림 + 진행 중 카드 (피드·홈)
5. 응원(Realtime): active 세션에 5유형+커스텀 30자, 스팸 제한, 인앱 배너
6. 찌르기: 오늘 미운동 크루원 → 알림
7. 알림함: 🔔 + 미읽음 뱃지 + 읽음 처리
8. 챌린지 종료 알림(`challenge_ended`, Phase 5 이월 "등수변동"의 실질 형태 — 진행중 비공개라 등수 변동은 종료 시점에만 노출됨)

**제외 (후속 계획으로):**
- 꾸준왕 성과 열람 UI + `record_viewed` 알림 — **테이블(record_views)은 0011에 포함**해 마이그레이션 왕복을 줄이고, UI·열람 게이트는 홈 꾸준왕 섹션과 함께 별도 계획(§18 Phase 6 후반).
- 홈 목업의 스트릭 카드·주간 stat·그룹 공동목표·오늘 그룹 현황 위젯 — 위와 같은 계획에서.
- 아침 브리핑 크론·notification_settings UI — Phase 7(§18).
- 웹푸시 — P1. 모든 알림은 durable(notifications 행)이고 푸시는 나중에 전달 수단만 추가.

## 핵심 설계 결정

### 결정 1 — 타인용 알림 생성 경로: definer RPC + 트리거 (service_role 대체)
§14는 "타인용 알림은 service_role만"이지만 MVP는 클라이언트 직결 구조라 서버 비밀키 경로가 없다.
- `notifications`는 클라이언트 **insert 불가**(권한 미부여). select/update(read_at)만 본인 행.
- 생성 주체: ① `send_cheer`·`poke_user` **security definer RPC** ② `reactions` **after-insert 트리거** ③ `start_workout` RPC 수정(크루 알림) ④ `finalize_challenge` RPC 수정(종료 알림).
- 트리거·definer 함수는 테이블 소유자 권한으로 실행되어 RLS를 우회하므로 각 함수 안에서 경계(같은 크루·본인 금지)를 **직접 검증**한다.

### 결정 2 — 응원 스팸 제한: send_cheer RPC 내부 검증
DB 제약만으로는 "세션당 3회·10초 쿨다운"을 표현하기 어렵다(제약은 행 단위, 쿨다운은 시간 창).
- `cheers`도 클라이언트 insert 불가. `send_cheer(p_session_id, p_cheer_type, p_message)` definer RPC가:
  세션이 `active`·`visibility='group'`인지 → 발신자가 같은 크루인지 → 본인 세션 금지 →
  해당 세션·발신자 기존 응원 `< 3` → 마지막 응원 후 `10초` 경과 → insert + `cheer_received` 알림.
- 위반 시 `raise exception`에 코드 문자열(`cheer_limit`, `cheer_cooldown`, `not_active` 등) — RLS 테스트가 메시지로 단언.
- 수신자 `notification_settings.cheers = false`면 응원 행은 남기고 **알림만 생략**.

### 결정 3 — Realtime: notifications 단일 구독
응원 배너·알림 뱃지를 위해 별도 broadcast 채널을 만들지 않는다.
- `notifications`를 `supabase_realtime` publication에 추가. 클라이언트는 로그인 직후
  `postgres_changes INSERT, filter: user_id=eq.{uid}` 하나만 구독(RLS 적용됨).
- 수신 시: `type='cheer_received'` → 인앱 배너(운동 중이면 강조), 그 외 → 🔔 뱃지 증가.
- 장점: 채널 1개·권한 모델 재사용·알림함과 데이터 원천 동일(놓친 알림도 durable).

### 결정 4 — 진행 중 카드의 데이터 원천: workout_events
§14에서 크루원은 타인 세션을 `completed`만 조회 가능 → active 세션 행으로는 진행 중 카드를 만들 수 없다.
- `workout_events`를 크루원 select 가능하게 열고(민감정보 없음: 세션id·유저id·이벤트타입·시각),
  "started 이벤트는 있는데 completed/cancelled 이벤트가 없는 세션" = 진행 중으로 계산한다.
- 이벤트 insert는 클라이언트 불가 — `start_workout`/`complete_workout`/`cancel_workout` RPC가 기록(0004 RPC 수정).
- 진행 중 판정은 순수 함수 `lib/domain/social.ts::activeSessionsFromEvents(events)`로 TDD.

### 결정 5 — 찌르기 제한
§9에 명시 제한이 없으므로 최소 규칙: 같은 크루·본인 금지 + **동일 대상 24시간 1회**(RPC가 최근 poke 알림 존재 확인). 오늘 미운동 여부는 클라이언트가 버튼 노출로만 제어(RPC 강제 안 함 — 시간대 판정을 DB에 중복 구현하지 않기 위해).

## 데이터 모델 (0011, §13 그대로)

```text
workout_events         id·session_id·user_id·event_type(workout_started|workout_completed|workout_cancelled)·created_at
reactions              id·session_id·user_id·reaction_type(fire|clap|like)·created_at·unique(session_id,user_id,reaction_type)
cheers                 id·session_id·sender_id·receiver_id·cheer_type(fire|power|clap|finish|custom)·message(≤30)·created_at·check(sender≠receiver)
notifications          id·user_id·actor_id·type·reference_id·title·body·read_at·created_at
notification_settings  user_id(pk)·morning_brief·cheers·pokes·ranks·record_views (모두 default true, 행 없음=전부 on)
record_views           id·viewer_id·target_id·challenge_id·viewed_at   ← 테이블만, UI는 후속
```
notification.type: `workout_started·cheer_received·poke·reaction_received·rank_change·record_viewed·morning_briefing·challenge_started·challenge_ended` (§13 전체 도메인을 check로 잡아두고 이번엔 앞 4개+challenge_ended만 발생).

## RLS 요약 (§14 준수)

| 테이블 | select | insert | update | delete |
|---|---|---|---|---|
| workout_events | 본인 + 같은 크루원 | 불가(RPC만) | 불가 | 불가 |
| reactions | 크루 공개 completed 세션 것 | 본인·크루원·해당 세션이 크루 공개 completed | 불가 | 본인 것만 |
| cheers | 발신자·수신자·같은 크루원 | 불가(send_cheer만) | 불가 | 발신자 본인 |
| notifications | 본인 | 불가(RPC·트리거만) | 본인 read_at만(컬럼 권한) | 불가 |
| notification_settings | 본인 | 본인 | 본인 | 본인 |
| record_views | viewer 또는 target 본인 | viewer 본인+같은 크루 | 불가 | 불가 |

## 화면 (목업 `운동앱-목업.html` 피드 탭 기준)

- **피드 탭**: [진행 중 카드들] → [완료 피드 리스트]. 카드: 아바타·닉네임·"n분째 운동 중"·응원 버튼(🔥💪👏🏁+커스텀). 피드 아이템: 아바타·닉네임·상대시각·제목/종목 요약·볼륨·시간·현재 스트릭 🔥n·인증사진(있으면)·반응 바(🔥👏❤️ 카운트+내 토글 강조). 20개 페이지네이션("더 보기").
- **홈**: 기존 "최근 친구 활동" 위에 진행 중 카드 재사용(진행 중인 크루원 있을 때만). 오늘 미운동 크루원 찌르기 버튼은 크루 카드 내.
- **알림함**: 모든 탭 헤더 우상단 🔔+미읽음 뱃지 → 바텀시트 리스트(타입별 아이콘·본문·상대시각·읽음 처리). 열 때 일괄 읽음.
- **응원 배너**: 화면 상단 토스트(발신자·유형 이모지·커스텀 메시지), 4초 자동 소멸.

## 모듈 경계

- `lib/domain/social.ts` (신규, 순수·TDD): `activeSessionsFromEvents`·`unreadCount`·`relativeTime`(기존 time 유틸 재사용 가능하면 생략)·피드 아이템 요약 계산(볼륨 합·종목명 목록 — 기존 volume 도메인 재사용).
- `lib/social.ts` (신규, I/O): `getGroupFeed(groupId, before?)`·`toggleReaction`·`sendCheer`·`pokeUser`·`getActiveCrewSessions`·`getNotifications`·`markAllRead`·`subscribeNotifications(uid, cb)`.
- `components/feed/`: `active-workout-card.tsx`·`feed-item.tsx`·`reaction-bar.tsx`·`cheer-sheet.tsx`(커스텀 입력).
- `components/notification-bell.tsx`(헤더 공용)·`components/cheer-banner.tsx`(Realtime 수신, 레이아웃 레벨).
- `src/app/(tabs)/feed/page.tsx` 전면 구현. 홈은 카드 삽입만.

## 에러·경계 처리

- 응원 실패(쿨다운/한도): RPC 에러 코드 → 버튼 비활성 3초 + 토스트("잠시 후 다시 응원할 수 있어요").
- Realtime 연결 끊김: 배너는 유실돼도 알림함(durable)에서 확인 가능 — 재연결 시 뱃지 재조회.
- 낙관적 반응 토글 실패 시 롤백.
- signed URL 만료(1h): 피드 재조회 시 재발급(기존 홈 크루 사진과 동일 패턴).

## 검증

- unit: `lib/domain/social.ts` TDD(이벤트→진행중 판정: 시작만/시작+완료/취소/다중 세션·경계).
- RLS: `scripts/rls-test.mjs` 확장 — events 크루 경계, reactions unique·비크루 차단·본인 삭제, cheers 본인세션 금지·3회 한도·10초 쿨다운·비크루 차단, notifications 본인만·insert 차단, poke 24h 제한. (목표 90+ 검사)
- E2E(2인, puppeteer-core): A 시작 → B 피드 진행 중 카드 확인 → B 응원 → A 배너 수신 → A 완료 → B 피드 반응 → A 알림 뱃지.
- lint·typecheck·build. 실기기(폰 2대) 스모크 후 커밋.

## 마이그레이션·적용 절차

- 0011 단일 파일(테이블 6 + RLS + `send_cheer`·`poke_user` 신설 + `start_workout`·`complete_workout`·`cancel_workout`·`finalize_challenge` `create or replace` + reactions 트리거 + realtime publication).
- 사용자가 SQL Editor로 1회 적용. `create table if not exists`·`create or replace function`으로 재실행 안전하게 작성.
