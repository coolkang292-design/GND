# GND 아바타·아이템 생성 프롬프트 모음 (36장)

ChatGPT Image에 **그대로 복사·붙여넣기**하면 되도록 각 프롬프트를 자체 완결형으로 썼다.
규격 배경은 `docs/avatar-item-asset-guide.md` 참조.

---

## 사용법 — 이 순서를 지킬 것

```
① char-3.png 첨부  →  A-3 (일단하개 아바타) 생성      ← 스타일 기준점
② A-3 마음에 들 때까지 반복. 확정.
③ 확정된 A-3 첨부  →  A-1, A-2, A-4 ~ A-7 생성        ← 나머지 6장
④ 확정된 A-3 첨부  →  아이템 29장 생성                 ← 위치·크기 기준
```

**참조 이미지 첨부는 선택이 아니라 필수다.** 텍스트만으로는 GND 화풍이 재현되지
않는다 — 사람 보디빌더 몸에 개 머리를 붙인 결과가 나온다.

**그린스크린으로 만들지 말 것.** 누끼를 따도 털 가장자리에 초록 픽셀이 남아
아이템을 겹칠 때 테두리가 지저분해진다. 반드시 투명 배경으로 받는다.

각 장을 받으면 **A-3 위에 겹쳐서** 어깨선·발바닥이 맞는지 확인한다. 어긋나면 그 장만 재생성.

---

# PART 1 — 아바타 7장

## A-3 · 일단하개  ← 가장 먼저. `char-3.png` 첨부

```
Using the attached image as the definitive style reference, redraw this exact
bulldog character as a clean full-body character sheet.

MATCH FROM THE REFERENCE — do not deviate:
- The same stylized 3D character illustration style (NOT photorealistic)
- The same exaggerated cartoon proportions: oversized head roughly 1/4 of total
  height, very short thick neck, broad stocky torso, short thick limbs
- Dog anatomy throughout: furry body, blunt paw-like hands and feet.
  This is NOT a human bodybuilder body with a dog head attached.
- The same fur texture, wrinkled face, large expressive scowling eyes
- The same warm golden rim lighting from the upper left with deep shadows

CHANGE FROM THE REFERENCE:
- Pose: standing upright, facing the camera directly, perfectly symmetrical,
  relaxed A-pose with arms angled about 30 degrees away from the body
- Background: FULLY TRANSPARENT. No green screen, no backdrop, no ground,
  no shadow, no glow behind the character.
- Clothing: remove all clothing from the reference. Wear ONLY a tight-fitting
  plain black sleeveless tank top and tight-fitting plain black short tights.
  Bare paws, no shoes, no hat, no headband, no accessories, nothing in the hands.
  The base layer must be skin-tight.

GENDER: strictly gender-neutral. No eyelashes, no lipstick, no bow,
no cinched waist, no chest definition.

EXPRESSION: neutral determination, jaw set, eyes forward and steady.
FUR: clean, groomed.
AURA: none.

CANVAS: 1024x1536, transparent PNG.
LAYOUT — keep these exact:
- Top of head at 8% from the top edge
- Eye line at 20% from the top
- Shoulder line at 34% from the top
- Waist at 55% from the top
- Soles of the paws at 93% from the top
- Body centered horizontally, shoulder width 48% of canvas width
```

---

### A-1 ~ A-7 공통 (A-3 제외) · **확정된 A-3 첨부**

아래 6개는 전부 이 문장으로 시작한다. 뒤의 4줄만 다르다.

```
Use the attached image as the exact reference. Reproduce it identically —
same character, same stylized 3D illustration style, same exaggerated cartoon
proportions, same dog anatomy, same A-pose, same camera angle, same canvas
placement, same body size, same tight black sleeveless tank top and tight black
short tights, same bare paws, same fully transparent background.

Change ONLY the four attributes listed below. The body, pose, clothing, and
layout must be pixel-identical to the attached image.

CANVAS: 1024x1536, transparent PNG. No green screen, no backdrop, no shadow.
GENDER: strictly gender-neutral.
```

## A-1 · 개노답

```
[위 공통 문단]

EXPRESSION: exhausted, defeated, heavy-lidded eyes looking slightly down.
FUR: dull, matted, patchy, unkempt.
AURA: none.
MOOD: someone who has given up but is still standing.
```

## A-2 · 눈떴개

