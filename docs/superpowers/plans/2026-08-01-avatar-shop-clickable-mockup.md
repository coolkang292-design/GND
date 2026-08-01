# GND Avatar Shop Clickable Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not spawn subagents unless the user explicitly requests delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 GND `/profile` 화면에 진입점을 추가하고, 운영 데이터에는 쓰지 않는 포인트 구매·실제 투명 레이어 장착 목업을 개발 서버에서 검증한다.

**Architecture:** 사용자 지정 갈색 불독 사진을 `1024×1536` 투명 베이스로 고정하고, 캡·후드티·반팔·신발을 같은 전체 캔버스의 투명 PNG로 겹친다. 자산 합성 선행 게이트가 통과한 뒤에만 React 메모리 상태로 구매·장착 UI를 만들며, Supabase 쓰기·마이그레이션·운영 배포는 하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Vitest, Testing Library, `next/image`, ImageGen 이미지 편집

---

## 실행 제약

- 실제 저장소는 `C:\Users\SAMSUNG\workout-app`이다. 모든 명령은 이 폴더에서 실행한다.
- 현재 루트의 `7단계 캐릭터`, `배지이미지`, `이미지 꾸미기`는 사용자 미추적 파일이다. 전체 폴더를 스테이징하거나 이름을 바꾸지 않는다.
- `.env.local`은 운영 Supabase에 연결된다. 이번 기능은 Supabase 쓰기 함수를 한 번도 호출하지 않는다.
- 이미지 합성 선행 게이트가 실패하면 Task 4 이후의 앱 구현을 시작하지 않는다.
- 개발 서버 화면을 직접 조작할 수단이 없으면 화면 검증에서 멈추고 사용자에게 확인표를 요청한다.
- 개발 서버를 중지한 뒤에만 `pnpm build`를 실행한다.
- 운영 배포는 범위 밖이다.

## 파일 구조

### 디자인 원본과 자산

- Create: `docs/design-sources/avatar-shop/README.md` — 출처·사용 범위·원본 해시
- Create: `docs/design-sources/avatar-shop/base-reference.jpg` — 사용자 제공 원본
- Create: `docs/design-sources/avatar-shop/base-master.png` — 투명 편집 마스터
- Create: `docs/design-sources/avatar-shop/composites/*.png` — 장착 목표 완성본 4장
- Create: `docs/design-sources/avatar-shop/masks/*.png` — 아이템 분리 마스크 4장
- Create: `docs/design-sources/avatar-shop/items/*.png` — 편집용 전체 캔버스 레이어 4장
- Create: `public/avatar-mock/base.png` — 앱 표시용 투명 베이스
- Create: `public/avatar-mock/items/*.png` — 앱 표시용 아이템 레이어 4장
- Create: `scripts/validate-avatar-mock-assets.mjs` — PNG 크기·알파 채널 검증
- Modify: `docs/avatar-item-asset-guide.md` — 새 갈색 불독 목업의 전체 캔버스 앵커 예외

### 도메인과 UI

- Create: `src/lib/domain/avatar-shop-mock.ts` — 카탈로그·구매·장착·레이어 순서
- Create: `src/lib/domain/avatar-shop-mock.test.ts` — 상태 전이 단위 테스트
- Create: `src/components/profile/avatar-layer-preview.tsx` — 동일 캔버스 레이어 합성
- Create: `src/components/profile/avatar-shop-mock.tsx` — 목업 상점 전체 UI
- Create: `src/components/profile/avatar-shop-mock.test.tsx` — 클릭 흐름·접근성 테스트
- Create: `src/components/profile/avatar-shop-entry.tsx` — `/profile` 진입 카드
- Create: `src/components/profile/avatar-shop-entry.test.tsx` — 진입 카드 링크 테스트
- Create: `src/app/(tabs)/profile/avatar-mock/page.tsx` — 목업 경로
- Modify: `src/components/profile/growth-hub.tsx` — 포인트 요약 아래 진입 카드 삽입
- Modify: `PROGRESS.md` — 검증 결과와 미배포 상태 기록

---

### Task 1: 원본 보존과 자산 검증기

**Files:**
- Create: `docs/design-sources/avatar-shop/README.md`
- Create: `docs/design-sources/avatar-shop/base-reference.jpg`
- Create: `scripts/validate-avatar-mock-assets.mjs`

- [ ] **Step 1: 원본 폴더를 만들고 사용자 제공 JPG만 복사한다**

PowerShell:

```powershell
$sourceImage = 'C:\Users\SAMSUNG\.codex\codex-remote-attachments\019fbbfe-f0c7-7b53-aa25-4dc753ec7b79\6E89F196-A8A0-4DB2-948E-788FD69F838D\1-사진-1.jpg'
$sourceDir = 'C:\Users\SAMSUNG\workout-app\docs\design-sources\avatar-shop'
New-Item -ItemType Directory -Force -Path $sourceDir, "$sourceDir\composites", "$sourceDir\masks", "$sourceDir\items" | Out-Null
Copy-Item -LiteralPath $sourceImage -Destination "$sourceDir\base-reference.jpg"
Get-FileHash -Algorithm SHA256 -LiteralPath "$sourceDir\base-reference.jpg"
```

Expected: SHA256가 `E552FB7190FF0BAC94E3DF7C2A46DB4F0C21B472F62913259E04C1E29730DF15`다.

- [ ] **Step 2: 출처와 사용 범위를 문서화한다**

Create `docs/design-sources/avatar-shop/README.md`:

```markdown
# Avatar shop design sources

## Base reference

- File: `base-reference.jpg`
- SHA256: `E552FB7190FF0BAC94E3DF7C2A46DB4F0C21B472F62913259E04C1E29730DF15`
- Supplied by: GND project owner through the Codex thread on 2026-08-01
- Original dimensions: 853×1280 JPG
- Permission status: user-supplied reference; external production rights not independently verified
- Allowed use in this work: local development mockup and asset-fit validation only
- Production rule: do not deploy this reference or derived assets until the owner confirms production usage rights

## Existing project references

- `C:\Users\SAMSUNG\workout-app\이미지 꾸미기`: transparent full-canvas layering technique only
- `C:\Users\SAMSUNG\workout-app\7단계 캐릭터`: character mood and growth-story reference only
- `C:\Users\SAMSUNG\workout-app\public\characters`: current production growth art; do not modify

The existing untracked reference folders are not copied or staged wholesale.
```

