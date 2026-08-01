# Fitted Multi-Layer Avatar Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pasted single cap image in the development mock with a fitted multi-layer cap that respects the bulldog's head curvature, ears, brim occlusion, and contact shadow.

**Architecture:** Keep the canonical 1024×1536 base avatar unchanged. Store each catalog item as a manifest entry containing one or more independently positioned layers, and render every equipped layer in z-order. Build the cap from fitted crown, ear-restoration, brim, and contact-shadow assets without replacing the full character image.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, JSON manifest, Pillow validation, OpenAI ImageGen, GIMP for local mask correction when needed

---

## File map

- `docs/design-sources/avatar-coordinate-v2/fitted-cap/`: generated reference, editable sources, layer QA output.
- `public/avatar-coordinate-v2/items/gnd-cap-v2/`: runtime transparent cap layer PNG files.
- `src/lib/domain/avatar-coordinate-manifest.json`: item-level `layers[]` placement metadata.
- `src/lib/domain/avatar-coordinate-items.ts`: converts manifest layers into catalog layers.
- `src/lib/domain/avatar-coordinate-items.test.ts`: manifest parsing and layer validation behavior.
- `src/components/profile/avatar-coordinate-preview.tsx`: z-sorted layer rendering; no cap-specific branch.
- `src/components/profile/avatar-coordinate-preview.test.tsx`: verifies all cap layers and ordering.
- `scripts/validate-avatar-coordinate-assets.py`: validates multi-layer assets and writes QA composites.
- `docs/avatar-item-asset-guide.md`: records the repeatable fitted-item production rule.

### Task 1: Create and approve the fitted cap reference

**Files:**

- Create: `docs/design-sources/avatar-coordinate-v2/fitted-cap/gnd-cap-fitted-reference-v1.png`
- Create: `docs/design-sources/avatar-coordinate-v2/fitted-cap/prompt.md`
- Reference: `public/avatar-coordinate-v2/base/avatar-base-master.png`

- [ ] **Step 1: Generate one identity-preserving edit**

Use the canonical base as the edit target and the user's natural-wear screenshot as a geometry reference. Add only a black curved baseball cap with a centered white `G`; preserve the character, pose, clothing, lighting, transparent canvas, and body placement.

- [ ] **Step 2: Save the exact prompt**

Record the input roles, invariants, and rejected changes in `prompt.md` so later cap variants use the same constraints.

- [ ] **Step 3: Inspect the result**

Reject the image if either eye changes, the muzzle changes, body pixels visibly drift, the brim crosses the pupils, or either ear has an impossible front/back relationship.

- [ ] **Step 4: Show the reference for approval**

Render the candidate inline and do not extract production layers until the fitted appearance is accepted.

### Task 2: Define multi-layer manifest behavior with a failing test

**Files:**

- Modify: `src/lib/domain/avatar-coordinate-items.test.ts`
- Modify: `src/lib/domain/avatar-coordinate-items.ts`
- Modify: `src/lib/domain/avatar-coordinate-manifest.json`

- [ ] **Step 1: Write the failing manifest test**

```ts
it("한 상품의 여러 착용 레이어를 매니페스트 순서와 좌표대로 반환한다", () => {
  const cap = AVATAR_ITEM_CATALOG.find((item) => item.id === "gnd-cap-v2");
  expect(cap?.layers.map((layer) => layer.id)).toEqual([
    "crown",
    "ear-left-front",
    "ear-right-front",
    "brim",
    "contact-shadow",
  ]);
  expect(cap?.layers.map((layer) => layer.z)).toEqual([40, 45, 45, 50, 55]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm vitest run src/lib/domain/avatar-coordinate-items.test.ts
```

Expected: FAIL because `AvatarLayer` has no `id` and the cap has one layer.

- [ ] **Step 3: Implement the minimal generic parser**

Add `id: string` to `AvatarLayer`. Change the manifest type to item metadata containing `slot` and `layers`, then map every manifest layer without cap-specific logic.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same Vitest command. Expected: PASS.

### Task 3: Extract the fitted cap into transparent layer assets

**Files:**

- Create: `public/avatar-coordinate-v2/items/gnd-cap-v2/crown.png`
- Create: `public/avatar-coordinate-v2/items/gnd-cap-v2/ear-left-front.png`
- Create: `public/avatar-coordinate-v2/items/gnd-cap-v2/ear-right-front.png`
- Create: `public/avatar-coordinate-v2/items/gnd-cap-v2/brim.png`
- Create: `public/avatar-coordinate-v2/items/gnd-cap-v2/contact-shadow.png`
- Create: `docs/design-sources/avatar-coordinate-v2/fitted-cap/layer-bounds.json`
- Create: `docs/design-sources/avatar-coordinate-v2/fitted-cap/composite-light.png`
- Create: `docs/design-sources/avatar-coordinate-v2/fitted-cap/composite-dark.png`

- [ ] **Step 1: Preserve the canonical base**

Compute and record the SHA256 of `avatar-base-master.png`; do not overwrite it.

- [ ] **Step 2: Separate cap geometry**

