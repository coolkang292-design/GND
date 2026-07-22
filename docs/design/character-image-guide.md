# GND 7단계 캐릭터 이미지 생성 가이드

> 목적: 홈·내 정보 화면에 쓰일 **불독 캐릭터 7종**을 일관된 그림체로 생성하기 위한 지침.
> 참고 목업: 사용자 제공 "7단계 캐릭터 진화 콘셉트" 이미지.
> 대상 툴: Midjourney / DALL·E 3 / Firefly 등 텍스트-투-이미지 도구.

---

## 0. 한눈에 보기

- **총 7장** (한 단계 = 5레벨 구간). 35장 아님.
- 모든 장이 **같은 캐릭터·같은 그림체·같은 화면비**여야 시리즈로 보인다.
- 진화 축: **무채색·웅크림 → 유채색·당당함 → 황금빛·전설**. 톤이 점점 밝고 강해진다.
- 배경 씬을 포함한 **통 일러스트**로 뽑는다(그대로 카드 배경으로 사용).

---

## 1. 기술 규격 (필수 — 이대로 맞출 것)

| 항목 | 값 |
|---|---|
| 화면비 | **3:4 세로** (Midjourney `--ar 3:4`) |
| 해상도 | 가로 **900px 이상** (원본은 최대한 크게) |
| 형식 | PNG 또는 WebP |
| 배경 | **씬 포함**(투명 아님). 인물이 프레임 중앙~하단 |
| 여백 | 상단에 하늘/조명 여백 확보(카드에서 이름·레벨 텍스트가 얹힘) |
| 파일명 | `char-1.png` ~ `char-7.png` (단계 순서) |
| 저장 위치 | `public/characters/` |

> 작은 트리 썸네일(7개)은 이 통 이미지를 코드에서 자동 축소하므로 **따로 만들 필요 없음.**

---

## 2. 공통 스타일 시트 (7장 전부 동일하게 유지)

모든 프롬프트 앞에 아래 "베이스"를 붙인다. **이 문장은 절대 바꾸지 말 것** — 캐릭터 동일성의 핵심이다.

**베이스 프롬프트 (영문, 복붙용):**
```
A muscular anthropomorphic English bulldog character, semi-realistic 3D
render with gritty comic-book grading, thick expressive brow, strong jaw,
detailed fur, cinematic dramatic rim lighting, dark moody atmosphere,
mobile game hero card art, full or 3/4 body, centered vertical composition,
highly detailed, --ar 3:4
```

**한글 요지:** 근육질 의인화 불독 · 반사실적 3D + 거친 코믹 톤 · 두꺼운 눈두덩과 강한 턱 · 시네마틱 림라이트 · 세로 3:4 · 모바일 게임 히어로 카드 아트.

**공통 네거티브 (넣을 수 있는 툴에서):**
```
--no text, letters, watermark, logo, extra limbs, cute chibi, flat cartoon,
low detail, blurry
```

### 일관성 유지 3원칙
1. **같은 seed 재사용** — Midjourney면 첫 장에서 마음에 드는 컷의 `--seed` 값을 뽑아 나머지 6장에 동일 적용.
2. **캐릭터 레퍼런스 고정** — Midjourney `--cref [1번 이미지 URL]` 또는 DALL·E는 "same bulldog character as before" 명시.
3. **베이스 문장 절대 고정** — 단계별로는 **표정·포즈·의상·배경·조명·색**만 바꾼다.

---

## 3. 진화 축 요약표 (색·조명·불꽃의 흐름)

| # | 단계 | 레벨 | 핵심 상태 | 지배 색 | 조명/분위기 | 불꽃 |
|---|---|---|---|---|---|---|
| 1 | 개노답 | 1~5 | 무기력·후회, 안 움직임 | 무채색 회색 | 어둡고 침침, 뒷골목 | 꺼짐 |
| 2 | 눈떴개 | 6~10 | 깨달음·첫 행동 | 차가운 청록 | 새벽빛 한 줄기 | 점화(작게) |
| 3 | 일단하개 | 11~15 | 실행·습관 시작 | 초록 | 활동적, 아침 | 성장 |
| 4 | 물고가개 | 16~20 | 몰입·끈기 | 보라·남색 | 집중, 실내 조명 | 강렬 |
| 5 | 미쳐보개 | 21~25 | 한계 돌파 | 보라+번개 | 폭발적, 스파크 | 폭발 |
| 6 | 판을짜개 | 26~30 | 창조·시스템·확장 | 주황·황금 | 도시 야경, 따뜻함 | 확산 |
| 7 | 전설이개 | 31~35 | 영향력·유산 | 황금빛 | 장엄, 스카이라인 | 영원 |

