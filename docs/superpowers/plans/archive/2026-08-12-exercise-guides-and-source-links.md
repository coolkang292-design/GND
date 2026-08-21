# GND Exercise Guides and Source Links Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 운동 카드에서 GND의 짧은 자세·호흡·실수·안전 안내를 즉시 보고, 검수된 운동만 네이버 지식백과 원문을 선택적으로 외부에서 열 수 있게 한다.

**Architecture:** 안내 카피와 검수된 URL은 사용자 데이터가 아니므로 버전 관리되는 TypeScript 정적 맵에 둔다. 앱은 GND 안내를 항상 우선 렌더하고 외부 콘텐츠를 복사·iframe 삽입하지 않는다. 원문 링크가 없거나 열리지 않아도 운동 기록 기능과 GND 안내는 그대로 동작한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Vitest, Testing Library

---

## 실행 전 조건

- 설계 원문: `docs/superpowers/specs/2026-08-12-official-workout-programs-design.md`
- 이 계획은 DB 마이그레이션이 없다.
- 네이버 URL은 사람이 운동명과 페이지를 대조한 것만 넣는다. 문서 ID를 검색 패턴으로 추측하지 않는다.
- 네이버의 본문·사진·영상은 저장소나 번들에 복사하지 않는다.

## 파일 구조

**생성**

- `src/lib/domain/exercise-guides.ts` — GND 안내와 선택적 출처 URL
- `src/lib/domain/exercise-guides.test.ts` — 첫 프로그램 종목 안내 완전성·URL 계약
- `src/components/record/exercise-guide-sheet.tsx` — 안내 바텀시트와 외부 링크
- `src/components/record/exercise-guide-sheet.test.tsx` — 섹션·출처·폴백·접근성

**수정**

- `src/components/record/exercise-card.tsx` — `자세 안내` 진입
- `src/components/record/exercise-card.test.tsx` — 버튼과 기록 UI 회귀
- `src/components/record/active-session-overlay.tsx` — 운동 중 안내 진입
- `src/components/record/active-session-overlay.test.tsx` — 운동 중 시트 연결
- `src/app/(tabs)/record/page.tsx` — 선택 운동 안내 시트 상태
- `PROGRESS.md` — 실측 결과

---

### Task 1: 안내 데이터 계약 TDD

**Files:**
- Create: `src/lib/domain/exercise-guides.test.ts`
- Create: `src/lib/domain/exercise-guides.ts`

- [ ] **Step 1: 안내 완전성 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import { EXERCISE_GUIDES, guideForExercise } from "./exercise-guides";

const SHOULDER_PROGRAM_EXERCISES = [
  "바벨 백스쿼트", "벤치프레스", "시티드 로우", "숄더프레스",
  "사이드 레터럴 레이즈", "루마니안 데드리프트", "랫풀다운",
  "인클라인 벤치프레스", "페이스풀", "덤벨 컬", "레그프레스",
  "덤벨 벤치프레스", "바벨 로우", "덤벨 레터럴 레이즈", "케이블 푸시다운",
] as const;

it("첫 공식 프로그램의 모든 운동은 GND 핵심 안내를 가진다", () => {
  for (const name of SHOULDER_PROGRAM_EXERCISES) {
    const guide = guideForExercise(name);
    expect(guide?.setup.length).toBeGreaterThan(0);
    expect(guide?.movement.length).toBeGreaterThan(0);
    expect(guide?.breathing.length).toBeGreaterThan(0);
    expect(guide?.mistakes.length).toBeGreaterThan(0);
    expect(guide?.caution.length).toBeGreaterThan(0);
  }
});

