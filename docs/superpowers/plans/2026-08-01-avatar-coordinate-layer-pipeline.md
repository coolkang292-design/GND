# Coordinate-Based Avatar Layer Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 불독 기준 이미지를 1024×1536 좌표계의 기본 캐릭터와 6개 투명 아이템으로 분리하고, 개발 서버의 `/profile/avatar-mock`에서 모자 구매·장착·해제를 실제 레이어 합성으로 검증한다.

**Architecture:** 기본 캐릭터는 고정 비율 캔버스 한 장으로 유지하고, 아이템은 잘라낸 투명 PNG와 `x/y/width/height/z` 메타데이터로 관리한다. 화면에서는 모든 좌표를 마스터 캔버스 대비 백분율로 변환해 합성한다. 목업 구매 상태는 브라우저 메모리에만 두며 실제 포인트·DB·운영 API에는 연결하지 않는다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, OpenAI ImageGen, Pillow 기반 자산 검증 스크립트

---

## 범위와 완료 조건

- 기준 이미지는 사용자가 제공한 새 불독 이미지다.
- 기준 캐릭터는 같은 외형과 자세를 유지하되 검은 민소매·검은 짧은 타이츠·맨발 상태다.
- 모자, 선글라스, 후드, 조거팬츠, 운동화, 손목시계는 서로 독립된 투명 PNG다.
- 개발 화면에서는 모자만 구매·장착·해제할 수 있고 나머지는 `준비 중`으로 비활성화한다.
- 새로고침하면 목업 상태가 초기화된다.
- 320px, 390px, 430px 화면 폭에서 좌표가 어긋나지 않는다.
- 실서버 배포, 실제 포인트 차감, DB 저장은 이번 범위에 포함하지 않는다.

## Task 1: 작업 격리와 입력 원본 고정

**Files:**

- Create: `docs/design-sources/avatar-coordinate-v2/README.md`
- Create: `docs/design-sources/avatar-coordinate-v2/reference.png`
- Reference: `C:/Users/SAMSUNG/AppData/Local/Temp/codex-clipboard-1ac50b4e-4067-43e7-9327-15f0c81b8179.png`

- [ ] 현재 체크아웃이 일반 작업공간임을 확인하고 사용자 동의를 받아 Git worktree를 만든다.
- [ ] `git status --short`, `git branch --show-current`, `git rev-parse --show-toplevel`로 기존 사용자 변경을 기록한다.
- [ ] 첨부 이미지를 수정하지 않고 설계 원본 경로로 복사한다.
- [ ] README에 원본 경로, 기준 캔버스 1024×1536, 사용 범위, 생성일을 기록한다.
- [ ] 복사본의 해시와 크기를 원본과 비교한다.

Expected verification:

```powershell
Get-FileHash -Algorithm SHA256 <원본>, <복사본>
Get-Item <원본>, <복사본> | Select-Object FullName, Length
```

두 파일의 SHA256과 길이가 같아야 한다.

## Task 2: 좌표 모델과 검증 규칙을 테스트로 고정

**Files:**

- Create: `src/lib/domain/avatar-coordinate-items.test.ts`
- Create: `src/lib/domain/avatar-coordinate-items.ts`

- [ ] 먼저 다음 실패 테스트를 작성한다.

```ts
import { describe, expect, it } from "vitest";
import {
  MASTER_CANVAS,
  layerStyle,
  validateAvatarLayer,
} from "./avatar-coordinate-items";

describe("avatar coordinate layers", () => {
  it("1024x1536 좌표를 캔버스 백분율로 변환한다", () => {
    expect(layerStyle({ x: 256, y: 384, width: 512, height: 384, z: 20 }))
      .toMatchObject({ left: "25%", top: "25%", width: "50%", height: "25%", zIndex: 20 });
  });

  it("레이어가 마스터 캔버스를 벗어나면 거부한다", () => {
    expect(validateAvatarLayer({ x: 900, y: 0, width: 200, height: 100, z: 1 })).toContain("canvas");
  });

  it("마스터 캔버스를 1024x1536으로 고정한다", () => {
    expect(MASTER_CANVAS).toEqual({ width: 1024, height: 1536 });
  });
});
```

