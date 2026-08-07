# UI 아이콘 생성 프롬프트 — 붙여넣기용 (2026-08-07)

규격·근거·검수 기준은 **`docs/ui-icon-asset-guide.md`**에 있다. 이 문서는
**이미지 모델에 그대로 넣는 프롬프트만** 모은 것이다.

> ⚠️ **가이드 문서를 통째로 넣지 마라.** 그건 사람이 읽는 글이라 지시로 안 읽힌다.
> 아래 블록을 **하나씩** 복사해서 **한 번에 한 시트씩** 받는다.

---

## 0. 작업 방식 — 이 순서를 지킨다

```
① 시트 A를 받는다                    ← 대화 1번, 이미지 1장
② 저장 → check-ui-icons.py로 잰다     ← 여기서 떨어지면 §3 재지시 문구로 다시
③ 통과하면 그 이미지를 확정 기준으로 삼는다
④ 시트 B~F는 ③을 첨부하고 받는다       ← "같은 화풍으로" 가 자동으로 걸린다
⑤ 시트마다 ②를 반복
```

**②를 건너뛰지 마라.** 1차 실패는 눈으로만 보고 넘어가서 생겼다.
6장을 다 받아 놓고 마지막에 재면, 기준점이 틀렸을 때 6장을 다 버린다.

### 받은 파일을 저장할 이름

`slice-ui-icons.py`의 `SHEETS`가 이 이름으로 찾는다(가이드 §8.1).

| 시트 | 저장 이름 | 캔버스 | 칸 |
|---|---|---|---|
| A 허브 | `어플 UI 이미지/허브.png` | 1024 × 1024 | 2행 3열 |
| B 부위 | `어플 UI 이미지/부위별.png` | 1024 × 1024 | 2행 3열 |
| C 상황 | `어플 UI 이미지/상황별.png` | 1024 × 1024 | 2행 3열 |
| D 탭바 | `어플 UI 이미지/탭바.png` | 1536 × 1024 | 2행 5열 |
| E 챌린지 | `어플 UI 이미지/챌린지.png` | 1536 × 1024 | 2행 4열 |
| F 스트릭·친구 | `어플 UI 이미지/스트릭친구.png` | 1024 × 1024 | 2행 2열 |

> **PNG로 저장한다.** JPG로 받으면 알파가 날아가서 배경을 못 뺀다.

---

## 1. 시트 A · 허브 6장 — **가장 먼저, 이것만 여러 번 반복**

이 한 장이 나머지 다섯 장의 화풍 기준이 된다. **마음에 들 때까지 여기서만 반복한다.**

```
Create a 1024x1024 icon sheet for a dark-themed mobile fitness app.
Exactly 6 icons in a 2 rows x 3 columns grid on a FULLY TRANSPARENT background.

THE MOST IMPORTANT REQUIREMENT — STROKE WEIGHT:
Every stroke must be THICK AND BOLD, at least 21 pixels wide on this canvas
(about 8% of each icon's height). These icons will be displayed at only 28-40
pixels on a phone, so thin lines disappear completely. When in doubt, make the
strokes thicker. Uniform stroke weight across all 6 icons. Rounded caps and joins.

OPACITY:
All strokes and fills must be 100% opaque solid color with hard, crisp edges.
No soft brushes, no semi-transparent strokes, no feathered edges, no airbrush.

COLOR:
Solid warm gold #e8b84b, flat color with minimal gradient.
NEVER fill any shape with black, dark brown, or any dark color. These icons sit
on a near-black card (#211f18), so anything dark becomes invisible. If a shape
needs a filled body, fill it with the SAME gold. Interior detail lines are drawn
in a slightly darker gold ON TOP of the gold body — never the reverse.

STRICTLY FORBIDDEN:
- No glow, no halo, no light bloom, no aura, no vignette, no lens flare
- No background of any kind — the background must be pure alpha zero
- No drop shadows, no ground shadows, no reflections
- No grid lines or dividers drawn between the cells
- No text, no numbers, no letters, no labels under the icons
- No 3D bevel, no photorealistic rendering, no metallic reflections

LAYOUT:
Each icon centered in its own cell, filling about 75% of the cell width.
Equal generous spacing between cells, horizontally AND vertically.
All 6 icons drawn at the same visual weight and size.

Style: clean flat vector icon set, like a mobile app tab bar icon — not an
illustration, not a 3D render.

THE 6 ICONS (left to right, top to bottom):
1. A target with a dart stuck in the bullseye
2. A muscular torso seen from the front, chest and abs visible
3. A magnifying glass tilted 45 degrees, thick handle
4. A clock face with a circular arrow curving backwards around it
5. A clipboard with three checked list lines
6. A stopwatch with a flame rising from its crown button
```

