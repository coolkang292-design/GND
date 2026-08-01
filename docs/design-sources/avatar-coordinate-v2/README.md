# 좌표 기반 아바타 v2 디자인 원본

- 기준 이미지: `reference.png`
- 첨부 원본: `C:/Users/SAMSUNG/AppData/Local/Temp/codex-clipboard-1ac50b4e-4067-43e7-9327-15f0c81b8179.png`
- 기준 캔버스: 1024 × 1536 px
- 생성일: 2026-08-01
- 사용 범위: GND 개발 서버의 좌표 기반 캐릭터 아이템 목업

`reference.png`는 사용자가 제공한 원본의 변경 없는 복사본이다. 생성된 기본 캐릭터와 아이템은 이 폴더 아래에 보관하고, 앱에서 사용하는 검증 완료본만 `public/avatar-coordinate-v2/`로 복사한다.

장착 좌표의 단일 원본은 `src/lib/domain/avatar-coordinate-manifest.json`이다. 앱과 `scripts/validate-avatar-coordinate-assets.py`가 같은 파일을 읽으므로 좌표를 바꿀 때 별도 JSON을 맞춰 수정하지 않는다. 상품 목록에는 `scripts/build-avatar-thumbnails.mjs`로 만든 192×192 WebP를 사용한다.