- [ ] `pnpm vitest run src/lib/domain/avatar-coordinate-items.test.ts`를 실행해 모듈 부재로 실패하는지 확인한다.
- [ ] `AvatarSlot`, `AvatarLayer`, `AvatarItem`, `AvatarLandmarks` 타입을 정의한다.
- [ ] `MASTER_CANVAS`, `layerStyle`, `validateAvatarLayer` 최소 구현을 작성한다.
- [ ] 같은 테스트를 다시 실행해 통과시킨다.

## Task 3: 기본 캐릭터와 랜드마크 생성

**Files:**

- Create: `docs/design-sources/avatar-coordinate-v2/base/avatar-base-master.png`
- Create: `docs/design-sources/avatar-coordinate-v2/base/landmarks.json`
- Create: `docs/design-sources/avatar-coordinate-v2/qa/landmark-guide.png`
- Create: `public/avatar-coordinate-v2/base/avatar-base-master.png`
- Create: `scripts/render-avatar-landmarks.mjs`

- [ ] ImageGen에 참조 이미지를 제공하고 다음 조건으로 기준 캐릭터를 생성한다: 같은 불독 얼굴·체형·정면 3/4 자세, 검은 민소매, 검은 짧은 타이츠, 맨발, 모자·안경·후드·조거팬츠·신발·시계·차량·배경 제거, 전신이 캔버스 안에 위치, 단색 크로마 배경.
- [ ] 생성 결과를 육안으로 비교해 얼굴, 신체 비율, 손·발, 자세가 기준 이미지와 일관되는 한 장을 선택한다.
- [ ] 제공된 `remove_chroma_key.py`를 사용해 알파 채널이 있는 PNG로 변환한다.
- [ ] 필요하면 투명 가장자리의 녹색 번짐만 수동 보정하되, 캐릭터 형태와 자세는 변경하지 않는다.
- [ ] 1024×1536 마스터에 대해 다음 정수 좌표를 기록한다: `headTop`, `headCenter`, `leftEar`, `rightEar`, `leftEye`, `rightEye`, `nose`, `neck`, `leftShoulder`, `rightShoulder`, `waistLeft`, `waistRight`, `leftWrist`, `rightWrist`, `leftFoot`, `rightFoot`.
- [ ] `head`, `eyes`, `top`, `bottom`, `leftWrist`, `rightWrist`, `feet` 영역 상자를 기록한다.
- [ ] 랜드마크를 점과 사각형으로 그린 QA 이미지를 생성해 좌표가 실제 신체 위치에 맞는지 확인한다.
- [ ] 공개 자산으로 복사한 파일과 설계 원본의 해시가 같은지 확인한다.

## Task 4: 6개 독립 아이템 생성과 자동 자르기

**Files:**

- Create: `docs/design-sources/avatar-coordinate-v2/items/gnd-cap-v2.png`
- Create: `docs/design-sources/avatar-coordinate-v2/items/gnd-sunglasses-v2.png`
- Create: `docs/design-sources/avatar-coordinate-v2/items/gnd-hoodie-v2.png`
- Create: `docs/design-sources/avatar-coordinate-v2/items/gnd-joggers-v2.png`
- Create: `docs/design-sources/avatar-coordinate-v2/items/gnd-sneakers-v2.png`
- Create: `docs/design-sources/avatar-coordinate-v2/items/gnd-watch-v2.png`
- Create: `public/avatar-coordinate-v2/items/*.png`
- Create: `scripts/crop-avatar-item-assets.mjs`
- Create: `scripts/validate-avatar-coordinate-assets.mjs`
- Create: `docs/design-sources/avatar-coordinate-v2/qa/all-items-light.png`
- Create: `docs/design-sources/avatar-coordinate-v2/qa/all-items-dark.png`

