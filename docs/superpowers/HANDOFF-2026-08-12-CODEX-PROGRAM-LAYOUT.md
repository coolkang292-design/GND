# GND 공식 프로그램 레이아웃 개선 — 새 Codex 채팅 인수인계

> 작성: 2026-08-12
> 작업 담당: 새 Codex 채팅
> 작업공간: `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-recommendation-programs`
> 브랜치: `codex/gnd-recommendation-programs`
> 인수 기준 커밋: `dc139dd`
> 병행 작업: Claude Code가 `gnd-interval-copy` 작업공간에서 기능을 구현 중

## 1. 목표

Claude의 기능 작업을 기다리지 않고, 서로 겹치지 않는 공식 프로그램 선택 흐름의 레이아웃을 먼저 완성한다.

개선 화면은 네 가지다.

1. 운동 추가 첫 화면
2. 프로그램 5종 목록
3. 프로그램 상세
4. 시작일·요일·시간·18회 미리보기

핵심 기준은 다음과 같다.

- 처음 보는 사람도 3초 안에 `프로그램으로 시작`과 `운동 직접 고르기`를 구분한다.
- 최종 생성된 검정·금색 대표 이미지 5장을 가장 강한 시각 자극으로 사용한다.
- 중요한 선택은 크게, 보조 기능은 작게 배치한다.
- 제목·설명·버튼이 서로 경쟁하지 않게 시각적 위계를 만든다.
- 모바일을 우선하고 데스크톱에서도 폭과 간격이 어색하지 않게 한다.
- 기존 기능·데이터·콜백은 바꾸지 않는다.

## 2. 반드시 먼저 읽을 문서

다음 순서로 읽는다.

1. `C:\Users\SAMSUNG\workout-app\CLAUDE.md`
2. `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-recommendation-programs\docs\superpowers\specs\2026-08-12-recommendation-hub-cognitive-layout-design.md`
3. `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-recommendation-programs\docs\superpowers\specs\2026-08-12-gnd-image-layout-quality-design.md`
4. `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-recommendation-programs\docs\superpowers\plans\2026-08-12-exercise-entry-hub-and-program-ui.md`
5. `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-recommendation-programs\docs\superpowers\HANDOFF-2026-08-12-CLAUDE-OFFICIAL-PROGRAM-REMAINDER.md`

마지막 문서는 Claude의 병행 범위를 확인하기 위한 것이며, 그 기능을 대신 구현하지 않는다.

## 3. 현재 완료된 이미지

다음 파일은 최종 승인된 자산이다.

- `public/program-assets/shoulder.webp`
- `public/program-assets/chest.webp`
- `public/program-assets/arms.webp`
- `public/program-assets/lower.webp`
- `public/program-assets/lean.webp`

의미:

- 어깨: 후면 덤벨 숄더프레스 + 체열 수증기
- 가슴: 얼굴이 가려진 덤벨 가슴 운동 + 체열 수증기
- 팔: 얼굴이 가려진 케이블 운동 + 체열 수증기
- 하체: 얼굴이 가려진 사이드 런지 + 체열 수증기
- 전신 인터벌: 모자를 쓴 검정·금빛 전신 실루엣

이 이미지는 재생성·교체·파일명 변경하지 않는다. `object-position`, 카드 비율, 오버레이, 크롭 방식은 레이아웃 목적에 맞게 조정할 수 있다.

## 4. 수정 허용 파일

기본 허용 범위:

- `src/components/record/exercise-entry-hub.tsx`
- `src/components/record/exercise-entry-hub.test.tsx`
- `src/components/programs/program-catalog.tsx`
- `src/components/programs/program-catalog.test.tsx`
- `src/components/programs/program-schedule-setup.tsx`
- `src/components/programs/program-schedule-setup.test.tsx`
- `src/components/programs/program-flow.tsx`
- `src/components/programs/program-flow.test.tsx`
- `src/app/(tabs)/record/programs/page.tsx`
- 해당 화면만을 위한 새 파일: `src/components/programs/*`

기존 아이콘이 부족한 것이 확인된 경우에만 다음 범위를 추가할 수 있다.

- `public/ui-icons/` 아래 새 검정·금색 아이콘
- 그 아이콘만 검증하는 전용 테스트

아이콘이나 이미지 생성이 필요하면 `imagegen` 스킬을 사용하고, 최종 파일을 프로젝트 폴더에 저장한 뒤 실제 카드 크기로 확인한다. 이모지는 새로 늘리지 않고 기존 금색 선 아이콘 또는 생성한 일관된 자산을 우선한다.

