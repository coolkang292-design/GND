# GND 아바타·아이템 생성 프롬프트 모음 (36장)

ChatGPT Image에 **그대로 복사·붙여넣기**하면 되도록 각 프롬프트를 자체 완결형으로 썼다.
규격 배경은 `docs/avatar-item-asset-guide.md` 참조.

---

## 사용법 — 이 순서를 지킬 것

```
① char-3.png 첨부  →  A-3 (일단하개 아바타) 생성      ← 화풍 기준점
② A-3 첨부        →  A-3b 옷 벗기기 (베이스 레이어)   ← 최종 기준점
③ 확정된 A-3b 첨부  →  A-1, A-2, A-4 ~ A-7 생성       ← 나머지 6장
④ 확정된 A-3b 첨부  →  아이템 29장 생성                ← 위치·크기 기준
```

**②를 건너뛰면 안 된다.** ①에서 나온 아바타는 후드·트랙팬츠·스니커즈·헤어밴드를
다 입고 나온다(참조로 쓴 char-3이 그 차림이라 당연하다). 그 상태로 아이템을 얹으면
후드가 티셔츠 밑으로 삐져나오고, 신발 위에 신발이 신겨진다.

**참조 이미지 첨부는 선택이 아니라 필수다.** 텍스트만으로는 GND 화풍이 재현되지
않는다 — 사람 보디빌더 몸에 개 머리를 붙인 결과가 나온다.

**그린스크린으로 만들지 말 것.** 누끼를 따도 털 가장자리에 초록 픽셀이 남아
아이템을 겹칠 때 테두리가 지저분해진다. 반드시 투명 배경으로 받는다.

각 장을 받으면 **A-3b 위에 겹쳐서** 어깨선·발바닥이 맞는지 확인한다. 어긋나면 그 장만 재생성.

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

## A-3b · 표정 완화 ← **`char-3.png` + A-3, 두 장 첨부**

A-3의 얼굴은 눈이 작고 사납고 송곳니가 나와 위협적이다. 표정만 조금 눅인다.

> ⚠️ **"cuter", "lovable", "귀엽게" 같은 단어를 쓰면 안 된다.**
> 모델이 얼굴만이 아니라 렌더링 스타일 전체를 봉제인형으로 갈아버린다.
> 실제로 1차 시도에서 조명이 평면 스튜디오로, 털이 매끈한 봉제 재질로,
> 몸이 근육 없는 동글동글한 인형으로 바뀌어 GND 화풍이 통째로 날아갔다.
>
> 대신 **구체적 변경 3개만** 지시하고 나머지는 전부 "바꾸지 말 것"으로 잠근다.
> 목표는 귀여움이 아니라 **"터프하되 적대적이지 않음"**이다.

참조를 두 장 넣는 게 핵심이다 — 화풍은 `char-3.png`에서, 포즈·레이아웃은 A-3에서.

```
Two reference images are attached.
IMAGE 1 (char-3.png) is the STYLE reference — the rendering style is law.
IMAGE 2 is the POSE and LAYOUT reference.

Produce a full-body character sheet with IMAGE 2's pose, layout and clothing,
rendered in IMAGE 1's style.

STYLE — copy from IMAGE 1 exactly. This is the most important requirement:
- Gritty semi-realistic 3D character render with heavy detail
- Individual fur strands visible, coarse and slightly unkempt
- Deep wrinkled skin folds across the muzzle and brow
- Strong directional warm golden rim light from the upper left
- Deep dark shadows down the right side of the body and under the jaw
- High contrast, cinematic, rich saturated color
- Athletic muscular stocky build with real shoulder and arm mass under the fur

DO NOT produce any of the following:
- a soft plush toy, a stuffed animal, a smooth vinyl collectible figure
- flat even studio lighting, or a shadowless evenly-lit render
- a rounded weightless body with no visible muscle
- pastel, washed out, or low-contrast coloring

POSE, LAYOUT AND CLOTHING — copy from IMAGE 2 exactly:
- Standing upright, facing the camera, symmetrical, relaxed A-pose
- Tight black sleeveless tank top and tight black short tights, bare paws
- No shoes, no hat, no accessories, nothing in the hands
- Fully transparent background, no backdrop, no ground, no cast shadow

FACE — start from IMAGE 1's face and make these three changes only:
1. Enlarge the eyes about 1.3x and add one bright round catchlight in each.
   The gaze stays intense and focused.
2. Relax the angry V-shaped brow furrow to neutral — alert, not hostile.
3. Remove the protruding fangs. Closed mouth, corners very slightly lifted.

Keep everything else about the face from IMAGE 1: the deep wrinkles, the heavy
brow ridge, the broad jaw, the coarse fur. The character must still read as
tough and characterful — approachable, not harmless.

GENDER: strictly gender-neutral.
CANVAS: 1024x1536, transparent PNG.
LAYOUT: head top 8%, eye line 20%, shoulder line 34%, waist 55%,
soles 93%, centered, shoulder width 48% of canvas width.
```

**표정 강도 조절 — 이 두 줄만 만진다**

