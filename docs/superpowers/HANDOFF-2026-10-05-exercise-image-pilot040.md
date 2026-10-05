# 클로드 인수인계 — GND 운동 이미지 40개 파일럿

기준일: 2026-10-05. 이 파일은 로컬 자산 인수인계이며 운영 적용 승인이 아니다.

## 현재 상태

- 최초 PASS 29 / 재생성 후 PASS 10 / 현재 FAIL 1 / 미판정 0.
- 이미지 생성 호출 22회, 전체 40개 기준 평균 재생성 0.300회.
- 남은 FAIL: 랫풀다운.
- 전체 생성 확대 권고: 보류. 반복 오류: {"cell_boundary_clipping": 6, "wrong_highlight_muscle": 3}.
- 40개는 기본 운동 중 정의 완료 운동만 선정. 기존 NEEDS_REVIEW 74개와 사용자 등록 13개 제외.
- 이미지 내용과 실제 48px 비교대지로 검수. 독립 운동 전문가 검수와 이 40개의 실제 앱 렌더링은 미검증.

## 파일 사용법

1. `운동_UUID_파일매핑.json`의 final_qa가 PASS이며 file이 있는 행만 사용한다. 이름 검색으로 연결하지 말고 exercise_id UUID로 연결한다.
2. `PASS_512/UUID.png`가 사용 후보이다. 전부 512×512 PNG. `생성시도_512`와 `원본시트`는 과정 기록으로 앱에 연결하지 않는다.
3. 신규 기본 방식은 2×2 원본 → 셀 crop → 512×512 축소. 최초 원본은 1254×1254, 셀은 627×627. 확대하지 않았다. 실패 운동은 해당 운동만 개별 재생성한다.
4. 최초 성공 여부/재생성 횟수/각 시도 판정은 `기록/exercise-image-pilot-040-qa.json`, 전체 family별 실패율은 summary.json을 확인한다.
5. `검수/전체_실제48px.png`는 각 그림을 실제 48px로 배치한 대지다. 이름/판정 문자는 검수 대지에만 있으며 자산에는 없다.
6. `생성프롬프트`에는 내장 image_gen 생성 프롬프트를 보관한다. 기존 GND 은회색 인체/짙은 남색 배경/청색 목표 근육 스타일을 유지한다.

## 클로드가 앱 적용을 맡을 때

사용자의 별도 적용 지시를 받은 뒤 기존 ExercisePicker/썸네일 구조를 확인하여 PASS 자산을 UUID 매핑으로 로컬 연결한다. 48px 크기, 선명도/식별성, 행 높이/정렬, 로딩 실패 시 기존 부위 아이콘 fallback을 개발 서버에서 직접 확인한다. 기존 사용자 수정과 이전 로컬 QA 4개를 보존한다. `.env.local`은 운영 Supabase에 연결되므로 DB 쓰기 없는 로컬 검수부터 진행한다.

현재 production DB/schema 변경, Supabase Storage 업로드, 배포, 335개 전체 생성은 승인되지 않았다. 이 문서를 보고 자동으로 실행하지 않는다. Codex는 이미지와 검수/기록을 담당하고 앱 구현은 클로드 담당이다. 이 폴더 전달은 클로드에게 메시지를 보냈다는 뜻이 아니다.

## 추가 주의

파일럿 밖 `덤벨 스컬 크러셔` 초안에 이두 컬 정의 불일치를 발견했으며 이번 40개에는 포함하지 않았다. 기존 74개 목록을 바꾸지 않고 별도 재검토 메모로 남겼다. 261개 전체 정의가 모두 검증됐다고 가정하지 않는다.

## 오류 유형별 건수

실패한 시도 기준으로 집계하며 한 시도에 여러 오류가 있을 수 있다.

| 유형 | 건수 |
|---|---:|
| pull_behind_neck | 1 |
| cell_boundary_clipping | 6 |
| wrong_highlight_muscle | 3 |
| extra_figures | 1 |
| fly_press_ambiguity | 1 |
| leg_curl_as_extension | 1 |
| pec_deck_press_ambiguity | 1 |
| wrong_leg_press_variant | 1 |

## visual_family별 실패율

분모는 해당 family에 선정된 운동 수. 표본이 작은 파일럿이므로 전체 실패율로 일반화하지 않는다.

| family | 선정 | 최초 실패율 | 최종 실패율 |
|---|---:|---:|---:|
| bench_press | 1 | 0% | 0% |
| lat_pulldown | 1 | 100% | 100% |
| biceps_curl | 3 | 0% | 0% |
| leg_extension | 1 | 0% | 0% |
| push_up | 1 | 0% | 0% |
| row | 2 | 50% | 0% |
| shoulder_press | 2 | 50% | 0% |
| plank | 2 | 0% | 0% |
| chest_fly | 2 | 100% | 0% |
| pull_up | 1 | 0% | 0% |
| triceps_extension | 2 | 50% | 0% |
| leg_curl | 1 | 100% | 0% |
| dip | 1 | 0% | 0% |
| front_raise | 1 | 0% | 0% |
| squat | 1 | 0% | 0% |
| pullover | 1 | 0% | 0% |
| dead_hang | 1 | 0% | 0% |
| calf_raise | 1 | 0% | 0% |
| deadlift | 1 | 0% | 0% |
| face_pull | 1 | 0% | 0% |
| leg_press | 1 | 100% | 0% |
| crunch | 1 | 0% | 0% |
| shrug | 1 | 0% | 0% |
| hip_bridge | 1 | 0% | 0% |
| core_rotation | 1 | 0% | 0% |
| cardio_run | 1 | 0% | 0% |
| step_up | 1 | 0% | 0% |
| rollout | 1 | 0% | 0% |
| cardio_row | 1 | 100% | 0% |
| lunge | 1 | 0% | 0% |
| mountain_climber | 1 | 0% | 0% |
| cardio_skip | 1 | 100% | 0% |
| cardio_treadmill | 1 | 100% | 0% |

## 클로드에게 붙여 넣을 요청

```text
C:\Users\SAMSUNG\workout-app\운동 이미지\GPT 생성된 이미지\클로드_인수인계.md를 읽고 PASS_512 이미지만 UUID 매핑에 따라 GND 운동 선택 화면에 로컬 적용해줘. 실제 48px 렌더링과 로딩 실패 fallback을 직접 QA해줘. production DB 변경, Storage 업로드, 배포는 하지 말고 로컬 검증 결과를 먼저 보고해줘.
```

## 검증 및 저장소 상태

- verify-pilot40.py 21passed/0failed, verify-trial-002.py16passed/0failed, verify.py22passed/0failed. 앱 코드 변경 없이 파일/해시/PNG/기존 정의 보존/재시도 제한/집계/내보내기 검증. 이번40개 실제앱QA와 독립전문가 검수는 미수행.
- 원본 시트10장 + 개별 재생성12장, 총52개512PNG시도. PASS39개만 적용 후보. 호출22회, 평균재생성0.300회(전체40개)·1.091회(최초실패11개).
- 기존 승인기록3개 e114f30/2654532/07e23eb 원격origin/main 푸시 및fetch후0 0 확인. 새파일럿커밋은 별도 푸시 승인 대기. 바이너리는 로컬폴더만 보관.
- 기존사용자 .gitignore/앱/추천운동 변경 및 미추적 파일을 이번커밋에 포함하지 않는다. production DB·Storage·배포·사용자알림 미실행.