## 5. 수정 금지 파일

Claude가 동시에 수정 중이거나 기능 책임이 있는 파일이다. 건드리지 않는다.

- `src/app/(tabs)/record/page.tsx`
- `src/components/record/calendar-view.tsx`
- `src/components/record/calendar-view.test.tsx`
- `src/components/feed/*`
- `src/components/profile/*`
- `src/components/challenge/*`
- `src/lib/challenge.ts`
- `src/lib/challenge.test.ts`
- 운동 카드·휴식 타이머·무게 추천·노력 피드백 관련 파일
- 운동 자세 안내·외부 링크 관련 파일
- `src/lib/programs.ts`
- `src/lib/domain/official-programs.ts`
- `src/lib/domain/program-schedule.ts`
- Supabase 마이그레이션과 DB 테스트 스크립트
- 대표 이미지 5장
- `PROGRESS.md`와 기존 최종 인수인계서

공용 타입이나 기능 변경이 필요해 보이면 수정하지 말고 이유와 필요한 인터페이스만 보고한다.

## 6. 화면별 디자인 요구

### A. 운동 추가 첫 화면

- `프로그램으로 시작하기`를 가장 큰 주 행동으로 둔다.
- 프로그램 카드에는 이미지·`GND 추천` 배지·6주 자동 계획이라는 결과를 보여준다.
- `운동 직접 고르기`는 두 번째 큰 행동으로 분명히 유지한다.
- 지난 운동·내 루틴·전신 인터벌은 `빠른 시작` 보조 영역으로 묶는다.
- 프로그램 카드가 검색 카드를 밀어내거나 검색 진입을 숨기면 안 된다.
- 버튼 전체가 클릭 영역이며 최소 높이 44px를 유지한다.

### B. 프로그램 목록

- 어깨 프로그램을 전폭 대표 카드로 배치한다.
- 가슴·팔·하체·체지방 관리는 2×2 카드로 배치한다.
- 카드에서 가장 먼저 이미지, 다음으로 헤드라인, 마지막으로 `주 3회 · 6주 · 회당 시간`이 읽힌다.
- 2×2 카드의 이미지 높이·텍스트 높이·카드 높이를 통일한다.
- 이미지는 인물 얼굴보다 운동 실루엣과 금빛 동작이 보이도록 크롭한다.
- 텍스트를 이미지 위에 과도하게 겹치지 않는다.
- 작은 화면에서 제목이 잘리거나 카드 높이가 들쭉날쭉하지 않게 한다.

### C. 프로그램 상세

정보 순서:

1. 대표 이미지와 헤드라인
2. `주 3회 · 6주 · 18회 · 회당 시간`
3. 이런 사람에게 적합한 이유
4. 전신 기본 운동과 목표 부위 집중 설명
5. A회차 실제 구성 미리보기
6. 자동 무게·반복·휴식 설정 설명
7. 안전 안내
8. 하단 고정 CTA `요일과 시간 정하기`

요구:

- 같은 모양의 회색 카드가 반복되지 않도록 섹션 강도를 나눈다.
- 핵심 수치는 작은 요약 칩으로 빠르게 읽히게 한다.
- 운동 목록은 이름·반복 범위·휴식을 한눈에 비교할 수 있게 정렬한다.
- 하단 CTA가 내용이나 모바일 탭 바를 가리지 않는다.
- 뒤로가기의 접근성 이름과 클릭 영역을 유지한다.

### D. 3단계 일정 등록

공통:

- 현재 단계 `1/3`, `2/3`, `3/3`이 즉시 보인다.
- 한 화면에서 다음 행동 하나가 가장 강하게 보인다.
- 오류는 해당 선택 가까이에 표시한다.
- 데이터 계산과 저장 로직은 변경하지 않는다.

1단계:

- `이번 주 시작`, `다음 주 시작`을 빠른 선택으로 제공한다.
- 직접 날짜 선택은 보조 행동으로 둔다.

2단계:

- 추천 요일 조합을 먼저 보여준다.
- 직접 선택은 그다음에 둔다.
- 주 3회와 회복 간격 조건을 선택 즉시 이해할 수 있게 한다.
- 같은 시간/요일별 시간 UI의 위계를 분리한다.

3단계:

- 18개를 평평한 긴 목록으로만 보여주지 않는다.
- 6주 × 3회 구조로 묶는다.
- 충돌된 날짜와 대체 날짜가 있다면 시각적으로 분명히 구분한다.
- 저장 버튼 문구는 `18회 계획을 달력에 담기`처럼 결과를 설명한다.
- 저장 중 중복 클릭 방지와 기존 오류 처리 동작을 유지한다.

등록 완료:

- 성공 상태, 첫 운동 날짜·시간·회차를 가장 먼저 보여준다.
- 다음 행동은 달력에서 계획 확인하기 하나로 집중한다.

## 7. 아이콘 준비 규칙

먼저 기존 `public/ui-icons/`와 코드 기반 `GoldLineIcon`을 조사한다.

필요 후보:

- 달력
- 시계
- 주 3회
- 6주 과정
- 18회 계획
- 무게 추천
- 반복 횟수
- 휴식시간
- 등록 완료

그러나 숫자·텍스트 칩으로 더 명확하면 아이콘을 만들지 않는다. 같은 뜻의 기존 아이콘이 있으면 재사용한다. 새 아이콘은 정말 부족한 것만 제작하고, 프로그램 대표 이미지와 경쟁하지 않게 작은 보조 요소로 쓴다.

## 8. 구현 절차

1. 저장소·브랜치·기존 변경 확인
2. 허용 파일과 테스트 읽기
3. 현재 화면을 개발 서버에서 직접 열어 기준 스크린샷 확보
4. 화면별 레이아웃 실패 테스트를 먼저 추가해 RED 확인
5. 가장 작은 CSS·마크업 변경으로 GREEN
6. 모바일 390px 안팎과 데스크톱 폭에서 직접 조작
7. 관련 테스트·변경 파일 ESLint·typecheck·diff-check
8. 논리적 커밋 1~2개
9. 최종 커밋 SHA와 변경 파일·검증·미검증 보고

화면 변경이므로 개발 서버에서 직접 눌러 확인해야 한다. 단, Claude의 미완성 기능을 기다리거나 대신 구현하지 않는다. 현재 가능한 프로그램 진입·목록·상세·일정 선택까지만 확인한다.

## 9. 최소 검증

관련 테스트:

```powershell
pnpm test -- src/components/record/exercise-entry-hub.test.tsx src/components/programs/program-catalog.test.tsx src/components/programs/program-schedule-setup.test.tsx src/components/programs/program-flow.test.tsx
```

정적 검사:

```powershell
pnpm typecheck
pnpm exec eslint src/components/record/exercise-entry-hub.tsx src/components/record/exercise-entry-hub.test.tsx src/components/programs src/app/(tabs)/record/programs/page.tsx
git diff --check
```

PowerShell에서 괄호 경로는 따옴표로 감싼다.

```powershell
pnpm exec eslint 'src/app/(tabs)/record/programs/page.tsx'
```

전체 test와 build는 Claude 기능을 통합한 뒤 Codex 최종 검수 단계에서 한 번 실행한다. 이 레이아웃 작업에서는 관련 검사와 typecheck까지만 수행한다.

## 10. Git과 안전

- `git add .` 금지
- `tmp/` 미리보기는 스테이징하지 않음
- 사용자 기존 변경을 보존
- DB·네트워크·외부 사용자 작업 없음
- 운영 배포·push·main 병합 없음
- Claude 브랜치를 중간에 merge/cherry-pick하지 않음
- 레이아웃 작업 커밋만 남기고 최종 통합은 기존 Codex 채팅에서 수행

## 11. 완료 보고

다음을 보고한다.

1. 변경된 화면과 사용자에게 보이는 차이
2. 새로 만든 자산이 있다면 경로·용도·생성 프롬프트
3. 변경 파일 목록
4. 관련 테스트 수치
5. typecheck·ESLint·diff-check 결과
6. 개발 서버에서 직접 누른 경로와 확인 결과
7. Claude 작업과 겹치지 않았다는 파일 범위 확인
8. 최종 커밋 SHA
9. 통합 뒤 Codex가 확인해야 할 위험

완료했다고 말하기 전에 현재 화면을 직접 확인한다. 배포하지 않는다.

---

## 12. 2026-08-12 Codex 작업 중지 시점 인계 상태

사용자 요청으로 구현을 중지하고 Claude가 이어서 작업하도록 현재 상태를 기록한다.

### Git 기준

