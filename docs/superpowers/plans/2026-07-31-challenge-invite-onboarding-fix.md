# Challenge Invite Onboarding Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챌린지 초대 링크로 온 새 사용자가 닉네임과 `챌린지 참가하기` 버튼만 거쳐 자동 참가하게 한다.

**Architecture:** 기존 `/challenge?join=CODE` 주소는 유지한다. `OnboardingGate`가 프로필 확인 전에 코드를 보관하고, 온보딩은 보관된 코드가 있을 때 챌린지 전용 최소 화면을 렌더한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, Supabase

---

### Task 1: 온보딩 이동 전에 챌린지 코드를 보관한다

**Files:**
- Create: `src/components/onboarding-gate.test.tsx`
- Modify: `src/components/onboarding-gate.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`/challenge?join=GND-ABCDE`에서 `getMyProfile()`이 아직 끝나지 않아도 `savePendingChallengeInvite("GND-ABCDE")`가 먼저 호출되는 테스트를 작성한다.

```tsx
it("프로필 확인보다 먼저 챌린지 초대 코드를 보관한다", () => {
  window.history.replaceState({}, "", "/challenge?join=GND-ABCDE");
  getMyProfileMock.mockReturnValue(new Promise(() => {}));

  render(<OnboardingGate />);

  expect(savePendingChallengeInviteMock).toHaveBeenCalledWith("GND-ABCDE");
});
```

- [ ] **Step 2: RED 확인**

실행:

```powershell
pnpm test src/components/onboarding-gate.test.tsx
```

예상: `savePendingChallengeInviteMock`이 호출되지 않아 실패.

- [ ] **Step 3: 최소 구현**

`src/components/onboarding-gate.tsx`에서 프로필 조회 전에 코드를 저장한다.

```tsx
const challengeCode =
  pathname === "/challenge"
    ? new URLSearchParams(window.location.search).get("join")
    : null;
if (challengeCode) savePendingChallengeInvite(challengeCode);
```

- [ ] **Step 4: GREEN 확인**

실행:

```powershell
pnpm test src/components/onboarding-gate.test.tsx
```

예상: 통과.

### Task 2: 챌린지 초대 전용 닉네임 화면을 만든다

**Files:**
- Create: `src/app/onboarding/page.test.tsx`
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: 화면 실패 테스트 작성**

보관된 챌린지 코드가 있을 때 아래 조건을 확인한다.

```tsx
expect(screen.getByRole("heading", { name: "챌린지에 초대받았어요 🏆" })).toBeVisible();
expect(screen.getByPlaceholderText("닉네임 (예: 형)")).toBeVisible();
expect(screen.getByRole("button", { name: "챌린지 참가하기" })).toBeVisible();
expect(screen.queryByText("프로필 사진")).toBeNull();
expect(screen.queryByText("주간 운동 목표")).toBeNull();
expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
expect(screen.queryByText("크루에 들어가요")).toBeNull();
```

- [ ] **Step 2: RED 확인**

실행:

```powershell
pnpm test src/app/onboarding/page.test.tsx
```

예상: 프로필 사진·주간 목표·`다음`이 보여 실패.

- [ ] **Step 3: 최소 화면 구현**

`challengeCode`가 있을 때 프로필 사진과 주간 목표를 숨기고 버튼 이름을 바꾼다.

```tsx
{!challengeCode && (
  <>
    <Label>프로필 사진</Label>
    <div className="flex flex-wrap justify-center gap-2">
      {AVATARS.map((a) => (
        <button
          key={a}
          onClick={() => setAvatar(a)}
          className={`flex h-11 w-11 items-center justify-center rounded-full border text-2xl ${
            avatar === a
              ? "border-accent bg-accent-weak"
              : "border-line bg-surface"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  </>
)}

<Label>닉네임</Label>
<input
  value={nickname}
  onChange={(e) => setNickname(e.target.value)}
  placeholder="닉네임 (예: 형)"
  maxLength={20}
  className="w-full rounded-card-sm border border-line bg-surface px-4 py-3 text-center text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent"
/>

{!challengeCode && (
  <>
    <Label>주간 운동 목표</Label>
    <div className="flex items-center justify-center gap-4">
      <Stepper onClick={() => setWeeklyGoal((g) => Math.max(1, g - 1))}>
        –
      </Stepper>
      <span className="min-w-16 font-mono text-lg font-bold">
        주 {weeklyGoal}회
      </span>
      <Stepper onClick={() => setWeeklyGoal((g) => Math.min(7, g + 1))}>
        +
      </Stepper>
    </div>
  </>
)}

<Primary onClick={submitProfile} busy={busy}>
  {challengeCode ? "챌린지 참가하기" : "다음"}
</Primary>

{!challengeCode && (
  <Link href="/login" className="mt-4 block text-[13px] text-muted underline">
    이미 계정이 있나요? 로그인
  </Link>
)}
```

챌린지 초대 모드에서는 `이미 계정이 있나요? 로그인` 링크도 숨긴다.

- [ ] **Step 4: 참가 성공·실패 테스트 작성**

성공 시 `upsertMyProfile` → `joinChallengeWithCode` → 코드 삭제 → `/challenge` 이동 순서를 확인한다. 실패 시 오류를 보여주고 코드 삭제와 화면 이동을 하지 않는지 확인한다.

- [ ] **Step 5: 참가 처리 구현**

```tsx
if (challengeCode) {
  try {
    await joinChallengeWithCode(challengeCode);
  } catch {
    setError("챌린지에 참가하지 못했어요. 초대 링크를 다시 확인해 주세요.");
    return;
  }
  clearPendingChallengeInvite();
  router.replace("/challenge");
  return;
}
```

- [ ] **Step 6: 대상 테스트 확인**

실행:

```powershell
pnpm test src/components/onboarding-gate.test.tsx src/app/onboarding/page.test.tsx
```

예상: 전부 통과.

### Task 3: 전체 검증과 로컬 화면 확인

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md`

- [ ] **Step 1: 전체 자동 검증**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

예상: 모두 종료 코드 0.

- [ ] **Step 2: 로컬 실제 화면 확인**

새 익명 사용자 상태에서 챌린지 초대 링크를 열어 아래를 확인한다.

1. 닉네임과 `챌린지 참가하기`만 보인다.
2. 크루 화면이 나오지 않는다.
3. 버튼을 누르면 `/challenge`로 이동한다.
4. 참가자 명단에 새 사용자가 보이고 크루 목록에는 생기지 않는다.

- [ ] **Step 3: 문서와 커밋**

검증 결과를 두 문서에 기록한 뒤 계획한 파일만 스테이징한다.

```powershell
git add -- src/components/onboarding-gate.tsx src/components/onboarding-gate.test.tsx src/app/onboarding/page.tsx src/app/onboarding/page.test.tsx PROGRESS.md docs/superpowers/HANDOFF-2026-07-31-challenge-rooms.md
git diff --cached --check
git commit -m "fix: 챌린지 초대 온보딩 자동 참가"
```

- [ ] **Step 4: 별도 승인 후 로컬 배포**

GitHub는 사용하지 않는다. 사용자 배포 승인을 다시 받은 뒤 로컬 `main`의 추적 파일만 담은 `.git` 없는 임시 복사본에서 `vercel --prod`를 실행한다.