```
[위 공통 문단]

EXPRESSION: just woke up, one eyebrow raised, a first spark of awareness.
FUR: still rough but no longer patchy.
AURA: a very faint warm glow at the silhouette edge.
MOOD: the moment of noticing something has to change.
```

## A-4 · 물고가개

```
[위 공통 문단]

EXPRESSION: stubborn, teeth slightly gritted, intense focused stare.
FUR: clean, with a slight sheen of sweat.
AURA: faint heat shimmer around the shoulders.
MOOD: refusing to let go.
```

## A-5 · 미쳐보개

```
[위 공통 문단]

EXPRESSION: wild-eyed intensity, slight manic grin, pupils sharp.
FUR: damp with sweat, bristling slightly.
AURA: violet electric arcs crackling faintly around the arms.
MOOD: past the point of reason.
```

## A-6 · 판을짜개

```
[위 공통 문단]

EXPRESSION: calm, calculating, faint knowing smirk, sharp confident eyes.
FUR: immaculate, well-conditioned.
AURA: thin cool blue outline light.
MOOD: in control, several moves ahead.
```

## A-7 · 전설이개

```
[위 공통 문단]

EXPRESSION: serene authority, eyes glowing faint gold, utterly composed.
FUR: pristine with a subtle golden sheen at the highlights.
AURA: warm golden light along the silhouette edge.
MOOD: nothing left to prove.
```

---

# PART 2 — 착용 아이템 23장

**전부 확정된 A-3을 첨부한다.** 아래 공통 문단 + 아이템 줄로 조합한다.

### 착용 아이템 공통 문단

```
The attached image shows the avatar this item will be layered on top of.

Draw ONLY the item described below. The character must NOT appear in the output.

Output on a 1024x1536 fully transparent canvas, with the item at the exact
position and scale it would occupy when worn by the attached avatar.

REQUIREMENTS:
- Fully transparent background. No green screen, no backdrop, no ground,
  no shadow, no glow, no product-photo staging.
- Scaled to the attached avatar's stocky cartoon proportions — oversized head,
  very short thick neck, broad torso, short thick limbs. NOT human proportions.
- Fully opaque and large enough to completely hide the avatar's black base layer
  underneath. No part of the base tank top or tights may peek out at the edges.
- Same stylized 3D illustration style as the attached image, warm rim light from
  the upper left, deep shadows, clean alpha edges.

ITEM:
```

---

## head · 3장

| 파일 | 아이템 |
|---|---|
| `nike-cap` | 나이개 캡 |
| `rayban-sunglasses` | 레이개 선글라스 |
| `burberry-bucket-hat` | 버버개 버킷햇 |

```
ITEM: A black baseball cap with a simple white curved swoosh mark on the front
panel, sitting on top of the bulldog's broad head between its floppy ears.
The ears remain outside and in front of the cap.
```

```
ITEM: Classic black wayfarer-style sunglasses with dark tinted lenses, resting
across the bridge of the bulldog's wide wrinkled muzzle. Wide enough to span
the full width of the broad face.
```

```
ITEM: A beige bucket hat with a tan, black and red plaid check pattern and a
soft downturned brim, pulled down over the bulldog's broad head. The floppy
ears stick out below the brim.
```

---

## top · 6장

| 파일 | 아이템 |
|---|---|
| `nike-drifit-tee` | 나이개 드라이핏 |
| `adidas-track-top` | 아디다개 트랙탑 |
| `northface-nuptse` | 노개페이스 눕시 |
| `moncler-puffer` | 몽클개 패딩 |
| `burberry-trench` | 버버개 트렌치코트 |
| `gucci-tracksuit-top` | 구찌개 트랙수트 상의 |

```
ITEM: A fitted black short-sleeve athletic training t-shirt in matte technical
fabric with a small white curved swoosh mark on the left chest. Cut wide and
short to fit a broad stocky torso with a very short neck.
```

```
ITEM: A black zip-up track jacket with three white stripes running down each
sleeve and a stand collar. Cut wide and short for a broad stocky torso.
```

```
ITEM: A black quilted down puffer jacket with thick horizontal baffles and a
high collar, in the classic 700-fill nuptse silhouette. Bulky and wide, cut
short to fit a stocky torso.
```

```
ITEM: A glossy black quilted designer puffer jacket with fine horizontal
baffles, a matte black shoulder patch badge, and a high zip collar.
Luxurious sheen. Cut wide and short for a stocky torso.
```

```
ITEM: A beige double-breasted trench coat with a wide collar, storm flap, belted
waist, and a tan-black-red plaid check lining visible at the open front.
Cut short and wide to fit a stocky torso, hem ending at mid-thigh.
```

