# GND 장착 아바타 · 아이템 이미지 제작 가이드

기존 7단계 풀씬 캐릭터(`public/characters/char-1~7.png`)는 **그대로 유지**한다.
이 문서는 아이템 장착 전용으로 **새로 만드는** 아바타 7장과 아이템 PNG의 규격이다.

> 기존 풀씬 캐릭터의 제작 지침은 `docs/design/character-image-guide.md`에 있다.
> 이 문서는 그것을 대체하지 않는다 — 두 세트는 용도가 다르며 공존한다.

---

## 0. 왜 따로 만드는가

기존 캐릭터는 단계마다 자세·카메라·조명이 전부 다르다(char-1은 앉아서 웅크림,
char-5는 데드리프트 로우앵글). 같은 후드티 PNG를 붙일 자리가 서로 다르므로
아이템 1종당 7벌을 그려야 한다 — 아이템이 늘어날수록 7배로 폭발한다.

장착 아바타는 **7장 전부 동일한 구도·동일한 체형**으로 만든다.
그러면 아이템 1종 = PNG 1장이고, 7단계 전부에 그대로 맞는다.

| | 성장 캐릭터 (기존) | 장착 아바타 (신규) |
|---|---|---|
| 역할 | 레벨·단계 서사 | 아이템 옷걸이 |
| 구도 | 단계마다 다름 | 7장 동일 |
| 배경 | 그림에 포함 | 투명 |
| 노출 | 홈 대표 카드, 성장 허브 | 꾸미기 화면, 피드, 크루 카드 |

---

## 1. 공통 규격 (7장 + 모든 아이템이 동일)

```
캔버스      1024 × 1536 px (2:3), PNG, 알파 채널
배경        완전 투명 (그림자·바닥·후광 없음)
구도        정면 전신, 좌우 대칭, A포즈 (팔을 몸에서 약 30도 벌림)
시선        정면
```

**신체 앵커 — 7장 모두 이 좌표를 지킨다. 아이템 정렬의 기준이다.**

| 부위 | 캔버스 상단에서 | px |
|---|---|---|
| 머리 최상단 | 10% | 154 |
| 눈높이 | 22% | 338 |
| 어깨선 | 32% | 492 |
| 가슴 중앙 | 40% | 614 |
| 허리 | 52% | 799 |
| 무릎 | 72% | 1106 |
| 발바닥 | 92% | 1413 |

```
몸 중심선     가로 50% (512px)
어깨 너비     캔버스 폭의 42% (430px)
```

> **체형은 7장 모두 동일하다.** 근육량·키·몸통 굵기를 단계별로 바꾸면
> 같은 옷이 한쪽에선 헐렁하고 한쪽에선 터진다. 성장감은 기존 풀씬 7장이
> 이미 담당하므로, 아바타는 옷걸이 역할만 한다.

**단계 차이는 이것으로만 낸다:** 표정 · 눈빛 · 털 상태 · 기본 복장 · 오라

---

## 2. 제작 순서 (일관성 확보)

1. **3단계(일단하개)를 먼저 만든다.** 중간 단계라 기준으로 삼기 좋다.
2. 마음에 들 때까지 3단계만 반복 생성한다.
3. 확정된 3단계 이미지를 **참조 이미지로 첨부**하고 나머지 6장을 생성한다.
   프롬프트에 반드시 넣을 문장:
   > "Use the attached image as the exact reference for body proportions,
   > pose, camera angle, and canvas placement. Keep the body identical.
   > Change only the facial expression, eyes, fur condition, and base clothing."
4. 7장이 다 나오면 **겹쳐서 확인한다.** 어깨선·발바닥이 어긋나면 그 장만 재생성.

---

## 3. 단계별 생성 프롬프트

### 공통 접두 (7장 모두 앞에 붙인다)

```
A full-body front-facing character portrait of a stocky bulldog character,
standing upright on two legs in a relaxed A-pose with arms angled about
30 degrees away from the body. Perfectly symmetrical, facing the camera directly.

STRICT LAYOUT REQUIREMENTS:
- Canvas 1024x1536, fully transparent background (no shadow, no ground, no glow behind)
- Top of head at 10% from the top edge
- Eye line at 22% from the top
- Shoulder line at 32% from the top
- Waist at 52% from the top
- Soles of the feet at 92% from the top
- Body centered horizontally, shoulder width 42% of canvas width
- Identical body proportions and muscle mass in every variant

Semi-realistic 3D render style, dramatic rim lighting from the upper left,
gritty urban streetwear aesthetic, high detail, clean alpha edges.
```

### 1단계 — 개노답

```
[공통 접두]

STAGE VARIATION:
Expression: exhausted, defeated, heavy-lidded eyes looking slightly down.
Fur: dull, matted, unkempt.
Base clothing: torn oversized gray hoodie with holes, faded sweatpants, bare feet.
Aura: none.
Mood: someone who has given up but is still standing.
```

### 2단계 — 눈떴개