---

## 2. 시트 B~F — **확정된 시트 A 이미지를 첨부하고 보낸다**

첨부 없이 보내면 시트마다 획 굵기가 달라져서, 한 화면에 나란히 놓였을 때
다른 세트로 보인다. **첨부는 선택이 아니다.**

### 공통 머리말 (B~F 앞에 항상 붙인다)

```
Using the attached icon sheet as the exact style reference, create another icon
sheet. Keep IDENTICAL: stroke weight, gold color (#e8b84b), flat vector style,
100% opaque hard edges, fully transparent background, cell spacing, and the
size each icon occupies within its cell.

Same hard rules as the reference: no glow, no halo, no shadows, no background,
no text or numbers, no dark fills of any kind, no 3D rendering.
Strokes must stay at least 8% of each icon's height — these render at 28-40px.

Change ONLY the grid size and the icons themselves:
```

### 시트 B · 부위 6장

```
[공통 머리말]

Canvas 1024x1024, exactly 6 icons in a 2 rows x 3 columns grid.

THE 6 ICONS (left to right, top to bottom):
1. Pectoral muscles, front view of a torso
2. Back muscles seen from behind, lats spread wide
3. A pair of muscular legs, front view
4. Deltoid muscles, front view of shoulders and upper chest
5. A flexed arm showing the biceps
6. Abdominal muscles, a six-pack midsection

CRITICAL FOR THIS SHEET: these are muscle silhouettes, and the obvious way to
draw them is a dark filled body with a gold outline. DO NOT DO THAT. The muscle
bodies must be GOLD-FILLED. Muscle definition lines are drawn in a darker gold
ON TOP of the gold body — never a dark body with gold lines. A dark-filled
muscle is completely invisible on this app's near-black card.
```

> ⚠️ 1차에서 이 시트가 가장 크게 망가졌다(6장 중 4장이 대비 1.0:1). 통과한
> `part-arms`가 정확히 "골드 채움"이었으니, **그 장을 같이 첨부**하면 더 확실하다.

### 시트 C · 상황 6장

```
[공통 머리말]

Canvas 1024x1024, exactly 6 icons in a 2 rows x 3 columns grid.

THE 6 ICONS (left to right, top to bottom):
1. A standing human figure, front view, simple bold silhouette
2. A target with an arrow in the bullseye
3. A question mark beside a dumbbell
4. A simple house with a door and one window
5. A stopwatch whose hand points at the halfway mark
6. A heart with a pulse/ECG line running through it

NOTE ON ICON 5: do NOT write "30" or any number on the stopwatch dial. The
meaning is carried by the hand pointing halfway around. No digits anywhere.
```

### 시트 D · 탭바 10장 — **가장 어려운 시트**

```
[공통 머리말]

Canvas 1536x1024, exactly 10 icons in a 2 rows x 5 columns grid.

Row 1 (INACTIVE state), left to right:
  a house | a stack of two list cards | a plus sign inside a circle |
  a trophy cup | a person bust

Row 2 (ACTIVE state), left to right: the exact same five shapes again.

CRITICAL FOR THIS SHEET:
- Row 1 icons are OUTLINE ONLY: a thick gold stroke with a HOLLOW interior that
  is FULLY TRANSPARENT. Do not fill the interior with black, dark brown, or any
  color — the app's card color must show through the hole.
- Row 2 icons are the SAME shapes filled solid with gold.
- Row 1 and Row 2 must match exactly in shape, size and position. They are the
  two states of one tab — if the shapes differ, the icon appears to change when
  the user taps it.
```

> ⚠️ **10칸은 모델이 자주 틀린다.** 칸 수가 안 맞거나 두 행의 모양이 갈리면
> §3의 재지시 문구를 쓴다. 두 번 시도해도 안 되면 **1행씩 두 장으로 나눠 받되,
> 두 번째 장에 첫 번째 장을 첨부**해서 모양을 맞춘다.

### 시트 E · 챌린지 8장

> ⚠️ **만들기 전에 가이드 §3 시트 E의 경고를 읽는다.** 표시 크기가 13~22px라
> 이미지가 아니라 이모지·SVG가 맞을 수 있다.

```
[공통 머리말]

Canvas 1536x1024, exactly 8 icons in a 2 rows x 4 columns grid.

THE 8 ICONS (left to right, top to bottom):
1. A closed padlock
2. A checkered flag on a pole
3. A thumbs-up hand
4. A trash can with a lid
5. Two hands shaking
6. A triangle with an exclamation mark
7. A camera body with a round lens
8. A crown with three points

These are the smallest icons in the app — keep every shape extremely simple and
the strokes extra thick. Drop any small detail that would not survive at 20px.
```

