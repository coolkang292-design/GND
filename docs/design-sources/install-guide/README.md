# 설치 안내 스크린샷 — 원본 대장

`public/onboarding/install/*.webp`(앱에 실제로 들어가는 사진)의 **원본**과
그것을 만든 방법을 적어 둔다. 2026-08-21, 사장님 아이폰(iPhone OS 18.7 / Safari)
실물 촬영.

## ⚠️ 원본 PNG는 git에 없다

이 폴더의 `*.png`는 **커밋하지 않는다.** 장당 1~3MB이고, 이 저장소는
`design-sources`에 문서만 두는 방식이다(`avatar-shop/`도 같은 이유로 untracked).
**앱에 들어가는 webp(전부 합쳐 18KB)는 커밋돼 있으므로 빌드·배포에는 지장이 없다.**

다시 만들어야 할 때만 원본이 필요하다. 없으면 아래 표대로 다시 찍으면 된다.

```bash
python scripts/make-install-guide-assets.py   # 자르기 좌표와 빨간 표시 위치가 이 안에 있다
```

## 원본 목록

| 파일 | 무엇을 찍은 것 | 만들어지는 것 |
|---|---|---|
| `kakao-inapp-login.png` | 카톡 인앱 브라우저의 GND 로그인 화면 — **하단바 맨 오른쪽 공유 버튼** | `step-kakao-share.webp` |
| `kakao-share-sheet-clean.png` | 카톡 공유 시트의 **`Safari로 열기`** | `step-open-safari.webp` |
| `safari-bottombar-more.png` | 사파리 하단바 — **`···`** (카톡에서 넘어온 상태) | `step-safari-more.webp` |
| `safari-share-sheet.png` | 사파리 공유 시트의 **`홈 화면에 추가`** | `step-add-home.webp` |

미사용 보관본: `safari-more-menu.png`(`···` 메뉴의 `공유`) ·
`safari-tab-menu-unused.png`. 안내에 사진을 안 붙인 단계라 쓰지 않았다(계획서 §13-2).

## ⚠️ 다시 찍을 때 지킬 것

1. **개인정보가 안 나오게.** 첫 촬영본의 공유 시트에는 카톡 친구 프로필 사진과
   실명이 찍혀 있었다. `kakao-share-sheet-clean.png`는 그걸 지운 판이다.
   전체 화면을 그대로 쓰지 말고 **필요한 줄만 잘라라.**
2. **아이폰 세로, 1170×2532** 로 찍어라. 스크립트의 자르기 좌표가 이 해상도 기준이다.
   다르면 좌표를 다시 잡아야 한다.
3. **카톡에서 링크를 열어 시작하라.** 사파리를 직접 켜면 하단바에 공유 버튼이
   있어서 `···`이 안 나온다 — 실제 사용자가 겪는 화면이 아니다.

자세한 배경: `docs/superpowers/plans/2026-08-21-pwa-install-prompt-pipeline.md` §13