---

## 4. 단계별 개별 프롬프트

각 항목은 **[영문 프롬프트]** = 베이스 뒤에 붙여 사용, **[한글 메모]** = 방향 설명.

### 01. 개노답 (Lv.1~5) — `char-1.png`
- **[영문]** `..., wearing a worn gray hoodie, slouched and sitting on dirty concrete steps in a dark grimy back alley, defeated hopeless expression, dull desaturated grey palette, cold dim lighting, no fire, graffiti wall background`
- **[한글]** 낡은 회색 후드, 더러운 뒷골목 계단에 웅크려 앉음. 무기력·후회. 채도 낮은 회색, 불꽃 없음.

### 02. 눈떴개 (Lv.6~10) — `char-2.png`
- **[영문]** `..., wearing a plain office shirt, standing up for the first time in a dim office at dawn, awakening determined look, first faint spark of fire in the background, cool teal palette with a single beam of morning light`
- **[한글]** 평범한 셔츠, 어스름한 새벽 사무실에서 처음 일어섬. 깨달음·결심. 청록 톤 + 새벽빛 한 줄기, 작은 불씨 점화.

### 03. 일단하개 (Lv.11~15) — `char-3.png`
- **[영문]** `..., in athletic workout clothes, mid-stride running/starting to move with open notebook nearby, energetic focused expression, growing warm fire glow, fresh green and morning palette, active dynamic pose`
- **[한글]** 운동복, 막 달리기 시작하는 역동적 자세, 옆에 노트. 실행·습관. 초록 톤, 커지는 불꽃.

### 04. 물고가개 (Lv.16~20) — `char-4.png`
- **[영문]** `..., focused at a desk gripping a single goal, intense unwavering stare, biting-down determination, deep purple and navy palette, strong indoor spotlight, bright intense flame accent`
- **[한글]** 책상 앞, 목표 하나를 문 듯한 강렬한 응시. 몰입·끈기. 보라·남색, 강렬한 불꽃.

### 05. 미쳐보개 (Lv.21~25) — `char-5.png`
- **[영문]** `..., mid heavy workout lifting a dumbbell, explosive obsessed intensity, sweat and motion, lightning and electric sparks around, vivid purple palette with crackling energy, flame bursting`
- **[한글]** 덤벨을 드는 격렬한 순간, 번개·스파크. 한계 돌파. 강한 보라 + 번개, 폭발하는 불꽃.

### 06. 판을짜개 (Lv.26~30) — `char-6.png`
- **[영문]** `..., in a sharp dark suit standing before a laptop and city lights, confident leader creating systems, warm orange and gold palette, glowing city night skyline background, fire spreading warmly`
- **[한글]** 세련된 정장, 노트북·도시 불빛 앞의 리더. 창조·확장. 주황·황금 야경, 번져가는 불꽃.

### 07. 전설이개 (Lv.31~35) — `char-7.png`
- **[영문]** `..., in a luxurious suit atop a skyscraper overlooking a golden city skyline, legendary commanding aura, radiant golden light, majestic epic atmosphere, eternal glowing flame, legacy and influence`
- **[한글]** 고급 정장, 마천루 위에서 황금빛 도시를 내려다봄. 영향력·유산. 찬란한 황금빛, 영원한 불꽃.

---

## 5. 생성 순서 추천 (일관성 극대화)

1. **1번(개노답)** 먼저 여러 컷 뽑아 캐릭터 얼굴·체형 확정 → 마음에 드는 컷의 seed/이미지 확보.
2. 그 seed와 캐릭터 레퍼런스를 **2~7번에 동일 적용**하고 배경·색·포즈만 교체.
3. 7장을 나란히 놓고 **얼굴이 같은 개로 보이는지** 검수 → 튀는 장만 재생성.
4. 최종 7장을 `char-1.png`~`char-7.png`로 저장해 `public/characters/`에 넣기.

---

## 6. 검수 체크리스트

- [ ] 7장 모두 **3:4 세로**, 가로 900px+
- [ ] 같은 캐릭터로 보임(얼굴·체형·그림체 일치)
- [ ] 1→7로 갈수록 **어둡고 무채색 → 밝고 황금빛** 흐름이 읽힘
- [ ] 상단에 텍스트 얹을 여백 있음
- [ ] 이미지 안에 글자·워터마크·로고 없음
- [ ] 파일명·저장 경로 규칙 준수

---

*이 가이드는 이미지 "생성"용이다. 실제 XP·레벨 규칙·혜택 해금 설계는 별도 브레인스토밍/스펙 문서에서 다룬다.*
