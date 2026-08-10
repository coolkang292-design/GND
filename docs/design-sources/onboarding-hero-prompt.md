# 온보딩 히어로 아트 — 이미지 생성 프롬프트

> ⚠️ **규격은 이 문서가 아니라 [`onboarding-canvas-spec.md`](./onboarding-canvas-spec.md)를
> 보라** (2026-08-10). 아래 "전체 화면 한 장(1080×1920, 아트 위 50%)" 규격은 한 장을
> 세 화면(온보딩·닉네임·로그인)에 나눠 쓰는 전제였고, 그래서 화면마다 그림이 다른
> 데서 잘렸다(로그인에서는 아트의 45%가 사라진다 — 실측). 새 규격은 **화면마다 한
> 장씩** 뽑고 캔버스 크기도 화면마다 다르다.
>
> 이 문서에서 아직 유효한 것: **프롬프트 본문**(아래 영문·한국어 프롬프트),
> 문구를 그림에 굽지 않는 이유, 레이어 3장 대안, 방패 아이콘.

**목적:** 온보딩 첫 화면(`/onboarding`, step=profile)의 상단 히어로 이미지 1장.

**왜 문구를 넣지 않는가:** 시안(`어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png`)은
아트와 한글 문구가 한 장에 구워져 있다. 그대로 쓰면 ① 폰 폭마다 글자가 뭉개지고
② 문구를 고칠 때마다 이미지를 다시 뽑아야 하고 ③ 스크린리더가 문구를 못 읽는다.
**아트만 이미지로 받고 문구·입력칸·버튼은 HTML로 그린다.**

- **저장 위치:** `어플 UI 이미지/온보딩 히어로.png`
- **최종 반영 위치:** `public/onboarding/hero.webp` (내가 변환해서 넣는다)
- **규격:** 정사각형에 가까운 세로(예: 1024×1024 또는 1024×1280), PNG, 배경 **검정**
- **⚠️ 절대 들어가면 안 되는 것:** 한글·영문 **문구**, 뒤로가기 버튼, 입력칸, 버튼,
  워터마크. `GND` 워드마크만 예외로 허용한다(로고니까).

---

## 프롬프트 (영문 — ChatGPT / Midjourney / Firefly 공용)

```
A premium mobile app hero illustration on a pure black background.

Subject: a muscular bulldog mascot standing confidently with arms crossed,
wearing a black hoodie with subtle gold embroidery. Metallic brushed-gold fur
highlights, dramatic rim lighting from behind. The bulldog is positioned on the
upper left, turned three-quarters toward the viewer, stern determined expression.

To the right of the bulldog: the wordmark "GND" in heavy extended sans-serif
capitals, rendered as polished brushed gold with a beveled 3D edge and a soft
warm glow. This is the only text in the image.

Below and centered: a glowing arched golden portal — a doorway of light, double
arched doors slightly ajar with brilliant warm light spilling out, standing on a
circular tiered pedestal with concentric glowing gold rings. Light rays fan
outward from the door seam. Faint gold particles and embers drift upward.

Background: deep black with barely visible cracked-obsidian texture and a dark
circular halo behind the bulldog. The bottom half fades smoothly to pure black
so UI text can sit beneath it.

Style: cinematic 3D render, luxury black-and-gold palette (#0a0a0a black,
#e8b84b / #c9962f gold), high contrast, sharp detail, dark fitness-brand poster
aesthetic, dramatic volumetric lighting.

No text other than the "GND" wordmark. No buttons, no UI elements, no input
fields, no back arrow, no watermark, no signature, no frame or border.
```

## 한국어 프롬프트 (한글 입력만 받는 도구용)

