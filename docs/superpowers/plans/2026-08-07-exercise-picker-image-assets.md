# Exercise Picker Image Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첨부 시안의 검정·골드 3D 상단 일러스트와 `처음 운동해요` 추천 4종 썸네일을 실제 GND 운동 추가 흐름에 적용한다.

**Architecture:** AI로 만든 이미지는 `public/` 아래의 정적 WebP 자산으로 보관하고, 글자·버튼·선택 상태는 기존 React UI로 유지한다. 이미지 경로는 추천 도메인의 이름→파일명 맵에서 한 번만 관리하며, 이미지 로드 실패 시 해당 이미지만 숨겨 텍스트 카드가 계속 동작하게 한다. 작은 아이콘은 생성 이미지가 아니라 재사용 가능한 SVG 컴포넌트로 만들어 허브와 상황 그리드의 색·크기를 코드로 통제한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, `next/image`, Vitest, Testing Library, built-in ImageGen, Python Pillow 12.2

---

## 실행 전 조건

- 현재 `main`에는 사용자 소유의 추적되지 않은 이미지·스크립트가 여럿 있다. 실행을 시작할 때 `using-git-worktrees`로 `codex/exercise-picker-images` 격리 worktree를 만든다.
- 설계 원문은 `docs/superpowers/specs/2026-08-07-exercise-picker-image-assets-design.md`다.
- 기준 참고 이미지는 `C:/Users/SAMSUNG/AppData/Local/Temp/codex-clipboard-f91e62cc-3d80-47af-8e10-89eee4b4f9c3.png`다. 파일이 사라졌다면 대화에 첨부된 마지막 참조 이미지 1장만 ImageGen 입력으로 사용한다.
- DB·마이그레이션·운영 배포는 범위 밖이다.

## 파일 구조

**생성**

- `public/record-assets/exercise-picker-hero.webp` — 운동 추가 허브 상단 장식 이미지
- `public/exercise-thumbs/chest-press-machine.webp` — 체스트프레스 머신
- `public/exercise-thumbs/lat-pulldown.webp` — 랫풀다운
- `public/exercise-thumbs/leg-press.webp` — 레그프레스
- `public/exercise-thumbs/shoulder-press.webp` — 숄더프레스
- `src/components/record/gold-line-icon.tsx` — 허브·상황 공용 골드 SVG 아이콘
- `src/components/record/gold-line-icon.test.tsx` — 아이콘 키 전수 렌더 테스트
- `src/lib/domain/exercise-picker-assets.test.ts` — 이미지 5장 존재·형식·용량 계약
- `docs/superpowers/HANDOFF-2026-08-07-exercise-picker-images.md` — 검증·남은 일 인수인계

**수정**

- `src/components/record/exercise-picker.tsx` — 상단 이미지 카드, 허브 골드 아이콘, 이미지 실패 폴백
- `src/components/record/exercise-picker.test.tsx` — 상단 카드·폴백·허브 아이콘 회귀 테스트
- `src/components/record/recommended-picker.tsx` — 상황 아이콘, WebP 썸네일, 실패 폴백
- `src/components/record/recommended-flow.test.tsx` — 추천 4개 이미지·실패 폴백·기존 선택 동작 검증
- `src/lib/domain/recommended-exercises.ts` — 상황 아이콘 키와 운동명→WebP 파일명 맵
- `src/lib/domain/recommended-exercises.test.ts` — 초보자 추천 4종 이미지 경로 계약
- `PROGRESS.md` — 최종 작업·검증 수치 기록

---

### Task 1: 이미지 파일 계약을 테스트로 고정

**Files:**
- Create: `src/lib/domain/exercise-picker-assets.test.ts`
- Modify: `src/lib/domain/recommended-exercises.test.ts`
- Test: `src/lib/domain/exercise-picker-assets.test.ts`
- Test: `src/lib/domain/recommended-exercises.test.ts`

- [ ] **Step 1: 정적 이미지 5장 계약 테스트 작성**

`src/lib/domain/exercise-picker-assets.test.ts`를 다음 내용으로 만든다.

```ts
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ASSETS = [
  { path: "public/record-assets/exercise-picker-hero.webp", maxBytes: 180_000 },
  { path: "public/exercise-thumbs/chest-press-machine.webp", maxBytes: 70_000 },
  { path: "public/exercise-thumbs/lat-pulldown.webp", maxBytes: 70_000 },
  { path: "public/exercise-thumbs/leg-press.webp", maxBytes: 70_000 },
  { path: "public/exercise-thumbs/shoulder-press.webp", maxBytes: 70_000 },
] as const;

describe("운동 추가 이미지 자산", () => {
  for (const asset of ASSETS) {
    it(`${asset.path}는 유효한 WebP이고 용량 제한 안이다`, () => {
      const absolute = join(process.cwd(), asset.path);
      const bytes = readFileSync(absolute);

      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(statSync(absolute).size).toBeLessThanOrEqual(asset.maxBytes);
    });
  }
});
```