```
ITEM: A dark navy zip-up track jacket with a green-and-red vertical web stripe
running down the center front and along each sleeve, gold zipper pull.
Cut wide and short for a broad stocky torso.
```

---

## bottom · 2장

| 파일 | 아이템 |
|---|---|
| `nike-tech-jogger` | 나이개 테크 조거 |
| `levis-501` | 리바개 501 |

```
ITEM: Black tapered technical jogger pants with a soft ribbed cuff at the ankle
and a small white curved swoosh mark on the left thigh. Short and wide to fit
the avatar's short thick legs.
```

```
ITEM: Classic mid-blue straight-leg denim jeans with copper rivets, a leather
patch at the back waistband, and light natural fading at the thighs. Short and
wide to fit the avatar's short thick legs.
```

---

## shoes · 4장

| 파일 | 아이템 |
|---|---|
| `adidas-ultraboost` | 아디다개 울트라부스트 |
| `jordan-1-retro` | 개조던 1 레트로 |
| `balenciaga-triple-s` | 발렌시개 트리플S |
| `gucci-horsebit-loafer` | 구찌개 홀스빗 로퍼 |

두 짝을 **한 장에** 그린다 — 아바타의 양발 위치에 각각 배치.

```
ITEM: A pair of white knit running sneakers with a thick cream-colored
segmented foam midsole and three dark side stripes. Drawn as a pair, positioned
at the avatar's two paw positions. Wide and chunky to fit broad blunt paws.
```

```
ITEM: A pair of high-top basketball sneakers in white leather with a red toe
and heel panel, black swoosh on the side, and a black ankle collar.
Drawn as a pair, positioned at the avatar's two paw positions.
```

```
ITEM: A pair of oversized chunky dad sneakers with an exaggerated multi-layered
stacked sole in cream, grey and black, and a distressed worn finish.
Drawn as a pair, positioned at the avatar's two paw positions.
```

```
ITEM: A pair of black leather slip-on loafers with a gold horsebit metal bar
across the vamp. Drawn as a pair, positioned at the avatar's two paw positions.
Wide and rounded to fit broad blunt paws.
```

---

## wrist · 3장

| 파일 | 아이템 |
|---|---|
| `apple-watch-ultra` | 애플워개 울트라 |
| `rolex-submariner` | 롤렉개스 서브멍리너 |
| `patek-nautilus` | 파텍개립 노틸개스 |

아바타의 **왼쪽 손목 한쪽에만** 그린다.

```
ITEM: A rugged titanium smartwatch with a large flat square face, orange action
button on the side, and an orange woven sport loop band. Worn on the avatar's
left wrist only. Oversized to fit a thick furry forearm.
```

```
ITEM: A stainless steel dive watch with a black dial, black rotating bezel with
minute markers, luminous round hour markers, and a steel oyster-link bracelet.
Worn on the avatar's left wrist only. Oversized to fit a thick furry forearm.
```

```
ITEM: A luxury steel sports watch with a rounded octagonal bezel, horizontally
embossed deep-blue dial, and an integrated tapering steel bracelet.
Worn on the avatar's left wrist only. Oversized to fit a thick furry forearm.
```

---

## bag · 3장

| 파일 | 아이템 | z |
|---|---|---|
| `lv-backpack` | 루이비개 백팩 | 뒤(20) |
| `chanel-flap-bag` | 개넬 클래식 플랩백 | 앞(85) |
| `hermes-birkin` | 에르개스 버킨 | 앞(85) |

```
ITEM: A brown monogram-canvas backpack with tan leather trim and rolled leather
top handles, worn on the avatar's back. Only the parts visible from the front
should be drawn: the two shoulder straps running over the shoulders and down
the chest, plus the bag edges peeking out at both sides of the torso.
```

```
ITEM: A small black quilted diamond-pattern leather handbag with a gold chain
strap and a gold interlocking-double-C clasp, hanging from the avatar's left
shoulder and resting at the left hip, in front of the body.
```

```
ITEM: A structured tan leather top-handle tote bag with two rolled handles, a
front flap with gold hardware and a small padlock, held in the avatar's right
paw at hip height, in front of the body.
```

---

## hand · 2장

| 파일 | 아이템 |
|---|---|
| `dom-perignon` | 개페리뇽 샴페인 |
| `lv-briefcase` | 루이비개 서류가방 |