- [ ] **Step 3: PNG 구조 검증 스크립트를 만든다**

Create `scripts/validate-avatar-mock-assets.mjs`:

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1536;
const REQUIRED = [
  "public/avatar-mock/base.png",
  "public/avatar-mock/items/gnd-cap.png",
  "public/avatar-mock/items/gnd-hoodie.png",
  "public/avatar-mock/items/performance-tee.png",
  "public/avatar-mock/items/jordan-1.png",
];

function inspectPng(relativePath) {
  const filePath = resolve(relativePath);
  const buffer = readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${relativePath}: not_png`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  const hasAlpha = colorType === 4 || colorType === 6;
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    throw new Error(`${relativePath}: expected_1024x1536_got_${width}x${height}`);
  }
  if (!hasAlpha) {
    throw new Error(`${relativePath}: alpha_channel_required_color_type_${colorType}`);
  }
  return { relativePath, width, height, colorType };
}

let failed = false;
for (const relativePath of REQUIRED) {
  try {
    const result = inspectPng(relativePath);
    console.log(`PASS ${result.relativePath} ${result.width}x${result.height} RGBA`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exitCode = 1;
```

- [ ] **Step 4: 검증기가 아직 자산이 없어서 실패하는지 확인한다**

Run:

```powershell
node scripts/validate-avatar-mock-assets.mjs
```

Expected: `FAIL ...` 5줄과 exit code 1. 아직 자산이 없으므로 정상적인 선행 실패다.

---

### Task 2: 투명 베이스와 실제 아이템 4개 제작

**Files:**
- Create: `docs/design-sources/avatar-shop/base-master.png`
- Create: `docs/design-sources/avatar-shop/composites/gnd-cap.png`
- Create: `docs/design-sources/avatar-shop/composites/gnd-hoodie.png`
- Create: `docs/design-sources/avatar-shop/composites/performance-tee.png`
- Create: `docs/design-sources/avatar-shop/composites/jordan-1.png`
- Create: `docs/design-sources/avatar-shop/masks/*.png`
- Create: `docs/design-sources/avatar-shop/items/*.png`
- Create: `public/avatar-mock/base.png`
- Create: `public/avatar-mock/items/*.png`

- [ ] **Step 1: ImageGen으로 기본 캐릭터 투명 마스터를 만든다**

Use the `imagegen` skill with `base-reference.jpg` as the referenced image and this exact prompt:

```text
Edit the attached bulldog image into a reusable dress-up avatar master.
Preserve the exact bulldog identity, brown-and-white fur markings, facial expression,
standing pose, body proportions, arm positions, black sleeveless tank top, black short tights,
and bare feet. Do not redesign or restyle the character.

Remove only the white background and produce a clean fully transparent alpha background.
Normalize to a 1024x1536 canvas using one uniform scale only. Do not stretch width and height
independently, do not crop any body part, and center with at most one transparent pixel of padding.
No shadow, floor, glow, text, logo, accessory, or added clothing.
Output a high-detail RGBA PNG with clean fur edges and no white halo.
```

Save the result to both:

```text
docs/design-sources/avatar-shop/base-master.png
public/avatar-mock/base.png
```

Open `base-master.png` with `view_image`. Expected: the selected brown bulldog is unchanged, the background is transparent, and no white fringe appears around ears, arms, or feet.

- [ ] **Step 2: 장착 완성본 4장을 만든다**

Use `base-master.png` as the referenced image for each of the following four independent ImageGen edits.

Cap prompt; save as `docs/design-sources/avatar-shop/composites/gnd-cap.png`:

```text
Use the attached base-master.png as a pixel-locked reference.
Change only the head region to add a matte black fitted baseball cap with small white GND lettering centered on the front. Keep both ears naturally visible.
Do not change the bulldog's face, fur, body, pose, hands, legs, canvas placement, base clothing, lighting, or transparent background.
Keep the output exactly 1024x1536 RGBA PNG. This is the target dressed composite, not the isolated item layer.
```

Hoodie prompt; save as `docs/design-sources/avatar-shop/composites/gnd-hoodie.png`:

```text
Use the attached base-master.png as a pixel-locked reference.
Change only the torso and arms to add a matte black zipless hoodie with long sleeves and small white GND lettering on the chest. Cover the base tank fully and keep both hands visible.
Do not change the bulldog's face, fur, body, pose, hands, legs, shorts, canvas placement, lighting, or transparent background.
Keep the output exactly 1024x1536 RGBA PNG. This is the target dressed composite, not the isolated item layer.
```

Performance tee prompt; save as `docs/design-sources/avatar-shop/composites/performance-tee.png`:

```text
Use the attached base-master.png as a pixel-locked reference.
Change only the torso and upper arms to add a clean white short-sleeve performance T-shirt with no logo. Cover the base tank fully and keep both hands and forearms visible.
Do not change the bulldog's face, fur, body, pose, hands, legs, shorts, canvas placement, lighting, or transparent background.
Keep the output exactly 1024x1536 RGBA PNG. This is the target dressed composite, not the isolated item layer.
```

Shoes prompt; save as `docs/design-sources/avatar-shop/composites/jordan-1.png`:

```text
Use the attached base-master.png as a pixel-locked reference.
Change only both feet to add red, white, and black retro high-top sneakers with no visible brand logo, fitted naturally to both feet.
Do not change the bulldog's face, fur, body, pose, hands, legs above the shoes, base clothing, canvas placement, lighting, or transparent background.
Keep the output exactly 1024x1536 RGBA PNG. This is the target dressed composite, not the isolated item layer.
```

- [ ] **Step 3: 완성본에서 아이템만 같은 위치로 분리한다**

For each composite, reference both `base-master.png` and the matching composite and use this prompt:

```text
Create an isolated dress-up item layer from the attached base master and dressed composite.
Output only the newly added item pixels. Remove the bulldog, fur, skin, base tank, base shorts,
and every unchanged pixel completely to transparent.
Do not redraw, resize, recenter, or crop the item.
Preserve the exact 1024x1536 canvas and the exact worn coordinates from the dressed composite.
Keep natural item shadows and folds that belong to the item, but include no character pixels.
Output RGBA PNG with clean antialiased edges and no white halo.
```

Save the four isolated results to these exact source/public pairs:

- `docs/design-sources/avatar-shop/items/gnd-cap.png` and `public/avatar-mock/items/gnd-cap.png`
- `docs/design-sources/avatar-shop/items/gnd-hoodie.png` and `public/avatar-mock/items/gnd-hoodie.png`
- `docs/design-sources/avatar-shop/items/performance-tee.png` and `public/avatar-mock/items/performance-tee.png`
- `docs/design-sources/avatar-shop/items/jordan-1.png` and `public/avatar-mock/items/jordan-1.png`

- [ ] **Step 4: 분리 알파를 선택 마스크로 보존한다**

For each isolated item, use ImageGen with this prompt:

```text
Convert this isolated transparent item layer into a selection mask on the same 1024x1536 canvas.
Every visible or partially visible item pixel becomes solid white while preserving the exact alpha edge.
Every transparent pixel remains transparent. Do not move, resize, blur, crop, or add pixels.
Output RGBA PNG.
```

Save the four masks as `docs/design-sources/avatar-shop/masks/gnd-cap.png`, `gnd-hoodie.png`, `performance-tee.png`, and `jordan-1.png`.

- [ ] **Step 5: 구조 검증을 통과시킨다**

Run:

```powershell
node scripts/validate-avatar-mock-assets.mjs
```

Expected: exactly 5 `PASS` lines, 0 `FAIL`, exit code 0.

---

### Task 3: 이미지 합성 선행 게이트

**Files:**
- Create temporarily, then delete: `public/avatar-mock/qa.html`
- Create after pass: `docs/design-sources/avatar-shop/QA.md`
- Modify after pass: `docs/avatar-item-asset-guide.md`

- [ ] **Step 1: 코드 구현 전에 정적 합성 검사 페이지를 만든다**

Create `public/avatar-mock/qa.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Avatar asset QA</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 20px; background: #111; color: #fff; font-family: sans-serif; }
      .controls { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
      .preview { position: relative; width: min(100%, 390px); aspect-ratio: 2 / 3; overflow: hidden; background: #222; border: 1px solid #666; }
      .preview.light { background: #fff; }
      .layer { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      .base { z-index: 30; }
      .bottom { z-index: 60; }
      .top { z-index: 50; }
      .head { z-index: 80; }
      label, button { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; }
    </style>
  </head>
  <body>
    <h1>캐릭터 레이어 QA</h1>
    <div class="controls">
      <label><input id="capToggle" type="checkbox" /> 캡</label>
      <label><input name="top" value="none" type="radio" checked /> 상의 없음</label>
      <label><input name="top" value="hoodie" type="radio" /> 후드티</label>
      <label><input name="top" value="tee" type="radio" /> 반팔</label>
      <label><input id="shoesToggle" type="checkbox" /> 신발</label>
      <button id="backgroundToggle" type="button">흰 배경 전환</button>
    </div>
    <div id="preview" class="preview">
      <img class="layer base" src="/avatar-mock/base.png" alt="" />
      <img id="hoodie" class="layer top" src="/avatar-mock/items/gnd-hoodie.png" alt="" hidden />
      <img id="tee" class="layer top" src="/avatar-mock/items/performance-tee.png" alt="" hidden />
      <img id="shoes" class="layer bottom" src="/avatar-mock/items/jordan-1.png" alt="" hidden />
      <img id="cap" class="layer head" src="/avatar-mock/items/gnd-cap.png" alt="" hidden />
    </div>
    <script>
      const cap = document.querySelector("#cap");
      const shoes = document.querySelector("#shoes");
      const hoodie = document.querySelector("#hoodie");
      const tee = document.querySelector("#tee");
      const preview = document.querySelector("#preview");
      document.querySelector("#capToggle").addEventListener("change", (event) => {
        cap.hidden = !event.target.checked;
      });
      document.querySelector("#shoesToggle").addEventListener("change", (event) => {
        shoes.hidden = !event.target.checked;
      });
      document.querySelectorAll('input[name="top"]').forEach((input) => {
        input.addEventListener("change", () => {
          hoodie.hidden = input.value !== "hoodie";
          tee.hidden = input.value !== "tee";
        });
      });
      document.querySelector("#backgroundToggle").addEventListener("click", () => {
        preview.classList.toggle("light");
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: 개발 서버를 실행하고 실제 레이어를 조작한다**

PowerShell:

```powershell
$devLog = Join-Path $env:TEMP 'gnd-avatar-mock-dev.log'
$devErr = Join-Path $env:TEMP 'gnd-avatar-mock-dev.err.log'
$dev = Start-Process -FilePath 'pnpm.cmd' -ArgumentList 'dev' -WorkingDirectory 'C:\Users\SAMSUNG\workout-app' -WindowStyle Hidden -RedirectStandardOutput $devLog -RedirectStandardError $devErr -PassThru
$dev.Id
```

Open `http://localhost:3000/avatar-mock/qa.html` with the in-app Browser. At viewport widths 320, 390, and 430px:

1. base only
2. cap only
3. hoodie only
4. tee only
5. shoes only
6. cap + hoodie + shoes
7. cap + tee + shoes
8. every state on dark and white backgrounds

Expected: no white halo, dog pixels, base clothing leak, or more than 1 CSS px outline shift. Hoodie and tee replace each other instead of overlapping.

If browser control is unavailable, stop here and ask the user to perform these eight checks. Do not treat HTTP 200 as visual verification.

- [ ] **Step 3: 실패 자산을 다시 만든다**

For any failed layer, repeat Task 2 Steps 2–4 for that item only, rerun the PNG validator, and repeat all eight browser states. Do not continue until all pass.

- [ ] **Step 4: 합격 증거를 기록하고 임시 QA 페이지를 제거한다**

Create `docs/design-sources/avatar-shop/QA.md` only after every check passes:

```markdown
# Avatar layer QA — 2026-08-01

- PNG structure validator: PASS, 5 files, 0 failed
- Viewport 320px: PASS
- Viewport 390px: PASS, outline deviation within 1 CSS px
- Viewport 430px: PASS
- Dark background edge check: PASS
- White background edge check: PASS
- Single layers: cap PASS, hoodie PASS, tee PASS, shoes PASS
- Combined layers: cap + hoodie + shoes PASS
- Same-slot replacement: hoodie → tee PASS
- Result: asset gate passed; clickable shop UI implementation may begin
```

Add this block immediately below the introduction in `docs/avatar-item-asset-guide.md`:

```markdown
> **2026-08-01 갈색 불독 클릭형 목업 예외**
> `/profile/avatar-mock`은 아래 A포즈 신체 앵커를 사용하지 않는다. 사용자 지정
> 갈색 불독 베이스와 모든 아이템 레이어는 동일한 `1024×1536` 전체 캔버스를
> 유지하며, 공통 앵커는 캔버스 좌상단 `(0, 0)`이다. 앱은 모든 레이어를 같은
> 크기로 겹치고 런타임 좌표 보정이나 개별 확대·축소를 하지 않는다. 아래 좌표표는
> 향후 7단계 장착 아바타 제작안에만 적용한다.
```

Delete `public/avatar-mock/qa.html` with this exact patch:

```text
*** Begin Patch
*** Delete File: public/avatar-mock/qa.html
*** End Patch
```

Then stop the development server:

```powershell
Stop-Process -Id $dev.Id
```

- [ ] **Step 5: 검증된 자산만 커밋한다**

```powershell
git add -- docs/design-sources/avatar-shop docs/avatar-item-asset-guide.md scripts/validate-avatar-mock-assets.mjs public/avatar-mock/base.png public/avatar-mock/items/gnd-cap.png public/avatar-mock/items/gnd-hoodie.png public/avatar-mock/items/performance-tee.png public/avatar-mock/items/jordan-1.png
git commit -m "feat: 캐릭터 상점 목업 합성 자산 준비"
```

Expected: `qa.html`과 루트의 미추적 이미지 폴더는 커밋에 포함되지 않는다.

---

### Task 4: 목업 구매·장착 상태 모델

**Files:**
- Create: `src/lib/domain/avatar-shop-mock.test.ts`
- Create: `src/lib/domain/avatar-shop-mock.ts`

- [ ] **Step 1: 실패하는 도메인 테스트를 작성한다**

Create `src/lib/domain/avatar-shop-mock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createMockShopState,
  equipMockItem,
  filterMockItems,
  purchaseMockItem,
  unequipMockItem,
  visibleLayers,
} from "./avatar-shop-mock";

describe("avatar shop mock state", () => {
  it("캡 구매 시 500P를 한 번만 차감한다", () => {
    const first = purchaseMockItem(createMockShopState(), "gnd-cap");
    expect(first.code).toBe("purchased");
    expect(first.state.balance).toBe(12_340);
    expect(first.state.owned.has("gnd-cap")).toBe(true);

    const duplicate = purchaseMockItem(first.state, "gnd-cap");
    expect(duplicate.code).toBe("already_owned");
    expect(duplicate.state.balance).toBe(12_340);
  });

  it("준비 중 아이템은 구매하지 않는다", () => {
    const result = purchaseMockItem(createMockShopState(), "sports-watch");
    expect(result.code).toBe("not_available");
    expect(result.state.balance).toBe(12_840);
  });

  it("잔액보다 비싼 구매를 거부한다", () => {
    const state = { ...createMockShopState(), balance: 400 };
    const result = purchaseMockItem(state, "gnd-cap");
    expect(result.code).toBe("insufficient_points");
    expect(result.state.balance).toBe(400);
  });

  it("보유하지 않은 아이템은 장착하지 않는다", () => {
    const result = equipMockItem(createMockShopState(), "gnd-cap");
    expect(result.code).toBe("not_owned");
    expect(result.state.equipped).toEqual({});
  });

  it("같은 top 슬롯의 후드티를 반팔로 교체한다", () => {
    const boughtHoodie = purchaseMockItem(createMockShopState(), "gnd-hoodie").state;
    const boughtBoth = purchaseMockItem(boughtHoodie, "performance-tee").state;
    const hoodieOn = equipMockItem(boughtBoth, "gnd-hoodie").state;
    const teeOn = equipMockItem(hoodieOn, "performance-tee");
    expect(teeOn.code).toBe("equipped");
    expect(teeOn.state.equipped.top).toBe("performance-tee");
  });

  it("장착 해제는 해당 슬롯만 비운다", () => {
    const bought = purchaseMockItem(createMockShopState(), "gnd-cap").state;
    const equipped = equipMockItem(bought, "gnd-cap").state;
    const result = unequipMockItem(equipped, "gnd-cap");
    expect(result.code).toBe("unequipped");
    expect(result.state.equipped.head).toBeUndefined();
  });

  it("장착 레이어를 z 오름차순으로 반환한다", () => {
    let state = createMockShopState();
    for (const key of ["gnd-cap", "gnd-hoodie", "jordan-1"]) {
      state = purchaseMockItem(state, key).state;
      state = equipMockItem(state, key).state;
    }
    expect(visibleLayers(state).map((layer) => layer.z)).toEqual([50, 60, 80]);
  });

  it("카테고리 필터와 빈 배경 카테고리를 구분한다", () => {
    expect(filterMockItems("clothing").map((item) => item.key)).toEqual([
      "gnd-hoodie",
      "performance-tee",
      "black-jogger",
    ]);
    expect(filterMockItems("background")).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 모듈 부재로 실패하는지 확인한다**

Run:

```powershell
pnpm test -- src/lib/domain/avatar-shop-mock.test.ts
```

Expected: FAIL with `Cannot find module './avatar-shop-mock'`.

- [ ] **Step 3: 최소 상태 모델을 구현한다**

Create `src/lib/domain/avatar-shop-mock.ts`:

```ts
export type MockItemCategory = "clothing" | "shoes" | "accessory" | "background";
export type MockCategory = "all" | MockItemCategory;
export type MockSlot = "head" | "top" | "bottom" | "shoes" | "wrist" | "neck" | "bag" | "prop";

export type MockLayer = { src: string; z: number };

export type MockItem = {
  key: string;
  name: string;
  category: MockItemCategory;
  slot: MockSlot;
  price: number;
  available: boolean;
  layers: MockLayer[];
};

export const MOCK_START_BALANCE = 12_840;

export const MOCK_ITEMS: readonly MockItem[] = [
  { key: "gnd-cap", name: "GND 캡", category: "accessory", slot: "head", price: 500, available: true, layers: [{ src: "/avatar-mock/items/gnd-cap.png", z: 80 }] },
  { key: "gnd-hoodie", name: "GND 후드티", category: "clothing", slot: "top", price: 900, available: true, layers: [{ src: "/avatar-mock/items/gnd-hoodie.png", z: 50 }] },
  { key: "performance-tee", name: "퍼포먼스 반팔", category: "clothing", slot: "top", price: 700, available: true, layers: [{ src: "/avatar-mock/items/performance-tee.png", z: 50 }] },
  { key: "jordan-1", name: "조던 1 레트로", category: "shoes", slot: "shoes", price: 1_200, available: true, layers: [{ src: "/avatar-mock/items/jordan-1.png", z: 60 }] },
  { key: "sports-watch", name: "스포츠 워치", category: "accessory", slot: "wrist", price: 1_500, available: false, layers: [] },
  { key: "gold-chain", name: "골드 체인", category: "accessory", slot: "neck", price: 1_800, available: false, layers: [] },
  { key: "gnd-backpack", name: "GND 백팩", category: "accessory", slot: "bag", price: 1_100, available: false, layers: [] },
  { key: "black-jogger", name: "블랙 조거 팬츠", category: "clothing", slot: "bottom", price: 800, available: false, layers: [] },
] as const;

export type MockShopState = {
  balance: number;
  owned: ReadonlySet<string>;
  equipped: Partial<Record<MockSlot, string>>;
};

export type MockActionCode =
  | "purchased"
  | "already_owned"
  | "insufficient_points"
  | "not_available"
  | "not_owned"
  | "equipped"
  | "unequipped";

export type MockActionResult = { state: MockShopState; code: MockActionCode };

export function createMockShopState(): MockShopState {
  return { balance: MOCK_START_BALANCE, owned: new Set(), equipped: {} };
}

export function itemByKey(key: string): MockItem | undefined {
  return MOCK_ITEMS.find((item) => item.key === key);
}

export function filterMockItems(category: MockCategory): MockItem[] {
  return MOCK_ITEMS.filter((item) => category === "all" || item.category === category);
}

export function purchaseMockItem(state: MockShopState, key: string): MockActionResult {
  const item = itemByKey(key);
  if (!item?.available) return { state, code: "not_available" };
  if (state.owned.has(key)) return { state, code: "already_owned" };
  if (state.balance < item.price) return { state, code: "insufficient_points" };
  return {
    code: "purchased",
    state: {
      ...state,
      balance: state.balance - item.price,
      owned: new Set(state.owned).add(key),
    },
  };
}

export function equipMockItem(state: MockShopState, key: string): MockActionResult {
  const item = itemByKey(key);
  if (!item?.available) return { state, code: "not_available" };
  if (!state.owned.has(key)) return { state, code: "not_owned" };
  return {
    code: "equipped",
    state: { ...state, equipped: { ...state.equipped, [item.slot]: key } },
  };
}

export function unequipMockItem(state: MockShopState, key: string): MockActionResult {
  const item = itemByKey(key);
  if (!item || state.equipped[item.slot] !== key) return { state, code: "not_owned" };
  const equipped = { ...state.equipped };
  delete equipped[item.slot];
  return { code: "unequipped", state: { ...state, equipped } };
}

export function equippedItems(state: MockShopState): MockItem[] {
  return Object.values(state.equipped)
    .map((key) => itemByKey(key))
    .filter((item): item is MockItem => Boolean(item));
}

export function visibleLayers(state: MockShopState): MockLayer[] {
  return equippedItems(state)
    .flatMap((item) => item.layers)
    .sort((a, b) => a.z - b.z);
}
```

- [ ] **Step 4: 도메인 테스트를 통과시킨다**

Run:

```powershell
pnpm test -- src/lib/domain/avatar-shop-mock.test.ts
```

Expected: 1 file passed, 8 tests passed.

- [ ] **Step 5: 도메인 작업을 커밋한다**

```powershell
git add -- src/lib/domain/avatar-shop-mock.ts src/lib/domain/avatar-shop-mock.test.ts
git commit -m "feat: 캐릭터 상점 목업 상태 모델"
```

---

### Task 5: 클릭형 상점 UI와 레이어 미리보기

**Files:**
- Create: `src/components/profile/avatar-shop-mock.test.tsx`
- Create: `src/components/profile/avatar-layer-preview.tsx`
- Create: `src/components/profile/avatar-shop-mock.tsx`

- [ ] **Step 1: 실패하는 클릭 흐름 테스트를 작성한다**

Create `src/components/profile/avatar-shop-mock.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarShopMock } from "./avatar-shop-mock";

