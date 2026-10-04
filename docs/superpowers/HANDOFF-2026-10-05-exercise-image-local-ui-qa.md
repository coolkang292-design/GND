# 운동 이미지 로컬 실제 앱 QA — 4 PASS / 0 FAIL

사용자 지시: 768px최소셀 기준 잠정해제, 기존 PNG4개만 로컬 테스트 자산으로 연결. 대량 생성·production DB·Storage·운영 적용 금지.

## 결과

| 운동 | 선명도/식별 | 레이아웃 | 404 대체 아이콘 | 검색/선택 | 최종 |
|---|---|---|---|---|---|
| 체스트프레스 머신 | PASS | PASS | 가슴 PASS | PASS | PASS |
| 덤벨 레터럴 레이즈 | PASS | PASS | 어깨 PASS | PASS | PASS |
| 바벨 로우 | PASS | PASS | 등 PASS | PASS | PASS |
| 사이클 | PASS | PASS | 유산소 PASS | PASS | PASS |

원본1254×1254 → 셀627×627 → sRGB PNG512×512. 확대0개, 이번 생성0회. 627px만으로 FAIL 처리하지 않는다.
**2×2 생성→512PNG 축소 방식은 최종 제작 방식 후보로 승인.** 전체 생성/적용 승인은 아직 없다. 새 이미지도 계속 운동별 QA해야 한다.

## 실제 앱에서 확인한 범위

- 개발 서버 `http://localhost:3000/image-local-qa`: 앱의 실제 `ExercisePicker`·`ExerciseThumbTile`·Next Image·GND CSS를 사용. 모형 이미지 목록을 새로 그린 것이 아니다.
- 기본335개 snapshot을 전달하고 네 운동 각각 검색→선택→선택한4개 추가까지 조작. 결과가 메모리에만 표시되는 검수 환경이다.
- 화면375×812 및430×932: 운동 그림48×48CSS px, 행 높이69px, 행 너비343/398px. 가로 넘침·운동명 겹침 없음.
- 운동 정의와 UUID별 그림을 재대조. 머신 앞으로 밀기, 덤벨 옆으로 들기, 상체 숙인 바벨 로우, 고정식 자전거를 48px로 구별했다. 미세 근육선까지 읽는 용도는 아니다.
- `?trial=1`: 동일 컴포넌트에서4개 동시 비교. `&broken=1`: 실제 없는 UUID파일404를 요청. 오류 처리 완료 후 부위 아이콘30px, 타일48px/행69px 유지, 검색/선택/추가 기능 유지.
- 오류 시험 최초 서버/브라우저 src 불일치를 발견하고 query를 서버에서 React context로 전달하도록 수정. 새로고침 후 정상/404 모두 이미지 로딩 완료 확인.
- 현재 브라우저 viewport override는 reset했다. 검수 탭/개발 서버를 로컬 재확인용으로 남겼다.

검수판정은 Codex의 직접 시각검토다. 독립 운동 전문가, 실제 아이폰, 로그인된 `/record` 바깥 흐름과 기록 저장은 미검증이다. 운영DB를 변경하지 않기 위해 해당 저장 흐름은 이번 검수 범위에서 제외했다.

## 로컬 연결과 보존

- PNG4개: `public/exercise-image-local-trial/<UUID>.png`, 원래 crop와 같은 해시, Git 제외. 원본/crop/증거는 `output/exercise-images/trial-002/`에 로컬 보관.
- 개발환경+`NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA=1` 둘 다 필요. production에서는 같은 플래그를 줘도 시험 이미지/검수 라우트 비활성.
- 로컬 layout 분기에서 AuthProvider·익명가입·유입/행동 추적을 실행하지 않아 운영DB 쓰기를 방지. 카탈로그는 기존 snapshot만 사용.
- 기존 사용자 수정 picker와 미추적 thumb/map을 보존하고 thumb에 로컬 매핑과 onError만 추가. 사용자 진행 중인 화면 변경을 함께 커밋하지 않기 위해 **앱 연결 소스 전체를 로컬 작업 상태에만 남겼다.** 이 작업의 커밋은 판정/검사/문서만 포함한다.
- 로컬 소스: `src/app/layout.tsx` 4줄 분기, `src/app/image-local-qa/`, `src/lib/domain/exercise-image-local-trial.ts`, `src/components/record/exercise-thumb.tsx`, `exercise-thumb.local-qa.test.tsx`. 이들은 이번 커밋에 포함하지 않는다.
- 로컬 연결 소스 사본 및 layout patch: `output/exercise-images/trial-002/local-source/`. 사용자 기존 파일을 지우거나 덮어쓰는 정리 작업을 하지 않았다.
- 기존335개 manifest·분류·batch·19장 기존QA는 미수정. parent manifest SHA 검증 통과. custom13개 별도관리 유지.
- 기존 trial002 요청 파일의768px는 당시 요청의 역사적 기록이며, 현행 기준은 `exercise-image-generation-policy.json`의 잠정해제다. QA에 이전 해상도FAIL을 별도 필드로 보존했다.

## 검증

- `verify-trial-002.py`:16passed/0failed, 후보 이미지4PASS/0FAIL, 확대 거부/원본해시/기존manifest/Screenshot해시 확인.
- 기존 `verify.py`:22passed/0failed,335coverage. 첫5×2실패0PASS/10FAIL 기록은 유지.
- 새 관련 테스트3passed: production 차단, 개발환경 opt-in 필수, 이미지 오류→부위아이콘 및 다른src복구.
- 전체228파일3933테스트 PASS. typecheck PASS(검수화면 필수콜백 누락 발견 후 저장 없는 null콜백으로 보완).
- build PASS. lint0errors/기존경고4개. 전체검사에서 시험용 img mock 경고2개를 발견해 명시alt/시험mock설명으로 수정 후 관련6파일 lint0errors/0warnings 및 관련3테스트 재통과.
- DB 조회/쓰기·Storage업로드·생성·배포·실사용자 알림 모두 이번 작업에서 실행하지 않았다.
- 코드 기준2654532. 이번 결과의 커밋은 Git 로그 참조. 이전2개 커밋과 함께 푸시 승인 대기.

## 재확인

PowerShell, `C:\Users\SAMSUNG\workout-app`:

```powershell
$env:NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA='1'
pnpm dev
```

이미 서버가3000에서 실행 중이면 새로 띄우지 말고 `http://localhost:3000/image-local-qa?trial=1`로 이동한다. 정상결과는4개48px그림, `&broken=1`에서4개부위아이콘이다. 종료는 시작한 터미널에서 Ctrl+C, 환경변수 제거는 `Remove-Item Env:NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA`.

다음할일1개: 사용자의 전체 생성 단계 승인을 기다린다. 후보 통과는 대량 생성·운영 적용 권한을 뜻하지 않는다.
