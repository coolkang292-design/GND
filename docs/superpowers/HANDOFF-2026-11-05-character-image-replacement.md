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

## 미검증·운영 주의

- 로그인 계정의 실제 홈·내 정보·크루 프로필·운동 완료 모달, 실제 폰은 이번에 확인하지 않음. 공용 컴포넌트와 기존 경로를 검사한 것임.
- DB 변경·배포·공지/실사용자 알림 발송 없음. 푸시와 배포는 별도.
- 같은 이미지 URL을 유지했으므로 운영 적용 시 최적화 이미지 캐시도 갱신하고, 실제 홈·내 정보에서 새 그림인지 확인해야 함. 단순 이미지 응답 200이나 `loaded=true`만으로 새 그림임을 단정하지 말 것. Next 공식 문서도 src 변경 또는 이미지 캐시 삭제를 안내함: https://nextjs.org/docs/app/api-reference/components/image#minimumcachettl
- 현재 작업 브랜치 `feat/posthog-funnel`에는 이번 변경 전부터 미푸시 `7ff3b83` 1개가 있었음. 이번 커밋까지 푸시하면 기존 커밋도 포함된다는 점을 승인 요청에 명시할 것. 기존 미추적 파일은 스테이징하지 않음.

다음 할 일: 나가는 커밋·브랜치·이미지 용량과 기존 미추적 파일을 안내하고 푸시 여부 확인. 운영 배포는 별도 승인 후 프로젝트 절차로 진행.