```
ITEM: A dark green champagne bottle with a gold foil neck and a cream shield
label, held upright in the avatar's right paw at hip height. Scaled to a broad
blunt paw.
```

```
ITEM: A rectangular brown monogram-canvas briefcase with tan leather corners,
gold hardware and a single top handle, carried in the avatar's right paw and
hanging at hip height.
```

---

# PART 3 — prop 6장

prop은 착용품이 아니라 **아바타 옆·뒤에 놓이는 물체**다. 공통 문단이 다르다.

### prop 공통 문단

```
The attached image shows the avatar this scene item will be composited with.

Draw ONLY the object described below. The character must NOT appear in the output.

Output on a 1024x1536 fully transparent canvas, positioned and scaled as
described so that it composites naturally with the attached avatar.

REQUIREMENTS:
- Fully transparent background. No ground, no environment, no sky, no shadow
  cast onto the background, no green screen.
- Same stylized 3D illustration style as the attached image, warm rim light
  from the upper left, deep cinematic shadows, clean alpha edges.
- Scaled so the attached avatar reads as a stocky character standing at the
  described position relative to the object.

OBJECT:
```

## 차량 4장 — 아바타 **앞**에 배치 (z=100)

| 파일 | 아이템 |
|---|---|
| `tesla-model-d` | 테슬개 모델 개 |
| `porsche-911` | 포르개 911 |
| `benz-g-wagon` | 벤개 G-바겐 |
| `lamborghini-huracan` | 람보르개니 우라멍 |

차량은 캔버스 **하단 절반**을 채우고, 아바타가 차 뒤에 서 있는 구도가 되게 한다.

```
OBJECT: A sleek white electric sedan with a smooth grille-less front, seen in a
low three-quarter front view. Occupies the bottom 45% of the canvas, spanning
almost the full width, so the avatar appears standing behind it with the car in
front from roughly the waist down.
```

```
OBJECT: A silver classic-silhouette sports coupe with round headlights and a
sloping rear, seen in a low three-quarter front view. Occupies the bottom 45%
of the canvas, spanning almost the full width, so the avatar appears standing
behind it.
```

```
OBJECT: A matte black boxy luxury off-road SUV with a squared-off body, round
headlights, exposed door hinges and a spare wheel cover, seen in a low
three-quarter front view. Occupies the bottom 50% of the canvas, spanning
almost the full width, so the avatar appears standing behind it.
```

```
OBJECT: A bright yellow angular mid-engine supercar with sharp hexagonal
styling and a very low wedge profile, seen in a low three-quarter front view.
Occupies the bottom 42% of the canvas, spanning almost the full width, so the
avatar appears standing behind it.
```

## 배경 2장 — 아바타 **뒤**에 배치 (z=10)

| 파일 | 아이템 |
|---|---|
| `hangang-penthouse` | 한강뷰 펜트개우스 |
| `private-jet` | 개인 전용기 |

배경은 캔버스 **전체**를 채우되 중앙 하단이 비어야 아바타가 앞에 선다.

```
OBJECT: The interior of a luxury high-rise penthouse at golden hour — floor-to-
ceiling windows filling the frame with a wide river and a glowing city skyline
beyond, marble floor, warm amber light flooding in. Fills the entire canvas as
a background plate. Keep the lower-center area of the frame open and uncluttered
so the avatar can stand in front of it.
```

```
OBJECT: A white private jet parked on a tarmac at golden hour, seen from a
front three-quarter angle with the airstair door open and lowered. Fills the
canvas as a background plate, positioned so the fuselage sits in the upper two
thirds. Keep the lower-center area of the frame open and uncluttered so the
avatar can stand in front of it.
```

---

## 체크리스트

각 장을 받으면 확인한다.

- [ ] 배경이 **완전 투명**인가 (그린스크린·흰 배경·그림자 없음)
- [ ] 캔버스가 1024×1536인가
- [ ] 아바타: A-3 위에 겹쳤을 때 어깨선·발바닥이 맞는가
- [ ] 아바타: 사람 비율이 아니라 다부진 3~4등신인가
- [ ] 아바타: 기본 복장이 밀착 검은 탱크톱+숏타이츠+맨발인가
- [ ] 아이템: 캐릭터가 같이 그려지지 않았는가
- [ ] 아이템: A-3 위에 겹쳤을 때 위치가 맞는가
- [ ] 상의·하의: 밑의 검은 베이스 레이어가 가장자리로 삐져나오지 않는가