- [ ] **Step 2: 초보자 추천 4종의 파일명 계약 테스트 작성**

`src/lib/domain/recommended-exercises.test.ts`의 import 목록에 `EXERCISE_THUMBS`를 추가하고, `초보자 설명` describe 앞에 다음 테스트를 넣는다.

```ts
describe("추천 운동 썸네일", () => {
  it("처음 운동해요 4종은 각자 다른 WebP를 가진다", () => {
    expect(EXERCISE_THUMBS).toEqual({
      "체스트프레스 머신": "chest-press-machine.webp",
      랫풀다운: "lat-pulldown.webp",
      레그프레스: "leg-press.webp",
      숄더프레스: "shoulder-press.webp",
    });
    expect(new Set(Object.values(EXERCISE_THUMBS)).size).toBe(4);
  });
});
```

- [ ] **Step 3: 테스트가 예상대로 실패하는지 확인**

실행:

```powershell
pnpm test -- src/lib/domain/exercise-picker-assets.test.ts src/lib/domain/recommended-exercises.test.ts
```

예상 결과: 이미지 파일이 없어서 `ENOENT`가 발생하고 `EXERCISE_THUMBS`가 `{}`라 매핑 테스트가 실패한다.

---

### Task 2: 상단 이미지와 체스트프레스 시제품 생성·승인

**Files:**
- Create: `public/record-assets/exercise-picker-hero.webp`
- Create: `public/exercise-thumbs/chest-press-machine.webp`

- [ ] **Step 1: 참고 이미지 확인**

`view_image`로 기준 참고 이미지를 원본 해상도로 연다. 이 이미지는 **스타일·조명·구도 참고**이고 수정 대상이 아니다.

- [ ] **Step 2: 상단 일러스트 생성**

기본 내장 ImageGen에 참고 이미지를 전달하고 다음 프롬프트로 새 이미지를 생성한다.

```text
Use case: stylized-concept
Asset type: mobile workout app hero illustration
Primary request: Create a premium 3D still-life of a black-and-gold dumbbell, a dark checklist clipboard with small gold check marks, and a magnifying glass for a workout-selection screen.
Input image: reference image for black-and-gold visual language, material treatment, and dramatic lighting only; do not reproduce its UI or text.
Scene/backdrop: seamless near-black studio background that can blend into a #0B0B0C app card.
Style/medium: refined realistic 3D product render, not cartoon, not emoji.
Composition/framing: landscape composition; group all objects on the right 55 percent; keep the left 40 percent calm and empty for live HTML copy; no cropped objects.
Lighting/mood: restrained warm gold rim light from upper right, subtle glow, deep soft shadows, premium gym atmosphere.
Color palette: charcoal black, dark gunmetal, GND gold #E8B84B.
Materials/textures: powder-coated metal, rubber dumbbell plates, brushed gold details.
Constraints: no text, no letters, no numbers, no logo, no UI controls, no border, no watermark.
Avoid: people, hands, bright yellow background, busy sparks, neon colors, duplicated objects.
```

생성 결과를 `generatedImage`로 사용자에게 보여준다. 아직 앱 폴더에 최종본으로 확정하지 않는다.

- [ ] **Step 3: 체스트프레스 머신 시제품 생성**

같은 참고 이미지를 전달하고 다음 프롬프트를 사용한다.

```text
Use case: product-mockup
Asset type: square exercise recommendation thumbnail
Primary request: A single recognizable commercial seated chest press machine, isolated as the only subject.
Input image: reference image for the same black-and-gold rendering style and lighting only; do not reproduce UI or text.
Scene/backdrop: seamless near-black studio background that blends into a #111111 card.
Style/medium: refined realistic 3D equipment product render, not a diagram, not cartoon.
Composition/framing: centered three-quarter front view, complete machine visible with generous padding, readable at 64 pixels.
Lighting/mood: restrained warm gold rim light from upper right, deep soft shadows.
Color palette: dark gunmetal frame, black pads, very small GND-gold accents.
Constraints: anatomically and mechanically plausible chest press machine; no person; no text; no letters; no logo; no watermark; one machine only.
Avoid: lat pulldown bars, leg press plates, shoulder press handles, extra equipment, bright floor reflections.
```

- [ ] **Step 4: 사용자에게 두 이미지를 나란히 보여주고 톤 승인 받기**

확인 기준:

- 상단 이미지는 왼쪽 문구 공간이 실제로 비어 있다.
- 체스트프레스가 다른 머신으로 오해되지 않는다.
- 둘의 배경·골드 광원·금속 재질이 같은 세트처럼 보인다.
- 이미지 안에 글자·워터마크가 없다.