- 작업공간: `C:\Users\SAMSUNG\workout-app\.worktrees\gnd-recommendation-programs`
- 브랜치: `codex/gnd-recommendation-programs`
- 완료 커밋: `c7f27cbb32b8d4f69b0f32582e3ee5aeb73ab2c3` (`feat: 운동 추가와 프로그램 화면 레이아웃 개선`)
- 아래 6주 전체 구성 작업은 **미커밋** 상태다.
- `tmp/`는 작업 전부터 있던 추적되지 않은 폴더다. 열거나 스테이징하지 않는다.
- 배포·push·main 병합·DB 작업은 하지 않았다.

### 완료 커밋 `c7f27cb`에 포함된 화면 변경

- 운동 없음 화면의 기존 이미지를 유지하면서 설명과 첫 운동 추가 행동을 하나의 시작 카드로 통합했다.
- 운동 추가 허브에서 프로그램 시작과 직접 선택의 위계를 정리했다.
- 프로그램 5종을 대표 카드 1장 + 2×2 카드로 정리했다.
- 프로그램 상세의 이미지 크롭, 핵심 수치, 적합 대상, 운동표, 자동 설정 안내, 안전 안내, 고정 CTA 위계를 정리했다.
- 일정 등록을 3단계 구조로 정리하고 18회 미리보기와 완료 화면을 개선했다.
- 운동명을 누르면 같은 표 안에서 짧은 설명을 펼치는 기능과 `세트 사이 휴식` 표기를 추가했다.
- 새 이미지·아이콘 자산은 만들지 않았고 승인된 대표 이미지 5장을 그대로 사용했다.

### 현재 미커밋 변경 파일

- `src/components/programs/program-catalog.tsx`
- `src/components/programs/program-catalog.test.tsx`
- `src/components/programs/exercise-preview-notes.ts`
- 이 인수인계서

현재 코드 변경 규모는 프로그램 컴포넌트 3파일 기준 `177 insertions(+), 31 deletions(-)`다.

### 현재 미커밋 화면 변경

- 프로그램 상세에 `6주 전체 구성` 카드를 추가했다.
- 1주부터 6주까지 각각 `A · B · C`를 보여 주며, 현재 데이터가 주차별 변형 없이 같은 세 회차를 반복한다는 사실만 표현한다.
- `회차별 상세`에서 A/B/C 탭을 직접 전환할 수 있다.
- 선택한 회차의 모든 운동, 반복 범위, 세트 사이 휴식, 초보·경험자 세트 수를 보여 준다.
- 세트 수가 같으면 `초보·경험 3세트`, 다르면 `초보 2세트 · 경험 3세트`처럼 표시한다.
- B/C에서 새로 노출되는 운동을 포함해 공식 프로그램의 고유 운동 27종 모두 짧은 설명을 열 수 있게 보완했다.
- 기능 로직과 `official-programs.ts` 데이터는 변경하지 않았다.

### TDD 기록

1. 6주 로드맵, A/B/C 탭 전환, 세트 수, 모든 회차 설명 테스트를 먼저 추가했다.
2. 첫 실행: 7개 중 3개 실패. `회차별 상세`, 6주 로드맵, 탭이 없는 예상된 RED였다.
3. 구현 뒤 단일 파일 테스트: `7/7` 통과.
4. 관련 화면 전체 테스트: `5 files, 32/32` 통과.

검증 명령과 결과:

```powershell
pnpm test -- src/components/programs/program-catalog.test.tsx src/components/programs/program-flow.test.tsx src/components/programs/program-schedule-setup.test.tsx src/components/record/exercise-entry-hub.test.tsx src/components/record/record-empty-state.test.tsx
# 5 files, 32 tests passed

pnpm typecheck
# exit 0

pnpm exec eslint src/components/programs/program-catalog.tsx src/components/programs/program-catalog.test.tsx src/components/programs/exercise-preview-notes.ts
# exit 0

git diff --check
# exit 0, Windows LF→CRLF 경고만 표시
```

전체 test와 build는 원래 인수인계 범위대로 아직 실행하지 않았다. Claude 기능 통합 뒤 한 번 실행한다.

### 개발 서버 직접 확인

- 개발 서버: `http://localhost:3100`
- 확인 페이지: `http://localhost:3100/record/programs`
- 현재 리스너 PID: `22788`
- 실행 명령: `pnpm exec next dev -p 3100`
- 표준 출력 로그: `C:\Users\SAMSUNG\AppData\Local\Temp\gnd-codex-dev-3100-v2.out.log`
- 오류 로그: `C:\Users\SAMSUNG\AppData\Local\Temp\gnd-codex-dev-3100-v2.err.log`

직접 누른 흐름:

