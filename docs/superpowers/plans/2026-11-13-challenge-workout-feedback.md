# 운동 전후 챌린지 점수 안내 Implementation Plan

> **For agentic workers:** Use executing-plans / subagent-driven-development for isolated calculation work. User approved the design and implementation in this chat. Production deployment and GitHub push require separate approval.

**Goal:** 진행 중·참가 확정 챌린지가 있는 사용자에게 오늘 계획의 예상 기본 점수와 추가 운동 제안, 완료 후 실제 기본 점수·순위 변화를 제공한다.

**Architecture:** 기존 foldPeriodStats → buildParticipantInput → rankForChallenge를 그대로 재사용한다. 실제 결과는 동일한 조회 자료에서 session_id를 제외/포함해 비교한다. 상대 기록은 조회 시점으로 고정하므로 과거 순위를 복원한다고 표현하지 않는다. 계획은 가상 완료 기록으로 계산하고 제안의 점수는 계획 대비 추가분이다. 새 테이블·라이브러리·AI 호출 없음.

**Tech Stack:** Next.js / React / TypeScript / Supabase / Vitest.

## 확정 범위

- active + joined만 대상. 챌린지 없음·초대·종료·탈퇴·조회실패는 기존 운동 흐름 유지.
- live_ranking=false이면 점수·순위·점수 제안 비노출, 기존 누적 실적 카드 유지.
- 사진 필수 챌린지는 대상 세션이 서버 집계에 들어온 뒤만 확정형 표시. 사진 변경 시 재조회.
- 점수는 기본 점수, v2 동점 가산점은 별도 설명. 순위는 전체 참가자를 같은 규칙으로 다시 계산.
- 오늘 일반 운동 목록을 첫 범위로 한다. 인터벌은 기존 블록 구조를 보존하고 제안으로 변경하지 않는다. 달력 미래 계획·예상 순위·결과 이력 저장은 범위 밖.
- 추가량은 기존/최근 수행량 기준으로 제한, 상위 2개 제안. 자동으로 계획을 바꾸지 않는다.

## Task 1: 서버 운동 식별

Files: src/lib/challenge.ts, src/lib/challenge.test.ts, supabase/migrations/0138_challenge_period_session_ids.sql.

- [x] session_id 보존·구형 응답 호환·잘못된 형식 거절 테스트를 작성하고 실패 확인.
- [x] PeriodSessionRow에 optional sessionId 추가. RPC JSON에 session_id=s.id만 추가, 나머지 게이트/필드/권한 보존.
- [x] 코드 테스트 통과 후 운영 DB 적용 직전 승인 요청. 적용되면 함수 정의/기존 키/권한 재조회 및 pnpm db:snapshot.

## Task 2: 계산

Files: src/lib/domain/challenge-workout-impact.ts, *.test.ts.

- [x] 실제 기여·같은 날·종목 수 문턱·상한·보너스·사이클·v1/v2·동점·누락·비공개 테스트 실패 확인.
- [x] 실제 제외/포함 비교와 계획 전체 완료 비교를 구현. 제안 추가 점수는 계획 완료 상태가 기준.
- [x] 제한된 추가량·같은 종목 합치기·순수성 검사와 관련 테스트 통과.

## Task 3: 조회와 화면

Files: src/lib/challenge-workout-feedback.ts, src/components/record/challenge-workout-*.tsx, src/app/(tabs)/record/page.tsx, related tests.

- [x] 기존 카드/계획 사용자 흐름 테스트에 active+joined/public 조건과 없음 상태를 검증.
- [x] 완료 결과 카드에서 비동기 조회·재시도·사진 변경을 처리하고 운동 저장과 분리.
- [x] 오늘 계획에 예상 기본 점수·추가점수·사용자 선택 적용 버튼 연결. 기존 계획 저장 경로 재사용.
- [x] 조회실패/이전 세션 응답/다중 챌린지 부분 실패가 잘못된 확정형을 만들지 않게 검증.

## Task 4: 검증과 마무리

- [x] 개발 서버에서 Chrome A / Edge B로 실제 사용자 흐름 확인. 리스트/버튼/계획 반영/결과/랭킹 수치 확인. no challenge·비공개·인증대기·실패는 안전한 개발 QA fixture로도 확인.
- [x] pnpm lint, pnpm typecheck, pnpm test, pnpm build와 읽기 전용 회귀를 순차로 1회 실행. 실패 원인 수정 시 해당 검사 재실행.
- [x] 최종 요구사항/코드 리뷰 1회, PROGRESS.md와 HANDOFF에 검사 수치·DB·배포·미검증 기록.
- [ ] 검증한 파일만 커밋하고 원격/브랜치/커밋 수·잔여 파일을 보여주며 푸시 여부 질문. 운영 배포는 별도 승인.

실행 결과와 남은 확인은 [HANDOFF-2026-11-13-challenge-workout-feedback.md](../HANDOFF-2026-11-13-challenge-workout-feedback.md)를 기준으로 한다. 기능 커밋: fadb1cc. 푸시/운영 배포는 별도 승인 단계다.
