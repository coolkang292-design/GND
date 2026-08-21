# Challenge Add Form and Error Message Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** 챌린지 추가 화면을 빈 이름칸으로 열고, 생성 버튼 문구를 단순화하며, 일반 객체 형태의 서버 오류를 사람이 읽을 수 있게 표시한다.

**Architecture:** 기존 챌린지 화면과 바텀시트 구조를 유지한다. `ChallengePage`에서 생성 모드 기본값과 오류 문자열 변환을 고치고, `ChallengeSetupSheet`는 입력 안내와 자동 포커스만 담당한다. 데이터베이스와 생성 RPC는 변경하지 않는다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library

---

### Task 1: 일반 객체 오류를 사람이 읽을 수 있게 변환

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx:71-92`
- Test: `src/app/(tabs)/challenge/page.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`errorMessage`를 named export로 가져와 다음 세 경우를 추가한다.

```tsx
import ChallengePage, { errorMessage } from "./page";

describe("ChallengePage 오류 문구", () => {
  it("일반 객체의 message를 읽어 알려진 오류를 한글로 바꾼다", () => {
    expect(errorMessage({ message: "invalid_status:setup" })).toBe(
      "챌린지 상태가 맞지 않아요. 새로고침해 주세요",
    );
  });

  it("message가 없는 객체를 object Object로 표시하지 않는다", () => {
    expect(errorMessage({ code: "unexpected" })).toBe(
      "오류: 알 수 없는 오류",
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test "src/app/(tabs)/challenge/page.test.tsx"`

Expected: `errorMessage`가 export되지 않았거나 일반 객체를 `[object Object]`로 처리해 FAIL.

- [ ] **Step 3: 최소 구현**

`page.tsx`에서 메시지 추출을 다음 규칙으로 바꾼다.

```tsx
export function errorMessage(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" &&
          e !== null &&
          "message" in e &&
          typeof e.message === "string"
        ? e.message
        : "알 수 없는 오류";
  // 기존 오류 코드 → 한글 변환 분기는 그대로 유지
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test "src/app/(tabs)/challenge/page.test.tsx"`

Expected: PASS.

### Task 2: 추가 버튼 문구와 빈 이름 기본값

**Files:**
- Modify: `src/app/(tabs)/challenge/page.tsx:555-566,661-667`
- Test: `src/app/(tabs)/challenge/page.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`ChallengeSetupSheet` mock이 전달받은 생성 이름을 출력하게 하고, 기존 챌린지가 있는 화면에서 추가 버튼을 누른 뒤 검증한다.

```tsx
vi.mock("@/components/challenge/setup-sheet", () => ({
  ChallengeSetupSheet: ({
    prevGoals,
    defaults,
  }: {
    prevGoals: unknown;
    defaults: { name: string };
  }) => (
    <>
      <output data-testid="previous-goals">{JSON.stringify(prevGoals)}</output>
      <output data-testid="setup-name">{defaults.name}</output>
    </>
  ),
}));

it("챌린지 추가 버튼은 짧은 이름을 쓰고 새 이름을 빈칸으로 연다", async () => {
  render(<ChallengePage />);
  await screen.findByText("예전 참가자");

  fireEvent.click(
    screen.getByRole("button", { name: "＋ 챌린지 추가하기" }),
  );

  expect(screen.getByTestId("setup-name").textContent).toBe("");
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test "src/app/(tabs)/challenge/page.test.tsx"`

Expected: 버튼 이름이 없거나 기본 이름이 `8월 GND 챌린지`여서 FAIL.

- [ ] **Step 3: 최소 구현**

`openSheet("create")`의 `defaults.name`을 빈 문자열로 바꾸고 버튼 문구를 변경한다.

```tsx
name: mode === "create" ? "" : challenge?.name ?? "",
```

```tsx
＋ 챌린지 추가하기
```

목표 설정 모드는 현재 챌린지 이름을 계속 사용한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm test "src/app/(tabs)/challenge/page.test.tsx"`

Expected: PASS.

### Task 3: 이름 입력 안내와 자동 포커스

**Files:**
- Modify: `src/components/challenge/setup-sheet.tsx:271-280`
- Create: `src/components/challenge/setup-sheet.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChallengeSetupSheet } from "./setup-sheet";

afterEach(cleanup);

describe("ChallengeSetupSheet 챌린지 이름", () => {
  it("생성 화면은 빈 이름칸에 안내 문구를 표시하고 바로 포커스한다", () => {
    render(
      <ChallengeSetupSheet
        mode="create"
        defaults={{
          name: "",
          startDate: "2026-08-02",
          endDate: "2026-08-29",
          goals: [{ type: "weight_reps", target: 100 }],
          plannedDays: 3,
        }}
        prevGoals={null}
        busy={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("챌린지 이름을 입력하세요");
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/components/challenge/setup-sheet.test.tsx`

Expected: placeholder가 없어 FAIL.

- [ ] **Step 3: 최소 구현**

```tsx
<input
  autoFocus
  placeholder="챌린지 이름을 입력하세요"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="..."
/>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/components/challenge/setup-sheet.test.tsx`

Expected: PASS.

### Task 4: 전체 검증과 로컬 화면 확인

**Files:**
- Modify after verification: `PROGRESS.md`
- Modify after verification: `docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md`

- [ ] **Step 1: 관련 테스트 실행**

Run: `pnpm test "src/app/(tabs)/challenge/page.test.tsx" src/components/challenge/setup-sheet.test.tsx`

Expected: 전부 PASS.

- [ ] **Step 2: 전체 검사 실행**

Run: `pnpm lint`

Expected: exit 0.

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm test`

Expected: 실패 0.

Run: `pnpm build`

Expected: exit 0.

- [ ] **Step 3: 로컬 화면 확인**

Run: `pnpm dev`

Expected: 챌린지 화면에서 `＋ 챌린지 추가하기`를 누르면 이름칸이 비어 있고, 안내 문구가 보이며 커서가 이름칸에 놓인다. 오류 객체 테스트에서는 `[object Object]`가 표시되지 않는다.

- [ ] **Step 4: 진행 문서 갱신**

`PROGRESS.md`와 최신 인수인계서에 수정 내용, 테스트 수, 로컬 화면 확인 결과, 운영 배포 대기 상태를 기록한다.

- [ ] **Step 5: 정확한 파일만 커밋**

```bash
git add -- \
  "src/app/(tabs)/challenge/page.tsx" \
  "src/app/(tabs)/challenge/page.test.tsx" \
  "src/components/challenge/setup-sheet.tsx" \
  "src/components/challenge/setup-sheet.test.tsx" \
  PROGRESS.md \
  docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md
git commit -m "fix: 챌린지 추가 화면과 오류 안내 개선"
```

운영 배포는 이 커밋 뒤 사용자에게 별도 승인을 받고, GitHub 없이 로컬 `main` 기준으로만 실행한다.
