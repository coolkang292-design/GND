# 관리자 분석 대시보드 실데이터 연동 Implementation Plan

> **보관됨 — 실행이 끝난 계획서다.** 여기 적힌 단계를 실행하지 마라.
> 체크박스가 비어 있어도 미완료가 아니다 — 실행하면서 표시하지 않았을 뿐이다.
> 현행 사실은 **코드**와 `docs/db-current-schema.sql`이다. 왜 보관하는지는 `../README.md`.

**Goal:** `docs/dashboard-source.html` 목업을 GND 앱 안 `/admin` 관리자 전용 경로로 옮기고, 모든 표시 값을 운영 Supabase 실데이터로 교체한다.

**Architecture:** `/admin`은 서버 컴포넌트다. `/admin` 경로에만 걸린 미들웨어가 Supabase 세션을 갱신하고, `requireAdmin()`이 환경변수 허용목록으로 단일 관문을 만든다. 통과 후에만 service_role로 원본 행을 읽고, 집계는 전부 `src/lib/domain/analytics.ts` 순수 함수(TDD)에서 한다. 스트릭·레벨·챌린지 달성률은 앱 화면이 쓰는 기존 함수를 그대로 호출해 화면 간 숫자가 어긋나지 않게 한다.

**Tech Stack:** Next.js 16 (App Router, 서버 컴포넌트) · React 19 · TypeScript · Supabase (`@supabase/ssr`, service_role) · Vitest · 순수 CSS(목업 이식, Tailwind 미사용)

**설계 문서:** `docs/superpowers/specs/2026-07-28-admin-analytics-dashboard-design.md`

---

## 설계 문서 대비 변경 1건 (계획 중 발견)

설계 §2는 "서버 컴포넌트 + `?period=`"만 적었으나, 실제 저장소를 확인한 결과 **미들웨어가 필요하다**:

- `getSupabaseServerClient()`는 정의만 있고 **호출부가 0건**이다. 앱 전체가 클라이언트 컴포넌트 + `createBrowserClient`로 동작한다.
- `middleware.ts`가 없어 서버 측 세션 갱신이 일어나지 않는다. 액세스 토큰(기본 1시간)이 만료된 상태로 `/admin`에 직접 들어오면 서버가 유효한 사용자를 못 읽어 **관리자에게도 404**가 뜬다.
- → `middleware.ts`를 추가하되 `matcher`를 `/admin/:path*`로 **한정**한다. 다른 라우트의 동작은 바뀌지 않는다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `middleware.ts` (신규, 루트) | `/admin`만 대상으로 Supabase 세션 쿠키 갱신 |
| `src/lib/admin/auth.ts` (신규) | `requireAdmin()` — 유일한 접근 관문 |
| `src/lib/admin/auth.test.ts` (신규) | 게이트 4케이스 |
| `src/lib/admin/queries.ts` (신규) | service_role 원본 행 조회. 서버 전용 |
| `src/lib/domain/analytics.ts` (신규) | 집계 순수 함수 — 로직 단일 원천 |
| `src/lib/domain/analytics.test.ts` (신규) | 위 함수 TDD |
| `src/app/admin/layout.tsx` (신규) | 목업 CSS 적용 · `no-store` |
| `src/app/admin/admin.css` (신규) | 목업 `<style>` 이식 |
| `src/app/admin/page.tsx` (신규) | 게이트 → 조회 → 집계 → 렌더 |
| `src/app/admin/_components/*.tsx` (신규) | KPI·차트·퍼널·챌린지·표·성장XP 패널 |
| `.env.example` (수정) | `ADMIN_USER_IDS` 문서화 |

---

## Task 1: 관리자 게이트 (`requireAdmin`)

**Files:**
- Create: `src/lib/admin/auth.ts`
- Create: `src/lib/admin/auth.test.ts`

게이트가 유일한 방어선이므로 **가장 먼저, 테스트부터** 만든다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/admin/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAdminUser, parseAdminIds } from "./auth";

describe("parseAdminIds", () => {
  it("쉼표 구분 uuid를 배열로 자른다", () => {
    expect(parseAdminIds("a-1,b-2")).toEqual(["a-1", "b-2"]);
  });

  it("공백을 제거한다", () => {
    expect(parseAdminIds(" a-1 , b-2 ")).toEqual(["a-1", "b-2"]);
  });

  it("빈 항목을 버린다", () => {
    expect(parseAdminIds("a-1,,b-2,")).toEqual(["a-1", "b-2"]);
  });

  it("undefined면 빈 배열", () => {
    expect(parseAdminIds(undefined)).toEqual([]);
  });
});