사용자가 수정 요청을 하면 한 번에 한 가지 변경만 프롬프트에 추가해 해당 이미지만 다시 만든다. 승인 전에는 나머지 3장을 생성하지 않는다.

- [ ] **Step 5: 승인 이미지를 WebP로 변환해 프로젝트에 저장**

ImageGen 결과가 알려준 두 원본 절대 경로를 PowerShell 변수 `$heroSource`,
`$chestSource`에 그대로 할당한 뒤, 먼저 고정된 임시 파일명으로 복사한다. 변수에는
임의 예시 문자열을 쓰지 않고 도구 결과에 표시된 실제 경로만 넣는다.

```powershell
New-Item -ItemType Directory -Force 'public\record-assets','public\exercise-thumbs' | Out-Null
New-Item -ItemType Directory -Force 'tmp\imagegen' | Out-Null
Copy-Item -LiteralPath $heroSource -Destination 'tmp\imagegen\hero-source.png'
Copy-Item -LiteralPath $chestSource -Destination 'tmp\imagegen\chest-source.png'
@'
from pathlib import Path
from PIL import Image

jobs = [
    (Path("tmp/imagegen/hero-source.png"), Path("public/record-assets/exercise-picker-hero.webp"), (960, 640), 82),
    (Path("tmp/imagegen/chest-source.png"), Path("public/exercise-thumbs/chest-press-machine.webp"), (384, 384), 80),
]
for source, target, size, quality in jobs:
    image = Image.open(source).convert("RGB")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=quality, method=6)
    print(f"{target}: {image.width}x{image.height}, {target.stat().st_size} bytes")
'@ | python -
```

예상 결과: hero는 180KB 이하, 체스트프레스는 70KB 이하의 WebP다. 초과하면 `quality`를 각각 4씩 낮춰 한 번만 재변환한다.

- [ ] **Step 6: 시제품 자산만 커밋**

```powershell
git add -- public/record-assets/exercise-picker-hero.webp public/exercise-thumbs/chest-press-machine.webp
git commit -m "assets: 운동 추가 이미지 시제품"
```

---

### Task 3: 같은 미술 방향으로 나머지 운동 3종 생성

**Files:**
- Create: `public/exercise-thumbs/lat-pulldown.webp`
- Create: `public/exercise-thumbs/leg-press.webp`
- Create: `public/exercise-thumbs/shoulder-press.webp`
- Test: `src/lib/domain/exercise-picker-assets.test.ts`

- [ ] **Step 1: 랫풀다운 생성**

승인된 체스트프레스 이미지를 스타일 참고 이미지로 전달한다.

```text
Use case: product-mockup
Asset type: square exercise recommendation thumbnail
Primary request: A single recognizable commercial lat pulldown machine with a high cable, wide pulldown bar, thigh pad, and seat.
Input image: approved chest press thumbnail; preserve its near-black backdrop, camera height, gold rim-light direction, contrast, and dark-gunmetal material style only.
Composition/framing: centered three-quarter front view, complete machine visible, generous padding, readable at 64 pixels.
Constraints: no person, no text, no logo, no watermark, one machine only.
Avoid: chest press arms, leg press sled, shoulder press configuration, extra equipment.
```

- [ ] **Step 2: 레그프레스 생성**

승인된 체스트프레스 이미지를 스타일 참고 이미지로 전달한다.

```text
Use case: product-mockup
Asset type: square exercise recommendation thumbnail
Primary request: A single recognizable 45-degree sled leg press machine with a large foot plate, angled rails, and padded backrest.
Input image: approved chest press thumbnail; preserve its near-black backdrop, camera height, gold rim-light direction, contrast, and dark-gunmetal material style only.
Composition/framing: centered three-quarter front view, complete machine visible, generous padding, readable at 64 pixels.
Constraints: mechanically plausible leg press; no person, no text, no logo, no watermark, one machine only.
Avoid: chest press arms, pulldown bars, shoulder press configuration, extra equipment.
```

- [ ] **Step 3: 숄더프레스 생성**

승인된 체스트프레스 이미지를 스타일 참고 이미지로 전달한다.

```text
Use case: product-mockup
Asset type: square exercise recommendation thumbnail
Primary request: A single recognizable seated shoulder press machine with an upright backrest and handles starting beside the shoulders and pressing overhead.
Input image: approved chest press thumbnail; preserve its near-black backdrop, camera height, gold rim-light direction, contrast, and dark-gunmetal material style only.
Composition/framing: centered three-quarter front view, complete machine visible, generous padding, readable at 64 pixels.
Constraints: mechanically plausible shoulder press; no person, no text, no logo, no watermark, one machine only.
Avoid: horizontal chest press arms, pulldown bars, leg press sled, extra equipment.
```

- [ ] **Step 4: 세 이미지를 시각 검수하고 WebP로 저장**

