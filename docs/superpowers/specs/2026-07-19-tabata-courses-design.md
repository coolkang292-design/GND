# 타바타 코스·표식·챌린지 연동 설계

## 목표

타바타 모드(2026-07-19 1차 구현)를 확장한다 — 사용자 확정(모두 추천안): ①4·8·16분 코스 선택 ②구성 운동 4개 고정(긴 코스는 반복) ③8·16분 음원은 원본을 이어붙인 파일 제작·내장 ④세션에 타바타 표식을 남겨 피드·달력 배지 표시 ⑤챌린지 목표 유형 "타바타 횟수" 추가.

## 구성

### 1. 음원 (빌드 산출물)

- 원본 `public/audio/tabata-4min-total-body.mp3`(4분23초)를 ffmpeg concat으로 2회(`tabata-8min-total-body.mp3`)·4회(`tabata-16min-total-body.mp3`) 이어붙여 내장한다. 블록마다 인트로 멘트가 반복돼 숨돌리기 구간 역할.
- `TABATA_TRACKS`를 코스 배열로 확장: `{ id, title, src, minutes(4|8|16) }`.

### 2. 코스 선택 UI (`tabata-sheet.tsx`)

- setup 화면에 코스 버튼 3개(4분·8분·16분, 기본 4분). 선택한 코스의 음원으로 재생·자동 기록. 운동 선택은 코스와 무관하게 4개 고정.

### 3. 타바타 표식 (0019 ①)

- `workout_sessions.tabata_minutes int` (check in (4,8,16), null=일반 운동) + authenticated의 해당 컬럼 insert 권한.
- 타바타 시작 시 세션 생성에 코스 분수를 저장(`createDraftSession` 파라미터 확장). 일반 운동은 null.
- 피드·달력 조회에 컬럼 추가 → 카드에 "🔥 타바타 N분" 배지 (기록 갱신 배지와 같은 계열).

### 4. 챌린지 "타바타 횟수" (0019 ②)

- `challenges`·`user_goals`의 goal_type 체크 제약에 `tabata_count` 추가(record_beaten 때처럼 제약 이름 무관 교체 패턴).
- 도메인: `plannedDaysForPeriod` 환산·rate 정규화에 tabata_count 포함(TDD — 목표 N회 대비 실제 횟수).
- 실적: `getPeriodStatsByUser`가 기간 내 `tabata_minutes not null` 완료 세션 수(`tabataCount`)를 노출, `actualForGoal('tabata_count')` = tabataCount.
- UI: KPI 목표 선택지에 "타바타 횟수 🔥" 추가(하루량×주N일 환산 그대로), 목표 라벨·단위 "회".

## 오류 처리

- 0019 미적용 상태의 구버전 클라이언트는 tabata_minutes를 보내지 않으므로 무해. 신버전 배포는 0019 적용 후에만 한다(기록 갱신 때와 동일한 순서 규칙).
- 음원 파일 누락 시 재생 오류 안내(1차 구현의 playError 재사용).

## 테스트

- 도메인 TDD: 코스 목록 무결성(분수·파일 매핑), goal-score의 tabata_count 환산·rate.
- 실 DB(0019 적용 후): tabata_minutes insert 허용·범위 제약, tabata_count 챌린지 생성 성공(기존 챌린지 스크립트 관례), 기존 게이트 전체 재통과.
- 실기기: 8분 코스 재생(이어붙인 블록 전환 확인)→자동 기록→피드 배지, 챌린지 만들기에서 타바타 목표 설정→타바타 1회 후 달성률 반영.

## 제외 범위

- 코스별 다른 운동 구성, 라운드 시각 타이머, 타바타 적합 운동 태그, 음원 다중 트랙 UI(구조만 유지)