- [ ] 각 아이템은 기준 캐릭터를 참조해 실제 착용 각도와 원근에 맞춘 별도 이미지로 생성한다.
- [ ] 아이템별 프롬프트에 슬롯 랜드마크와 목표 영역 크기를 명시하고, 캐릭터 본체는 생성하지 않도록 지시한다.
- [ ] 크로마 제거 후 알파 경계 상자를 계산해 빈 여백을 자동 자른다.
- [ ] 잘라낸 PNG의 마스터 캔버스 배치 좌표를 계산해 아이템 메타데이터 후보를 만든다.
- [ ] 모자는 머리카락/귀 가림이 자연스럽도록 필요 시 `back`과 `front` 두 레이어로 나눈다.
- [ ] 후드·바지·신발도 신체가 앞뒤로 교차하는 경우에만 다중 레이어로 나눈다.
- [ ] 검증 스크립트에서 RGBA, 알파 모서리, 실제 크기, 메타데이터 크기, 캔버스 경계, 빈 알파 이미지를 검사한다.
- [ ] 흰 배경과 어두운 배경에서 6개를 모두 합성한 QA 이미지를 만들고 테두리 번짐·공중 부양·신체 관통을 확인한다.

Expected verification:

```powershell
node scripts/validate-avatar-coordinate-assets.mjs
```

6개 아이템과 기본 캐릭터가 모두 `PASS`여야 한다.

## Task 5: 아이템 카탈로그와 목업 상태 전이 구현

**Files:**

- Modify: `src/lib/domain/avatar-coordinate-items.test.ts`
- Modify: `src/lib/domain/avatar-coordinate-items.ts`

- [ ] 먼저 잔액 12,840P, 모자 가격 500P, 다른 5개 아이템 `comingSoon`을 고정하는 실패 테스트를 추가한다.
- [ ] 구매하지 않은 모자는 장착할 수 없고, 구매하면 500P가 차감되며, 장착·해제·재장착이 가능한 상태 전이 테스트를 추가한다.
- [ ] 새로고침을 모사한 새 초기 상태가 다시 12,840P와 미구매 상태인지 테스트한다.
- [ ] `AVATAR_ITEM_CATALOG`, `createAvatarMockState`, `purchaseAvatarItem`, `equipAvatarItem`, `unequipAvatarItem`을 최소 구현한다.
- [ ] 같은 슬롯에 다른 아이템을 장착할 때 이전 아이템을 자동 해제하는 규칙을 타입과 테스트로 준비한다.
- [ ] 관련 테스트를 다시 실행해 통과시킨다.

## Task 6: 좌표 합성 미리보기 컴포넌트 구현

**Files:**

- Create: `src/components/profile/avatar-coordinate-preview.test.tsx`
- Create: `src/components/profile/avatar-coordinate-preview.tsx`

- [ ] 먼저 기본 이미지와 장착 레이어가 렌더되고, 모자 좌표가 백분율 스타일로 변환되며, `zIndex`가 적용되는 실패 테스트를 작성한다.
- [ ] `aspect-ratio: 2 / 3`, `position: relative`, `overflow: hidden`인 미리보기 캔버스를 만든다.
- [ ] 기본 캐릭터를 가장 아래에 렌더하고 장착 레이어를 `z` 순서로 정렬한다.
- [ ] 레이어 경로가 실패해도 기본 캐릭터와 상점 조작이 유지되도록 오류 상태를 표시한다.
- [ ] 관련 테스트를 다시 실행해 통과시킨다.

## Task 7: 모자 구매·장착 목업 상점 구현

**Files:**

- Create: `src/components/profile/avatar-shop-mock.test.tsx`
- Create: `src/components/profile/avatar-shop-mock.tsx`

- [ ] `// @vitest-environment jsdom` 환경에서 실패 테스트를 작성한다.
- [ ] 모자 선택 → `500P 구매` → 잔액 12,340P → `장착` → 미리보기에 모자 표시 → `해제` → 모자 제거 → `재장착` 흐름을 클릭 테스트로 고정한다.
- [ ] 나머지 5개 아이템이 보이지만 `준비 중` 버튼이 비활성인지 테스트한다.
- [ ] 선택 아이템, 구매 목록, 장착 목록, 목업 잔액을 컴포넌트 로컬 상태로 구현한다.
- [ ] 구매 버튼과 장착 버튼을 분리해 사용자가 상태를 혼동하지 않도록 한다.
- [ ] 새로고침 초기화 안내 문구와 `개발 목업 · 실제 포인트 차감 없음` 표시를 넣는다.
- [ ] 관련 테스트를 다시 실행해 통과시킨다.

## Task 8: 프로필 진입점과 페이지 연결

**Files:**

