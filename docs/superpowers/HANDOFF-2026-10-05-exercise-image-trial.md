# 운동 이미지 관리표·시험 배치 — 2026-10-05

**시험까지만 실행. 전체생성/Storage/운영DB/앱변경/배포 없음. 시험 실패로 확장 중단.**

기준코드ed7e873. 기존 작업 중인 썸네일·추천 코드·19개WebP·스크린샷은 수정/스테이징하지 않는다.

- 운영 읽기조회348개=기본335+custom13. 이번manifest335개 UUID와 정확히 대응, 누락/중복0.
- 자세·기구·타깃근육/visual_family초안261개. NEEDS_REVIEW74개(전량`data/exercise-image-needs-review.md`).
- custom13개는 별도NEEDS_REVIEW로 로컬만 관리. 공개Git파일에는 포함하지 않는다.
- 실행가능한 설명초안 배치29개(261개, 시험1개포함), 정의미확정 예약그룹10개(74개). 다음 생성은 미승인.
- 기존19장 직접검토/21UUID매핑. 운동형태 일치 후보17장, pulley/pullover불명확2장. 모든파일160pxWebP로512pxPNG기준미충족, 즉시재사용0장. `DONE`승격없음.
- 내장imagegen1회, 시험10종. 프롬프트`data/exercise-image-trial-prompt.txt`와 기존전신시트참조. 요청2560x1024, 실제1983x793PNG RGB.
- 5x2칸을정규화좌표로자동crop:원본396~397px. 비율보존후512x512sRGBPNG10개(각UUID파일명). 확대여부를명시하고native해상도FAIL10개.
- 운동형태9PASS/1FAIL(체스트프레스머신이케이블플라이형태),48px식별7PASS/3FAIL(머신+일반/와이드푸시업),최종0PASS/10FAIL. 대상근육외파란강조도보임.
- QA는Codex시각검토,독립운동전문가검수아님.261개정의는DRAFT_READY이며전문가승인표시가아님.
- 파이프라인검사22passed/0failed:UUID전량대응,review격리,slot연결,실패주입5종,실제PNG/profile/hash/해상도,QA실패유지,CSV대응.재작성멱등성통과.
- 프로젝트 lint0errors/기존경고4개, typecheck 통과, 전체227파일3930테스트 통과, build 성공(exit0).
- 실물검토:원본시트·crop160px대지·48px대지를직접봤다.앱화면변경없음,개발서버/앱렌더검증은수행하지않음.
- 생성원본/실험PNG약5.08MB는`output/exercise-images/`로컬보관.Git커밋제외.실제사용량/금액은도구미반환으로미검증.
- 푸시승인은미요청/미실행.배포/DB마이그레이션/알림발송없음.

다음할일1개: 생성방식수정시험의승인.현방식전체확장은권장하지않는다.

재현절차/제한은 `scripts/exercise-images/README.md`. 요청은 기본335 전체 제작관리와 시험1개까지이고, 허용범위를 넘어 추가 생성하지 않는다.

## 시험 10종 판정

아래 운동 형태 판정은 Codex 시각 검토다. 원본 칸512px 미달 때문에 최종 판정은 모두 FAIL이다.

| 슬롯 | 운동 | 운동 형태 | 48px 식별 | 최종 |
|---|---|---|---|---|
| 1 | 인클라인 벤치프레스 | PASS | PASS | FAIL |
| 2 | 덤벨 플라이 | PASS | PASS | FAIL |
| 3 | 체스트프레스 머신 | FAIL | FAIL | FAIL |
| 4 | 푸시업 | PASS | FAIL | FAIL |
| 5 | 와이드 푸시업 | PASS | FAIL | FAIL |
| 6 | 덤벨 레터럴 레이즈 | PASS | PASS | FAIL |
| 7 | 시티드 덤벨 숄더 프레스 | PASS | PASS | FAIL |
| 8 | 바벨 로우 | PASS | PASS | FAIL |
| 9 | 레그 익스텐션 | PASS | PASS | FAIL |
| 10 | 사이클 | PASS | PASS | FAIL |

## 결과 확인 파일

- 관리표: `data/exercise-image-manifest.json`, `data/exercise-image-manifest.csv`
- 검토대기 목록74개: `data/exercise-image-needs-review.md`
- 배치계획: `data/exercise-image-batches.json`
- 기존 이미지 매핑/QA: `data/exercise-image-existing-qa.json`
- 시험 상세검사: `data/exercise-image-trial-qa.json`
- 원본: `output/exercise-images/sheets/GND-TRIAL-001.png`
- 개별 PNG: `output/exercise-images/cropped/<exercise_id>.png`
- 160px 비교표: `output/exercise-images/reports/trial-contact-160.png`
- 48px 비교표: `output/exercise-images/reports/trial-thumbnails-48.png`

**판단: 이 방식으로 나머지 전체를 자동 생성하면 안 된다.**
한 번의 시트 생성이10개의 원본512px 품질을 보장하지 않았고, 운동 변형을 잘못 그렸다.
다음 수정시험은 실제 해상도 제어 가능 여부와 적은 운동 수/기구별 배치 등의 대안을 검토한 뒤 별도 승인을 받는다.
