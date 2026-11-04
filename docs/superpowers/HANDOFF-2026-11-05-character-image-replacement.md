# 캐릭터 이미지 7종 교체

2026-11-05. 사용자 범위: 새 성장 알고리즘은 보류하고 캐릭터 그림만 교체.

## 변경

- 제공 원본: `C:\Users\SAMSUNG\Downloads\gnd_characters_webp_7.zip`.
- 원본은 합성 일러스트에서 분리된 1024×1024 투명 WebP 7종. 번호대로 기존 1~7단계에 대응함. 7단계는 얼굴을 감춘 후드와 보라색 오라.
- 결과: `public/characters/char-1.png`~`char-7.png`, `fallback.png`(1단계와 동일). 600×800 RGBA PNG, 합계 3,113,066바이트.
- 각 원본의 알파 영역을 기준으로 여백 16px를 포함해 자르고, 560×760 안에 비율을 유지해 축소한 뒤 600×800 투명 캔버스에 중앙 배치. 다시 그리거나 외형을 생성하지 않았음. 전체 전신·오라를 보존.
- 기존 이미지 경로·DB·XP·레벨·진화 규칙·단계명·UI 소스는 변경하지 않음. `???` 이름 변경도 이번 범위가 아님. 기준 HEAD `7ff3b83`, 자산·작업 기록을 하나의 후속 커밋으로 남김.
- 원본 추출·이전 PNG 8종·시각 검수 대지·검증 메타데이터: `C:\Users\SAMSUNG\AppData\Local\Temp\gnd-character-swap-20261105`. 이전 PNG는 Git에도 남아 있음.

## 검증

- 기존 테스트: `pnpm exec vitest run src/lib/domain/progression.test.ts src/components/profile/growth-hub.test.tsx src/components/record/xp-result-modal.test.tsx` → 3파일/44건 통과.
- 8파일의 PNG 형식·600×800 크기·알파·정상 디코딩, 각 단계 원본과 대응, fallback=char-1 확인.
- 개발 서버: `NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA=1`, Next webpack, `http://localhost:3001/character-image-qa`. 기존 개발 전용 offline QA 플래그를 사용해 인증·운영 데이터 변경 없는 임시 화면에서 실제 `CharacterCard`, `CurrentStageCard`, `StageCarousel`, `StageGuideSheet`를 사용함.
- 화면에서 1~7단계를 차례로 선택해 레벨 1/6/11/16/21/26/31과 각 PNG 대응·표시 확인. 안내 열기→7행/7이미지 로드→닫기 확인. 390×844에서 카드·안내 하단 7단계까지 직접 확인. 임시 라우트 제거 및 개발 서버 종료.
- 첫 확인에서 Next 개발 이미지 캐시가 이전 그림을 반환함. `.next/dev/cache/images`만 위 임시 폴더의 `previous-next-image-cache`로 이동해 보관하고, 새 포트에서 새 그림을 재확인. 다른 캐시·사용자 파일을 삭제하지 않음.
- 추적되는 동작 코드 변경이 없어 전체 lint/typecheck/test/build는 실행하지 않음.

## 2026-11-05 운영 배포 결과