describe("isAdminUser", () => {
  it("허용목록에 있으면 true", () => {
    expect(isAdminUser("a-1", ["a-1", "b-2"])).toBe(true);
  });

  it("허용목록에 없으면 false", () => {
    expect(isAdminUser("c-3", ["a-1", "b-2"])).toBe(false);
  });

  // fail-closed: 환경변수 미설정이 전면 개방으로 이어지면 안 된다
  it("허용목록이 비면 누구든 false", () => {
    expect(isAdminUser("a-1", [])).toBe(false);
  });

  it("userId가 null이면 false", () => {
    expect(isAdminUser(null, ["a-1"])).toBe(false);
  });

  // prefix/부분 일치로 뚫리면 안 된다
  it("접두사만 같으면 false", () => {
    expect(isAdminUser("a-1", ["a-12"])).toBe(false);
    expect(isAdminUser("a-12", ["a-1"])).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm vitest run src/lib/admin/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/lib/admin/auth.ts`:

```ts
import "server-only";

import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** `ADMIN_USER_IDS` 파싱 — 쉼표 구분, 공백 제거, 빈 항목 제외 */
export function parseAdminIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 관리자 판정. 허용목록이 비어 있으면 **누구도 통과하지 못한다**(fail-closed) —
 * 환경변수 설정 누락이 전면 개방으로 이어지면 안 된다.
 * 비교는 정확 일치. 부분·접두사 일치를 허용하면 게이트가 뚫린다.
 */
export function isAdminUser(
  userId: string | null,
  adminIds: string[],
): boolean {
  if (!userId) return false;
  if (adminIds.length === 0) return false;
  return adminIds.includes(userId);
}

/**
 * `/admin` 유일한 관문. 거부는 전부 **404**다.
 * 403이면 "여기 관리자 페이지가 있다"는 사실이 드러나므로 존재 자체를 숨긴다.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;

  if (!isAdminUser(userId, parseAdminIds(process.env.ADMIN_USER_IDS))) {
    notFound();
  }
  return { userId: userId! };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm vitest run src/lib/admin/auth.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: `.env.example`에 문서화한다**

`.env.example` 끝에 추가:

```
# 관리자 대시보드(/admin) 접근 허용 uuid — 쉼표 구분.
# 비워두면 아무도 접근할 수 없다(fail-closed). NEXT_PUBLIC_ 접두사 금지.
ADMIN_USER_IDS=
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/admin/auth.ts src/lib/admin/auth.test.ts .env.example
git commit -m "feat(admin): 관리자 게이트 requireAdmin — 허용목록 fail-closed, 거부는 404"
```

---

## Task 2: `/admin` 전용 미들웨어

**Files:**
- Create: `middleware.ts` (저장소 루트)

- [ ] **Step 1: 미들웨어를 만든다**

`middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `/admin`에서만 동작한다(아래 matcher).
 * 앱 전체는 클라이언트 컴포넌트 + createBrowserClient로 인증하므로
 * 서버 측 토큰 갱신 지점이 없다. 갱신이 없으면 액세스 토큰 만료 후
 * 서버 컴포넌트가 유효한 사용자를 못 읽어 관리자에게도 404가 뜬다.
 * getUser() 호출이 필요 시 토큰을 갱신하고 새 쿠키를 응답에 싣는다.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

// 다른 라우트의 동작을 바꾸지 않기 위해 /admin으로 한정한다.
export const config = { matcher: ["/admin/:path*"] };
```

- [ ] **Step 2: 빌드가 통과하는지 확인한다**

Run: `pnpm typecheck && pnpm build`
Expected: 통과. 빌드 로그에 `ƒ Middleware` 항목이 뜬다.

- [ ] **Step 3: 다른 라우트가 영향을 안 받는지 확인한다**

Run: `pnpm dev` 후 다른 터미널에서
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/home
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/whats-new
```
Expected: 둘 다 `200`

- [ ] **Step 4: 커밋**

```bash
git add middleware.ts
git commit -m "feat(admin): /admin 한정 세션 갱신 미들웨어"
```

---

## Task 3: 집계 기반 타입과 기간 계산

**Files:**
- Create: `src/lib/domain/analytics.ts`
- Create: `src/lib/domain/analytics.test.ts`

이후 모든 태스크가 여기 정의한 타입을 쓴다. 이름을 바꾸지 말 것.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/analytics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPeriod, formatRatio, ratio } from "./analytics";

describe("buildPeriod", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("28일 구간은 now에서 28일 전부터 now까지", () => {
    const p = buildPeriod(28, now);
    expect(p.days).toBe(28);
    expect(p.to).toEqual(now);
    expect(p.from).toEqual(new Date("2026-06-30T00:00:00Z"));
  });

  it("직전 구간은 같은 길이로 바로 앞에 붙는다", () => {
    const p = buildPeriod(28, now);
    expect(p.prevTo).toEqual(p.from);
    expect(p.prevFrom).toEqual(new Date("2026-06-02T00:00:00Z"));
  });

  it("7일·90일도 같은 규칙", () => {
    expect(buildPeriod(7, now).from).toEqual(new Date("2026-07-21T00:00:00Z"));
    expect(buildPeriod(90, now).from).toEqual(new Date("2026-04-29T00:00:00Z"));
  });
});

describe("formatRatio — 표본 표기 규칙", () => {
  it("모수가 충분하면 퍼센트와 모수를 함께 쓴다", () => {
    expect(formatRatio(ratio(3, 10))).toBe("30% (3/10)");
  });

  // 4명 규모에서 퍼센트를 큰 글씨로 띄우면 그 자체가 거짓 정보다
  it("모수 5 미만이면 퍼센트를 숨기고 원시수치만", () => {
    expect(formatRatio(ratio(2, 4))).toBe("2/4");
    expect(formatRatio(ratio(1, 1))).toBe("1/1");
  });

  it("모수 0은 측정 불가 — 0%가 아니라 —", () => {
    expect(formatRatio(ratio(0, 0))).toBe("—");
  });

  it("모수 5는 경계 안쪽이라 퍼센트를 쓴다", () => {
    expect(formatRatio(ratio(1, 5))).toBe("20% (1/5)");
  });

  it("반올림은 정수 퍼센트", () => {
    expect(formatRatio(ratio(1, 3))).toBe("33% (1/3)");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: FAIL — `Failed to resolve import "./analytics"`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/lib/domain/analytics.ts`:

```ts
/**
 * 관리자 분석 대시보드 집계 — 순수 함수만. DB·네트워크 접근 금지.
 * 스트릭·레벨·챌린지 달성률은 여기서 새로 계산하지 않고
 * 앱 화면이 쓰는 기존 함수를 그대로 호출한다(화면 간 불일치 방지).
 */

export type PeriodDays = 7 | 28 | 90;

export interface Period {
  days: PeriodDays;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

/** 비율은 항상 모수를 들고 다닌다 — 표본 크기를 숨기지 않기 위해서다 */
export interface Ratio {
  numerator: number;
  denominator: number;
}

/** 이 아래로는 퍼센트를 표시하지 않는다 */
export const MIN_RATIO_SAMPLE = 5;

const DAY_MS = 86_400_000;

export function buildPeriod(days: PeriodDays, now: Date): Period {
  const from = new Date(now.getTime() - days * DAY_MS);
  return {
    days,
    from,
    to: now,
    prevFrom: new Date(from.getTime() - days * DAY_MS),
    prevTo: from,
  };
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator };
}

/**
 * 모수 0 → "—"(측정 불가와 0%는 다르다)
 * 모수 < MIN_RATIO_SAMPLE → 퍼센트 없이 "2/4"
 * 그 외 → "30% (3/10)"
 */
export function formatRatio(r: Ratio): string {
  if (r.denominator === 0) return "—";
  if (r.denominator < MIN_RATIO_SAMPLE) {
    return `${r.numerator}/${r.denominator}`;
  }
  const pct = Math.round((r.numerator / r.denominator) * 100);
  return `${pct}% (${r.numerator}/${r.denominator})`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: PASS — 9 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts
git commit -m "feat(admin): 분석 기간 계산 + 표본 표기 규칙(모수 5 미만 퍼센트 숨김)"
```

---

## Task 4: KPI 4장 집계

**Files:**
- Modify: `src/lib/domain/analytics.ts`
- Modify: `src/lib/domain/analytics.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/analytics.test.ts` 끝에 추가:

```ts
import {
  ABANDON_AFTER_HOURS,
  buildKpi,
  type SessionRow,
} from "./analytics";

const s = (
  userId: string,
  status: SessionRow["status"],
  completedAt: string | null,
  startedAt: string | null = completedAt,
): SessionRow => ({
  userId,
  status,
  startedAt: startedAt ? new Date(startedAt) : null,
  completedAt: completedAt ? new Date(completedAt) : null,
});

describe("buildKpi", () => {
  const now = new Date("2026-07-28T00:00:00Z");
  const period = buildPeriod(28, now);

  it("활성 사용자는 기간 내 완료 세션의 distinct 사용자", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u1", "completed", "2026-07-21T10:00:00Z"),
        s("u2", "completed", "2026-07-22T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.activeUsers).toBe(2);
    expect(k.completedWorkouts).toBe(3);
  });

  it("기간 밖 세션은 제외한다", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-05-01T10:00:00Z"), // 28일 밖
        s("u2", "completed", "2026-07-22T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.activeUsers).toBe(1);
    expect(k.completedWorkouts).toBe(1);
  });

  it("취소 세션을 센다", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u2", "cancelled", null, "2026-07-21T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.cancelledWorkouts).toBe(1);
  });

  // 6시간은 피드의 "운동 중" 판정과 같은 값을 쓴다
  it("시작 후 6시간이 지나도 안 끝난 active는 방치로 센다", () => {
    const k = buildKpi(
      [s("u1", "active", null, "2026-07-20T00:00:00Z")],
      [],
      period,
      now,
    );
    expect(k.abandonedWorkouts).toBe(1);
  });

  it("아직 6시간이 안 지난 active는 방치가 아니다(운동 중)", () => {
    const recent = new Date(now.getTime() - (ABANDON_AFTER_HOURS - 1) * 3_600_000);
    const k = buildKpi(
      [s("u1", "active", null, recent.toISOString())],
      [],
      period,
      now,
    );
    expect(k.abandonedWorkouts).toBe(0);
  });

  it("완료율 = 완료 / (완료+취소+방치)", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u1", "completed", "2026-07-21T10:00:00Z"),
        s("u2", "cancelled", null, "2026-07-21T10:00:00Z"),
        s("u3", "active", null, "2026-07-01T00:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.completionRate).toEqual({ numerator: 2, denominator: 4 });
  });

  it("신규는 기간 내 가입한 프로필 수", () => {
    const k = buildKpi(
      [],
      [
        { userId: "u1", createdAt: new Date("2026-07-20T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
      period,
      now,
    );
    expect(k.newUsers).toBe(1);
  });

  it("1인당 운동 = 완료 / 활성 사용자", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"),
        s("u1", "completed", "2026-07-21T10:00:00Z"),
        s("u2", "completed", "2026-07-22T10:00:00Z"),
      ],
      [],
      period,
      now,
    );
    expect(k.workoutsPerUser).toBeCloseTo(1.5);
  });

  it("활성 사용자 0이면 1인당 운동은 0", () => {
    const k = buildKpi([], [], period, now);
    expect(k.workoutsPerUser).toBe(0);
  });

  it("상위 25%는 사용자별 완료 수의 p75", () => {
    const rows: SessionRow[] = [];
    // u1 4회, u2 3회, u3 2회, u4 1회
    for (let i = 0; i < 4; i++) rows.push(s("u1", "completed", "2026-07-20T10:00:00Z"));
    for (let i = 0; i < 3; i++) rows.push(s("u2", "completed", "2026-07-20T10:00:00Z"));
    for (let i = 0; i < 2; i++) rows.push(s("u3", "completed", "2026-07-20T10:00:00Z"));
    rows.push(s("u4", "completed", "2026-07-20T10:00:00Z"));
    expect(buildKpi(rows, [], period, now).topQuartileWorkouts).toBe(3);
  });

  it("직전 구간과 비교해 증감을 낸다", () => {
    const k = buildKpi(
      [
        s("u1", "completed", "2026-07-20T10:00:00Z"), // 이번 구간
        s("u2", "completed", "2026-06-10T10:00:00Z"), // 직전 구간
        s("u3", "completed", "2026-06-11T10:00:00Z"), // 직전 구간
      ],
      [],
      period,
      now,
    );
    expect(k.prevCompletedWorkouts).toBe(2);
    expect(k.completedWorkoutsDeltaPct).toBe(-50);
  });

  // 0 → 5는 ∞%다. 퍼센트를 만들지 않는다.
  it("직전 구간이 0이면 증감 퍼센트는 null", () => {
    const k = buildKpi(
      [s("u1", "completed", "2026-07-20T10:00:00Z")],
      [],
      period,
      now,
    );
    expect(k.prevCompletedWorkouts).toBe(0);
    expect(k.completedWorkoutsDeltaPct).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: FAIL — `buildKpi is not a function`

- [ ] **Step 3: 구현을 추가한다**

`src/lib/domain/analytics.ts` 끝에 추가:

```ts
/** 피드의 "운동 중" 판정과 같은 값 — 화면마다 다른 기준을 쓰면 어긋난다 */
export const ABANDON_AFTER_HOURS = 6;

export type SessionStatus = "draft" | "active" | "completed" | "cancelled";

export interface SessionRow {
  userId: string;
  status: SessionStatus;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ProfileRow {
  userId: string;
  createdAt: Date;
}

export interface Kpi {
  activeUsers: number;
  newUsers: number;
  completedWorkouts: number;
  cancelledWorkouts: number;
  abandonedWorkouts: number;
  completionRate: Ratio;
  workoutsPerUser: number;
  topQuartileWorkouts: number;
  prevActiveUsers: number;
  prevCompletedWorkouts: number;
  activeUsersDeltaPct: number | null;
  completedWorkoutsDeltaPct: number | null;
}

function inRange(d: Date | null, from: Date, to: Date): boolean {
  return d !== null && d >= from && d < to;
}

/** 직전 구간이 0이면 null — 0에서 늘어난 것을 퍼센트로 쓰면 ∞다 */
function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** 오름차순 정렬 배열의 p75 (nearest-rank) */
function p75(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(sorted.length * 0.75);
  return sorted[rank - 1];
}

export function buildKpi(
  sessions: SessionRow[],
  profiles: ProfileRow[],
  period: Period,
  now: Date,
): Kpi {
  const completedIn = (from: Date, to: Date) =>
    sessions.filter(
      (s) => s.status === "completed" && inRange(s.completedAt, from, to),
    );

  const current = completedIn(period.from, period.to);
  const previous = completedIn(period.prevFrom, period.prevTo);

  const activeUsers = new Set(current.map((s) => s.userId)).size;
  const prevActiveUsers = new Set(previous.map((s) => s.userId)).size;

  const cancelledWorkouts = sessions.filter(
    (s) => s.status === "cancelled" && inRange(s.startedAt, period.from, period.to),
  ).length;

  const abandonCutoff = new Date(
    now.getTime() - ABANDON_AFTER_HOURS * 3_600_000,
  );
  const abandonedWorkouts = sessions.filter(
    (s) =>
      (s.status === "active" || s.status === "draft") &&
      inRange(s.startedAt, period.from, period.to) &&
      s.startedAt! < abandonCutoff,
  ).length;

  const perUser = new Map<string, number>();
  for (const s of current) {
    perUser.set(s.userId, (perUser.get(s.userId) ?? 0) + 1);
  }
  const counts = [...perUser.values()].sort((a, b) => a - b);

  return {
    activeUsers,
    newUsers: profiles.filter((p) =>
      inRange(p.createdAt, period.from, period.to),
    ).length,
    completedWorkouts: current.length,
    cancelledWorkouts,
    abandonedWorkouts,
    completionRate: ratio(
      current.length,
      current.length + cancelledWorkouts + abandonedWorkouts,
    ),
    workoutsPerUser: activeUsers === 0 ? 0 : current.length / activeUsers,
    topQuartileWorkouts: p75(counts),
    prevActiveUsers,
    prevCompletedWorkouts: previous.length,
    activeUsersDeltaPct: deltaPct(activeUsers, prevActiveUsers),
    completedWorkoutsDeltaPct: deltaPct(current.length, previous.length),
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: PASS — 22 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts
git commit -m "feat(admin): KPI 집계 — 완료율 분모에 6시간 방치 포함, 직전 0이면 증감 미표시"
```

---

## Task 5: 일별 활성 사용자 + DAU/WAU/MAU

**Files:**
- Modify: `src/lib/domain/analytics.ts`
- Modify: `src/lib/domain/analytics.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/analytics.test.ts` 끝에 추가:

```ts
import { activeUserCounts, dailyActiveSeries } from "./analytics";

describe("dailyActiveSeries", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("KST 날짜별 distinct 사용자 수를 낸다", () => {
    const series = dailyActiveSeries(
      [
        s("u1", "completed", "2026-07-27T01:00:00Z"), // KST 7/27 10:00
        s("u2", "completed", "2026-07-27T02:00:00Z"), // KST 7/27 11:00
        s("u1", "completed", "2026-07-26T01:00:00Z"), // KST 7/26
      ],
      buildPeriod(7, now),
      "Asia/Seoul",
    );
    const byKey = Object.fromEntries(series.map((p) => [p.dayKey, p.count]));
    expect(byKey["2026-07-27"]).toBe(2);
    expect(byKey["2026-07-26"]).toBe(1);
  });

  it("운동이 없는 날도 0으로 채운다(막대가 비지 않게)", () => {
    const series = dailyActiveSeries([], buildPeriod(7, now), "Asia/Seoul");
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.count === 0)).toBe(true);
  });

  // UTC 자정 직전 운동이 KST로는 다음 날이다
  it("UTC 22시 운동은 KST 다음 날로 센다", () => {
    const series = dailyActiveSeries(
      [s("u1", "completed", "2026-07-26T22:00:00Z")], // KST 7/27 07:00
      buildPeriod(7, now),
      "Asia/Seoul",
    );
    const byKey = Object.fromEntries(series.map((p) => [p.dayKey, p.count]));
    expect(byKey["2026-07-27"]).toBe(1);
    expect(byKey["2026-07-26"]).toBeUndefined();
  });
});

describe("activeUserCounts", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("DAU·WAU·MAU를 각각 1·7·28일 창으로 센다", () => {
    const c = activeUserCounts(
      [
        s("u1", "completed", "2026-07-27T12:00:00Z"), // 1일 안
        s("u2", "completed", "2026-07-24T12:00:00Z"), // 7일 안
        s("u3", "completed", "2026-07-10T12:00:00Z"), // 28일 안
        s("u4", "completed", "2026-05-01T12:00:00Z"), // 밖
      ],
      now,
    );
    expect(c.dau).toBe(1);
    expect(c.wau).toBe(2);
    expect(c.mau).toBe(3);
  });

  it("DAU/MAU는 Ratio로 낸다", () => {
    const c = activeUserCounts(
      [
        s("u1", "completed", "2026-07-27T12:00:00Z"),
        s("u2", "completed", "2026-07-10T12:00:00Z"),
      ],
      now,
    );
    expect(c.dauOverMau).toEqual({ numerator: 1, denominator: 2 });
  });

  it("아무 활동이 없으면 전부 0", () => {
    const c = activeUserCounts([], now);
    expect(c).toEqual({
      dau: 0,
      wau: 0,
      mau: 0,
      dauOverMau: { numerator: 0, denominator: 0 },
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: FAIL — `dailyActiveSeries is not a function`

- [ ] **Step 3: 구현을 추가한다**

`src/lib/domain/analytics.ts` 상단 import에 추가:

```ts
import { dayKey } from "./time";
```

파일 끝에 추가:

```ts
export interface DailyActivePoint {
  dayKey: string;
  count: number;
}

/**
 * 기간의 매일에 대한 완료 사용자 수. 운동이 없는 날도 0으로 채운다 —
 * 빈 날을 빼면 막대그래프의 가로축이 거짓말을 한다.
 */
export function dailyActiveSeries(
  sessions: SessionRow[],
  period: Period,
  timeZone: string,
): DailyActivePoint[] {
  const usersByDay = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    if (!inRange(s.completedAt, period.from, period.to)) continue;
    const key = dayKey(s.completedAt!, timeZone);
    if (!usersByDay.has(key)) usersByDay.set(key, new Set());
    usersByDay.get(key)!.add(s.userId);
  }

  const points: DailyActivePoint[] = [];
  for (let i = period.days - 1; i >= 0; i--) {
    const day = new Date(period.to.getTime() - i * DAY_MS);
    const key = dayKey(day, timeZone);
    points.push({ dayKey: key, count: usersByDay.get(key)?.size ?? 0 });
  }
  return points;
}

export interface ActiveUserCounts {
  dau: number;
  wau: number;
  mau: number;
  dauOverMau: Ratio;
}

export function activeUserCounts(
  sessions: SessionRow[],
  now: Date,
): ActiveUserCounts {
  const distinctWithin = (days: number) =>
    new Set(
      sessions
        .filter(
          (s) =>
            s.status === "completed" &&
            inRange(s.completedAt, new Date(now.getTime() - days * DAY_MS), now),
        )
        .map((s) => s.userId),
    ).size;

  const dau = distinctWithin(1);
  const mau = distinctWithin(28);
  return { dau, wau: distinctWithin(7), mau, dauOverMau: ratio(dau, mau) };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: PASS — 28 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts
git commit -m "feat(admin): 일별 활성 사용자 시계열 + DAU/WAU/MAU (KST 기준, 빈 날 0 채움)"
```

---

## Task 6: 재운동 리텐션 + 활성화 퍼널 + 크루 참여율

**Files:**
- Modify: `src/lib/domain/analytics.ts`
- Modify: `src/lib/domain/analytics.test.ts`

설계 §4.4·§4.5 근거를 코드 주석으로 남긴다 — 나중에 "왜 방문이 아니라 운동인가"를 다시 묻지 않게.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/analytics.test.ts` 끝에 추가:

```ts
import {
  activationFunnel,
  crewParticipation,
  reworkoutRetention,
} from "./analytics";

describe("reworkoutRetention", () => {
  const now = new Date("2026-07-28T00:00:00Z");

  it("가입 후 D1에 운동한 사람을 센다", () => {
    const r = reworkoutRetention(
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [s("u1", "completed", "2026-07-02T05:00:00Z")], // 가입 후 1일차
      now,
    );
    expect(r.d1).toEqual({ numerator: 1, denominator: 1 });
  });

  it("D7 코호트는 가입 후 7일이 지난 사람만 분모에 넣는다", () => {
    const r = reworkoutRetention(
      [
        { userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }, // 7일 지남
        { userId: "u2", createdAt: new Date("2026-07-27T00:00:00Z") }, // 아직 안 지남
      ],
      [],
      now,
    );
    expect(r.d7.denominator).toBe(1);
  });

  it("D28도 마찬가지로 아직 28일이 안 된 사람은 제외", () => {
    const r = reworkoutRetention(
      [{ userId: "u1", createdAt: new Date("2026-07-20T00:00:00Z") }],
      [],
      now,
    );
    expect(r.d28.denominator).toBe(0);
  });

  it("해당 일자에 운동이 없으면 분자에 안 들어간다", () => {
    const r = reworkoutRetention(
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [s("u1", "completed", "2026-07-05T05:00:00Z")], // D4 — D1도 D7도 아님
      now,
    );
    expect(r.d1.numerator).toBe(0);
    expect(r.d7.numerator).toBe(0);
  });
});

describe("activationFunnel", () => {
  it("가입은 auth 기준, 프로필 설정은 profiles 기준", () => {
    const f = activationFunnel(
      [
        { userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-07-02T00:00:00Z") },
        { userId: "u3", createdAt: new Date("2026-07-03T00:00:00Z") }, // 프로필 없음
      ],
      [
        { userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") },
        { userId: "u2", createdAt: new Date("2026-07-02T00:00:00Z") },
      ],
      [
        s("u1", "completed", "2026-07-04T00:00:00Z"),
        s("u1", "completed", "2026-07-05T00:00:00Z"),
        s("u1", "completed", "2026-07-06T00:00:00Z"),
        s("u2", "completed", "2026-07-04T00:00:00Z"),
      ],
    );
    expect(f.map((step) => step.count)).toEqual([3, 2, 2, 1]);
    expect(f.map((step) => step.label)).toEqual([
      "가입 완료",
      "프로필 설정",
      "첫 운동 완료",
      "3회 운동 완료",
    ]);
  });

  // 단계 수는 절대 늘어나면 안 된다 — 늘어나면 퍼널을 읽을 수 없다
  it("단계는 단조 감소한다", () => {
    const f = activationFunnel(
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [{ userId: "u1", createdAt: new Date("2026-07-01T00:00:00Z") }],
      [s("u1", "completed", "2026-07-02T00:00:00Z")],
    );
    for (let i = 1; i < f.length; i++) {
      expect(f[i].count).toBeLessThanOrEqual(f[i - 1].count);
    }
  });

  it("가입자가 없으면 전 단계 0", () => {
    expect(activationFunnel([], [], []).map((step) => step.count)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("crewParticipation", () => {
  it("크루에 속한 사용자 비율", () => {
    expect(
      crewParticipation(
        [
          { userId: "u1", createdAt: new Date() },
          { userId: "u2", createdAt: new Date() },
          { userId: "u3", createdAt: new Date() },
        ],
        ["u1", "u2"],
      ),
    ).toEqual({ numerator: 2, denominator: 3 });
  });

  it("같은 사용자가 여러 크루에 있어도 1명으로 센다", () => {
    expect(
      crewParticipation([{ userId: "u1", createdAt: new Date() }], ["u1", "u1"]),
    ).toEqual({ numerator: 1, denominator: 1 });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: FAIL — `reworkoutRetention is not a function`

- [ ] **Step 3: 구현을 추가한다**

`src/lib/domain/analytics.ts` 끝에 추가:

```ts
/**
 * **"재방문"이 아니라 "재운동" 리텐션이다.**
 * 앱이 방문·페이지뷰·로그인 이벤트를 수집하지 않아 진짜 재방문은 계산할 수 없다.
 * (auth.users.last_sign_in_at은 마지막 1개 값뿐이라 코호트에 못 쓴다.)
 * 그래서 "가입 후 D일차에 운동을 완료했는가"로 정의한다. 화면 문구도 재운동이다.
 */
export interface Retention {
  d1: Ratio;
  d7: Ratio;
  d28: Ratio;
}

export function reworkoutRetention(
  profiles: ProfileRow[],
  sessions: SessionRow[],
  now: Date,
): Retention {
  const completedByUser = new Map<string, Date[]>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt) continue;
    if (!completedByUser.has(s.userId)) completedByUser.set(s.userId, []);
    completedByUser.get(s.userId)!.push(s.completedAt);
  }

  const at = (day: number): Ratio => {
    // 아직 D일이 지나지 않은 사람은 분모에서 뺀다 — 안 그러면 최근 가입자가
    // 전부 "미복귀"로 잡혀 리텐션이 실제보다 낮게 나온다.
    const cohort = profiles.filter(
      (p) => now.getTime() - p.createdAt.getTime() >= day * DAY_MS,
    );
    const returned = cohort.filter((p) => {
      const windowFrom = new Date(p.createdAt.getTime() + day * DAY_MS);
      const windowTo = new Date(windowFrom.getTime() + DAY_MS);
      return (completedByUser.get(p.userId) ?? []).some(
        (d) => d >= windowFrom && d < windowTo,
      );
    });
    return ratio(returned.length, cohort.length);
  };

  return { d1: at(1), d7: at(7), d28: at(28) };
}

export interface FunnelStep {
  label: string;
  count: number;
}

/**
 * 활성화 퍼널 4단계.
 *
 * **크루 단계를 넣지 않는 이유**: 온보딩의 "혼자 시작하기"는 DB에 흔적을
 * 남기지 않아(setStep("done")만 하고 쓰기 없음) "혼자 완료"와 "크루 단계
 * 이탈"을 구분할 수 없다. group_members 유무로 단계를 만들면 혼자모드
 * 사용자가 크루 없이 첫 운동을 완료해 다음 단계가 이전 단계보다 커지는
 * 비단조 퍼널이 된다. 크루 참여율은 crewParticipation()으로 따로 낸다.
 *
 * 가입은 profiles가 아니라 authUsers 기준이다 — 그래야 온보딩을 시작만 하고
 * 프로필을 안 만든 사람이 "프로필 설정" 단계의 이탈로 잡힌다.
 */
export function activationFunnel(
  authUsers: ProfileRow[],
  profiles: ProfileRow[],
  sessions: SessionRow[],
): FunnelStep[] {
  const profileIds = new Set(profiles.map((p) => p.userId));

  const completedCount = new Map<string, number>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    completedCount.set(s.userId, (completedCount.get(s.userId) ?? 0) + 1);
  }

  const withProfile = authUsers.filter((u) => profileIds.has(u.userId));
  const withFirst = withProfile.filter(
    (u) => (completedCount.get(u.userId) ?? 0) >= 1,
  );
  const withThree = withProfile.filter(
    (u) => (completedCount.get(u.userId) ?? 0) >= 3,
  );

  return [
    { label: "가입 완료", count: authUsers.length },
    { label: "프로필 설정", count: withProfile.length },
    { label: "첫 운동 완료", count: withFirst.length },
    { label: "3회 운동 완료", count: withThree.length },
  ];
}

/** 크루 보유 사용자 / 전체 프로필. 퍼널 단계가 아니라 독립 지표다(위 주석 참고). */
export function crewParticipation(
  profiles: ProfileRow[],
  memberUserIds: string[],
): Ratio {
  const inCrew = new Set(memberUserIds);
  return ratio(
    profiles.filter((p) => inCrew.has(p.userId)).length,
    profiles.length,
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: PASS — 37 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts
git commit -m "feat(admin): 재운동 리텐션 + 4단계 활성화 퍼널 + 크루 참여율 분리"
```

---

## Task 7: 사용자 표 행 (상태·이탈 위험)

**Files:**
- Modify: `src/lib/domain/analytics.ts`
- Modify: `src/lib/domain/analytics.test.ts`

**스트릭과 레벨은 새로 계산하지 않는다.** 앱 화면이 쓰는 `currentStreak()`·`getLevelProgress()`를 그대로 호출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/domain/analytics.test.ts` 끝에 추가:

```ts
import { buildUserRows, churnRisk, userStatus } from "./analytics";

describe("userStatus", () => {
  it("7일 이내 운동이면 활성", () => {
    expect(userStatus(0)).toBe("활성");
    expect(userStatus(7)).toBe("활성");
  });

  it("8~14일이면 주의", () => {
    expect(userStatus(8)).toBe("주의");
    expect(userStatus(14)).toBe("주의");
  });

  it("15일 이상이면 휴면", () => {
    expect(userStatus(15)).toBe("휴면");
  });

  it("운동 기록이 없으면(null) 휴면", () => {
    expect(userStatus(null)).toBe("휴면");
  });
});

describe("churnRisk", () => {
  // 경계 5일 = STREAK_EXPIRY_DAYS. 앱이 불꽃을 보여주는 사용자가
  // 관리자 화면에서 "위험"으로 뜨면 두 화면이 어긋난다.
  it("스트릭이 살아있는 5일 미만은 낮음", () => {
    expect(churnRisk(0)).toBe("낮음");
    expect(churnRisk(4)).toBe("낮음");
  });

  it("5~13일은 중간", () => {
    expect(churnRisk(5)).toBe("중간");
    expect(churnRisk(13)).toBe("중간");
  });

  it("14일 이상은 높음", () => {
    expect(churnRisk(14)).toBe("높음");
  });

  it("기록 없음은 높음", () => {
    expect(churnRisk(null)).toBe("높음");
  });
});

describe("buildUserRows", () => {
  const now = new Date("2026-07-28T00:00:00Z");
  const period = buildPeriod(28, now);

  it("닉네임·단계·기간 내 운동 수·스트릭·마지막 활동을 채운다", () => {
    const rows = buildUserRows(
      [{ userId: "u1", nickname: "오뎅끼", avatarUrl: "🧔", createdAt: new Date("2026-01-01T00:00:00Z") }],
      [
        s("u1", "completed", "2026-07-27T01:00:00Z"),
        s("u1", "completed", "2026-07-26T01:00:00Z"),
      ],
      new Map([["u1", 3000]]),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nickname).toBe("오뎅끼");
    expect(rows[0].workoutsInPeriod).toBe(2);
    expect(rows[0].streakDays).toBe(2);
    expect(rows[0].stageName).toBe("일단하개"); // 3000 XP = Lv.11 = 3단계
    expect(rows[0].status).toBe("활성");
  });

  it("운동이 0건인 사용자도 표에 남긴다(휴면 발견이 목적)", () => {
    const rows = buildUserRows(
      [{ userId: "u1", nickname: "휴면이", avatarUrl: null, createdAt: new Date("2026-01-01T00:00:00Z") }],
      [],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].workoutsInPeriod).toBe(0);
    expect(rows[0].lastActiveAt).toBeNull();
    expect(rows[0].status).toBe("휴면");
    expect(rows[0].churnRisk).toBe("높음");
  });

  it("XP가 없으면 1레벨 1단계로 본다", () => {
    const rows = buildUserRows(
      [{ userId: "u1", nickname: "새싹", avatarUrl: null, createdAt: new Date() }],
      [],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows[0].level).toBe(1);
    expect(rows[0].stageName).toBe("개노답");
  });

  it("기간 밖 운동은 기간 내 운동 수에 안 들어간다", () => {
    const rows = buildUserRows(
      [{ userId: "u1", nickname: "u", avatarUrl: null, createdAt: new Date("2026-01-01T00:00:00Z") }],
      [s("u1", "completed", "2026-01-05T01:00:00Z")],
      new Map(),
      period,
      now,
      "Asia/Seoul",
    );
    expect(rows[0].workoutsInPeriod).toBe(0);
    // 마지막 활동은 기간과 무관하게 전체에서 본다
    expect(rows[0].lastActiveAt).toEqual(new Date("2026-01-05T01:00:00Z"));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: FAIL — `userStatus is not a function`

- [ ] **Step 3: 구현을 추가한다**

`src/lib/domain/analytics.ts` 상단 import에 추가:

```ts
import { getLevelProgress } from "./progression";
import { currentStreak, workoutDayKeys } from "./streak";
```

파일 끝에 추가:

```ts
export type UserStatus = "활성" | "주의" | "휴면";
export type ChurnRisk = "낮음" | "중간" | "높음";

export function userStatus(daysSinceLastWorkout: number | null): UserStatus {
  if (daysSinceLastWorkout === null) return "휴면";
  if (daysSinceLastWorkout <= 7) return "활성";
  if (daysSinceLastWorkout <= 14) return "주의";
  return "휴면";
}

/**
 * 경계 5일은 streak.ts의 STREAK_EXPIRY_DAYS와 같다.
 * 앱이 "불꽃 살아있음"을 보여주는 사용자가 여기서 "위험"으로 뜨면 안 된다.
 */
export function churnRisk(daysSinceLastWorkout: number | null): ChurnRisk {
  if (daysSinceLastWorkout === null) return "높음";
  if (daysSinceLastWorkout < 5) return "낮음";
  if (daysSinceLastWorkout < 14) return "중간";
  return "높음";
}

export interface AdminProfileRow extends ProfileRow {
  nickname: string;
  avatarUrl: string | null;
}

export interface UserRow {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  stageName: string;
  workoutsInPeriod: number;
  streakDays: number;
  lastActiveAt: Date | null;
  status: UserStatus;
  churnRisk: ChurnRisk;
}

export function buildUserRows(
  profiles: AdminProfileRow[],
  sessions: SessionRow[],
  totalXpByUser: Map<string, number>,
  period: Period,
  now: Date,
  timeZone: string,
): UserRow[] {
  const completedByUser = new Map<string, Date[]>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt) continue;
    if (!completedByUser.has(s.userId)) completedByUser.set(s.userId, []);
    completedByUser.get(s.userId)!.push(s.completedAt);
  }

  const todayKey = dayKey(now, timeZone);

  return profiles.map((p) => {
    const all = completedByUser.get(p.userId) ?? [];
    const lastActiveAt =
      all.length === 0
        ? null
        : all.reduce((a, b) => (a > b ? a : b));

    const daysSince =
      lastActiveAt === null
        ? null
        : Math.floor((now.getTime() - lastActiveAt.getTime()) / DAY_MS);

    // 앱 화면과 같은 함수로 계산한다 — 자체 계산을 두면 조용히 어긋난다
    const streakDays = currentStreak(
      workoutDayKeys(all, timeZone),
      todayKey,
    );
    const progress = getLevelProgress(totalXpByUser.get(p.userId) ?? 0);

    return {
      userId: p.userId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      // LevelProgress의 필드명은 level이 아니라 currentLevel이다(확인함)
      level: progress.currentLevel,
      stageName: progress.stageName,
      workoutsInPeriod: all.filter((d) => inRange(d, period.from, period.to))
        .length,
      streakDays,
      lastActiveAt,
      status: userStatus(daysSince),
      churnRisk: churnRisk(daysSince),
    };
  });
}
```

> **확인 완료:** `LevelProgress`의 실제 필드는 `currentLevel`·`currentStageIndex`·`stageName`이다. `level`이 아니다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm vitest run src/lib/domain/analytics.test.ts`
Expected: PASS — 48 tests

- [ ] **Step 5: 커밋**

```bash
git add src/lib/domain/analytics.ts src/lib/domain/analytics.test.ts
git commit -m "feat(admin): 사용자 표 행 — 스트릭·레벨은 앱과 같은 함수 재사용"
```

---

## Task 8: service_role 조회 계층

**Files:**
- Create: `src/lib/admin/queries.ts`

순수 함수가 먹을 원본 행을 읽어 오는 얇은 계층. 여기에 집계 로직을 두지 않는다.

- [ ] **Step 1: 조회 함수를 쓴다**

`src/lib/admin/queries.ts`:

```ts
import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AdminProfileRow,
  ProfileRow,
  SessionRow,
  SessionStatus,
} from "@/lib/domain/analytics";

export interface AdminDataset {
  authUsers: ProfileRow[];
  profiles: AdminProfileRow[];
  sessions: SessionRow[];
  totalXpByUser: Map<string, number>;
  /**
   * 크루 참여율의 원천은 **crew_links**다(0039부터 "크루" = 상호 수락 연결).
   * group_members는 0039 이후 **챌린지 전용**으로만 남았다 — 크루 지표에 쓰면 틀린다.
   * (`src/lib/crew.ts`의 getGroupMemberProfiles 주석 참고)
   */
  crewLinkUserIds: string[];
}

/**
 * 대시보드가 쓰는 원본 행을 한 번에 읽는다. **requireAdmin() 통과 뒤에만 호출할 것.**
 * 집계는 하지 않는다 — 계산은 domain/analytics.ts 순수 함수의 몫이다.
 */
export async function fetchAdminDataset(): Promise<AdminDataset> {
  const db = getSupabaseAdminClient();

  const [sessionsRes, profilesRes, progressRes, membersRes, authRes] =
    await Promise.all([
      db
        .from("workout_sessions")
        .select("user_id,status,started_at,completed_at")
        .is("deleted_at", null),
      db.from("profiles").select("id,nickname,avatar_url,created_at"),
      db.from("user_progress").select("user_id,total_xp"),
      // 0039부터 "크루" = crew_links(상호 수락). group_members는 챌린지 전용이다.
      db.from("crew_links").select("user_a,user_b"),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  for (const [name, res] of [
    ["workout_sessions", sessionsRes],
    ["profiles", profilesRes],
    ["user_progress", progressRes],
    ["crew_links", membersRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }
  if (authRes.error) {
    throw new Error(`auth.users 조회 실패: ${authRes.error.message}`);
  }

  return {
    // 가입 퍼널 최상단은 profiles가 아니라 auth 기준이다(설계 §4.5)
    authUsers: authRes.data.users.map((u) => ({
      userId: u.id,
      createdAt: new Date(u.created_at),
    })),
    profiles: (profilesRes.data ?? []).map((p) => ({
      userId: p.id as string,
      nickname: p.nickname as string,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      createdAt: new Date(p.created_at as string),
    })),
    sessions: (sessionsRes.data ?? []).map((r) => ({
      userId: r.user_id as string,
      status: r.status as SessionStatus,
      startedAt: r.started_at ? new Date(r.started_at as string) : null,
      completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
    })),
    totalXpByUser: new Map(
      (progressRes.data ?? []).map((r) => [
        r.user_id as string,
        r.total_xp as number,
      ]),
    ),
    // 연결의 양쪽 끝을 모두 "크루 보유자"로 센다
    crewLinkUserIds: (membersRes.data ?? []).flatMap((r) => [
      r.user_a as string,
      r.user_b as string,
    ]),
  };
}
```

> **알려진 한계 (주석으로 남길 것):** `listUsers`는 1페이지 1000명까지만 읽는다. 현재 실계정 4명이라 문제없다. 사용자가 1000명을 넘으면 페이지 순회를 넣어야 한다.

- [ ] **Step 2: 위 한계를 파일 상단 주석에 적는다**

`fetchAdminDataset` 위에 추가:

```ts
/**
 * 한계: auth.users는 1000명까지만 읽는다(단일 페이지). 현재 실계정 4명.
 * 1000명을 넘으면 page 순회가 필요하다.
 * 한계: 완료 세션이 약 5,000건을 넘으면 전 행 조회 + TS 집계가 느려진다.
 * 그때는 SQL 집계(RPC 또는 뷰)로 옮긴다(설계 §5).
 */
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 4: 커밋**

```bash
git add src/lib/admin/queries.ts
git commit -m "feat(admin): service_role 조회 계층 — 집계 없이 원본 행만"
```

---

## Task 9: `/admin` 레이아웃 + 목업 CSS 이식

**Files:**
- Create: `src/app/admin/admin.css`
- Create: `src/app/admin/layout.tsx`

- [ ] **Step 1: 목업 CSS를 옮긴다**

`docs/dashboard-source.html`의 **7~91행 `<style>` 안쪽 내용을 그대로** `src/app/admin/admin.css`로 복사한다. 단 아래 2가지만 바꾼다:

1. `body{...}` 선택자를 `.admin-root{...}`로 바꾼다 — 앱 전역 `body` 스타일을 덮어쓰지 않기 위해서다.
2. 파일 맨 위에 출처를 적는다:

```css
/* docs/dashboard-source.html의 <style>을 이식. 레이아웃·색은 목업 그대로 유지한다. */
```

- [ ] **Step 2: 레이아웃을 만든다**

`src/app/admin/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = { title: "GND 관리자" };

// 집계 결과가 CDN·중간 캐시에 남지 않게 한다
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-root">{children}</div>;
}
```

- [ ] **Step 3: 빌드가 통과하는지 확인한다**

Run: `pnpm typecheck && pnpm build`
Expected: 통과

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/admin.css src/app/admin/layout.tsx
git commit -m "feat(admin): /admin 레이아웃 + 목업 CSS 이식 (no-store)"
```

---

## Task 10: `/admin` 페이지 뼈대 + KPI + 일별 차트

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/_components/kpi-cards.tsx`
- Create: `src/app/admin/_components/activity-chart.tsx`

- [ ] **Step 1: KPI 카드 컴포넌트를 만든다**

`src/app/admin/_components/kpi-cards.tsx`:

```tsx
import { formatRatio, type Kpi } from "@/lib/domain/analytics";

function Delta({ pct }: { pct: number | null }) {
  // 직전 구간이 0이면 퍼센트를 만들지 않는다(0→5는 ∞%)
  if (pct === null) return <span className="sub">직전 구간 없음</span>;
  const up = pct >= 0;
  return (
    <span className={up ? "up" : "sub"}>
      {up ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  );
}

export function KpiCards({ kpi }: { kpi: Kpi }) {
  return (
    <section className="metrics">
      <article className="card">
        <div className="card-head"><span>활성 사용자</span><i>♙</i></div>
        <strong>{kpi.activeUsers}<small>명</small></strong>
        <div className="card-foot">
          <Delta pct={kpi.activeUsersDeltaPct} />
          <span className="sub">신규 +{kpi.newUsers}명</span>
        </div>
      </article>

      <article className="card">
        <div className="card-head"><span>완료 운동</span><i>✓</i></div>
        <strong>{kpi.completedWorkouts.toLocaleString()}<small>회</small></strong>
        <div className="card-foot">
          <Delta pct={kpi.completedWorkoutsDeltaPct} />
          <span className="sub">취소 {kpi.cancelledWorkouts}회</span>
        </div>
      </article>

      <article className="card">
        <div className="card-head"><span>운동 완료율</span><i>◎</i></div>
        <strong style={{ fontSize: 26 }}>{formatRatio(kpi.completionRate)}</strong>
        <div className="card-foot">
          <span className="sub">방치 {kpi.abandonedWorkouts}회</span>
          <span className="sub">분모=완료+취소+방치</span>
        </div>
      </article>

      <article className="card accent">
        <div className="card-head"><span>1인당 운동</span><i>⚡</i></div>
        <strong>{kpi.workoutsPerUser.toFixed(1)}<small>회</small></strong>
        <div className="card-foot">
          <span className="sub">상위 25% {kpi.topQuartileWorkouts}회</span>
        </div>
      </article>
    </section>
  );
}
```

- [ ] **Step 2: 일별 차트 컴포넌트를 만든다**

`src/app/admin/_components/activity-chart.tsx`:

```tsx
import {
  formatRatio,
  type ActiveUserCounts,
  type DailyActivePoint,
} from "@/lib/domain/analytics";

/** 막대가 촘촘할 때 라벨을 솎아낸다 — 7개는 전부, 그 이상은 간헐 표기 */
function labelFor(points: DailyActivePoint[], i: number): string {
  const step = points.length <= 7 ? 1 : Math.ceil(points.length / 6);
  if (i !== points.length - 1 && i % step !== 0) return "";
  if (i === points.length - 1) return "오늘";
  return points[i].dayKey.slice(5).replace("-", "/");
}

export function ActivityChart({
  points,
  counts,
}: {
  points: DailyActivePoint[];
  counts: ActiveUserCounts;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <p className="kicker">ACTIVE USERS</p>
          <h2>일별 활성 사용자</h2>
        </div>
        <span className="muted">최대 {max}명</span>
      </div>
      <div className="bars" aria-label="일별 활성 사용자 막대그래프">
        {points.map((p, i) => (
          <div className="bar-wrap" key={p.dayKey} title={`${p.dayKey} · ${p.count}명`}>
            <div
              className="bar"
              style={{ height: `${p.count === 0 ? 2 : Math.max(12, (p.count / max) * 100)}%` }}
            />
            <span>{labelFor(points, i)}</span>
          </div>
        ))}
      </div>
      <div className="summary">
        <div><small>DAU · 오늘</small><b>{counts.dau}</b></div>
        <div><small>WAU · 주간</small><b>{counts.wau}</b></div>
        <div><small>MAU · 월간</small><b>{counts.mau}</b></div>
        <div><small>DAU / MAU</small><b className="gold">{formatRatio(counts.dauOverMau)}</b></div>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: 페이지를 만든다**

`src/app/admin/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/admin/auth";
import { fetchAdminDataset } from "@/lib/admin/queries";
import {
  activeUserCounts,
  buildKpi,
  buildPeriod,
  dailyActiveSeries,
  type PeriodDays,
} from "@/lib/domain/analytics";
import { DEFAULT_TIMEZONE } from "@/lib/domain/time";
import { KpiCards } from "./_components/kpi-cards";
import { ActivityChart } from "./_components/activity-chart";

const ALLOWED_PERIODS: PeriodDays[] = [7, 28, 90];

function parsePeriod(raw: string | undefined): PeriodDays {
  const n = Number(raw);
  return (ALLOWED_PERIODS as number[]).includes(n) ? (n as PeriodDays) : 28;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireAdmin();

  const days = parsePeriod((await searchParams).period);
  const now = new Date();
  const period = buildPeriod(days, now);
  const data = await fetchAdminDataset();

  const kpi = buildKpi(data.sessions, data.profiles, period, now);
  const points = dailyActiveSeries(data.sessions, period, DEFAULT_TIMEZONE);
  const counts = activeUserCounts(data.sessions, now);

  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🏋️</span>
          <div><b>GND</b><small>ADMIN</small></div>
        </div>
        <nav>
          <a className="active" href="#overview"><i>▦</i>대시보드</a>
          <a href="#users"><i>♙</i>사용자</a>
          <a href="#activity"><i>↗</i>운동 기록</a>
          <a href="#challenges"><i>♛</i>챌린지</a>
          <a href="#levels"><i>✦</i>성장·XP</a>
        </nav>
        <div className="sidebar-foot">GND ADMIN · 운영자 전용</div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="kicker">GND PERFORMANCE CENTER</p>
            <h1>사용자 현황</h1>
            <p>유저가 들어오고, 운동하고, 다시 돌아오는지 확인합니다.</p>
          </div>
          <div className="actions">
            <span className="live">실데이터</span>
            <div className="seg">
              {ALLOWED_PERIODS.map((d) => (
                <a
                  key={d}
                  href={`/admin?period=${d}`}
                  className={d === days ? "on" : ""}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 30,
                    padding: "0 11px",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontWeight: 700,
                    color: d === days ? "var(--gold2)" : "#737680",
                    background: d === days ? "#2a2519" : "transparent",
                  }}
                >
                  {d}일
                </a>
              ))}
            </div>
          </div>
        </header>

        <div className="notice">
          <span>ⓘ</span>
          <div>
            <b>표본이 작습니다.</b> 모수 5 미만인 비율은 퍼센트 대신 원시수치로 표시합니다.
          </div>
        </div>

        <div id="overview" />
        <KpiCards kpi={kpi} />

        <section className="grid" id="activity">
          <ActivityChart points={points} counts={counts} />
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 4: 빌드하고 게이트를 실측한다**

Run: `pnpm build && pnpm dev`
그리고 다른 터미널에서:
```bash
curl -s -o /dev/null -w "비로그인 /admin: %{http_code}\n" http://localhost:3000/admin
```
Expected: `404` (게이트가 동작한다는 증거)

- [ ] **Step 5: 커밋**

```bash
git add src/app/admin/page.tsx src/app/admin/_components/
git commit -m "feat(admin): /admin 뼈대 + KPI 카드 + 일별 활성 차트 실데이터"
```

---

## Task 11: 리텐션 · 퍼널 · 챌린지 패널

**Files:**
- Create: `src/app/admin/_components/retention-panel.tsx`
- Create: `src/app/admin/_components/funnel-panel.tsx`
- Create: `src/app/admin/_components/challenge-panel.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: 리텐션 패널을 만든다**

`src/app/admin/_components/retention-panel.tsx`:

```tsx
import {
  formatRatio,
  MIN_RATIO_SAMPLE,
  type Ratio,
  type Retention,
} from "@/lib/domain/analytics";

function Ring({ label, r }: { label: string; r: Ratio }) {
  // 모수가 작으면 링을 그리지 않는다 — 1/1을 100% 링으로 그리면 거짓 인상을 준다
  const showRing = r.denominator >= MIN_RATIO_SAMPLE;
  const deg = showRing ? (r.numerator / r.denominator) * 360 : 0;
  return (
    <div className="ring" style={{ ["--p" as string]: `${deg}deg` }}>
      <div>
        <b style={{ fontSize: 13 }}>{formatRatio(r)}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

export function RetentionPanel({ retention }: { retention: Retention }) {
  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <p className="kicker">RETENTION</p>
          <h2>재운동 리텐션</h2>
        </div>
      </div>
      <div className="rings">
        <Ring label="D1" r={retention.d1} />
        <Ring label="D7" r={retention.d7} />
        <Ring label="D28" r={retention.d28} />
      </div>
      <div className="insight">
        <b>가입 후 D일차에 운동을 완료한 비율입니다.</b>
        <br />
        앱이 방문·페이지뷰를 수집하지 않아 &ldquo;재방문&rdquo;은 측정할 수 없습니다.
        해당 일수가 아직 지나지 않은 가입자는 분모에서 제외합니다.
      </div>
    </article>
  );
}
```

- [ ] **Step 2: 퍼널 패널을 만든다**

`src/app/admin/_components/funnel-panel.tsx`:

```tsx
import { formatRatio, type FunnelStep, type Ratio } from "@/lib/domain/analytics";

export function FunnelPanel({
  steps,
  crew,
}: {
  steps: FunnelStep[];
  crew: Ratio;
}) {
  const top = steps[0]?.count ?? 0;
  return (
    <article className="panel">
      <div className="panel-title">
        <div>
          <p className="kicker">ACTIVATION FUNNEL</p>
          <h2>가입 후 첫 운동 전환</h2>
        </div>
        <span className="muted">크루 참여 {formatRatio(crew)}</span>
      </div>
      <div className="funnel">
        {steps.map((step, i) => {
          const prev = i === 0 ? null : steps[i - 1].count;
          const loss =
            prev === null || prev === 0
              ? ""
              : `-${Math.round(((prev - step.count) / prev) * 100)}%`;
          return (
            <div className="frow" key={step.label}>
              <label>
                <span>{step.label}</span>
                <b>{step.count}명</b>
              </label>
              <div className="track">
                <i style={{ width: `${top === 0 ? 0 : (step.count / top) * 100}%` }} />
              </div>
              <span className="loss">{loss}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
```

- [ ] **Step 3: 챌린지 패널을 만든다**

`src/app/admin/_components/challenge-panel.tsx`:

```tsx
export interface AdminChallenge {
  id: string;
  name: string;
  daysLeft: number;
  memberCount: number;
  achievementPct: number | null;
}

export function ChallengePanel({ items }: { items: AdminChallenge[] }) {
  return (
    <article className="panel" id="challenges">
      <div className="panel-title">
        <div>
          <p className="kicker">CHALLENGE HEALTH</p>
          <h2>진행 중 챌린지</h2>
        </div>
        <span className="muted">{items.length}개</span>
      </div>
      {items.length === 0 ? (
        <div className="insight">진행 중인 챌린지가 없습니다.</div>
      ) : (
        <div className="challenges">
          {items.map((c) => (
            <div className="challenge" key={c.id}>
              <div className="challenge-icon">🔥</div>
              <div>
                <div className="challenge-top">
                  <b>{c.name}</b>
                  <span>D-{c.daysLeft}</span>
                </div>
                <p>
                  {c.memberCount}명 참여
                  {c.achievementPct !== null && ` · 달성률 ${c.achievementPct}%`}
                </p>
                <div className="progress">
                  <i style={{ width: `${c.achievementPct ?? 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: 챌린지 데이터를 조회에 추가한다**

`src/lib/admin/queries.ts`에 함수 추가:

```ts
import { getActiveChallengeRanking } from "@/lib/challenge";
import type { AdminChallenge } from "@/app/admin/_components/challenge-panel";

/**
 * 진행 중 챌린지. 달성률은 챌린지 화면이 쓰는 getActiveChallengeRanking()을
 * 그대로 재사용한다 — 같은 챌린지가 두 화면에서 다른 달성률로 보이면 안 된다.
 */
export async function fetchActiveChallenges(
  now: Date,
): Promise<AdminChallenge[]> {
  const db = getSupabaseAdminClient();

  const { data, error } = await db
    .from("challenges")
    .select("id,name,end_date,group_id")
    .eq("status", "active");
  if (error) throw new Error(`challenges 조회 실패: ${error.message}`);

  // 챌린지 참여 인원은 group_members가 맞다 — 0039 이후에도 챌린지는 그룹 기반이다.
  // (크루 참여율만 crew_links를 쓴다. 두 개념이 갈라졌으니 섞지 말 것.)
  const { data: members, error: mErr } = await db
    .from("group_members")
    .select("group_id,user_id");
  if (mErr) throw new Error(`group_members 조회 실패: ${mErr.message}`);

  const memberCount = new Map<string, number>();
  for (const m of members ?? []) {
    const g = m.group_id as string;
    memberCount.set(g, (memberCount.get(g) ?? 0) + 1);
  }

  return Promise.all(
    (data ?? []).map(async (c) => {
      // ChallengeRanking = { name, list: RankedParticipant[] }
      // RankedParticipant.achievement는 0~100 스케일이다(확인함)
      const ranking = await getActiveChallengeRanking(c.group_id as string);
      const list = ranking?.list ?? [];
      const pct =
        list.length === 0
          ? null
          : Math.round(
              list.reduce((sum, r) => sum + r.achievement, 0) / list.length,
            );
      const end = new Date(`${c.end_date as string}T23:59:59+09:00`);
      return {
        id: c.id as string,
        name: c.name as string,
        daysLeft: Math.max(
          0,
          Math.ceil((end.getTime() - now.getTime()) / 86_400_000),
        ),
        memberCount: memberCount.get(c.group_id as string) ?? 0,
        achievementPct: pct,
      };
    }),
  );
}
```

> **확인 완료:** `ChallengeRanking = { name: string; list: RankedParticipant[] }`이고 `RankedParticipant`는 `{ userId, rank, achievement, participation, overall, completedGoalCount }`다. `achievement`는 0~100 스케일(`goal-score.ts`에서 `* 100`).

- [ ] **Step 5: 페이지에 배선한다**

`src/app/admin/page.tsx`의 import에 추가:

```tsx
import { activationFunnel, crewParticipation, reworkoutRetention } from "@/lib/domain/analytics";
import { fetchActiveChallenges } from "@/lib/admin/queries";
import { RetentionPanel } from "./_components/retention-panel";
import { FunnelPanel } from "./_components/funnel-panel";
import { ChallengePanel } from "./_components/challenge-panel";
```

`const counts = ...` 아래에 추가:

```tsx
const retention = reworkoutRetention(data.profiles, data.sessions, now);
const funnel = activationFunnel(data.authUsers, data.profiles, data.sessions);
const crew = crewParticipation(data.profiles, data.crewLinkUserIds);
const challenges = await fetchActiveChallenges(now);
```

`<ActivityChart .../>` 뒤 `</section>` 안에 `<RetentionPanel retention={retention} />`를 넣고, 그 아래에 추가:

```tsx
<section className="grid equal">
  <FunnelPanel steps={funnel} crew={crew} />
  <ChallengePanel items={challenges} />
</section>
```

- [ ] **Step 6: 빌드 확인**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add src/app/admin/ src/lib/admin/queries.ts
git commit -m "feat(admin): 재운동 리텐션·활성화 퍼널·진행 중 챌린지 패널"
```

---

## Task 12: 사용자 표 + 검색/필터 + CSV 내보내기

**Files:**
- Create: `src/app/admin/_components/user-table.tsx`
- Modify: `src/app/admin/page.tsx`

검색·필터·CSV는 클라이언트 동작이므로 이 컴포넌트만 `"use client"`다. **CSV에 실제로 들어가는 필드만** props로 내려보낸다.

- [ ] **Step 1: 클라이언트로 내려보낼 최소 타입을 정하고 컴포넌트를 만든다**

`src/app/admin/_components/user-table.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { ChurnRisk, UserStatus } from "@/lib/domain/analytics";

/**
 * 클라이언트로 내려보내는 필드는 화면·CSV에 실제로 쓰는 것만이다.
 * userId·이메일·원본 타임스탬프는 서버에서 잘라내고 보내지 않는다 —
 * 화면에 안 쓰는 값이 RSC 페이로드에 묻어 나가지 않게 한다.
 */
export interface UserTableRow {
  nickname: string;
  avatar: string;
  stageName: string;
  level: number;
  workoutsInPeriod: number;
  streakDays: number;
  lastActiveLabel: string;
  status: UserStatus;
  churnRisk: ChurnRisk;
}

const STATUSES: (UserStatus | "전체")[] = ["전체", "활성", "주의", "휴면"];

export function UserTable({
  rows,
  periodDays,
}: {
  rows: UserTableRow[];
  periodDays: number;
}) {
  const [status, setStatus] = useState<UserStatus | "전체">("전체");
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === "전체" || r.status === status) &&
          (r.nickname.includes(query) || r.stageName.includes(query)),
      ),
    [rows, status, query],
  );

  function exportCsv() {
    const head = `사용자,성장 단계,${periodDays}일 운동,연속 기록,마지막 활동,상태,이탈 위험`;
    const body = visible.map((r) =>
      [
        r.nickname,
        r.stageName,
        r.workoutsInPeriod,
        r.streakDays,
        r.lastActiveLabel,
        r.status,
        r.churnRisk,
      ].join(","),
    );
    const csv = [head, ...body].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv" }),
    );
    a.download = "gnd-users.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="panel table-panel" id="users">
      <div className="panel-title table-top">
        <div>
          <p className="kicker">USER HEALTH</p>
          <h2>사용자 활동 현황</h2>
        </div>
        <div className="filters">
          <button className="ghost" onClick={exportCsv}>↓ CSV 내보내기</button>
          <label className="search">
            ⌕&nbsp;
            <input
              placeholder="이름 또는 단계 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value.trim())}
            />
          </label>
          <div className="status-buttons">
            {STATUSES.map((s) => (
              <button
                key={s}
                className={s === status ? "on" : ""}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>사용자</th>
              <th>성장 단계</th>
              {/* 기간을 바꾸면 헤더 문구도 같이 바뀌어야 한다 */}
              <th>{periodDays}일 운동</th>
              <th>스트릭</th>
              <th>마지막 활동</th>
              <th>상태</th>
              <th>이탈 위험</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.nickname}>
                <td>
                  <div className="user">
                    <span className="avatar">{r.avatar}</span>
                    <b>{r.nickname}</b>
                  </div>
                </td>
                <td>
                  <span className="pill level">
                    {r.stageName} · Lv.{r.level}
                  </span>
                </td>
                <td><b>{r.workoutsInPeriod}회</b></td>
                <td>{r.streakDays ? `🔥 ${r.streakDays}일` : "—"}</td>
                <td>{r.lastActiveLabel}</td>
                <td>
                  <span
                    className={`pill ${
                      r.status === "활성" ? "active" : r.status === "주의" ? "warn" : "sleep"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>
                  <span
                    className={`risk ${
                      r.churnRisk === "낮음" ? "low" : r.churnRisk === "중간" ? "mid" : "high"
                    }`}
                  >
                    {r.churnRisk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 페이지에서 필드를 잘라 내려보낸다**

`src/app/admin/page.tsx`의 import에 추가:

```tsx
import { buildUserRows } from "@/lib/domain/analytics";
import { UserTable, type UserTableRow } from "./_components/user-table";
```

`const challenges = ...` 아래에 추가:

```tsx
const userRows = buildUserRows(
  data.profiles,
  data.sessions,
  data.totalXpByUser,
  period,
  now,
  DEFAULT_TIMEZONE,
);

// userId를 비롯해 화면·CSV에 안 쓰는 필드는 여기서 잘라낸다
const tableRows: UserTableRow[] = userRows.map((r) => ({
  nickname: r.nickname,
  avatar: r.avatarUrl ?? "🙂",
  stageName: r.stageName,
  level: r.level,
  workoutsInPeriod: r.workoutsInPeriod,
  streakDays: r.streakDays,
  lastActiveLabel: r.lastActiveAt
    ? r.lastActiveAt.toLocaleDateString("ko-KR", { timeZone: DEFAULT_TIMEZONE })
    : "기록 없음",
  status: r.status,
  churnRisk: r.churnRisk,
}));
```

`</section>` 뒤(챌린지 섹션 아래)에 추가:

```tsx
<UserTable rows={tableRows} periodDays={days} />
```

- [ ] **Step 3: 빌드하고 확인한다**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/
git commit -m "feat(admin): 사용자 표 + 검색·상태 필터 + CSV (표시 필드만 클라 전달)"
```

---

## Task 13: 성장·XP 탭

**Files:**
- Create: `src/app/admin/_components/growth-panel.tsx`
- Modify: `src/lib/admin/queries.ts`
- Modify: `src/app/admin/page.tsx`

목업 사이드바의 `#levels`는 대응 섹션이 없는 죽은 링크였다. 여기서 채운다.

- [ ] **Step 1: 조회를 추가한다**

`src/lib/admin/queries.ts`에 추가:

```ts
export interface GrowthDataset {
  stageDistribution: { stageName: string; count: number }[];
  xpByReason: { reason: string; total: number }[];
  pointsIssued: number;
  walletBalance: number;
  badgeCounts: { badgeKey: string; rarity: string; earned: number }[];
}

export async function fetchGrowthDataset(
  totalXpByUser: Map<string, number>,
): Promise<GrowthDataset> {
  const db = getSupabaseAdminClient();

  const [xpRes, pointRes, walletRes, badgeRes, defRes] = await Promise.all([
    db.from("xp_transactions").select("reason,amount"),
    db.from("point_transactions").select("amount,transaction_type"),
    db.from("user_wallet").select("balance"),
    db.from("user_badges").select("badge_key"),
    db.from("badge_definitions").select("badge_key,rarity"),
  ]);

  for (const [name, res] of [
    ["xp_transactions", xpRes],
    ["point_transactions", pointRes],
    ["user_wallet", walletRes],
    ["user_badges", badgeRes],
    ["badge_definitions", defRes],
  ] as const) {
    if (res.error) throw new Error(`${name} 조회 실패: ${res.error.message}`);
  }

  const stageCount = new Map<string, number>();
  for (const xp of totalXpByUser.values()) {
    const name = getLevelProgress(xp).stageName;
    stageCount.set(name, (stageCount.get(name) ?? 0) + 1);
  }

  const xpByReason = new Map<string, number>();
  for (const r of xpRes.data ?? []) {
    const key = (r.reason as string) ?? "기타";
    xpByReason.set(key, (xpByReason.get(key) ?? 0) + (r.amount as number));
  }

  const rarityOf = new Map(
    (defRes.data ?? []).map((d) => [d.badge_key as string, d.rarity as string]),
  );
  const earned = new Map<string, number>();
  for (const b of badgeRes.data ?? []) {
    const key = b.badge_key as string;
    earned.set(key, (earned.get(key) ?? 0) + 1);
  }

  return {
    stageDistribution: [...stageCount].map(([stageName, count]) => ({
      stageName,
      count,
    })),
    xpByReason: [...xpByReason]
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total),
    pointsIssued: (pointRes.data ?? [])
      .filter((p) => p.transaction_type === "earn")
      .reduce((sum, p) => sum + (p.amount as number), 0),
    walletBalance: (walletRes.data ?? []).reduce(
      (sum, w) => sum + (w.balance as number),
      0,
    ),
    badgeCounts: [...rarityOf].map(([badgeKey, rarity]) => ({
      badgeKey,
      rarity,
      earned: earned.get(badgeKey) ?? 0,
    })),
  };
}
```

`queries.ts` 상단 import에 추가:

```ts
import { getLevelProgress } from "@/lib/domain/progression";
```

> **확인 완료 (컬럼명 검증됨):**
> - `xp_transactions`: `amount` int · `reason` (enum: `workout_completed`·`workout_photo`·`weekly_goal`·`historical_backfill`·`workout_reversal`·`admin_adjustment`·`level_compensation`)
> - `point_transactions`: `amount` int · `transaction_type` (`earn`·`spend`·`refund`·`admin_adjustment`)
> - `user_wallet`: `balance` int · `lifetime_earned` int
>
> `reason` 값은 영문 enum이므로 화면에는 한글 라벨로 바꿔 보여줄 것 (예: `workout_completed` → "운동 완료", `workout_photo` → "인증 사진", `historical_backfill` → "소급 지급").

- [ ] **Step 2: 패널을 만든다**

`src/app/admin/_components/growth-panel.tsx`:

```tsx
import type { GrowthDataset } from "@/lib/admin/queries";

export function GrowthPanel({ data }: { data: GrowthDataset }) {
  const maxStage = Math.max(1, ...data.stageDistribution.map((s) => s.count));
  const maxXp = Math.max(1, ...data.xpByReason.map((x) => x.total));
  const earnedTotal = data.badgeCounts.reduce((s, b) => s + b.earned, 0);

  return (
    <section className="grid equal" id="levels">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">GROWTH</p>
            <h2>성장 단계 분포</h2>
          </div>
        </div>
        <div className="funnel">
          {data.stageDistribution.map((s) => (
            <div className="frow" key={s.stageName}>
              <label><span>{s.stageName}</span><b>{s.count}명</b></label>
              <div className="track">
                <i style={{ width: `${(s.count / maxStage) * 100}%` }} />
              </div>
              <span className="loss" />
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="kicker">XP · POINT</p>
            <h2>XP 원천과 포인트 경제</h2>
          </div>
        </div>
        <div className="funnel">
          {data.xpByReason.map((x) => (
            <div className="frow" key={x.reason}>
              <label><span>{x.reason}</span><b>{x.total.toLocaleString()} XP</b></label>
              <div className="track">
                <i style={{ width: `${(x.total / maxXp) * 100}%` }} />
              </div>
              <span className="loss" />
            </div>
          ))}
        </div>
        <div className="summary">
          <div><small>포인트 발행</small><b>{data.pointsIssued.toLocaleString()}</b></div>
          <div><small>지갑 잔액 합</small><b>{data.walletBalance.toLocaleString()}</b></div>
          <div><small>배지 획득 총계</small><b>{earnedTotal}</b></div>
          <div><small>배지 종류</small><b className="gold">{data.badgeCounts.length}</b></div>
        </div>
      </article>
    </section>
  );
}
```

- [ ] **Step 3: 페이지에 배선한다**

`src/app/admin/page.tsx`:

```tsx
import { fetchGrowthDataset } from "@/lib/admin/queries";
import { GrowthPanel } from "./_components/growth-panel";
```

`const challenges = ...` 아래:

```tsx
const growth = await fetchGrowthDataset(data.totalXpByUser);
```

`<UserTable ... />` 아래:

```tsx
<GrowthPanel data={growth} />
```

- [ ] **Step 4: 빌드 확인**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/app/admin/ src/lib/admin/queries.ts
git commit -m "feat(admin): 성장·XP 탭 — 단계 분포·XP 원천·포인트 경제·배지 (죽은 링크 해소)"
```

---

## Task 14: 전체 검증 + 배포

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 게이트를 돌린다**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: lint 0 · typecheck 통과 · 전 테스트 통과(기존 483 + 신규 약 60) · build 성공

**실패하면 여기서 멈춘다.** 통과 수치를 실제 출력에서 읽어 기록한다.

- [ ] **Step 2: 게이트 4케이스를 로컬에서 실측한다**

`pnpm dev` 실행 후:

| 케이스 | 방법 | 기대 |
|---|---|---|
| 비로그인 | `curl -s -o /dev/null -w "%{http_code}" localhost:3000/admin` | 404 |
| 환경변수 미설정 | `.env.local`에서 `ADMIN_USER_IDS` 주석 처리 후 로그인 상태로 접속 | 404 |
| 비관리자 | 다른 계정 uuid만 등록하고 접속 | 404 |
| 관리자 | 본인 uuid 등록 후 접속 | 200, 대시보드 표시 |

- [ ] **Step 3: 앱 화면과 숫자를 대조한다**

관리자 표의 스트릭·레벨을 앱 `/home`·`/profile`의 같은 계정 값과 비교한다.
**하나라도 다르면 배포하지 않는다** — 대시보드가 자체 계산으로 갈라진 것이다.

- [ ] **Step 4: Vercel 환경변수를 등록한다**

Vercel → Project Settings → Environment Variables → Production에
`ADMIN_USER_IDS` = 본인 uuid 추가. (`NEXT_PUBLIC_` 접두사 금지.)

- [ ] **Step 5: 배포하고 운영에서 확인한다**

```bash
pnpm dlx vercel deploy --prod --yes
```

배포 후:
```bash
curl -s -o /dev/null -w "로그아웃 /admin: %{http_code}\n" https://gnd-one.vercel.app/admin
```
Expected: `404`

브라우저에서 관리자 계정으로 로그인 후 `https://gnd-one.vercel.app/admin` 접속 → 대시보드가 실데이터로 뜨는지 확인.

- [ ] **Step 6: `PROGRESS.md`를 갱신한다**

`PROGRESS.md` 최상단에 새 항목을 추가한다. 포함할 것: 무엇을 만들었는지, 목업과 달라진 3곳(리텐션 정의·퍼널 4단계·크루 참여율 분리)과 그 이유, **실측한 테스트 수·게이트 4케이스 결과·배포 URL**, `ADMIN_USER_IDS` 환경변수가 필요하다는 사실.

- [ ] **Step 7: 릴리스 알림은 보내지 않는다**

`/admin`은 운영자 전용이라 사용자에게 알릴 내용이 아니다.
`release-notes.data.json`에 **추가하지 않는다.**

- [ ] **Step 8: 커밋**

```bash
git add PROGRESS.md
git commit -m "docs: 관리자 분석 대시보드 진행 기록"
```

---

## 구현 시 유의

**import 위치** — 태스크 3~7은 같은 두 파일(`analytics.ts`·`analytics.test.ts`)에 누적해서 쓴다. 각 태스크의 코드 블록에 적힌 `import`는 파일 중간에 새 import문을 만들라는 뜻이 아니라 **맨 위 import 블록에 합치라는 뜻**이다.

**외부 타입은 전부 검증됨** — 이 계획이 참조하는 기존 코드의 타입·컬럼명은 작성 시점에 실제 파일에서 확인했다(`LevelProgress.currentLevel`, `ChallengeRanking.list`, `RankedParticipant.achievement` 0~100, `xp_transactions.reason` enum, `user_wallet.balance`). 추측으로 쓴 필드명은 없다.

**태스크 순서 의존** — 태스크 4가 정의하는 `inRange`·`SessionRow`를 태스크 5~7이 쓴다. 순서를 바꾸지 말 것.