각 원본 경로를 ImageGen 결과에서 받아 PowerShell 변수 `$latSource`,
`$legSource`, `$shoulderSource`에 그대로 할당한다. 그런 다음 고정된 임시 파일명으로
복사하고 384×384 이내 WebP로 변환한다.

```powershell
New-Item -ItemType Directory -Force 'tmp\imagegen' | Out-Null
Copy-Item -LiteralPath $latSource -Destination 'tmp\imagegen\lat-source.png'
Copy-Item -LiteralPath $legSource -Destination 'tmp\imagegen\leg-source.png'
Copy-Item -LiteralPath $shoulderSource -Destination 'tmp\imagegen\shoulder-source.png'
@'
from pathlib import Path
from PIL import Image

jobs = [
    (Path("tmp/imagegen/lat-source.png"), "lat-pulldown.webp"),
    (Path("tmp/imagegen/leg-source.png"), "leg-press.webp"),
    (Path("tmp/imagegen/shoulder-source.png"), "shoulder-press.webp"),
]
for source, filename in jobs:
    target = Path("public/exercise-thumbs") / filename
    image = Image.open(source).convert("RGB")
    image.thumbnail((384, 384), Image.Resampling.LANCZOS)
    image.save(target, "WEBP", quality=80, method=6)
    print(f"{target}: {image.width}x{image.height}, {target.stat().st_size} bytes")
'@ | python -
```

- [ ] **Step 5: 이미지 실물 규격 확인**

```powershell
@'
from pathlib import Path
from PIL import Image

for path in [
    Path("public/record-assets/exercise-picker-hero.webp"),
    Path("public/exercise-thumbs/chest-press-machine.webp"),
    Path("public/exercise-thumbs/lat-pulldown.webp"),
    Path("public/exercise-thumbs/leg-press.webp"),
    Path("public/exercise-thumbs/shoulder-press.webp"),
]:
    with Image.open(path) as image:
        print(path, image.format, image.size, path.stat().st_size)
'@ | python -
```

예상 결과: 전부 `WEBP`, hero는 960×640 이내·180KB 이하, 나머지는 384×384 이내·각 70KB 이하다.

- [ ] **Step 6: 이름→WebP 매핑 구현**

`src/lib/domain/recommended-exercises.ts`:

```ts
export const EXERCISE_THUMBS: Record<string, string> = {
  "체스트프레스 머신": "chest-press-machine.webp",
  랫풀다운: "lat-pulldown.webp",
  레그프레스: "leg-press.webp",
  숄더프레스: "shoulder-press.webp",
};
```

- [ ] **Step 7: 이미지와 매핑 계약 테스트 통과 확인**

```powershell
pnpm test -- src/lib/domain/exercise-picker-assets.test.ts src/lib/domain/recommended-exercises.test.ts
```

예상 결과: 이미지 파일 계약 5건과 `EXERCISE_THUMBS` 매핑 테스트가 모두 PASS다.

- [ ] **Step 8: 나머지 자산과 계약 커밋**

```powershell
git add -- public/exercise-thumbs/lat-pulldown.webp public/exercise-thumbs/leg-press.webp public/exercise-thumbs/shoulder-press.webp src/lib/domain/exercise-picker-assets.test.ts src/lib/domain/recommended-exercises.ts src/lib/domain/recommended-exercises.test.ts
git commit -m "assets: 처음 운동 추천 이미지 세트"
```

---

### Task 4: 골드 선형 아이콘 컴포넌트 추가

**Files:**
- Create: `src/components/record/gold-line-icon.tsx`
- Create: `src/components/record/gold-line-icon.test.tsx`
- Modify: `src/lib/domain/recommended-exercises.ts:105-175`
- Modify: `src/lib/domain/recommended-exercises.test.ts:109-136`
- Modify: `src/components/record/recommended-picker.tsx:17-18,68-80,122-162,232-246`

- [ ] **Step 1: 아이콘 전수 렌더 실패 테스트 작성**

`src/components/record/gold-line-icon.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_GOLD_ICON_NAMES, GoldLineIcon } from "./gold-line-icon";

describe("GoldLineIcon", () => {
  it("지원하는 모든 아이콘을 장식용 SVG로 렌더한다", () => {
    for (const name of ALL_GOLD_ICON_NAMES) {
      const html = renderToStaticMarkup(<GoldLineIcon name={name} />);
      expect(html).toContain("<svg");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("currentColor");
    }
  });
});
```

- [ ] **Step 2: 테스트가 모듈 없음으로 실패하는지 확인**

```powershell
pnpm test -- src/components/record/gold-line-icon.test.tsx
```

예상 결과: `./gold-line-icon` 모듈을 찾지 못해 FAIL이다.

- [ ] **Step 3: 공용 SVG 아이콘 구현**

`src/components/record/gold-line-icon.tsx`:

```tsx
import type { ReactNode } from "react";

export const ALL_GOLD_ICON_NAMES = [
  "target",
  "body",
  "search",
  "history",
  "routine",
  "flame",
  "beginner",
  "help",
  "home",
  "clock",
  "heart",
] as const;

export type GoldIconName = (typeof ALL_GOLD_ICON_NAMES)[number];

const PATHS: Record<GoldIconName, ReactNode> = {
  target: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /><path d="m14 10 6-6m0 0v4m0-4h-4" /></>,
  body: <><circle cx="12" cy="5" r="2" /><path d="M8 9c1.5-1 2.5-1.5 4-1.5S14.5 8 16 9M9 9l-2 5m8-5 2 5m-7-2v7m4-7v7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4l3 2" /></>,
  routine: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  flame: <path d="M13 3c1 4-2 5-1 8 1.5-1 2-2 2-4 3 2 5 5 4 8a6 6 0 0 1-12 0c0-3 2-5 5-8 0 2 .5 3 2 4" />,
  beginner: <><circle cx="12" cy="5" r="2" /><path d="M6 10c2-1.5 4-2 6-2s4 .5 6 2M8 11l-2 5m10-5 2 5m-6-7v10m-4 2 4-2 4 2" /></>,
  help: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17h.01" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  heart: <path d="M20 8c0 5-8 11-8 11S4 13 4 8a4 4 0 0 1 7-2.6L12 6.5l1-1.1A4 4 0 0 1 20 8Z" />,
};

export function GoldLineIcon({
  name,
  className = "h-6 w-6",
}: {
  name: GoldIconName;
  className?: string;
}) {
  return (
    <span className={`inline-flex text-accent ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        className="h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[name]}
      </svg>
    </span>
  );
}
```

- [ ] **Step 4: 상황 데이터의 이모지를 아이콘 키로 교체**

`src/lib/domain/recommended-exercises.ts`에서 `Situation`의 `icon` 타입을 다음처럼 제한한다.

```ts
export type SituationIconKey =
  | "beginner"
  | "target"
  | "help"
  | "home"
  | "clock"
  | "heart";

export type Situation = {
  key: SituationKey;
  label: string;
  sub: string;
  icon: SituationIconKey;
  names: readonly string[];
};
```

`SITUATIONS`의 아이콘 값은 순서대로 다음처럼 바꾼다.

```ts
icon: "beginner" // 처음 운동해요
icon: "target"   // 챌린지 목표에 맞게
icon: "help"     // 기구를 잘 몰라요
icon: "home"     // 집에서 할래요
icon: "clock"    // 30분만 운동할래요
icon: "heart"    // 유산소만 할래요
```

- [ ] **Step 5: 추천 그리드가 상황일 때 SVG를 렌더**

`src/components/record/recommended-picker.tsx`에 다음 import와 선택 타입을 사용한다.

```tsx
import { useState } from "react";
import {
  GoldLineIcon,
  type GoldIconName,
} from "./gold-line-icon";

type Choice = {
  key: string;
  label: string;
  sub: string;
} & (
  | { iconKind: "emoji"; icon: string }
  | { iconKind: "gold"; icon: GoldIconName }
);
```

부위와 상황 매핑에 각각 `iconKind`를 추가한다.

```tsx
const choices: Choice[] = byPart
  ? RECOMMEND_PARTS.map((p) => ({
      key: p,
      label: p,
      sub: PART_META[p].sub,
      iconKind: "emoji" as const,
      icon: PART_META[p].icon,
    }))
  : situations.map((s) => ({
      key: s.key,
      label: s.label,
      sub: s.sub,
      iconKind: "gold" as const,
      icon: s.icon,
    }));
```

기존 `{choice.icon}` 렌더를 다음으로 바꾼다.

```tsx
{choice.iconKind === "gold" ? (
  <GoldLineIcon name={choice.icon} className="h-6 w-6 text-accent" />
) : (
  <span className="text-xl leading-none">{choice.icon}</span>
)}
```

추천 하단 검색 버튼의 `🔍`도
`<GoldLineIcon name="search" className="h-5 w-5 text-accent" />`로 바꾼다.

- [ ] **Step 6: 관련 테스트 통과 확인**

```powershell
pnpm test -- src/components/record/gold-line-icon.test.tsx src/lib/domain/recommended-exercises.test.ts src/components/record/recommended-flow.test.tsx
```

예상 결과: 아이콘 테스트와 기존 추천 흐름 테스트가 모두 PASS다.

- [ ] **Step 7: 아이콘 변경 커밋**

```powershell
git add -- src/components/record/gold-line-icon.tsx src/components/record/gold-line-icon.test.tsx src/components/record/recommended-picker.tsx src/lib/domain/recommended-exercises.ts src/lib/domain/recommended-exercises.test.ts
git commit -m "feat: 운동 추천 골드 아이콘 통일"
```

---

### Task 5: 운동 추가 허브 상단 이미지 카드 연결

**Files:**
- Modify: `src/components/record/exercise-picker.tsx:3,371-421,773-810`
- Modify: `src/components/record/exercise-picker.test.tsx:120-154`

- [ ] **Step 1: 상단 이미지와 실패 폴백 테스트 작성**

`src/components/record/exercise-picker.test.tsx`의 허브 describe에 다음 테스트를 추가한다.

```tsx
it("허브에 실제 문구와 상단 이미지가 함께 나온다", () => {
  const { container, getByText } = setup({ initialMode: "hub" });
  expect(getByText("어떤 방식으로 시작할까요?")).toBeTruthy();
  expect(getByText("초보자도 쉽게 고를 수 있게 준비했어요")).toBeTruthy();
  expect(container.querySelector('[data-testid="exercise-picker-hero"]')).toBeTruthy();
});