```
순검정 배경의 프리미엄 모바일 앱 히어로 일러스트.

주인공: 검정 후드티를 입고 팔짱을 낀 근육질 불독 마스코트. 후드에 은은한 금색
자수. 브러시드 골드 톤의 털 하이라이트, 뒤에서 들어오는 강한 림 라이트. 불독은
화면 왼쪽 위에 3/4 측면으로 서 있고 단호한 표정.

불독 오른쪽: "GND" 워드마크를 두껍고 넓은 산세리프 대문자로, 광택 있는 브러시드
골드에 입체 베벨과 따뜻한 글로우를 준다. 이미지 안의 유일한 글자다.

아래 중앙: 빛나는 아치형 황금 포털. 빛으로 된 문이 살짝 열려 따뜻한 빛이 쏟아져
나오고, 동심원 골드 링이 있는 원형 계단 받침 위에 서 있다. 문틈에서 광선이
퍼지고 금색 입자와 불티가 위로 떠오른다.

배경: 깊은 검정에 거의 안 보이는 갈라진 흑요석 텍스처, 불독 뒤에 어두운 원형
헤일로. 아래쪽 절반은 순검정으로 부드럽게 사라져서 그 위에 UI 문구를 올릴 수 있게.

스타일: 시네마틱 3D 렌더, 블랙&골드 럭셔리 팔레트(검정 #0a0a0a, 골드 #e8b84b /
#c9962f), 높은 대비, 선명한 디테일, 어두운 피트니스 브랜드 포스터 느낌,
드라마틱한 볼류메트릭 라이팅.

"GND" 워드마크 외의 글자 금지. 버튼·UI 요소·입력칸·뒤로가기 화살표·워터마크·
서명·테두리 금지.
```

## 참고 이미지로 같이 넣을 것

시안을 **참고 이미지(reference)** 로 첨부하면 톤이 훨씬 잘 맞는다:

- `어플 UI 이미지/블랙 골드 GND 탈출 포털 로그인 화면.png` — 색·조명·불독 포즈 기준
- `public/characters/char-7.png` — 앱이 쓰는 캐릭터 톤

첨부할 때 덧붙일 한 줄: `이 이미지와 같은 색감·조명으로, 글자와 UI만 모두 제거한
아트 버전을 만들어 주세요.`

## 받은 뒤 확인할 것

1. 문구가 정말 없는가 (`GND` 워드마크만)
2. 아래쪽 1/3이 순검정으로 떨어지는가 — 그 위에 흰 문구가 올라간다
3. 불독 얼굴이 이미지 상단 10% 안에 잘려 있지 않은가 — 폰에서 위가 잘린다
4. 세로 1000px 이상인가

---

# ⭐ 권장 — 전체 화면 한 장 (2026-08-08 사용자 제안, 이걸로 간다)

사용자 제안: *"불독·황금문·GND는 그대로 두고 나머지를 공백으로 남기고 그 위에
텍스트를 추가하면 되지 않아? 사진 사이즈만 정해주면?"*

**맞다. 이게 레이어 3장보다 낫다.** 오려낼 일이 없어 얼룩 위험이 0이고, 자산도 한
장이며, 화면이 "위에 사진 한 장 붙인 것"이 아니라 **한 장면**으로 보인다.

## 규격 — 이 수치대로 뽑아 주세요

| | |
|---|---|
| **캔버스** | **1080 × 1920** (9:16), PNG |
| **배경** | 순검정 `#0a0a0a` — 투명 아니어도 된다 |
| **아트 영역** | **위에서 0 ~ 50%** (y 0 ~ 960px). 불독·GND 워드마크·황금문·발판이 전부 이 안에 |
| **빈 영역** | **아래 50%** (y 960 ~ 1920px). **완전히 비운다** — 여기에 문구·입력칸·버튼이 HTML로 올라간다 |
| **여백** | 아트가 위 4%(77px)·좌우 3%(32px)에 닿지 않게 |
| **전환** | 아트 아래쪽은 검정으로 **자연스럽게 사라지게**. 가로선이 생기면 안 된다 |

앱 화면이 `max-w-[430px]` 고정 컬럼이라 이 비율이면 폰·데스크톱 모두에서 아트가
안 잘린다(넘치는 것은 아래쪽 검정뿐이라 잘려도 티가 안 난다).

## 프롬프트에 덧붙일 문장

기존 영문 프롬프트 끝에 이 두 줄을 더한다:

```
Vertical 9:16 composition. All artwork (bulldog, "GND" wordmark, golden portal,
pedestal) must sit within the TOP 50% of the canvas. The BOTTOM 50% must be
completely empty flat black (#0a0a0a) with no artwork, no glow, no particles —
this area is reserved for UI text. The artwork should fade smoothly into the
black with no visible horizontal edge.
```

한국어판:

```
세로 9:16 구도. 아트(불독·GND 워드마크·황금 포털·받침)는 전부 **캔버스 위쪽 50%
안에** 들어가야 한다. **아래쪽 50%는 완전히 빈 순검정(#0a0a0a)** — 아트도 글로우도
입자도 없어야 한다. 그 자리에 UI 문구가 올라간다. 아트 아래쪽은 검정으로 부드럽게
사라지고 가로 경계선이 보이면 안 된다.
```

## 받은 뒤 확인할 것

1. **아래 50%가 정말 비어 있는가** — 불티 하나라도 있으면 그 위 글자가 지저분해진다
2. 아트가 위 4%에 안 닿는가 — 폰 노치·상태바에 물린다
3. 아트와 검정 사이에 **가로선이 안 보이는가**
4. `GND` 세 글자가 정확한가 (생성기가 자주 틀린다: `GNO`·`CND`)

저장: `어플 UI 이미지/온보딩 히어로.png` (같은 자리에 덮어쓰면 된다)
→ `python scripts/make-onboarding-assets.py` 실행 → `public/onboarding/hero.webp`

⚠️ **새 그림을 넣으면 `make-onboarding-assets.py`의 자동 잘라내기를 꺼야 한다.**
지금 스크립트는 검은 여백을 걷어내도록 돼 있는데, 새 그림은 **그 여백이 설계의
일부**라 잘라내면 안 된다. 스크립트에 `crop=False`로 바꾸는 자리가 있다.

---

# 대안 — 레이어 3장 (지금은 안 쓴다)

⚠️ 위 "전체 화면 한 장"으로 가기로 했으므로 **이 절은 참고용이다.** 포털을 따로
움직이게 하고 싶어질 때만 꺼내 쓴다.

사용자 질문: *"이미지가 통짜라서 저게 최선이야? 문과 불독 그리고 GND를 각각 따로
제작을 해야 하나?"*

**답: 나누는 게 낫다. 다만 지금 있는 통짜 그림을 오려내면 안 된다.**

## ⚠️⚠️ 오려내기가 안 되는 이유 — 이미 한 번 당했다

통짜 렌더는 불독 뒤 후광, 포털에서 뻗는 광선, 바닥 반사가 **서로 겹쳐 구워져** 있다.
오려내면 가장자리에 검은 후광 얼룩이 남는다. `scripts/slice-ui-icons.py` 헤더에
그때 기록이 있다:

> 2026-08-07에 `.convert("RGB")`로 알파를 버리고 밝기 키잉으로 배경을 다시 빼내려
> 했다. 색 채널의 글로우가 그대로 딸려 나와 아이콘 뒤에 구름 같은 얼룩이 생겼고,
> 사용자가 "왜 얼룩이 생기는거야?"라고 지적했다.

**그래서 오려내는 게 아니라 처음부터 레이어별로 다시 뽑는다.**

## 나누면 얻는 것

| | 통짜 1장 (현행) | 레이어 3장 |
|---|---|---|
| 화면 비율 대응 | 통째로 축소만 된다 | 짧은 화면에서 **불독만 줄이고 포털은 크게** 둘 수 있다 |
| 움직임 | 없다 | 포털 맥동 · 광선 회전 · 불티 상승 — "신비로운 느낌"의 대부분이 여기서 나온다 |
| 재사용 | 이 화면 전용 | 워드마크는 로고로, 포털은 로딩·빈 화면으로 |

## 공통 규칙 — 이 세 줄이 빠지면 다시 통짜가 된다

세 장 모두 프롬프트 **맨 끝**에 붙인다. 안 붙이면 검은 배경째로 나와서 오려내기
문제가 그대로 반복된다.

```
transparent background (alpha channel), PNG-32, no background fill
subject fully isolated with clean alpha edges
no glow spill or halo outside the subject silhouette
no text, no UI, no watermark, no frame
```

받은 뒤 **반드시 확인**: 이미지 뷰어에서 배경이 **체크무늬(투명)** 로 보이는가.
검정으로 보이면 알파가 없는 것이니 다시 요청한다.

## ① 불독 — `어플 UI 이미지/레이어-불독.png`

