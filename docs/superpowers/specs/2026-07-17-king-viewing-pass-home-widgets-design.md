# 꾸준왕 열람권 + 홈 위젯 설계 (Phase 6 후속)

- 날짜: 2026-07-17
- 상태: 사용자 승인 완료 (brainstorming Q&A로 확정)
- 선행: Phase 6 소셜 완료(0011 적용·실기기 통과). `record_views` 테이블·`record_viewed` 알림 타입·`notification_settings.record_views`는 0011에 선반영됨.

## 1. 확정 결정 (사용자 Q&A)

1. **꾸준왕 기준 = 고정 주 5회** (개인 주간 목표와 무관). 목업의 "주 5회 달성자만" 그대로.
2. **세는 방식 = 운동한 '날' 5일** — 하루 2번 운동해도 1회. 몰아치기 방지, 스트릭·달력과 일관.
3. **열람권 모델(목업에서 변경)**: 목업은 "꾸준왕의 성과를 누구나 열람"이었으나, 사용자 결정으로 **"꾸준왕이 열람권을 획득"**으로 뒤집음.
   - 이번 주 5일째 운동을 완료하는 순간 열람권 1장 획득.
   - 획득 후 **24시간 유효**, 크루원 1명 지정 **1회 열람**, 미사용 시 자연 소멸. 주당 최대 1장(사용/소멸 후 재발급 없음, 다음 주에 다시 획득).
4. **열람 내용 = 챌린지 잠금 해제**: 대상의 ① 이번 주 운동 일수 ② 🔥 스트릭 ③ 진행 중 챌린지가 있으면 그 사람의 달성률·현재 순위(Phase 5에서 🔒로 숨긴 정보를 여는 열쇠).
5. **열람 시 상대에게 👀 알림** ("OO님이 회원님의 기록을 확인했어요"). 열람권이 주당 1장·1회라 알림 도배 없음 — 별도 중복 억제 불필요.
6. **홈 위젯 범위**: 스트릭 카드 + 주간 stat 3칸 + 스트릭 소멸 경고 배너(Phase 7에서 앞당김) + 꾸준왕 카드. **그룹 공동 목표 진행바는 제외.**
7. **구현 접근 = A안(파생 상태)**: 열람권 테이블 없이, 열람 순간 서버 RPC가 운동 기록·열람 기록으로 자격을 판정. 소멸은 시간 경과로 자연 파생.

## 2. 도메인 규칙

- **주간**: KST 월요일 00:00 시작(챌린지·스트릭과 같은 tz dayKey 체계).
- **운동한 날**: 완료(completed) 세션의 `completed_at`을 KST dayKey로 접은 고유 날짜 수.
- **열람권 획득 시각** = 이번 주 5번째 고유 날짜를 만든 세션의 `completed_at`. 유효기간 = +24h.
- **자격 판정** (서버·클라 동일 로직):
  1. 이번 주 운동한 날 ≥ 5
  2. now < 획득 시각 + 24h
  3. 이번 획득분 미사용 — `record_views`에 (viewer=나, viewed_at ≥ 획득 시각) 행이 없음
  4. 대상 = 같은 크루원, 본인 제외
- **상태 모델** (홈 꾸준왕 카드 표시용): `progress`(n/5일) → `available`(열람권 보유, 만료까지 남은 시간) → `used`(이번 주 사용함) / `expired`(미사용 소멸). 주가 바뀌면 `progress`로 리셋.

## 3. 서버 — 마이그레이션 `0012_record_view_rpc.sql`

- `view_record(p_target uuid) returns void` — security definer:
  1. 위 자격 판정 4가지를 서버에서 재검증. 실패 시 `raise exception` 사유 코드: `not_eligible` / `pass_expired` / `pass_used` / `not_crew` / `self_view`.
  2. 통과 시 `record_views` insert (`challenge_id` = 대상 크루의 진행 중(active) 챌린지 id, 없으면 null).
  3. 대상의 `notification_settings.record_views`가 false가 아니면(행 없음 = true) 0011의 `notify()` 헬퍼로 `record_viewed` 알림 insert.
- **직접 쓰기 회수**: 0011에서 열어둔 `record_views` insert grant·`record_views_insert_own` 정책 제거 → 이후 기록은 RPC 경유만. select 정책(viewer·target 본인)은 유지.
- 재실행 안전(`create or replace` / `drop policy if exists`), SQL Editor 1회 적용. 다른 RPC(complete_workout 등) 변경 없음.