```
[공통 접두]

STAGE VARIATION:
Expression: just woke up, one eyebrow raised, a first spark of awareness in the eyes.
Fur: still rough but slightly cleaner.
Base clothing: plain gray hoodie (intact, no holes), simple sweatpants, cheap slides.
Aura: a very faint warm glow at the edges.
Mood: the moment of noticing something has to change.
```

### 3단계 — 일단하개  ← 이 장을 먼저 만들고 기준으로 삼는다

```
[공통 접두]

STAGE VARIATION:
Expression: neutral determination, jaw set, eyes forward and steady.
Fur: clean, groomed.
Base clothing: plain black training tee, black jogger pants, basic running shoes.
Aura: none.
Mood: not motivated, just showing up anyway.
```

### 4단계 — 물고가개

```
[공통 접두]

STAGE VARIATION:
Expression: stubborn, teeth slightly gritted, intense focused stare.
Fur: clean, slight sheen of sweat.
Base clothing: black sleeveless training top, compression shorts, worn training shoes.
Aura: faint heat shimmer around the shoulders.
Mood: refusing to let go.
```

### 5단계 — 미쳐보개

```
[공통 접두]

STAGE VARIATION:
Expression: wild-eyed intensity, slight manic grin, pupils sharp.
Fur: damp with sweat, bristling slightly.
Base clothing: black cutoff hoodie vest, tactical joggers, lifting shoes, wrist wraps.
Aura: violet electric arcs crackling faintly around the arms.
Mood: past the point of reason.
```

### 6단계 — 판을짜개

```
[공통 접두]

STAGE VARIATION:
Expression: calm, calculating, faint knowing smirk, sharp confident eyes.
Fur: immaculate, well-conditioned.
Base clothing: fitted black technical training jacket, tapered black pants, premium trainers.
Aura: thin cool blue outline light.
Mood: in control, several moves ahead.
```

### 7단계 — 전설이개

```
[공통 접두]

STAGE VARIATION:
Expression: serene authority, eyes glowing faint gold, utterly composed.
Fur: pristine with a subtle golden sheen at the highlights.
Base clothing: matte black training set with fine gold trim, elite trainers.
Aura: warm golden light along the silhouette edge.
Mood: nothing left to prove.
```

---

## 4. 아이템 PNG 규격

**핵심: 아이템도 아바타와 같은 1024×1536 캔버스에 그린다.**

후드티를 그릴 때 "후드티만" 잘라서 그리는 게 아니라, **아바타가 서 있을 자리에
맞춰 투명 캔버스 위 제 위치에** 그린다. 그러면 앱에서 합성할 때 좌표 계산이
전혀 필요 없다 — 그냥 같은 자리에 겹치면 맞는다.

```
캔버스   1024 × 1536 px (아바타와 동일)
배경     완전 투명
위치     아바타 앵커에 맞춘 실제 착용 위치
조명     상단 좌측 림라이트 (아바타와 동일)
```

**아이템 생성 프롬프트 템플릿**

```
[확정된 3단계 아바타 이미지를 참조로 첨부]

Draw ONLY the {아이템 이름} positioned exactly where it would be worn on the
attached character. Output on a 1024x1536 fully transparent canvas with the item
at its exact worn position — do NOT draw the character, only the item.
Match the attached image's lighting: rim light from the upper left.
Semi-realistic 3D render style, clean alpha edges, no shadow on the background.
```

### 슬롯과 z-순서

합성은 z 낮은 것부터 쌓는다.

| z | 슬롯 | 예시 |
|---:|---|---|
| 10 | `prop` (배경) | 펜트하우스, 전용기 (아바타 뒤) |
| 20 | `bag` (뒤) | 백팩 |
| **30** | **아바타 본체** | |
| 40 | `bottom` | 조거, 데님, 슬랙스 |
| 50 | `top` | 후드, 패딩, 트렌치코트, 트랙탑 |
| 60 | `shoes` | 스니커즈, 로퍼 |
| 70 | `wrist` | 시계 |
| 80 | `head` | 캡, 선글라스, 버킷햇 |
| 85 | `bag` (앞) | 핸드백, 토트 |
| 90 | `hand` | 샴페인, 서류가방, 클러치 |
| 100 | `prop` (전경) | 슈퍼카 (아바타 앞) |

`prop`과 `bag`은 아이템에 따라 아바타 앞뒤가 갈린다 — 표의 z는 기본값이고
실제 순서는 `items.z_layer` 행 값이 결정한다. 슬롯당 동시 장착은 1개다.

아이템은 전부 **패션 또는 성공의 상징**이다 (명품 의류·신발·가방·시계,
슈퍼카·펜트하우스·전용기). 운동용품은 만들지 않는다.

---

## 5. 파일 배치

| | 위치 | 이유 |
|---|---|---|
| 아바타 7장 | `public/avatars/avatar-1~7.png` | 단계 수 고정, 배포에 포함 |
| 아이템 PNG | **Supabase Storage** `items/` 버킷 | 계속 늘어남 — 앱 배포 없이 추가 |

아이템을 `public/`에 두면 아이템 하나 추가할 때마다 재배포해야 하고 번들이
계속 커진다. Storage에 두면 **① PNG 업로드 ② items 테이블에 row 1줄**로
상점에 즉시 등장한다.