```
A muscular bulldog mascot, upper body only, standing with arms crossed, wearing
a black hoodie with subtle gold embroidery on the chest. Metallic brushed-gold
fur highlights, warm rim light along the left edge of the silhouette. Turned
three-quarters toward the viewer, stern determined expression. Cinematic 3D
render, luxury black-and-gold palette (#0a0a0a, #e8b84b, #c9962f).

transparent background (alpha channel), PNG-32, no background fill
subject fully isolated with clean alpha edges
no glow spill or halo outside the subject silhouette
no text, no UI, no watermark, no frame
```

규격: 세로 1200px 이상. 후드 아래쪽이 **잘려도 된다**(화면에서 아래를 덮는다).

## ② 포털 — `어플 UI 이미지/레이어-포털.png`

```
A glowing arched golden portal: double arched doors slightly ajar with brilliant
warm light spilling from the seam, standing on a circular tiered pedestal with
concentric glowing gold rings. Light rays fan outward from the door seam. Faint
gold particles and embers drift upward around it. Cinematic 3D render, polished
brushed gold (#e8b84b, #c9962f), dramatic volumetric lighting.

transparent background (alpha channel), PNG-32, no background fill
subject fully isolated with clean alpha edges
no glow spill or halo outside the subject silhouette
no text, no UI, no watermark, no frame
```

⚠️ 여기만 예외가 하나 있다. **문틈에서 뻗는 광선과 불티는 남겨야 한다** — 그게 이
그림의 핵심이다. "no glow spill"은 *실루엣 밖 배경에 깔리는 뿌연 후광*을 뜻하는
것이니, 도구가 광선까지 지우면 이렇게 바꿔 다시 요청한다:
`keep the light rays and embers, but they must fade into full transparency`

규격: 정사각형에 가깝게, 세로 1000px 이상.

## ③ GND 워드마크 — `어플 UI 이미지/레이어-워드마크.png`

```
The wordmark "GND" in heavy extended sans-serif capitals, rendered as polished
brushed gold with a beveled 3D edge and a soft warm inner glow. Metallic
reflections, luxury black-and-gold branding (#e8b84b, #c9962f). This is the only
text; render exactly these three letters: G, N, D.

transparent background (alpha channel), PNG-32, no background fill
subject fully isolated with clean alpha edges
no glow spill or halo outside the subject silhouette
no watermark, no frame
```

⚠️ **글자가 정확히 `GND` 세 자인지 눈으로 확인한다.** 이미지 생성기는 글자를 자주
틀린다(`GNO`·`CND`·`GNND`). 틀리면 앱 로고가 틀린 채로 나간다.

규격: 가로로 긴 캔버스(예: 1200×500). 글자 주변 여백은 최소로.

## 받은 뒤 내가 할 것

1. `scripts/make-onboarding-assets.py`에 세 장을 추가 — 알파를 **유지**하고
   (`RGBA`) 각각 webp로 변환, 크기 상한 확인
2. `src/app/onboarding/page.tsx`의 `Hero()`를 겹침 배치로 교체 —
   포털을 중앙 기준으로 두고, 불독은 왼쪽에서 살짝 잘리게, 워드마크는 오른쪽 위
3. 포털에만 아주 느린 맥동(4초)과 광선 회전을 건다 — `prefers-reduced-motion`이면 끈다
4. 통짜 `hero.webp`는 **지우지 않는다.** 레이어가 안 좋으면 되돌릴 자리다

## 그동안의 대안 (레이어 없이도 되는 것)

통짜 그림 위에 **CSS 발광 레이어**를 포털 위치에 얹어 맥동시키는 것만으로도 인상이
꽤 달라진다. 오려내기가 없으니 얼룩 위험도 0이다. 레이어 3장이 준비되기 전까지의
임시 수단으로 쓸 수 있다.

---

## 선택 — 방패 체크 아이콘

시안의 `GND에서 친구들에게 보여질 이름이에요` 왼쪽에 있는 방패+체크 표시.
**없어도 진행 가능**하다(인라인 SVG로 그린다). 굳이 이미지로 받으려면:

```
A single icon on a transparent background: a shield outline with a checkmark
inside, drawn in brushed gold (#e8b84b) with a thin 3D beveled edge, matte dark
interior. Centered, square canvas, generous padding, no text, no background.
```

저장: `어플 UI 이미지/방패체크.png` → `public/ui-icons/shield-check.webp`