| | 더 부드럽게 | 더 사납게 |
|---|---|---|
| 눈 크기 | `1.3x` → `1.5x` | `1.3x` → `1.15x` |
| 눈썹 | `to neutral` → `to slightly raised` | `to neutral` → `keep a light furrow` |

`DO NOT produce` 블록은 어느 경우에도 지운다.

---

### A-1 ~ A-7 공통 (A-3 제외) · **확정된 A-3b 첨부**

**7장의 차이는 표정뿐이다.** 털 상태나 오라를 단계별로 그려 넣지 않는다.
두 가지 이유다.

1. **옷에 가려진다.** 몸통 털이나 팔 주위 오라를 아바타에 그려도 상의를 입는
   순간 덮인다. 옷에 안 가려지는 건 얼굴뿐이다.
2. **아이템 호환성.** 표정만 바꾸면 목 아래가 7장 모두 픽셀 단위로 동일해져
   어느 단계에서든 아이템이 정확히 맞는다.

단계별 오라는 이미지에 굽지 않고 **CSS glow 레이어**로 합성 스택 최상단에 얹는다
(`docs/avatar-item-asset-guide.md` §4). 그래야 패딩을 입어도 오라가 옷 바깥
실루엣을 따라 살아난다.

아래 6개는 전부 이 문장으로 시작한다. 뒤의 EXPRESSION 블록만 다르다.

```
Use the attached image as the exact reference. Reproduce it identically —
same character, same gritty semi-realistic 3D render style, same coarse fur
detail, same warm golden rim lighting, same deep shadows and high contrast,
same stocky muscular build, same body proportions, same A-pose, same camera
angle, same canvas placement, same body size, same tight black sleeveless tank
top and tight black short tights, same bare paws, same fully transparent
background.

Change ONLY the facial expression, exactly as described below.

Everything from the neck down must be pixel-identical to the attached image.
Do not change the fur, do not add any aura, glow, sparks or particle effects,
do not change the lighting, do not change the rendering style.

Do NOT turn this into a soft plush toy or a flat evenly-lit render.
The gritty style of the attached image is law.

GENDER: strictly gender-neutral.
CANVAS: 1024x1536, transparent PNG. No backdrop, no ground, no cast shadow.
```

## A-1 · 개노답

```
[위 공통 문단]

EXPRESSION — exhausted and defeated:
- Eyes half-closed and heavy-lidded, gaze cast downward
- Outer ends of the brows drooping
- Mouth corners pulled down, jaw slack
- Ears hanging lower than in the reference
MOOD: worn down and out of fuel, but still on its feet.
```

## A-2 · 눈떴개

```
[위 공통 문단]

EXPRESSION — just woke up:
- Eyes wide open for the first time, alert, looking straight ahead
- One brow raised noticeably higher than the other
- Mouth slightly open, as if caught mid-realization
- Ears perked up
MOOD: the moment of noticing something has to change.
```

## A-4 · 물고가개

```
[위 공통 문단]

EXPRESSION — grinding through it:
- Eyes narrowed to a hard focused squint
- Brows pulled tightly together at the center
- Teeth clenched, jaw muscles visibly tensed
- Deep strain lines across the brow
MOOD: refusing to let go, hanging on by sheer stubbornness.
```

## A-5 · 미쳐보개

```
[위 공통 문단]

EXPRESSION — gone past reason:
- Eyes bulging wide, whites visible all around the iris, pupils small and sharp
- Brows raised high and asymmetric
- Wide open snarling grin with teeth bared
- Face flushed, veins faintly visible at the temple
MOOD: manic, running on pure adrenaline.
```

## A-6 · 판을짜개

```
[위 공통 문단]

EXPRESSION — calculating:
- Eyes narrowed to cool half-lidded slits, gaze steady and unbothered
- One brow arched high, the other level
- A small lopsided smirk lifting only one corner of the mouth
- Head absolutely still, no strain anywhere on the face
MOOD: several moves ahead and enjoying it.
```

## A-7 · 전설이개

```
[위 공통 문단]

EXPRESSION — serene authority:
- Eyes half-closed in complete ease, irises a deep warm gold
- Brows relaxed and level, no tension anywhere
- Mouth closed with the faintest confident curve
- Chin lifted just slightly, looking slightly down at the viewer
MOOD: nothing left to prove.
```

---

# PART 2 — 착용 아이템 23장

**전부 확정된 A-3b를 첨부한다.** 아래 공통 문단 + 아이템 줄로 조합한다.

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
- [ ] 아바타: A-3b 위에 겹쳤을 때 어깨선·발바닥이 맞는가
- [ ] 아바타: 사람 비율이 아니라 다부진 3~4등신인가
- [ ] 아바타: 기본 복장이 밀착 검은 탱크톱+숏타이츠+맨발인가
- [ ] 아이템: 캐릭터가 같이 그려지지 않았는가
- [ ] 아이템: A-3b 위에 겹쳤을 때 위치가 맞는가
- [ ] 상의·하의: 밑의 검은 베이스 레이어가 가장자리로 삐져나오지 않는가