### 시트 F · 스트릭·친구 4장 — **현재 미사용, 필요할 때만**

```
[공통 머리말]

Canvas 1024x1024, exactly 4 icons in a 2 rows x 2 columns grid.

THE 4 ICONS (left to right, top to bottom):
1. A burning flame, filled solid with warm orange-gold
2. The same flame shape, OUTLINE ONLY with a hollow transparent interior
3. Two person busts side by side, the front one larger
4. Two person busts with a small plus sign beside them

Icons 1 and 2 must be the same flame in two states — filled and hollow.
```

---

## 3. 안 나올 때 재지시 문구

받은 그림이 §2의 수치에 미달하면 **처음부터 다시 쓰지 말고** 아래를 이어 보낸다.
같은 대화에서 고치면 나머지 특성이 유지된다.

| 증상 | `check-ui-icons.py` 신호 | 이어서 보낼 말 |
|---|---|---|
| 선이 가늘다 | `획 5.6%` | `The strokes are far too thin. Redraw with the stroke weight DOUBLED — at least 21 pixels on a 1024 canvas. Keep everything else identical.` |
| 흐릿·반투명 | `불투명 51%` | `The strokes look soft and airbrushed. Redraw with 100% opaque flat color and hard crisp edges, like a vector icon. No feathering, no glow.` |
| 검게 채워짐 | `대비 1.0:1` | `The shapes are filled with dark color, which is invisible on a near-black card. Redraw with the bodies filled in GOLD #e8b84b. Detail lines go in a darker gold on top of the gold body.` |
| 배경이 생김 | (알파가 0이 아님) | `Remove the background entirely. The output must have a fully transparent alpha channel — no dark backdrop, no glow, no vignette behind the icons.` |
| 발광이 있다 | 얼룩 · `불투명` 미달 | `Remove all glow and light bloom around the icons. Flat vector only.` |
| 칸 수가 틀림 | 자를 때 오류 | `The grid is wrong. I need exactly {N} icons in a {R} rows x {C} columns grid, evenly spaced. Redraw with that exact layout.` |
| 글자가 들어감 | — | `Remove all text, numbers and labels. The icons must contain no characters of any kind.` |
| 행끼리 모양이 다름 | (시트 D) | `Row 2 must be the exact same five shapes as Row 1, only filled solid instead of hollow. Redraw so the shapes match one-to-one.` |

**같은 지적을 세 번 해도 안 고쳐지면 그 시트는 접는다.** 1차에서 스크립트로
밝기·감마·단색 칠하기를 차례로 보정해 통과시키려 했고, 전부 원화를 죽였다.

---

## 4. 이미지 모델로 안 될 때 — SVG

여기 있는 아이콘은 전부 **단색 기하 도형**이다(과녁·돋보기·시계·집·자물쇠…).
이런 것은 이미지 생성보다 SVG가 모든 면에서 낫다.

| | 생성 이미지 | SVG |
|---|---|---|
| 획 굵기 | 운에 맡긴다 | `stroke-width`로 지정 |
| 작은 크기 | 뭉갠다 | 어느 크기든 선명 |
| 색 | 자산에 구워짐 | `currentColor` — CSS로 바꾼다 |
| 활성/비활성 | 자산 2벌 | `fill` 하나만 바꾼다 |
| 용량 | 장당 8~13KB | 장당 1KB 미만 |
| 자르는 스크립트 | 필요 | 불필요 |
| 검사 스크립트 | 필요 | 불필요 |

원래 설계 문서도 그렇게 정해 뒀다 —
`specs/2026-08-07-exercise-picker-image-assets-design.md` §5:

> 단순 아이콘은 AI 이미지가 아니라 코드 기반 SVG로 만든다. 작은 크기에서도
> 선명하고 선택 상태의 색을 코드로 바꿀 수 있기 때문이다.

**시안의 '골드 느낌'은 SVG에서도 그대로 낼 수 있다** — `stroke="#e8b84b"` 하나면
된다. 잃는 것은 1차 시안의 발광 질감인데, 그건 **어차피 잘라 내야 하는 것**이었다
(가이드 §0 원인 ②).

이미지로 가는 것이 맞는 자산은 **히어로 일러스트**
(`record-assets/exercise-picker-hero.webp`)처럼 **크게 보이는 그림**이다.
거기는 질감이 살고, 축소 문제가 없다.