Use the fitted reference to isolate crown and brim. Extract only the portions of the original base ears that must appear above the crown. Paint contact shadow as a separate low-opacity layer.

- [ ] **Step 3: Crop by alpha bounds**

Crop each layer to non-transparent bounds and store `assetWidth`, `assetHeight`, `x`, `y`, `width`, and `height` in `layer-bounds.json`.

- [ ] **Step 4: Update the cap manifest entry**

Copy the five measured records into `avatar-coordinate-manifest.json`; keep the other five catalog items as one-layer entries.

- [ ] **Step 5: Produce light and dark QA composites**

Composite base plus all five cap layers in z-order on `#f6f1e5` and `#11151a` backgrounds.

### Task 4: Validate multi-layer assets with TDD

**Files:**

- Create: `scripts/validate-avatar-coordinate-assets.test.py`
- Modify: `scripts/validate-avatar-coordinate-assets.py`

- [ ] **Step 1: Write a failing validator test**

Create a temporary manifest with two layers for one item and assert that the validator rejects a missing layer file and accepts both valid RGBA files.

- [ ] **Step 2: Run the validator test and verify RED**

Run:

```powershell
python -m unittest scripts/validate-avatar-coordinate-assets.test.py
```

Expected: FAIL because the validator expects one PNG named after each item.

- [ ] **Step 3: Implement generic layer iteration**

For each manifest item, iterate `item["layers"]`, validate the declared file, dimensions, transparent corners, canvas bounds, and finite z-order, then composite all layers sorted by z.

- [ ] **Step 4: Verify GREEN and real assets**

Run:

```powershell
python -m unittest scripts/validate-avatar-coordinate-assets.test.py
pnpm validate:avatar-assets
```

Expected: both commands PASS and cap-only QA files are rewritten.

### Task 5: Render every fitted layer and preserve error fallback

**Files:**

- Modify: `src/components/profile/avatar-coordinate-preview.test.tsx`
- Modify: `src/components/profile/avatar-coordinate-preview.tsx`

- [ ] **Step 1: Write the failing render test**

```ts
it("장착한 모자의 모든 조각을 z순서대로 렌더링한다", () => {
  const html = renderToStaticMarkup(
    <AvatarCoordinatePreview equippedItemIds={["gnd-cap-v2"]} />,
  );
  const crown = html.indexOf("gnd-cap-v2%2Fcrown.png");
  const brim = html.indexOf("gnd-cap-v2%2Fbrim.png");
  const shadow = html.indexOf("gnd-cap-v2%2Fcontact-shadow.png");
  expect(crown).toBeGreaterThan(-1);
  expect(brim).toBeGreaterThan(crown);
  expect(shadow).toBeGreaterThan(brim);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm vitest run src/components/profile/avatar-coordinate-preview.test.tsx
```

Expected: FAIL because the current cap has one source.

- [ ] **Step 3: Keep the renderer generic**

Use the existing `flatMap` plus z-sort path, add a stable layer key based on item/layer id if needed, and keep the base visible when any item source fails.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same command. Expected: PASS.

### Task 6: Document the repeatable item pipeline

**Files:**

- Modify: `docs/avatar-item-asset-guide.md`

- [ ] **Step 1: Replace the one-image assumption**

Document that head items may require crown, occlusion-restoration, front, and contact-shadow layers. State that coordinate reuse applies only to the same canonical body and slot template.

- [ ] **Step 2: Add the new-item checklist**

Record: create fitted reference → separate layers → crop alpha bounds → register coordinates → validate light/dark → inspect at 320/390/430px → approve.

### Task 7: Run direct development-server acceptance

**Files:**

- Verify only: `src/app/(tabs)/profile/avatar-mock/page.tsx`
- Verify only: `public/avatar-coordinate-v2/items/gnd-cap-v2/**`

- [ ] **Step 1: Start or reuse the development server**

Open `http://localhost:3107/profile/avatar-mock` in the controllable in-app browser.

- [ ] **Step 2: Exercise the complete mock flow**

Select cap → buy for 500P → equip → verify all fitted layers → unequip → verify exact base → re-equip.

- [ ] **Step 3: Check responsive sizes**

Inspect at 320px, 390px, and 430px. The cap must not drift, crop, or cover the pupils.

- [ ] **Step 4: Check visual acceptance**

Confirm head curvature, ear occlusion, contact shadow, and clean edges on the live dark preview. Capture a screenshot for the user.

### Task 8: Run final checks without merging or deploying

**Files:**

- Modify: `PROGRESS.md`

- [ ] **Step 1: Run focused checks**

```powershell
pnpm test:avatar-coordinate
python -m unittest scripts/validate-avatar-coordinate-assets.test.py
```

- [ ] **Step 2: Run project checks once**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

- [ ] **Step 3: Record evidence**

Update `PROGRESS.md` with the fitted layer paths, visual checks, commands, results, and remaining production exclusions.

- [ ] **Step 4: Stop at the approval gate**

Do not merge to `main`, push, deploy, connect Supabase, or charge real points. Show the development-server result and wait for explicit visual approval.
