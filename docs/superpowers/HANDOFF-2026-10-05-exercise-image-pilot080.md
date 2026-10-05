# 클로드 인수인계: 추가40 (041-080)

2026-10-05. 기존40개 및 기존시험4개와 중복0. NEEDS_REVIEW74/custom13 제외.

최초PASS 29 / 재생성후PASS 11 / 최종FAIL 0. 생성 22회, 평균재생성 0.300회.

PASS_512의512×512PNG만 운동_UUID_파일매핑.json의exercise_id UUID로 연결한다. final_qa=FAIL/file=null은 적용하지 않는다. 원본/생성시도는 과정 기록이다. 원본 셀512 이상에서 축소만 수행하며 확대0. 텍스트/번호 없음. 기존 첫40개 폴더는 그대로 유지한다.

Codex는 이미지 생성·시각검수만 수행했다. 이번40개 실제앱QA와 독립운동전문가 검수는 미검증. 클로드는 별도 적용 지시 후 로컬48px렌더링/레이아웃/로딩실패fallback을 직접 검증한다. 운영DB/Storage/배포/전체335생성은 승인되지 않았다.

오류 및 family별 최초/최종 실패율:

```json
{
  "first_pass": 29,
  "pass_after_retry": 11,
  "final_fail": 0,
  "pending": 0,
  "total_pass": 40,
  "error_counts_by_failed_attempt": {
    "exercise": 1,
    "target_muscle": 8,
    "style": 3,
    "equipment": 1
  },
  "error_types_by_failed_attempt": {
    "chinup_grip_ambiguity": 1,
    "wrong_highlight_muscle": 8,
    "cell_boundary_clipping": 3,
    "wrong_machine_variant": 1
  },
  "families": {
    "bench_press": {
      "selected": 3,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 0.3333333333333333,
      "final_failure_rate": 0.0
    },
    "pull_up": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "wrist_curl": {
      "selected": 2,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "squat": {
      "selected": 2,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "row": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "dip": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "dead_bug": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "push_up": {
      "selected": 3,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "rear_delt": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "triceps_extension": {
      "selected": 2,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 0.5,
      "final_failure_rate": 0.0
    },
    "cardio_walk": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "chest_fly": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "shrug": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "biceps_curl": {
      "selected": 2,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "lunge": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "shoulder_raise": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "bird_dog": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "lateral_raise": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "deadlift": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "shoulder_tap": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "grip": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "hip_adduction": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "leg_raise": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "hip_hinge": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "hip_abduction": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "side_bend": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "front_raise": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "jump": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "wall_sit": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "handstand": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    },
    "calf_raise": {
      "selected": 1,
      "initial_fail": 1,
      "final_fail": 0,
      "initial_failure_rate": 1.0,
      "final_failure_rate": 0.0
    },
    "crunch": {
      "selected": 1,
      "initial_fail": 0,
      "final_fail": 0,
      "initial_failure_rate": 0.0,
      "final_failure_rate": 0.0
    }
  },
  "image_generation_calls": 22,
  "sheet_calls": 10,
  "individual_retry_calls": 12,
  "average_regeneration_all40": 0.3,
  "average_regeneration_initial_failures": 1.0909090909090908,
  "repeated_error_categories": {
    "wrong_highlight_muscle": 8,
    "cell_boundary_clipping": 3
  },
  "recommend_expansion": false,
  "repeat_detection": "Conservative: same detailed error type in2+attempts blocks recommendation, even if retries fix it."
}
```

## 검증 및 동시 작업

새파일럿21/이전파일럿21/이전2x2시험16 통과(58검사). 옛verify.py는작업중기존19장human-name.webp경로가없어져중단됐다. 별도앱적용커밋5095800이public이미지를UUID.webp로변경했고기존해시10개만현재파일에서확인했다. 옛19장증거를새40개QA로대체하지않는다. 추가40개출력·해시·PNG·이력검사는전부통과. 실제앱QA·독립전문가미검증.

이번Codex 작업은앱코드를수정하지않았고DB/Storage/배포를실행하지않았다. 별도앱작업커밋과구분한다. 0bb0e6a와5095800은origin/main확인,이번생성기록커밋은푸시승인대기.