vi.mock("next/image", () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => <img {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

afterEach(cleanup);

describe("AvatarShopMock", () => {
  it("목업 전용 잔액과 비영구 안내를 표시한다", () => {
    render(<AvatarShopMock />);
    expect(screen.getByText("목업 전용 12,840P")).not.toBeNull();
    expect(screen.getByText(/실제 포인트와 보유 목록은 바뀌지 않아요/)).not.toBeNull();
  });

  it("캡을 구매한 뒤 별도 동작으로 장착한다", () => {
    const { container } = render(<AvatarShopMock />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /GND 캡 500P/ }));
    fireEvent.click(screen.getByRole("button", { name: "구매하기" }));
    expect(screen.getByText("목업 전용 12,340P")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("실제 포인트는 그대로");
    fireEvent.click(screen.getByRole("button", { name: "장착하기" }));
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getByTestId("equipped-summary").textContent).toContain("GND 캡");
    expect(screen.getByRole("button", { name: "장착 해제" })).not.toBeNull();
  });

  it("후드티를 반팔로 교체한다", () => {
    render(<AvatarShopMock />);
    for (const name of ["GND 후드티", "퍼포먼스 반팔"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${name} \\d`) }));
      fireEvent.click(screen.getByRole("button", { name: "구매하기" }));
      fireEvent.click(screen.getByRole("button", { name: "장착하기" }));
    }
    const summary = screen.getByTestId("equipped-summary").textContent ?? "";
    expect(summary).toContain("퍼포먼스 반팔");
    expect(summary).not.toContain("GND 후드티");
  });

  it("준비 중 아이템은 구매 버튼을 비활성화한다", () => {
    render(<AvatarShopMock />);
    fireEvent.click(screen.getByRole("button", { name: /스포츠 워치 1,500P/ }));
    const unavailableButton = screen.getByRole("button", { name: "준비 중" }) as HTMLButtonElement;
    expect(unavailableButton.disabled).toBe(true);
  });

  it("비어 있는 배경 필터에서 이전 아이템 상세를 숨긴다", () => {
    render(<AvatarShopMock />);
    fireEvent.click(screen.getByRole("button", { name: "배경" }));
    expect(screen.getByText("준비된 배경 아이템이 없어요")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "구매하기" })).toBeNull();
  });

  it("선택과 장착을 색 이외의 접근성 상태로 전달한다", () => {
    render(<AvatarShopMock />);
    const cap = screen.getByRole("button", { name: /GND 캡 500P/ });
    expect(cap.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });
});
```

- [ ] **Step 2: 컴포넌트 부재로 실패하는지 확인한다**

Run:

```powershell
pnpm test -- src/components/profile/avatar-shop-mock.test.tsx
```

Expected: FAIL with `Cannot find module './avatar-shop-mock'`.

- [ ] **Step 3: 레이어 미리보기 컴포넌트를 구현한다**

Create `src/components/profile/avatar-layer-preview.tsx`:

```tsx
import Image from "next/image";
import type { MockLayer } from "@/lib/domain/avatar-shop-mock";

export function AvatarLayerPreview({
  layers,
  equippedNames,
}: {
  layers: MockLayer[];
  equippedNames: string[];
}) {
  return (
    <section aria-label="캐릭터 장착 미리보기">
      <div className="relative mx-auto aspect-[2/3] w-full max-w-[320px] overflow-hidden rounded-card border border-line bg-gradient-to-b from-surface-2 to-surface shadow-card">
        <Image
          src="/avatar-mock/base.png"
          alt=""
          fill
          priority
          sizes="(max-width: 430px) 82vw, 320px"
          className="object-contain"
          style={{ zIndex: 30 }}
        />
        {layers.map((layer) => (
          <Image
            key={`${layer.src}:${layer.z}`}
            src={layer.src}
            alt=""
            fill
            sizes="(max-width: 430px) 82vw, 320px"
            className="object-contain"
            style={{ zIndex: layer.z }}
          />
        ))}
      </div>
      <p data-testid="equipped-summary" className="mt-2 text-center text-[11px] text-muted">
        현재 장착: {equippedNames.length > 0 ? equippedNames.join(" · ") : "기본 복장"}
      </p>
    </section>
  );
}
```

- [ ] **Step 4: 상점 UI를 구현한다**

Create `src/components/profile/avatar-shop-mock.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AvatarLayerPreview } from "./avatar-layer-preview";
import {
  MOCK_ITEMS,
  createMockShopState,
  equipMockItem,
  equippedItems,
  filterMockItems,
  purchaseMockItem,
  unequipMockItem,
  visibleLayers,
  type MockCategory,
} from "@/lib/domain/avatar-shop-mock";

const CATEGORIES: { key: MockCategory; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "clothing", label: "의상" },
  { key: "shoes", label: "신발" },
  { key: "accessory", label: "액세서리" },
  { key: "background", label: "배경" },
];

function formatPoint(value: number): string {
  return `${value.toLocaleString("ko-KR")}P`;
}

export function AvatarShopMock() {
  const [state, setState] = useState(createMockShopState);
  const [category, setCategory] = useState<MockCategory>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(MOCK_ITEMS[0].key);
  const [notice, setNotice] = useState("아이템을 골라 목업 구매를 시작해보세요");

  const items = useMemo(() => filterMockItems(category), [category]);
  const selected = selectedKey ? MOCK_ITEMS.find((item) => item.key === selectedKey) ?? null : null;
  const owned = selected ? state.owned.has(selected.key) : false;
  const equipped = selected ? state.equipped[selected.slot] === selected.key : false;
  const equippedNow = equippedItems(state);

  function changeCategory(next: MockCategory) {
    const nextItems = filterMockItems(next);
    setCategory(next);
    setSelectedKey(nextItems[0]?.key ?? null);
  }

  function runPrimaryAction() {
    if (!selected?.available) return;
    if (!owned) {
      const result = purchaseMockItem(state, selected.key);
      setState(result.state);
      setNotice(
        result.code === "purchased"
          ? "목업 구매 완료 · 실제 포인트는 그대로예요"
          : result.code === "insufficient_points"
            ? "포인트가 부족해요"
            : "이미 보유한 목업 아이템이에요",
      );
      return;
    }
    if (equipped) {
      const result = unequipMockItem(state, selected.key);
      setState(result.state);
      setNotice(`${selected.name} 장착을 해제했어요`);
      return;
    }
    const result = equipMockItem(state, selected.key);
    setState(result.state);
    setNotice(`${selected.name} 장착 완료`);
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          <Link
            href="/profile"
            aria-label="내 정보로 돌아가기"
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-lg"
          >
            ‹
          </Link>
          <div>
            <h1 className="text-[19px] font-extrabold">아이템 상점</h1>
            <p className="text-[11px] text-muted">구매·장착 클릭형 목업</p>
          </div>
        </div>
        <p className="rounded-full border border-accent/40 bg-accent-weak px-3 py-2 text-xs font-extrabold text-accent">
          목업 전용 {formatPoint(state.balance)}
        </p>
      </header>

      <section className="rounded-card-sm border border-accent/35 bg-accent-weak px-3.5 py-3">
        <p className="text-xs font-bold">🧪 실제 포인트와 보유 목록은 바뀌지 않아요</p>
        <p className="mt-0.5 text-[11px] text-muted">새로고침하면 목업 구매와 장착 상태가 초기화됩니다.</p>
      </section>

      <AvatarLayerPreview
        layers={visibleLayers(state)}
        equippedNames={equippedNow.map((item) => item.name)}
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1" aria-label="아이템 분류">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={category === item.key}
            onClick={() => changeCategory(item.key)}
            className={`min-h-11 flex-none rounded-full border px-4 text-xs font-extrabold ${
              category === item.key
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-surface text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <section className="rounded-card border border-line bg-surface p-6 text-center shadow-card">
          <p className="text-sm font-bold">준비된 배경 아이템이 없어요</p>
          <p className="mt-1 text-xs text-muted">첫 목업은 의상·신발·액세서리 합성을 먼저 검증합니다.</p>
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-2.5" aria-label="목업 아이템 목록">
          {items.map((item) => {
            const isSelected = selectedKey === item.key;
            const isOwned = state.owned.has(item.key);
            const isEquipped = state.equipped[item.slot] === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${item.name} ${formatPoint(item.price)} ${
                  !item.available ? "준비 중" : isEquipped ? "장착 중" : isOwned ? "보유" : "미보유"
                }`}
                onClick={() => setSelectedKey(item.key)}
                className={`min-h-44 rounded-card border p-3 text-left shadow-card ${
                  isSelected ? "border-accent bg-accent-weak" : "border-line bg-surface"
                }`}
              >
                <div className="grid h-16 place-items-center rounded-card-sm bg-surface-2 px-2 text-center">
                  <span className="text-xs font-bold text-muted">
                    {item.available ? `${item.name} 장착 레이어` : "이미지 준비 중"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-extrabold">{item.name}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-accent">{formatPoint(item.price)}</span>
                  <span className="text-muted">
                    {!item.available ? "준비 중" : isEquipped ? "✓ 장착 중" : isOwned ? "보유" : "미보유"}
                  </span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {selected && (
        <section className="sticky bottom-0 z-20 rounded-card border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold">{selected.name}</p>
              <p className="text-xs text-muted">{formatPoint(selected.price)} · {selected.available ? "목업 상품" : "이미지 준비 중"}</p>
            </div>
            <span className="text-xs font-extrabold text-accent">잔액 {formatPoint(state.balance)}</span>
          </div>
          <p role="status" aria-live="polite" className="mb-2 min-h-4 text-[11px] text-muted">{notice}</p>
          <button
            type="button"
            disabled={!selected.available}
            onClick={runPrimaryAction}
            className="h-12 w-full rounded-card bg-accent text-sm font-extrabold text-accent-ink disabled:bg-surface-2 disabled:text-faint"
          >
            {!selected.available ? "준비 중" : !owned ? "구매하기" : equipped ? "장착 해제" : "장착하기"}
          </button>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 컴포넌트 테스트를 통과시킨다**

Run:

```powershell
pnpm test -- src/components/profile/avatar-shop-mock.test.tsx
```

Expected: 1 file passed, 6 tests passed.

---

### Task 6: 현재 `/profile`에 진입점 연결

**Files:**
- Create: `src/components/profile/avatar-shop-entry.test.tsx`
- Create: `src/components/profile/avatar-shop-entry.tsx`
- Create: `src/app/(tabs)/profile/avatar-mock/page.tsx`
- Modify: `src/components/profile/growth-hub.tsx`

- [ ] **Step 1: 실패하는 진입 카드 테스트를 작성한다**

Create `src/components/profile/avatar-shop-entry.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarShopEntry } from "./avatar-shop-entry";

describe("AvatarShopEntry", () => {
  it("현재 내 정보에서 같은 앱의 목업 상점으로 연결한다", () => {
    const html = renderToStaticMarkup(<AvatarShopEntry />);
    expect(html).toContain('href="/profile/avatar-mock"');
    expect(html).toContain("아이템 상점 둘러보기");
    expect(html).toContain("목업");
  });
});
```

- [ ] **Step 2: 진입 컴포넌트 부재로 실패하는지 확인한다**

Run:

```powershell
pnpm test -- src/components/profile/avatar-shop-entry.test.tsx
```

Expected: FAIL with `Cannot find module './avatar-shop-entry'`.

- [ ] **Step 3: 진입 카드를 구현한다**

Create `src/components/profile/avatar-shop-entry.tsx`:

```tsx
import Link from "next/link";

export function AvatarShopEntry() {
  return (
    <Link
      href="/profile/avatar-mock"
      className="flex min-h-16 items-center justify-between rounded-card border border-accent/40 bg-accent-weak px-4 py-3 shadow-card"
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold">🛍️ 아이템 상점 둘러보기</p>
          <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-extrabold text-accent">목업</span>
        </div>
        <p className="mt-1 text-[11px] text-muted">실제 포인트 차감 없이 구매·장착을 시험해보세요</p>
      </div>
      <span className="text-sm font-bold text-accent">›</span>
    </Link>
  );
}
```

- [ ] **Step 4: 목업 페이지를 만든다**

Create `src/app/(tabs)/profile/avatar-mock/page.tsx`:

```tsx
import { AvatarShopMock } from "@/components/profile/avatar-shop-mock";

export default function AvatarShopMockPage() {
  return <AvatarShopMock />;
}
```

- [ ] **Step 5: 기존 성장 허브의 포인트 요약 바로 아래에 카드를 삽입한다**

Modify `src/components/profile/growth-hub.tsx` imports:

```tsx
import { AvatarShopEntry } from "@/components/profile/avatar-shop-entry";
```

Modify the rendered sequence immediately after `<PointSummary ... />`:

```tsx
      <PointSummary balance={balance} streakDays={streakDays} />

      <AvatarShopEntry />

      <NextGoalCard goal={selectNextGoal(achievements)} />
```

- [ ] **Step 6: 진입 카드와 관련 목업 테스트를 함께 통과시킨다**

Run:

```powershell
pnpm test -- src/components/profile/avatar-shop-entry.test.tsx src/components/profile/avatar-shop-mock.test.tsx src/lib/domain/avatar-shop-mock.test.ts
```

Expected: 3 files passed, 15 tests passed.

---

### Task 7: 개발 서버에서 실제 사용자 흐름 검증

**Files:**
- Verify: `src/app/(tabs)/profile/avatar-mock/page.tsx`
- Verify: `src/components/profile/avatar-shop-mock.tsx`
- Verify: `src/components/profile/growth-hub.tsx`

- [ ] **Step 1: 정적 관련 검사를 먼저 통과시킨다**

Run:

```powershell
node scripts/validate-avatar-mock-assets.mjs
pnpm typecheck
pnpm lint
pnpm test -- src/lib/domain/avatar-shop-mock.test.ts src/components/profile/avatar-shop-mock.test.tsx src/components/profile/avatar-shop-entry.test.tsx
```

Expected: asset 5/5 PASS, typecheck exit 0, lint error 0, related 15 tests passed.

- [ ] **Step 2: 개발 서버를 실행한다**

PowerShell:

```powershell
$devLog = Join-Path $env:TEMP 'gnd-avatar-shop-dev.log'
$devErr = Join-Path $env:TEMP 'gnd-avatar-shop-dev.err.log'
$dev = Start-Process -FilePath 'pnpm.cmd' -ArgumentList 'dev' -WorkingDirectory 'C:\Users\SAMSUNG\workout-app' -WindowStyle Hidden -RedirectStandardOutput $devLog -RedirectStandardError $devErr -PassThru
$dev.Id
```

Expected: `http://localhost:3000`이 열리고 컴파일 오류가 없다.

- [ ] **Step 3: 로그인 가능한 기존 세션을 확인한다**

Use the in-app Browser's existing signed-in session. If it is logged out, run the read-only fixture check:

```powershell
node scripts/dev-fixture.mjs status
```

Expected: existing fixture A/B status is shown. Do not run `create` unless the user separately approves production test-account creation.

- [ ] **Step 4: `/profile`에서 기존 화면과 진입점을 확인한다**

In the Browser:

1. Open `http://localhost:3000/profile`.
2. Count one existing character growth carousel, one point summary, one badge section, and one `아이템 상점 둘러보기` card.
3. Tap the settings gear and confirm the shop entry disappears with the growth hub.
4. Close settings and tap `아이템 상점 둘러보기`.

Expected: URL becomes `/profile/avatar-mock`; existing profile sections are not duplicated or removed.

- [ ] **Step 5: 목업 구매·장착을 직접 조작한다**

At viewport 390px:

1. Confirm `목업 전용 12,840P` and the non-persistent warning.
2. Select GND cap → purchase → confirm `12,340P` → equip → confirm cap visible and button says `장착 해제`.
3. Purchase and equip GND hoodie.
4. Purchase and equip Jordan 1; confirm cap + hoodie + shoes are visible together.
5. Purchase and equip performance tee; confirm hoodie disappears and tee replaces it.
6. Select sports watch; confirm `준비 중` is disabled.
7. Open background category; confirm zero-state text and no purchase button.
8. Reload; confirm balance returns to `12,840P` and equipment returns to `기본 복장`.
9. Use the back control; confirm `/profile` and settings still work.

Expected: every visible count, button transition, balance transition, removal, and reset matches the list. HTTP 200 alone is not a pass.

- [ ] **Step 6: 폭 320px와 430px에서도 합성을 확인한다**

Repeat the cap + hoodie + shoes combination at 320px and cap + tee + shoes at 430px.

Expected: no horizontal overflow, item drift, white halo, base-clothing leak, or covered action button. All major controls remain at least 44px high.

- [ ] **Step 7: 개발 서버를 종료한다**

```powershell
Stop-Process -Id $dev.Id
```

Expected: port 3000 is released before the build.

---

### Task 8: 전체 검증, 진행 기록, 최종 코드 커밋

**Files:**
- Modify: `PROGRESS.md`
- Commit: all verified UI, tests, route, and progress files

- [ ] **Step 1: 전체 검증을 마지막으로 한 번 실행한다**

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: typecheck exit 0, lint error 0, all tests 0 failed, Next.js production build succeeds.

- [ ] **Step 2: `PROGRESS.md` 맨 위에 검증 결과를 기록한다**

Add this section below the title and introductory quote:

```markdown
## ✅ 2026-08-01 — 캐릭터 아이템 상점 클릭형 목업 (개발 서버 확인 ✅ · 운영 배포 안 함)

- `/profile`의 기존 성장 허브에 `아이템 상점 둘러보기` 목업 진입 카드를 추가했다.
- 사용자 지정 갈색 불독을 투명 기본 캐릭터로 고정하고, 같은 1024×1536 캔버스의 캡·후드티·반팔·신발 레이어를 실제로 겹친다.
- 구매·보유·장착·슬롯 교체는 React 메모리에서만 동작한다. 실제 `user_wallet`, `point_transactions`, Supabase에는 쓰지 않는다.
- 이미지 선행 게이트: PNG 5개 구조 PASS, 흰·짙은 배경 PASS, 320·390·430px PASS, 후드티→반팔 교체 PASS.
- 개발 서버 직접 확인: 12,840P→12,340P 구매, 캡 장착, 세 슬롯 동시 장착, 같은 top 슬롯 교체, 준비 중 차단, 새로고침 초기화, 기존 설정 화면 유지 PASS.
- 자동 검증: typecheck PASS · lint 0 · 전체 test 0 failed · build PASS.
- 운영 배포와 DB 변경은 하지 않았다. 이미지 운영 사용 권한도 별도 확인 전까지 미확정이다.
- 다음 할 일: 사용자가 목업을 직접 써 보고 실제 포인트를 쓰고 싶은 아이템이 있는지 판단한다.
```

- [ ] **Step 3: 사용자 파일이 섞이지 않았는지 최종 상태를 확인한다**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: 루트의 기존 미추적 이미지 폴더는 그대로이며, `.env.local`과 무관한 사용자 파일은 변경 목록에 없다.

- [ ] **Step 4: 검증된 UI 파일만 커밋한다**

```powershell
git add -- src/lib/domain/avatar-shop-mock.ts src/lib/domain/avatar-shop-mock.test.ts src/components/profile/avatar-layer-preview.tsx src/components/profile/avatar-shop-mock.tsx src/components/profile/avatar-shop-mock.test.tsx src/components/profile/avatar-shop-entry.tsx src/components/profile/avatar-shop-entry.test.tsx 'src/app/(tabs)/profile/avatar-mock/page.tsx' src/components/profile/growth-hub.tsx PROGRESS.md
git commit -m "feat: 캐릭터 아이템 상점 클릭형 목업"
```

Expected: commit succeeds; no database migration, environment file, or root reference folder is staged.

- [ ] **Step 5: 완료 범위를 사용자에게 보고한다**

Report:

```text
현재 GND 개발 화면에 목업 상점을 추가했습니다.
실제 포인트·DB는 바뀌지 않았고 운영 배포도 하지 않았습니다.
개발 서버에서 구매, 장착, 같은 슬롯 교체, 준비 중 차단, 새로고침 초기화와 기존 프로필 복귀를 직접 확인했습니다.
다음 판단은 실제 포인트를 쓰고 싶은 아이템이 있는지입니다.
```
