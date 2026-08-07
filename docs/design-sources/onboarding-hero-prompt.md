# 온보딩 히어로 아트 — 이미지 생성 프롬프트

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

## 선택 — 방패 체크 아이콘

시안의 `GND에서 친구들에게 보여질 이름이에요` 왼쪽에 있는 방패+체크 표시.
**없어도 진행 가능**하다(인라인 SVG로 그린다). 굳이 이미지로 받으려면:

```
A single icon on a transparent background: a shield outline with a checkmark
inside, drawn in brushed gold (#e8b84b) with a thin 3D beveled edge, matte dark
interior. Centered, square canvas, generous padding, no text, no background.
```

저장: `어플 UI 이미지/방패체크.png` → `public/ui-icons/shield-check.webp`