- 사용자 운영 배포 승인 후 `using-git-worktrees`로 `.worktrees/character-image-deploy-20261105`에 main을 분리. 로컬 main을 `origin/main` **e4dc6e5**로 fast-forward하고 이미지·기록 변경만 반영. 기존 미푸시 운동 탭 변경 `7ff3b83`은 제외했으며 원래 작업 브랜치와 미추적 파일은 그대로 보존.
- 배포 코드: **497af90** (`main`). 이미지 8개와 새소식 항목 `2026-11-05-character-illustrations`·작업 기록만 변경. XP·단계 판정·단계명·기존 DB 경로·기능 코드 변경 없음.
- 최신 main 기반 개발 서버 `http://localhost:3000/character-image-qa`에서 위 네 실제 컴포넌트와 `XpResultModal`을 추가로 직접 검사. 1~7단계 전환·7종 대응, 안내 7행/7이미지 로드·열기/닫기, 6→7단계 진화 모달, 390×844에서 새 그림 확인. 임시 라우트는 삭제했고 운영 소스에 포함되지 않음.
- 최종 검사: `pnpm lint` **0 errors / 기존 warnings 5**, `pnpm typecheck` 통과, `pnpm test` **270 passed / 1 skipped 파일, 4,389 passed / 1 skipped 테스트**. 임시 라우트 삭제 후 남은 `.next/dev/types` 참조는 별도 백업한 뒤 typecheck 재통과. 테스트가 생성한 snapshot 줄바꿈 변경은 diff 내용이 없음을 확인하고 검사 작업 폴더에서만 복원.
- 검증 트리 **a9e5e4cbcee9dbed8806757bcd394e4ba9034cb1**를 Git archive로 추출한 `.git` 없는 깨끗한 복사본에서 의존성을 고정 설치하고 `pnpm build` 통과. commit 트리와 일치함을 확인한 뒤 main 푸시→fetch **0 0** 확인.
- 배포 원본: `C:\Users\SAMSUNG\AppData\Local\Temp\gnd-character-prod-20261105`. 기존 `.vercel/project.json` 복사 후 CLI inspect로 **gnd4/gnd / prj_JwhGK3yIwL93CafyJXGnzsnALMdk** 대상 재확인. 최신 CLI 다운로드는 npm 캐시 잠금 오류로 실패하여 이미 설치된 공식 Vercel CLI 62.7.0을 사용함.
- CLI 로컬 배포 결과: **dpl_A1mbiVbuKwjsZSohhjBWg2kvtfj3 READY**, **https://gnd-nwi0lew58-gnd4.vercel.app**, 운영 별칭 **https://gnd-one.vercel.app**. 이전 운영 배포는 `dpl_8iSxwoS6GiXtopCR6fDKiorV5Vqg` / `gnd-90pn06i1j-gnd4.vercel.app`.
- `cache purge --type cdn`으로 CDN만 갱신. 운영 도메인의 원본 PNG **8/8 SHA-256 일치**, 최적화 **7/7 128×171 투명 PNG**, 새소식 표시 확인. 원본 1·7단계는 브라우저에서도 직접 새 그림 확인. 최적화 URL은 attachment 처리로 브라우저 직접 열기가 차단되어 파일 응답 검사로 확인했고 원본 inline URL은 정상 표시됨.
- 검증 보고서: `C:\Users\SAMSUNG\AppData\Local\Temp\gnd-character-swap-20261105\production-verified\report.json`. 설치·빌드 로그도 같은 상위 임시 폴더에 저장. 비밀값은 기록·커밋하지 않음.
- DB 변경·마이그레이션 적용·실사용자 알림 발송 없음. 새소식은 페이지 항목만 추가했으며 발송하지 않음.

## 미검증·운영 주의

- 로그인 계정의 실제 홈·내 정보·크루 프로필·운동 완료 모달, 실제 폰은 이번에 확인하지 않음. 공용 컴포넌트와 기존 경로를 검사한 것임.
- 같은 이미지 URL을 유지했으며 운영 캐시는 위와 같이 갱신·검증함. 실제 폰에서 기존 화면을 열어 둔 경우 앱을 닫고 다시 열어 확인할 것. 이미지 HTTP 200이나 `loaded=true`만으로 새 그림임을 단정하지 말 것.
- 원래 `feat/posthog-funnel`의 `7ff3b83`·`840acb9`는 그대로 로컬에 남아 있으며 해당 브랜치를 이번에 푸시하거나 배포하지 않음. 운영 반영된 것은 이미지 변경만 옮긴 main 497af90임.

다음 할 일: 실제 폰에서 앱을 다시 열어 현재 단계 캐릭터가 새 그림인지 확인.