- Create: `src/components/profile/avatar-shop-entry.test.tsx`
- Create: `src/components/profile/avatar-shop-entry.tsx`
- Modify: `src/components/profile/growth-hub.tsx`
- Create: `src/app/(tabs)/profile/avatar-mock/page.test.tsx`
- Create: `src/app/(tabs)/profile/avatar-mock/page.tsx`

- [ ] 프로필 포인트 요약 바로 아래에 `캐릭터 아이템 상점` 카드가 1개 렌더되고 `/profile/avatar-mock`으로 연결되는 실패 테스트를 작성한다.
- [ ] 상점 페이지가 제목, 개발 목업 표시, 합성 미리보기, 6개 아이템을 렌더하는 실패 테스트를 작성한다.
- [ ] 진입 카드를 `PointSummary` 다음에 삽입한다.
- [ ] 탭 레이아웃을 그대로 상속하는 상점 페이지를 구현한다.
- [ ] 관련 테스트를 실행해 통과시킨다.

## Task 9: 개발 서버 실물 검증

**Files:**

- Verify only: `src/app/(tabs)/profile/avatar-mock/page.tsx`
- Verify only: `public/avatar-coordinate-v2/**`

- [ ] `pnpm dev`를 숨김 창으로 실행하고 실제 포트를 확인한다.
- [ ] 인앱 브라우저에서 `/profile`을 열어 포인트 요약 아래 상점 카드가 정확히 1개 보이는지 센다.
- [ ] 카드를 눌러 `/profile/avatar-mock`으로 이동한다.
- [ ] 모자를 선택하고 구매해 잔액이 12,840P에서 12,340P로 변하는지 확인한다.
- [ ] 장착 버튼을 눌러 모자가 머리에 자연스럽게 겹쳐지는지 확인한다.
- [ ] 해제하면 모자만 사라지고 기본 캐릭터가 유지되는지 확인한다.
- [ ] 재장착하고 새로고침하면 목업 상태가 초기화되는지 확인한다.
- [ ] 5개 준비 중 아이템 버튼이 눌리지 않는지 확인한다.
- [ ] 320px, 390px, 430px 폭에서 머리 좌표가 변하지 않고 화면이 가로로 넘치지 않는지 확인한다.
- [ ] 개발자 콘솔 오류가 0건인지 확인한다.

실물 확인에서 위치가 어색하면 코드의 좌표 메타데이터만 조정한다. 완성 사진 교체 방식으로 우회하지 않는다.

## Task 10: 전체 검증과 진행 문서 갱신

**Files:**

- Modify: `PROGRESS.md`

- [ ] 관련 테스트를 한 번 실행한다.

```powershell
pnpm vitest run src/lib/domain/avatar-coordinate-items.test.ts src/components/profile/avatar-coordinate-preview.test.tsx src/components/profile/avatar-shop-mock.test.tsx src/components/profile/avatar-shop-entry.test.tsx "src/app/(tabs)/profile/avatar-mock/page.test.tsx"
```

- [ ] 전체 정적·회귀 검사를 각각 한 번 실행한다.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

- [ ] `PROGRESS.md`에 사용자 화면 변화, 좌표 구조, 자산 경로, 개발 서버 조작 결과, 전체 검사 결과, 미포함 범위를 기록한다.
- [ ] `git status --short`로 사용자 기존 파일이 보존됐는지 확인한다.
- [ ] 검증된 파일만 경로를 명시해 스테이징하고 논리적 커밋 1개를 만든다. `git add .`는 사용하지 않는다.
- [ ] 운영 배포는 하지 않고, 이후 실제 포인트·보유 아이템 DB 연동을 별도 고위험 단계로 남긴다.

## 구현 중 중단 기준

- 생성된 기본 캐릭터의 얼굴·자세가 기준 이미지와 명백히 다르면 아이템 생성으로 넘어가지 않는다.
- 투명 가장자리에서 녹색 번짐이 남거나 손·귀·발이 잘리면 공개 자산으로 복사하지 않는다.
- 모자 위치가 3회 이상 좌표 조정 후에도 어색하면 단일 레이어 가정을 중단하고 앞/뒤 레이어로 분리한다.
- 개발 서버 화면을 직접 조작할 수 없으면 완료 또는 배포 가능이라고 보고하지 않는다.
- 실제 포인트·DB·운영 배포가 필요해지면 이번 목업 범위를 종료하고 별도 승인 절차로 전환한다.