it("상단 이미지가 실패해도 문구와 허브 버튼은 남는다", () => {
  const { container, getByText } = setup({ initialMode: "hub" });
  const image = container.querySelector('[data-testid="exercise-picker-hero"]')!;
  fireEvent.error(image);

  expect(container.querySelector('[data-testid="exercise-picker-hero"]')).toBeNull();
  expect(getByText("어떤 방식으로 시작할까요?")).toBeTruthy();
  expect(getByText("상황별 추천")).toBeTruthy();
});
```

- [ ] **Step 2: 새 테스트가 실패하는지 확인**

```powershell
pnpm test -- src/components/record/exercise-picker.test.tsx
```

예상 결과: 상단 문구와 이미지가 아직 없어 두 테스트가 FAIL이다.

- [ ] **Step 3: 상단 이미지 컴포넌트 구현**

`src/components/record/exercise-picker.tsx`에 `next/image`와 골드 아이콘을 import한다.

```tsx
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { GoldLineIcon, type GoldIconName } from "./gold-line-icon";
```

`HubCard` 앞에 다음 컴포넌트를 추가한다.

```tsx
function PickerHero() {
  const [failed, setFailed] = useState(false);

  return (
    <section className="relative mb-3 min-h-[124px] overflow-hidden rounded-card border border-accent/35 bg-surface-2 p-4">
      {!failed && (
        <Image
          src="/record-assets/exercise-picker-hero.webp"
          alt=""
          fill
          sizes="(max-width: 480px) 92vw, 440px"
          data-testid="exercise-picker-hero"
          onError={() => setFailed(true)}
          className="object-cover object-right"
          priority
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-surface-2 via-surface-2/90 to-transparent" />
      <div className="relative z-10 max-w-[54%]">
        <p className="text-base leading-6 font-extrabold">
          어떤 방식으로
          <br />
          시작할까요?
        </p>
        <p className="mt-2 text-[11px] leading-4 text-muted">
          초보자도 쉽게 고를 수 있게 준비했어요
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 허브에 카드와 골드 아이콘 연결**

허브 설명 아래, 스크롤 컨테이너 첫 자식으로 `<PickerHero />`를 넣는다. 여섯 `HubCard`의 `icon` 값을 다음처럼 교체한다.

```tsx
icon="target"  // 상황별 추천
icon="body"    // 부위별 추천
icon="search"  // 운동 이름 검색
icon="history" // 지난 운동 불러오기
icon="routine" // 내 루틴
icon="flame"   // 타바타
```

`HubCard`의 타입과 렌더를 다음처럼 바꾼다.

```tsx
function HubCard({
  icon,
  title,
  sub,
  onClick,
  primary = false,
}: {
  icon: GoldIconName;
  title: string;
  sub: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-2 flex w-full items-center gap-3 rounded-card border p-4 text-left ${
        primary
          ? "border-accent bg-accent text-accent-ink"
          : "border-line bg-surface-2"
      }`}
    >
      <span className={primary ? "text-accent-ink" : "text-accent"}>
        <GoldLineIcon name={icon} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className={`mt-0.5 block text-xs ${primary ? "text-accent-ink/75" : "text-muted"}`}>
          {sub}
        </span>
      </span>
      <span className={primary ? "text-accent-ink/60" : "text-faint"}>›</span>
    </button>
  );
}
```

`GoldLineIcon`이 항상 `text-accent`를 강제하지 않도록 Task 4의 wrapper 클래스를 다음처럼 조정한다.

```tsx
<span className={`inline-flex ${className}`} aria-hidden="true">
```

호출부가 `text-accent` 또는 `text-accent-ink`를 책임진다. 아이콘 테스트의 `currentColor` 계약은 그대로 유지한다.

- [ ] **Step 5: 허브 테스트 통과 확인**

```powershell
pnpm test -- src/components/record/exercise-picker.test.tsx src/components/record/gold-line-icon.test.tsx
```

예상 결과: 신규 2건과 기존 허브·검색·타바타 테스트가 전부 PASS다.

- [ ] **Step 6: 상단 카드 변경 커밋**

```powershell
git add -- src/components/record/exercise-picker.tsx src/components/record/exercise-picker.test.tsx src/components/record/gold-line-icon.tsx src/components/record/gold-line-icon.test.tsx
git commit -m "feat: 운동 추가 상단 이미지 카드"
```

---

### Task 6: 추천 4종 WebP와 실패 폴백 연결

**Files:**
- Modify: `src/lib/domain/recommended-exercises.ts:199-215`
- Modify: `src/components/record/recommended-picker.tsx:3,171-228`
- Modify: `src/components/record/recommended-flow.test.tsx:213-274`
- Test: `src/lib/domain/exercise-picker-assets.test.ts`
- Test: `src/lib/domain/recommended-exercises.test.ts`

- [ ] **Step 1: 추천 화면 이미지·폴백 실패 테스트 작성**

`src/components/record/recommended-flow.test.tsx`의 `상황별 추천` describe에 다음을 추가한다.

```tsx
it("'처음 운동해요' 추천 4개에 서로 다른 썸네일이 나온다", () => {
  const { container } = situation(null);
  const images = Array.from(
    container.querySelectorAll("[data-exercise-thumbnail]"),
  );

  expect(images).toHaveLength(4);
  expect(images.map((image) => image.getAttribute("data-exercise-thumbnail"))).toEqual([
    "체스트프레스 머신",
    "랫풀다운",
    "레그프레스",
    "숄더프레스",
  ]);
});

it("썸네일 하나가 실패해도 그 운동의 텍스트와 추가 버튼은 남는다", () => {
  const { container, getByText, getAllByText } = situation(null);
  const image = container.querySelector(
    '[data-exercise-thumbnail="체스트프레스 머신"]',
  )!;
  fireEvent.error(image);

  expect(
    container.querySelector('[data-exercise-thumbnail="체스트프레스 머신"]'),
  ).toBeNull();
  expect(getByText("체스트프레스 머신")).toBeTruthy();
  expect(getAllByText("＋ 추가").length).toBe(4);
});
```

- [ ] **Step 2: 신규 테스트가 실패하는지 확인**

```powershell
pnpm test -- src/components/record/recommended-flow.test.tsx src/lib/domain/recommended-exercises.test.ts
```

예상 결과: 현재 컴포넌트가 WebP 파일명 뒤에 `.png`를 덧붙이고 실패 폴백과
`data-exercise-thumbnail` 표식이 없어서 신규 2건이 FAIL이다.

- [ ] **Step 3: 실패 시 사라지는 썸네일 컴포넌트 구현**

`src/components/record/recommended-picker.tsx`에서 기존 인라인 `<Image>`를 다음 컴포넌트 호출로 바꾼다.

```tsx
{thumb && <ExerciseThumbnail file={thumb} exerciseName={item.name} />}
```

파일 아래쪽에 다음 컴포넌트를 추가한다.

```tsx
function ExerciseThumbnail({
  file,
  exerciseName,
}: {
  file: string;
  exerciseName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Image
      src={`/exercise-thumbs/${file}`}
      alt=""
      width={64}
      height={64}
      sizes="64px"
      data-exercise-thumbnail={exerciseName}
      onError={() => setFailed(true)}
      className="h-16 w-16 flex-none rounded-card-sm object-cover"
    />
  );
}
```

- [ ] **Step 4: 관련 테스트 전체 통과 확인**

```powershell
pnpm test -- src/lib/domain/exercise-picker-assets.test.ts src/lib/domain/recommended-exercises.test.ts src/components/record/recommended-flow.test.tsx src/components/record/exercise-picker.test.tsx
```

예상 결과: 이미지 파일 5건, 매핑 1건, UI 이미지·폴백 4건과 기존 흐름 테스트가 전부 PASS다.

- [ ] **Step 5: 추천 이미지 연결 커밋**

```powershell
git add -- src/lib/domain/recommended-exercises.ts src/lib/domain/recommended-exercises.test.ts src/components/record/recommended-picker.tsx src/components/record/recommended-flow.test.tsx
git commit -m "feat: 처음 운동 추천 이미지 연결"
```

---

### Task 7: 개발 서버에서 실제 화면 조작

**Files:**
- No source changes expected

- [ ] **Step 1: 개발 서버 실행**

입력 프로그램: PowerShell 1

현재 폴더: 격리 worktree 루트

```powershell
pnpm dev
```

정상 결과: `Local: http://localhost:3000`과 컴파일 완료가 보인다. 종료는 해당 창에서 `Ctrl+C`다.

- [ ] **Step 2: 브라우저로 A 계정 실제 흐름 조작**

브라우저 조작 도구로 다음을 직접 수행한다. 브라우저를 조작할 수 없으면 여기서 중단하고 같은 표를 사용자에게 전달해 확인 결과를 기다린다.

| # | 조작 | 확인할 실물 |
|---|---|---|
| 1 | `/record` → `첫 운동 추가하기` | 상단 소개 카드 1개, 오른쪽 이미지, 왼쪽 실제 문구 |
| 2 | 허브 목록 확인 | 상황·부위·검색·지난 운동 아이콘이 이모지가 아닌 골드 선형 아이콘 |
| 3 | `상황별 추천` 클릭 | 상황 카드 5개(챌린지 목표가 있으면 6개), 모두 골드 선형 아이콘 |
| 4 | `처음 운동해요` 유지 | 추천 썸네일 **4개**를 센다. 깨진 이미지 0개 |
| 5 | 체스트프레스 카드 몸통 클릭 | 골드 선택 테두리와 `✓ 추가됨`, 선택 개수 1개 |
| 6 | 같은 카드 다시 클릭 | 선택이 풀리고 0개로 감소 |
| 7 | 2개 선택 → `다음` | 설정 행 2개가 나오고 뒤로 가면 선택 2개 유지 |
| 8 | 화면 폭을 모바일 크기로 확인 | 상단 문구와 이미지가 겹치지 않고 카드 마지막 행이 하단 버튼에 가리지 않음 |

사회적 기능이 아니므로 계정 하나만 사용한다. 테스트 중 DB 데이터를 새로 만들 필요가 없다.

- [ ] **Step 3: 화면 문제가 있으면 해당 원인만 수정하고 관련 테스트 재실행**

레이아웃 문제를 테스트나 빌드 성공으로 무시하지 않는다. 수정 후 Task 7의 같은 조작을 다시 수행한다.

- [ ] **Step 4: 개발 서버 종료**

PowerShell 1에서 `Ctrl+C`를 누른다. 정상 결과는 Next 개발 서버 프로세스가 종료되고 프롬프트가 돌아오는 것이다.

---

### Task 8: 전체 검사·기록·최종 커밋

**Files:**
- Modify: `PROGRESS.md`
- Create: `docs/superpowers/HANDOFF-2026-08-07-exercise-picker-images.md`

- [ ] **Step 1: 최종 전체 검사 한 번 실행**

입력 프로그램: PowerShell

현재 폴더: 격리 worktree 루트

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

정상 결과: lint 오류 0, typecheck 오류 0, 전체 Vitest 실패 0, Next build 성공, `git diff --check` 출력 0줄이다. 실제 테스트 파일·건수는 실행 결과 그대로 기록한다.

- [ ] **Step 2: PROGRESS와 새 인수인계 문서 한 번 갱신**

두 문서에 다음 사실만 기록한다.

- 이미지 5장 파일명·용량
- UI 변경 파일과 동작
- 개발 서버에서 직접 조작한 8개 항목 결과
- lint·typecheck·전체 test·build 실측
- DB 변경 0건, 운영 배포 안 함
- 사용자 기기 미확인 사항이 있으면 `[미검증]`으로 표시
- 다음 할 일 1개: 사용자 승인 후 로컬 `main` 반영 여부 결정

- [ ] **Step 3: 최종 리뷰**

```powershell
git status --short
git diff --stat
git diff -- src/components/record/exercise-picker.tsx src/components/record/recommended-picker.tsx src/lib/domain/recommended-exercises.ts PROGRESS.md docs/superpowers/HANDOFF-2026-08-07-exercise-picker-images.md
```

예상 결과: 이 계획에 명시된 파일만 변경됐고 `.superpowers/`, 기존 사용자 이미지·임시 스크립트는 포함되지 않는다.

- [ ] **Step 4: 문서 커밋**

```powershell
git add -- PROGRESS.md docs/superpowers/HANDOFF-2026-08-07-exercise-picker-images.md
git commit -m "docs: 운동 추가 이미지 적용 기록"
```

- [ ] **Step 5: 완료 상태 확인**

```powershell
git status --short
git log -5 --oneline
```

정상 결과: 계획에 해당하는 추적 파일은 깨끗하고, 사용자의 기존 추적되지 않은 파일은 원래 checkout에 그대로 보존돼 있다. 운영 배포는 실행하지 않는다.

---

## 요구사항 대응표

| 설계 요구 | 구현 Task |
|---|---|
| 상단 이미지 1장 | Task 2, 5 |
| 처음 운동 추천 4종 | Task 2, 3, 6 |
| 검정·골드 3D 톤 통일 | Task 2 승인 게이트, Task 3 |
| 글자·버튼은 실제 UI | Task 5, 6 |
| 골드 선형 아이콘 | Task 4, 5 |
| 이미지 실패 시 텍스트 폴백 | Task 5, 6 |
| DB 변경 없음 | 전체 범위 |
| 개발 서버 실제 조작 | Task 7 |
| 전체 검사·기록 | Task 8 |
