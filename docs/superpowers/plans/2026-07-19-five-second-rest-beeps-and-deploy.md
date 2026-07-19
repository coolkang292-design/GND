# Five-Second Rest Beeps And Production Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웨이트·맨몸 휴식 비프음을 5초 전부터 `짧게 4회 + 길게 1회`로 재생하고, 검증된 현재 `main`을 Vercel 운영 환경에 배포한다.

**Architecture:** 기존 `getRestCountdownBeep` 순수 함수의 적용 범위만 5~1초로 넓힌다. 훅과 오디오 모듈의 재생·중복 방지 구조는 유지하고 테스트 기대값만 새 패턴으로 확장한다. 코드 검증 후 이미 연결된 Vercel 프로젝트 `gnd`에 직접 운영 배포하고 운영 주소를 확인한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Web Audio API, Vercel CLI

---

### Task 1: Extend The Countdown Pattern To Five Seconds

**Files:**
- Modify: `src/lib/domain/rest-countdown.test.ts`
- Modify: `src/lib/domain/rest-countdown.ts`
- Modify: `src/hooks/use-rest-countdown.test.tsx`

- [x] **Step 1: Write the failing domain tests**

Replace the beep-pattern tests with:

```ts
describe("getRestCountdownBeep", () => {
  it.each([5, 4, 3, 2])(
    "returns a short beep with %i seconds remaining",
    (remainingSeconds) => {
      expect(getRestCountdownBeep(remainingSeconds)).toEqual({
        durationSeconds: 0.12,
      });
    },
  );

  it("returns a longer beep with one second remaining", () => {
    expect(getRestCountdownBeep(1)).toEqual({ durationSeconds: 0.35 });
  });

  it.each([null, 0, 6, 10])(
    "returns null outside the countdown range: %s",
    (remainingSeconds) => {
      expect(getRestCountdownBeep(remainingSeconds)).toBeNull();
    },
  );
});
```

- [x] **Step 2: Run the domain test and verify RED**

Run:

```powershell
pnpm test -- src/lib/domain/rest-countdown.test.ts
```

Expected: the 5-second and 4-second cases fail because the current function returns `null`.

- [x] **Step 3: Implement the minimal domain change**

Replace the short-beep condition in `src/lib/domain/rest-countdown.ts` with:

```ts
if (
  remainingSeconds !== null &&
  remainingSeconds >= 2 &&
  remainingSeconds <= 5
) {
  return { durationSeconds: 0.12 };
}
```

Keep the 1-second long beep and all cardio eligibility logic unchanged.

- [x] **Step 4: Verify GREEN for the domain rule**

Run:

```powershell
pnpm test -- src/lib/domain/rest-countdown.test.ts
```

Expected: all rest countdown domain tests pass.

- [x] **Step 5: Extend the hook integration test**

Replace the first hook test with:

```ts
it("plays four short beeps and one long beep once each at 5 through 1", () => {
  const { result } = renderHook(() => useRestCountdown(true, vi.fn()));

  act(() => result.current.startRest("squat:set-1", 5));
  advanceSeconds(5);

  expect(prepareAudio).not.toHaveBeenCalled();
  expect(playBeep).toHaveBeenNthCalledWith(1, { durationSeconds: 0.12 });
  expect(playBeep).toHaveBeenNthCalledWith(2, { durationSeconds: 0.12 });
  expect(playBeep).toHaveBeenNthCalledWith(3, { durationSeconds: 0.12 });
  expect(playBeep).toHaveBeenNthCalledWith(4, { durationSeconds: 0.12 });
  expect(playBeep).toHaveBeenNthCalledWith(5, { durationSeconds: 0.35 });
  expect(playBeep).toHaveBeenCalledTimes(5);
  expect(result.current.remainingSeconds).toBeNull();
});
```

- [x] **Step 6: Run focused tests and commit**

Run:

```powershell
pnpm test -- src/lib/domain/rest-countdown.test.ts src/hooks/use-rest-countdown.test.tsx src/lib/rest-countdown-audio.test.ts
```

Expected: all focused tests pass with no duplicate or stale beep regression.

```powershell
git add -- src/lib/domain/rest-countdown.ts src/lib/domain/rest-countdown.test.ts src/hooks/use-rest-countdown.test.tsx
git commit -m "feat: start rest beeps at five seconds"
```

---

### Task 2: Verify, Deploy, And Record Production State

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-07-19-five-second-rest-beeps-and-deploy.md`

- [x] **Step 1: Stop the local development server before building**

Stop the running `pnpm dev` process with `Ctrl+C`. This prevents the development server and production build from writing to `.next` at the same time.

- [x] **Step 2: Run the full local verification gate**

Run each command from `C:\Users\SAMSUNG\workout-app`:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all tests, typecheck, lint, and the production build pass. Do not deploy if any command fails.

- [x] **Step 3: Re-run the database and integration gates for the features entering production**

Run:

```powershell
node scripts/rls-test.mjs
node scripts/workout-plan-test.mjs
node scripts/challenge-photo-test.mjs
node scripts/briefing-integration-test.mjs
```

Expected: RLS `107/107`, workout plans `15/15`, challenge photos `8/8`, and briefing integration `8/8`. The scripts must clean up their own test records. Do not rerun migration SQL files.

- [x] **Step 4: Confirm the Vercel project link without changing secrets**

Read `.vercel/project.json` and confirm:

```json
{
  "projectId": "prj_JwhGK3yIwL93CafyJXGnzsnALMdk",
  "orgId": "team_L239WS37mVljbb56lF8KjBkO",
  "projectName": "gnd"
}
```

Do not add, remove, or rewrite any Vercel environment variable.

- [x] **Step 5: Deploy the verified working tree to production**

Run:

```powershell
pnpm dlx vercel deploy --prod --yes
```

Expected: Vercel reports `Ready` and assigns the production alias `https://gnd-one.vercel.app`.

- [x] **Step 6: Verify the production routes**

Run:

```powershell
(Invoke-WebRequest -UseBasicParsing -Uri "https://gnd-one.vercel.app/home" -TimeoutSec 30).StatusCode
(Invoke-WebRequest -UseBasicParsing -Uri "https://gnd-one.vercel.app/record" -TimeoutSec 30).StatusCode
```

Expected: both routes return HTTP `200`.

- [x] **Step 7: Record the completed deployment**

Update `PROGRESS.md` so it states:

- challenge photo/level and calendar workout plans are deployed rather than waiting for deployment;
- five-second rest beeps are deployed for weight/bodyweight, with cardio excluded;
- the deployment URL and route verification result are recorded;
- the remaining gate is phone verification of the deployed user flows, not another deployment.

Mark all completed steps in this plan with `[x]`, then run:

```powershell
git add -- PROGRESS.md docs/superpowers/plans/2026-07-19-five-second-rest-beeps-and-deploy.md
git commit -m "docs: record five-second beep production deploy"
```

- [x] **Step 8: Restart the local development server**

Run:

```powershell
pnpm dev
```

Expected: `http://localhost:3000` is ready and `/record` returns HTTP `200`.
