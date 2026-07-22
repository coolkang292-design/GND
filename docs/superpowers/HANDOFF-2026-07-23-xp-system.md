# 인수인계서 — XP·35레벨·7단계 캐릭터 시스템

작성 2026-07-23. 다른 에이전트가 이어서 작업할 수 있게 현재 상태·남은 일·주의사항을 정리한다.

## 0. 지금 위치 한 줄 요약

**0022 XP 엔진(Phase A) 완성·실 DB 검증·배포 대기. 홈 캐릭터 카드(Task 10)까지 완료. 다음은 내 정보 성장 허브(Task 11)부터.** 전부 `main`이 아닌 브랜치에만 있고 아직 배포 안 함.

## 1. 문서 지도 (먼저 읽을 것)

| 문서 | 용도 |
|---|---|
| `docs/superpowers/specs/2026-07-23-xp-level-character-system-design.md` | 설계(확정 정책·화면 구성·보완 11건) |
| `docs/superpowers/plans/2026-07-23-xp-level-character-system.md` | **메인 실행 계획(Task 1~14 + 8B)** — 이걸 따라 진행 |
| `docs/superpowers/plans/2026-07-23-plan-completion-xp.md` | 후속 계획(0023 계획완료 +20). **0022 배포 후** 착수 |
| `docs/design/character-image-guide.md` | 캐릭터 이미지 생성 가이드(참고) |

## 2. 브랜치·커밋 상태

- 브랜치: **`feat/xp-level-character-system`** (main 아님, 미배포)
- 커밋(오래된→최신):
  1. `docs: XP·35레벨·7단계 … 설계·계획·이미지 가이드`
  2. `feat: XP·레벨 엔진 (Phase A) — 0022 …`
  3. `feat: 홈 나의 캐릭터 카드 + 7단계 캐릭터 에셋 (Phase B Task 9·10)`

## 3. 완료·검증된 것

### Phase A — 엔진 (Task 1~8 + 8B) ✅ 실 DB 검증 완료
- `supabase/migrations/0022_xp_level_system.sql` — **이미 운영 DB에 적용됨**(사용자가 SQL Editor로 Run). 5테이블·RLS·35레벨 seed·`complete_workout_v2`(멱등)·`apply_xp_and_progress`(공통)·`award_workout_photo_xp`·`is_valid_workout`(내부전용).
- `src/lib/domain/progression.ts` / `xp.ts` — 순수 함수, **챌린지 레벨 `level.ts`와 분리**. 44 단위테스트.
- `src/lib/progression.ts` — 클라 조회(`getProgressSummary`/`getRecentXpTransactions`/`getMyUnlocks`/`getLevelRewards`, userId 인자 없음·RLS 기반·error throw).
- `src/lib/workout.ts` — `completeWorkoutV2` 래퍼 + `WorkoutXpResult` 타입.
- `scripts/xp-test.mjs` — **실 DB 15/15 통과**(멱등·RLS·타바타·DB↔TS 일치·360분·내부함수 보호). `node scripts/xp-test.mjs`로 재실행 가능(픽스처 자동 정리).
- `scripts/recalculate-user-progress.mjs` — 원장 기준 캐시 재계산(dry-run 기본).

### Phase B — Task 9·10 ✅
- `public/characters/char-1~7.png` + `fallback.png` — 매핑대로 배치 완료.
- `src/components/home/character-card.tsx` + `home-client.tsx` 통합 — **실 DB 렌더 확인**(신규 계정 → Lv.1 개노답, 다음 200 XP, "오늘 운동하면 최대 180 XP", 성장 보기 링크).

## 4. 남은 일 (여기서 이어서)

### Phase B 잔여 — 메인 계획 Task 11~14
- **Task 11 — 내 정보 성장 허브** (`src/components/profile/growth-hub.tsx` + 하위): 7단계 캐러셀·현재 단계·레벨 혜택(coming_soon="준비 중")·다음 단계 미리보기·성장 타임라인. `profile/page.tsx` 재구성 + 기존 알림설정을 톱니로 이동. 데이터: `getProgressSummary`/`LEVEL_DEFS`/`getRecentXpTransactions`/`getMyUnlocks`/`getLevelRewards`.
- **Task 12 — XP 획득 방법 시트**: "지금 획득 가능"(기본100·시간·기록·사진·타바타100) vs "준비 중"(주간목표·계획완료).
- **Task 13 — 완료/레벨업/진화 모달**(순차 이벤트 큐): `record/page.tsx`의 완료 경로를 `completeWorkout`→`completeWorkoutV2`로 교체하고 `WorkoutXpResult`로 모달. 기존 `markRecordBeaten` 호출은 유지.
- **Task 14 — 게이트 + 실기기 + 배포**.

### 그 다음 — 0023 계획 완료 보너스
- `docs/superpowers/plans/2026-07-23-plan-completion-xp.md` 6개 Task. **0022 배포 후** 시작.

## 5. 반드시 지킬 주의사항

1. **커밋 규칙(사용자 강함)**: 기능 완성 → 검증 → **사용자 실기기 확인** → 그다음 커밋/배포. 지금까지 코드는 자동 테스트로 검증했고, **배포(main 머지)는 실기기 확인 후**에만.
2. **마이그레이션 정책**: `0022`는 **이미 운영 적용됨** → **절대 수정 금지**. 추가 변경은 `0023+` 새 파일로. (0023은 계획완료용으로 예약)
3. **검증 시 테스트 계정은 반드시 정리**(교훈 13). 온보딩으로 만든 계정은 `service_role`로 크루→유저 순 삭제. 현재 실계정 4개: 오뎅끼데스까·스칼레또·ㄹ홀·낭만송곳니 — 이건 건드리지 말 것.
4. **챌린지 레벨과 혼동 금지**: 이번 성장 레벨(영구 1~35, `progression.ts`)은 챌린지 레벨(임시 1~5, `level.ts`)과 **완전 별개**.
5. **DB↔TS 미러**: 레벨 컷/단계를 바꾸면 `progression.ts`의 `CUTS`/`STAGES`와 `level_definitions`(DB) 둘 다 맞춰야 함. `scripts/xp-test.mjs` 항목7이 불일치를 잡는다.

## 6. ⚠️ 발견된 이슈 (다음 작업 시 우선 처리 권장)

**캐릭터 이미지 최적화 필요** — char-1~7.png가 각 ~2MB(1086×1448)라 총 16MB. Next Image 최적화가 느려 프리뷰 스크린샷이 타임아웃될 정도. 모바일 성능(설계 §31)에도 부담.
- 해결: WebP 변환 + 리사이즈. 단 `character_path`가 **DB(level_definitions)에 이미 `/characters/char-N.png`로 seed**돼 있으니, 경로를 바꾸려면 (a) 이미지 변환 (b) `progression.ts`의 characterPath 생성 규칙 (c) `level_definitions.character_path`를 **새 마이그레이션 0023 이전 번호가 아닌 별도**로 업데이트 — 3곳을 함께 바꿔야 한다. 또는 파일명은 유지(char-N.png)하고 내용만 WebP로 최적화(확장자 유지가 가장 간단).

## 7. 재개 방법

```
1) 이 파일 + 메인 계획(2026-07-23-xp-level-character-system.md) 읽기
2) git checkout feat/xp-level-character-system
3) pnpm test 로 baseline(358 통과) 확인
4) Task 11(내 정보 성장 허브)부터 계획대로 진행
5) UI는 preview_start(next-dev)로 실 렌더 확인, 테스트 계정은 반드시 정리
```