## 4. 클라이언트

### 4.1 도메인 (TDD, `src/lib/domain/viewing-pass.ts`)

순수 함수만, 기존 `time.ts`의 dayKey 체계 재사용:

- `workoutDaysInWeek(sessions, now, tz)` — 이번 주 고유 운동 날짜 수·5일째 세션의 completed_at.
- `viewingPassStatus(sessions, myViewsThisPass, now, tz)` → `{ state, daysDone, acquiredAt?, expiresAt? }` (상태 모델 §2).
- 테스트 케이스: 주 경계(월요일 자정 직전/직후)·하루 2세션=1일·5일째 판정·24h 만료 직전/직후·사용 소진·주 넘어가면 리셋·연말 경계.

### 4.2 I/O (`src/lib/social.ts` 확장)

- `viewRecord(targetId)` — RPC 호출, 실패 사유를 `SocialError` 코드로 매핑.
- `getMyRecordViewsSince(ts)` — 이번 획득분 사용 여부 판정용.
- 성과 시트 데이터는 기존 재사용: `getCompletedSessions`(대상 주간·스트릭), `lib/challenge.ts getPeriodStatsByUser`+`actualForGoal`+`goal-score`(달성률·순위 — 완료 세션은 크루 공개 데이터라 클라 계산 가능, Phase 5 한계 기록 그대로).

### 4.3 홈 UI (목업 시각 스펙 준수)

홈 배치(위→아래): 히어로 → **스트릭 카드** → **소멸 경고 배너** → **주간 stat 3칸** → 진행 중 카드 → 크루 카드 → **꾸준왕 카드** → 최근 친구 활동.

- `components/home/streak-card.tsx` — 🔥 스트릭 n일·마지막 운동 n일 전·최근 7일 요일 점(운동일 채움). `lib/domain/streak.ts` 재사용.
- 소멸 경고 배너 — 스트릭 보유 && 오늘 미운동일 때만 D-n 단계 메시지(`streak.ts` 단계 판정 재사용). 스트릭 카드 파일에 포함.
- `components/home/weekly-stats.tsx` — 이번 주 운동 n일(/개인 목표 N)·목표 달성률 %·🔥 스트릭.
- `components/home/king-card.tsx` — 상태별 표시: `progress` "이번 주 n/5일 — m일 더 하면 열람권" / `available` "🎟️ 열람권 · n시간 남음" + 크루원 선택(본인 제외) / `used`·`expired` 안내. 선택 → 확인 모달("1회용이에요. 상대에게 확인 알림이 가요") → `viewRecord` → **성과 시트**(운동 일수·스트릭·챌린지 달성률·순위, 챌린지 없으면 해당 줄 생략).
- 데이터: 내 완료 세션 1회 조회를 홈 클라이언트 래퍼에서 공유(스트릭 카드·stat·꾸준왕 카드 props로 전달) — 중복 fetch 방지.

## 5. 알림함

`record_viewed`는 기존 알림함·🔔 뱃지 구조(서버 저장 title/body 그대로 렌더)에 자동 표출 — 클라 변경 없음.

## 6. 에러 처리

- RPC 실패 코드별 사용자 문구: `not_eligible` "이번 주 5일을 채우면 열람권이 생겨요" / `pass_expired` "열람권이 만료됐어요" / `pass_used` "이번 주 열람권을 이미 사용했어요" / `not_crew`·`self_view` 방어적 문구.
- 홈 카드가 클라 판정으로 버튼을 미리 숨기더라도 서버가 최종 강제(경합·시계 차이 대비).

## 7. 검증

- unit: viewing-pass TDD 추가 (기존 104 + α).
- RLS 확장(`scripts/rls-test.mjs`): record_views 직접 insert 차단·RPC 자격 미달/만료/이중 사용/크루 밖/본인 거절·정상 열람 후 대상의 알림 수신.
- lint · typecheck · build. 실기기 확인: 홈 위젯 표시·열람 흐름·👀 알림 수신.

## 8. 비범위 (이번에 안 함)

- notification_settings UI(Phase 7) — RPC는 플래그만 존중.
- 그룹 공동 목표 진행바(제외 결정), 아침 브리핑·등수 변동 알림(Phase 7).
- 목업의 "이번 주 꾸준왕이에요 🏅" 자기 축하 배너·축하 알림 — 꾸준왕 카드 `available` 상태 문구로 갈음.