it("검수된 네이버 링크만 https terms.naver.com 원문으로 허용한다", () => {
  for (const guide of Object.values(EXERCISE_GUIDES)) {
    if (!guide.source) continue;
    expect(guide.source.provider).toBe("네이버 지식백과");
    expect(new URL(guide.source.url).protocol).toBe("https:");
    expect(new URL(guide.source.url).hostname).toBe("terms.naver.com");
    expect(guide.source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});

it("알 수 없는 운동은 빈 안내를 꾸며내지 않는다", () => {
  expect(guideForExercise("없는 운동")).toBeNull();
});
```

- [ ] **Step 2: 모듈 없음 실패 확인**

```powershell
pnpm test -- src/lib/domain/exercise-guides.test.ts
```

- [ ] **Step 3: 타입과 첫 프로그램 안내 작성**

```ts
export type ExerciseGuide = {
  exerciseName: string;
  setup: readonly string[];
  movement: readonly string[];
  breathing: string;
  mistakes: readonly string[];
  caution: string;
  source?: {
    provider: "네이버 지식백과";
    url: string;
    checkedAt: string;
  };
};
```

15개 운동에는 다음 검수 카피를 그대로 넣는다. 배열 항목은 화면에서 한 줄씩 보인다.

| 운동 | 시작 자세 | 동작 | 호흡 | 자주 하는 실수 | 주의 |
|---|---|---|---|---|---|
| 바벨 백스쿼트 | 발을 어깨너비로 두고 복부에 힘을 준다 | 무릎과 발끝 방향을 맞추며 앉았다 발바닥 전체로 민다 | 내려가며 들이마시고 올라오며 내쉰다 | 무릎이 안으로 모이거나 허리가 둥글게 말림 | 허리·무릎에 날카로운 통증이 생기면 중단한다 |
| 벤치프레스 | 발을 바닥에 고정하고 견갑을 벤치에 안정시킨다 | 바를 가슴 중간으로 내린 뒤 손목과 팔꿈치를 정렬해 민다 | 내리며 들이마시고 밀며 내쉰다 | 손목이 꺾이거나 팔꿈치를 과하게 벌림 | 안전바 또는 보조자 없이 한계 반복을 시도하지 않는다 |
| 시티드 로우 | 가슴을 세우고 어깨를 귀에서 멀리 둔다 | 팔꿈치를 뒤로 보내 손잡이를 몸통 쪽으로 당긴다 | 당기며 내쉬고 돌아가며 들이마신다 | 허리를 크게 젖히거나 어깨를 으쓱함 | 허리 반동 대신 조절 가능한 무게를 쓴다 |
| 숄더프레스 | 엉덩이와 등을 지지대에 붙이고 손목을 세운다 | 손잡이를 머리 위로 밀되 어깨가 들리지 않게 한다 | 밀며 내쉬고 내리며 들이마신다 | 허리를 과하게 꺾거나 팔꿈치를 너무 뒤로 보냄 | 어깨 앞쪽이 찝히면 가동범위와 무게를 줄이거나 중단한다 |
| 사이드 레터럴 레이즈 | 가벼운 무게를 들고 팔꿈치를 살짝 굽힌다 | 팔꿈치가 손보다 약간 높게 옆으로 들어 올린다 | 올리며 내쉬고 내리며 들이마신다 | 반동으로 던지거나 어깨를 으쓱함 | 통증 없는 범위까지만 올린다 |
| 루마니안 데드리프트 | 발을 골반너비로 두고 바를 몸 가까이 잡는다 | 엉덩이를 뒤로 보내며 바를 다리 가까이 내렸다 엉덩이를 편다 | 내려가기 전 들이마셔 버티고 올라오며 내쉰다 | 무릎을 과하게 굽히거나 등이 둥글게 말림 | 허리가 아니라 엉덩이와 허벅지 뒤쪽 긴장을 느낄 범위만 쓴다 |
| 랫풀다운 | 허벅지를 고정하고 가슴을 가볍게 세운다 | 팔꿈치를 아래로 내려 바를 윗가슴 쪽으로 당긴다 | 당기며 내쉬고 올리며 들이마신다 | 몸을 뒤로 크게 젖히거나 목 뒤로 당김 | 어깨 통증이 있으면 손잡이와 가동범위를 조정한다 |
| 인클라인 벤치프레스 | 발과 견갑을 고정하고 벤치 각도를 확인한다 | 바를 윗가슴 방향으로 내린 뒤 수직에 가깝게 민다 | 내리며 들이마시고 밀며 내쉰다 | 벤치 각도를 지나치게 높이거나 손목을 꺾음 | 안전바 또는 보조자를 사용하고 한계 반복을 피한다 |
| 페이스풀 | 케이블을 얼굴 높이에 두고 몸통을 세운다 | 손잡이를 얼굴 쪽으로 당기며 손을 양옆으로 벌린다 | 당기며 내쉬고 돌아가며 들이마신다 | 허리를 젖히거나 팔꿈치를 아래로 떨어뜨림 | 어깨가 불편하면 무게와 당기는 높이를 낮춘다 |
| 덤벨 컬 | 팔꿈치를 몸통 옆에 두고 손목을 곧게 편다 | 팔꿈치 위치를 유지하며 덤벨을 올리고 천천히 내린다 | 올리며 내쉬고 내리며 들이마신다 | 몸을 흔들거나 손목을 꺾음 | 팔꿈치나 손목 통증이 생기면 중단한다 |
| 레그프레스 | 허리와 엉덩이를 등받이에 붙이고 발을 발판에 둔다 | 무릎과 발끝 방향을 맞춰 내렸다 발판 전체를 민다 | 내리며 들이마시고 밀며 내쉰다 | 엉덩이가 들리거나 무릎이 안으로 모임 | 무릎을 잠그지 말고 허리가 말리기 전까지만 내린다 |
| 덤벨 벤치프레스 | 발과 견갑을 고정하고 덤벨을 가슴 옆에 둔다 | 양쪽 덤벨을 같은 속도로 밀고 조절해 내린다 | 내리며 들이마시고 밀며 내쉰다 | 덤벨이 흔들리거나 팔꿈치를 과하게 벌림 | 들고 눕고 일어나는 과정에서 무리한 무게를 피한다 |
| 바벨 로우 | 무릎을 살짝 굽히고 엉덩이를 뒤로 보내 몸통을 고정한다 | 바를 몸 가까이 당긴 뒤 등이 무너지지 않게 내린다 | 당기며 내쉬고 내리며 들이마신다 | 상체를 들썩이거나 허리가 둥글게 말림 | 몸통 고정이 어렵다면 무게를 낮추거나 지지형 로우로 바꾼다 |
| 덤벨 레터럴 레이즈 | 덤벨을 몸 옆에 두고 팔꿈치를 살짝 굽힌다 | 반동 없이 양옆으로 들고 천천히 내린다 | 올리며 내쉬고 내리며 들이마신다 | 손이 팔꿈치보다 높거나 몸을 흔듦 | 어깨 통증 없는 높이까지만 움직인다 |
| 케이블 푸시다운 | 팔꿈치를 몸통 옆에 고정하고 손목을 세운다 | 팔꿈치를 펴 손잡이를 아래로 누른 뒤 조절해 돌아온다 | 누르며 내쉬고 돌아가며 들이마신다 | 어깨와 몸통을 흔들거나 팔꿈치가 앞으로 움직임 | 팔꿈치 통증이 생기면 손잡이와 무게를 조정한다 |

진단·치료 표현, 통증을 참고 계속하라는 문구, 절대적인 자세 표현은 넣지 않는다.
통증·저림·어지럼이 생기면 중단하고 전문가에게 확인하라는 공통 안내를 시트 하단에
한 번 더 표시한다.

사용자가 제공한 링크는 `버피테스트` 안내가 실제 카탈로그에 존재하는 경우에만 다음처럼 등록한다.

```ts
source: {
  provider: "네이버 지식백과",
  url: "https://terms.naver.com/entry.naver?docId=2099791&cid=51030&categoryId=51030",
  checkedAt: "2026-08-12",
}
```

첫 프로그램 15개 운동은 사람이 원문을 직접 대조하지 못한 링크를 넣지 않는다. 이 경우 GND 안내만 표시하는 것이 정상 완료 조건이다.

- [ ] **Step 4: 테스트 통과와 커밋**

```powershell
pnpm test -- src/lib/domain/exercise-guides.test.ts
git add -- src/lib/domain/exercise-guides.ts src/lib/domain/exercise-guides.test.ts
git commit -m "feat: 첫 공식 프로그램 운동 안내 데이터"
```

---

### Task 2: 안내 바텀시트 TDD

**Files:**
- Create: `src/components/record/exercise-guide-sheet.test.tsx`
- Create: `src/components/record/exercise-guide-sheet.tsx`

- [ ] **Step 1: 렌더 실패 테스트 작성**

```tsx
const guideWithoutSource = {
  exerciseName: "숄더프레스",
  setup: ["등을 지지대에 붙이고 손목을 세워요"],
  movement: ["손잡이를 머리 위로 밀고 천천히 내려요"],
  breathing: "밀며 내쉬고 내리며 들이마셔요",
  mistakes: ["허리를 과하게 꺾지 않아요"],
  caution: "어깨 앞쪽이 찝히면 중단해요",
} as const;

const guideWithSource = {
  ...guideWithoutSource,
  source: {
    provider: "네이버 지식백과" as const,
    url: "https://terms.naver.com/entry.naver?docId=2099791&cid=51030&categoryId=51030",
    checkedAt: "2026-08-12",
  },
};

it("GND 안내 다섯 영역을 먼저 보여준다", () => {
  render(<ExerciseGuideSheet open guide={guideWithoutSource} onClose={vi.fn()} />);
  expect(screen.getByText("시작 자세")).toBeVisible();
  expect(screen.getByText("동작")).toBeVisible();
  expect(screen.getByText("호흡")).toBeVisible();
  expect(screen.getByText("자주 하는 실수")).toBeVisible();
  expect(screen.getByText("주의")).toBeVisible();
});

it("출처가 있을 때만 외부 원문 링크를 낸다", () => {
  render(<ExerciseGuideSheet open guide={guideWithSource} onClose={vi.fn()} />);
  const link = screen.getByRole("link", { name: /네이버 지식백과에서 자세히 보기/ });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
});

it("출처가 없어도 GND 안내와 닫기는 정상이다", () => {
  render(<ExerciseGuideSheet open guide={guideWithoutSource} onClose={vi.fn()} />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("button", { name: "안내 닫기" })).toBeEnabled();
});
```

- [ ] **Step 2: 모듈 없음 실패 확인**

```powershell
pnpm test -- src/components/record/exercise-guide-sheet.test.tsx
```

- [ ] **Step 3: 바텀시트 구현**

시트는 `role="dialog"`, `aria-modal="true"`, 운동명을 포함한 제목을 가진다. 링크 클릭 실패를 앱이 감지할 수 없으므로 성공 토스트를 꾸며내지 않는다. 외부 페이지가 닫혀도 현재 운동 draft와 휴식 타이머는 유지한다.

- [ ] **Step 4: 테스트 통과와 커밋**

```powershell
pnpm test -- src/components/record/exercise-guide-sheet.test.tsx
git add -- src/components/record/exercise-guide-sheet.tsx src/components/record/exercise-guide-sheet.test.tsx
git commit -m "feat: 운동 자세 안내 시트와 원문 링크"
```

---

### Task 3: 준비 화면과 운동 중 화면에 연결

**Files:**
- Modify: `src/components/record/exercise-card.tsx`
- Modify: `src/components/record/exercise-card.test.tsx`
- Modify: `src/components/record/active-session-overlay.tsx`
- Modify: `src/components/record/active-session-overlay.test.tsx`
- Modify: `src/app/(tabs)/record/page.tsx`

- [ ] **Step 1: 진입 버튼 실패 테스트 작성**

안내가 있는 운동은 `자세 안내` 버튼이 보이고, 없는 커스텀 운동은 버튼을 숨긴다. 버튼을 눌러도 세트 완료 토글·무게 입력·운동 교체 이벤트가 발생하지 않는지 단언한다.

- [ ] **Step 2: 선택 상태 한 곳에서 관리**

`record/page.tsx`에 다음 상태만 둔다.

```ts
const [guideExerciseName, setGuideExerciseName] = useState<string | null>(null);
const activeGuide = guideExerciseName ? guideForExercise(guideExerciseName) : null;
```

준비 카드와 운동 중 오버레이는 `onOpenGuide(name)`만 받는다. 안내 데이터 조회를 두 컴포넌트에 중복하지 않는다.

- [ ] **Step 3: UI 테스트 통과**

```powershell
pnpm test -- src/components/record/exercise-card.test.tsx src/components/record/active-session-overlay.test.tsx src/components/record/exercise-guide-sheet.test.tsx
```

- [ ] **Step 4: 연결 커밋**

```powershell
git add -- src/components/record/exercise-card.tsx src/components/record/exercise-card.test.tsx src/components/record/active-session-overlay.tsx src/components/record/active-session-overlay.test.tsx src/app/(tabs)/record/page.tsx
git commit -m "feat: 운동 준비와 진행 화면에 자세 안내 연결"
```

---

### Task 4: 링크 검수 장치

**Files:**
- Modify: `src/lib/domain/exercise-guides.test.ts`

- [ ] **Step 1: 중복·비HTTPS·비네이버 링크 계약 추가**

테스트에서 URL 중복, `http:`, `javascript:`, `terms.naver.com` 이외 호스트, 미래의 `checkedAt`을 거부한다. 네트워크 상태에 따라 흔들리는 HTTP 요청 테스트는 단위 테스트에 넣지 않는다.

- [ ] **Step 2: 사람 검수 절차를 코드 주석으로 고정**

새 링크를 추가할 때 다음 네 항목을 확인하도록 `exercise-guides.ts` 상단에 기록한다.

1. 운동명과 원문 동작이 동일한가
2. 브라우저에서 현재 열리는가
3. provider와 checkedAt이 있는가
4. 원문 콘텐츠를 복사하지 않았는가

- [ ] **Step 3: 테스트 통과와 커밋**

```powershell
pnpm test -- src/lib/domain/exercise-guides.test.ts
git add -- src/lib/domain/exercise-guides.ts src/lib/domain/exercise-guides.test.ts
git commit -m "test: 외부 운동 원문 링크 계약"
```

---

### Task 5: 개발 서버 직접 조작·전체 검사·기록

**Files:**
- Modify: `PROGRESS.md`
- Create: `docs/superpowers/HANDOFF-2026-08-12-exercise-guides.md`

- [ ] **Step 1: 개발 서버 실행과 실제 조작**

```powershell
pnpm dev
```

| # | 조작 | 확인할 실물 |
|---|---|---|
| 1 | 프로그램 계획 준비 | 각 운동에 `자세 안내` 버튼 표시 |
| 2 | 숄더프레스 안내 열기 | 시작·동작·호흡·실수·주의 다섯 영역 |
| 3 | 안내 닫기 | 입력 무게·완료 세트·현재 포커스 유지 |
| 4 | 운동 시작 후 안내 열기 | 휴식 타이머와 운동 세션 유지 |
| 5 | 출처 없는 운동 | GND 안내만 있고 깨진 링크 없음 |
| 6 | 버피테스트 원문 선택 | 새 외부 페이지에서 제공 URL 열림 |
| 7 | 외부 페이지에서 복귀 | GND 운동 상태 그대로 |
| 8 | 커스텀 운동 | 안내 버튼이 없고 기존 기록 기능 정상 |

브라우저 조작 수단이 없으면 배포하지 않고 사용자 확인을 기다린다.

- [ ] **Step 2: 개발 서버 종료 후 전체 검사**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

- [ ] **Step 3: 기록과 지정 커밋**

PROGRESS와 인수인계서에 안내가 있는 운동 수, 검수된 외부 링크 수, 화면 8개 항목, 전체 검사 실측, DB 변경 0, 운영 미배포를 기록한다.

```powershell
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-12-exercise-guides.md
git commit -m "docs: 운동 안내와 원문 링크 검증 기록"
```

운영 배포는 사용자 승인 전 실행하지 않는다.
