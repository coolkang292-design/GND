# GND 운동 이미지 시험 파이프라인

2026-10-05. 기본 운동335개만 포함. 사용자 운동13개는 제외.
실제 생성은 GND-TRIAL-001 한 장만 승인됐으며 이미 실행했다.
최종 QA0 PASS/10 FAIL이므로 추가 생성/Storage/DB/앱 적용을 실행하지 않는다.

## 데이터와 판정

- `data/exercise-image-catalog-snapshot.json`: 읽기 전용 운영 조회의 기본 운동335개 UUID. 작성자 식별값/키 없음.
- `data/exercise-image-manifest.json`: 단일 제작 상태 원천. CSV는 재생성 가능한 내보내기.
- `data/exercise-image-batches.json`: 설명 작성261개에 대한29개 배치(시험1개 포함), 검토대기74개의10개 예약 그룹.
- `data/exercise-image-needs-review.md`: 검토대기74개 전량과 이유.
- `data/exercise-image-existing-qa.json`: 기존19개 WebP의21개 UUID 매핑/QA 후보. 현재 규격으로 재사용0개.
- `data/exercise-image-trial-qa.json`: 시험 원본/개별 PNG 해시, crop좌표, 원본칸 크기, 운동/썸네일/최종 판정.
- `data/exercise-image-custom-review.json`: 사용자 등록13개 로컬 검토 목록. 공개 Git 커밋 제외.
- `output/exercise-images/`: 원본/시험crop/미리보기/검사보고서. 실패한 실험 자산이므로 로컬 보관, Git 제외.

`DRAFT_READY`는 자세·기구·근육 설명 초안을 작성했다는 뜻이다. 전문가 승인 또는 이미지 QA PASS가 아니다.
기구가 불명확한 이름, 복합 동작, 현재 설명과 프롬프트가 충돌하는 운동은 추측하여 생성하지 않는다.
예약 그룹은 실행 가능한 배치가 아니며 정의 확인 후 순서/프롬프트를 다시 고정해야 한다.
335개에 대한 현재 계획은 UUID누락/중복이 없지만74개 정의는 미확정이다.

## 재현 명령

입력 프로그램: PowerShell. 현재 폴더: `C:\Users\SAMSUNG\workout-app`.
Python과 Pillow가 이미 설치된 현재 환경을 사용한다. 명령은 로컬 파일만 읽고 쓴다.

```powershell
python scripts/exercise-images/build-manifest.py
python scripts/exercise-images/verify.py
```

정상 결과: manifest335 / DRAFT_READY261 / NEEDS_REVIEW74 / 배치29 / 보류그룹10.
검사22passed/0failed는 **파이프라인의 매핑·격리·실패 판정이 정상**이라는 뜻이다.
이미지 품질은0PASS/10FAIL이다. 상태가 바뀌지 않으면 재작성해도 진행 상태와 배치 계획을 보존한다.
작업 종료는 명령이 끝나면 자동. 도중 정지는Ctrl+C. DB/Storage/앱 상태는 바뀌지 않는다.
로컬JSON을 되돌려야 하면Git의 해당 텍스트 변경만 검토해서 복구한다. 원본 자산이나 사용자 파일을 삭제하지 않는다.

시험 원본을 다시 잘라야 할 때만:

```powershell
python scripts/exercise-images/crop-trial.py --source output/exercise-images/sheets/GND-TRIAL-001.png
python scripts/exercise-images/record-qa.py
python scripts/exercise-images/build-manifest.py
python scripts/exercise-images/verify.py
```

같은 원본에 한정한 재crop이다. QA기록은 검토한 원본SHA에 고정되어 다른 시트로 바꾸면 거절한다.
생성 도구를 다시 호출하는 명령은 제공하지 않는다. 시험1장의 추가생성도 다음 승인 범위다.
원본1983x793 → 정규화된5x2 crop → 396~397px칸 → 비율보존 후512x512sRGBPNG.
확대가 필요했으므로 native해상도FAIL을 기록한다. 확대파일을 해상도품질PASS로 승격하지 않는다.

## 미구현/제한

대량 생성/자동 vision provider/Storage/DB연결/앱 적용은 구현·실행하지 않았다.
의미 QA는 Codex의 원본·160px·48px 이미지 직접 검토이며 독립 운동전문가 검수는 아니다.
내장 imagegen은 요청해상도를 보장하지 않았고 정확한 차감량을 반환하지 않았다.
다음 승인 전 필요사항: 원본칸512px확보 방식, 체스트프레스 머신 오생성 수정, 정상/와이드푸시업48px구별 개선.