1. 프로그램 목록에서 `시선이 머무는 어깨` 선택
2. 상세에서 1~6주 `A · B · C` 여섯 개 확인
3. B 탭 선택 → `등판과 뒤쪽 어깨`와 `루마니안 데드리프트` 표시 확인
4. `루마니안 데드리프트 설명 보기` 선택 → 설명 펼침 확인
5. C 탭 선택 → `덤벨 레터럴 레이즈`, `초보 3세트 · 경험 4세트` 확인
6. 모바일 390×844에서 `bodyScrollWidth = viewportWidth = 390`, 가로 넘침 없음
7. 데스크톱 1280×900에서 `bodyScrollWidth = viewportWidth = 1280`, 앱 본문 폭 430px로 중앙 정렬 확인
8. 브라우저 콘솔 error/warning 0건

앱 내 브라우저에는 `/record/programs` 한 탭만 남겼고 C회차가 선택된 상태다. 임시 뷰포트 강제 설정은 해제했다.

### 사용자와 확정했지만 아직 구현하지 않은 기능

다음은 이번 레이아웃 허용 파일 밖이므로 구현하지 않았다.

1. 주 3회 선택은 유지하되 요일 간격 제한 제거
   - 금·토·일 같은 연속 3일 허용이 사용자 확정 사항이다.
   - 현재 UI·도메인·DB의 회복 간격 제한은 그대로 남아 있다.
   - 관련 금지 파일: `src/lib/domain/program-schedule.ts`, `src/lib/programs.ts`, 마이그레이션/RPC.

2. 프로그램 운동표 입력 간소화
   - 반복 횟수 자동 채움
   - 최근 기록 기반 무게 제안
   - 운동별 한 번 확인하면 모든 세트에 적용
   - 운동 중 변경 시 남은 세트에 반영
   - 신규 사용자는 운동별 최초 한 번만 입력
   - 관련 금지 파일: `src/app/(tabs)/record/page.tsx`와 무게·운동 카드 로직.

3. 종목별 세트 사이 휴식 타이머 자동 적용
   - 프로그램 데이터의 `restSeconds`는 계획에 저장되지만 실제 운동 타이머는 현재 전역 기본값을 사용한다.
   - 상세 화면의 `무게와 휴식도 미리 맞춰드려요` 문구는 실제 실행 기능보다 앞서 있으므로 통합 전 반드시 기능 구현 또는 문구 하향 조정이 필요하다.

### Claude가 이어서 할 권장 순서

1. 먼저 `git status --short`로 위 미커밋 3개 코드 파일과 이 문서만 있는지 확인한다.
2. 앱 내 브라우저의 현재 C회차 화면을 보고 6주 로드맵과 운동표의 정보 밀도가 적절한지 판단한다.
3. 현재 미커밋 구현을 유지한다면 관련 32개 테스트와 정적 검사를 다시 한 번 실행한 뒤 별도 커밋한다.
4. Claude의 기능 작업과 통합할 때 위 세 가지 미구현 기능을 연결한다.
5. 연속 3일 허용은 DB/RPC와 클라이언트 검증을 함께 바꿔야 하므로 별도 고위험 작업으로 처리한다.
6. 전체 test·build 후 `/record` → 프로그램 선택 → 일정 등록 → 실제 운동 시작까지 개발 서버에서 다시 클릭한다.

### 충돌 여부와 통합 위험

- 현재 코드 변경은 `src/components/programs/*` 세 파일뿐이며 Claude 병행 작업공간의 `record/page.tsx`, 캘린더, 피드, 프로필, 챌린지, DB 파일과 겹치지 않았다.
- 이 인수인계서 갱신 외에는 문서나 금지 파일을 수정하지 않았다.
- 6주 로드맵은 주차별 점진 과부하나 단계 구성을 새로 만든 것이 아니다. 현재 데이터의 A/B/C 반복을 정직하게 시각화한 것이다.
- 실제 일정 날짜는 기존 3단계 미리보기에서 별도로 보여 준다.
- `selectedSessionKey`는 상세 컴포넌트가 프로그램 변경 때 재마운트된다는 현재 흐름을 전제로 한다. 같은 컴포넌트 인스턴스에서 `program` prop만 교체하는 통합이 생기면 A회차로 초기화하는 처리가 필요하다.
- 개발 서버는 유지했지만 Codex 작업 종료나 PC 상태에 따라 PID가 바뀔 수 있으므로 Claude가 시작할 때 HTTP 200과 리스너를 다시 확인한다.
