# GND 수집형 성장 캐릭터 카드 설계

작성일: 2026-08-02

상태: 사용자 대화 승인 후 작성된 검토용 설계

범위: 카드 상품 기획, 획득·장착 경험, 이미지 제작 기준, GPT 생성 프롬프트, 최소 검증

관련 문서:

- `2026-07-23-xp-level-character-system-design.md`
- `2026-07-27-badge-catalog-and-point-economy-design.md`
- `2026-08-01-avatar-coordinate-layer-pipeline-design.md`
- `2026-08-02-avatar-fitted-multilayer-cap-design.md`

---

## 1. 결론

GND의 첫 출시형 꾸미기는 개별 모자·옷을 좌표로 겹치는 시스템이 아니라, **배경과
착장이 완성된 캐릭터 카드 이미지를 구매하고 대표 캐릭터로 교체하는 방식**으로 한다.

7개 성장 단계마다 취향이 다른 카드 3장을 열어 총 21장을 구성한다. 세 노선은 단순한
패션 분류가 아니라 사용자가 되고 싶은 이상적 자아를 상징한다.

| 사용자 노출 이름 | 내부 심리 역할 | 핵심 욕망 |
|---|---|---|
| 퍼포먼스 플렉스 | 정복자 | 강하고 승리하는 나 |
| 스트리트 플렉스 | 아이콘 | 남들과 다르고 주목받는 나 |
| 클래식 플렉스 | 마스터 | 삶을 통제하고 결정하는 나 |

같은 단계의 카드 3장은 가격과 지위가 같다. 표현 방식만 다르다. 단계가 올라갈수록
좋은 옷에서 자동차로, 자동차에서 공간·조직·접근 권한으로 성공의 크기가 상승한다.

기존 7단계 기본 캐릭터는 삭제하지 않는다. 사용자가 구매 카드를 장착하지 않으면 현재
성장 단계의 기본 캐릭터가 보이고, 구매 카드를 장착하면 레벨이 바뀌어도 장착 카드가
대표 캐릭터로 계속 보인다.

---

## 2. 문제의 본질과 성공 조건

### 2.1 핵심 문제

사용자는 PNG를 사는 것이 아니다. 운동으로 얻은 포인트를 사용해 **되고 싶은 자신의
모습과 성공의 순간**을 산다. 카드가 갖고 싶은 이유는 비싼 물건의 개수가 아니라 다음
네 요소의 결합에서 나온다.

1. 이상적 자아: 이 캐릭터가 내가 되고 싶은 사람처럼 보인다.
2. 획득 자격: 실제 운동으로 이 모습을 얻었다.
3. 사회적 신호: 다른 사람에게 장착 카드가 보인다.
4. 다음 약속: 지금 카드가 다음 단계의 더 큰 성공을 예고한다.

### 2.2 성공 조건

- 사용자가 3장의 차이를 의상이 아니라 **서로 다른 성공 방식**으로 설명할 수 있다.
- 사용자가 최소 1장에 실제 포인트를 쓰고 싶다고 답한다.
- 낮은 단계는 초라하지 않고, 높은 단계의 보상을 미리 소진하지 않는다.
- 구매 카드는 획득 당시 운동 기록과 연결돼 개인의 역사로 남는다.
- 선택한 카드는 홈·프로필·피드·크루에서 일관되게 보인다.
- 이미지에는 동적 UI를 굽지 않고 앱이 최신 레벨·XP·포인트를 표시한다.

### 2.3 근거와 적용 한계

- 게임 속 자아가 이상적 자아와 가까울수록 내적 동기와 긍정 정서가 높아졌다는 연구가
  있다. GND에서는 자동차 자체보다 그 장면 속 캐릭터가 표현하는 성격을 먼저 설계한다.
  - https://doi.org/10.1177/0956797611418676
- 게임의 선택권·유능감·관계성은 즐거움과 지속 의향을 설명한다. GND에서는 3개 노선의
  자유 선택, 실제 운동으로 좁혀지는 목표, 크루 노출로 대응한다.
  - https://doi.org/10.1007/s11031-006-9051-8
- 운동 게임에서도 선택권과 유능감을 지지하는 기능이 동기와 참여 결과에 영향을 줬다.
  - https://doi.org/10.1080/15213269.2012.673850
- 목표에 가까워질수록 행동이 빨라지는 목표가속 효과가 보고됐다. GND는 가짜 진행률이
  아니라 실제 잔액과 예상 운동 횟수를 보여준다.
  - https://doi.org/10.1509/jmkr.43.1.39
- 성공적으로 노력을 완성한 결과물은 더 높게 평가될 수 있다. 카드에 획득 당시 운동
  기록을 남겨 단순 구매가 아니라 노력의 완성으로 만든다.
  - https://doi.org/10.1016/j.jcps.2011.08.002
- 럭셔리 노출은 지위를 전달하지만 친근함을 낮출 수 있다. 카드마다 물건과 함께 노력의
  흔적·행동·서사를 넣어 빌린 사치나 허세로 보이지 않게 한다.
  - https://doi.org/10.1016/j.evolhumbehav.2010.12.002
  - https://doi.org/10.1016/j.jbusres.2022.113382

위 연구는 GND 카드의 성과를 직접 검증한 것이 아니다. 따라서 아래 설계는 근거 있는
가설이며, 4단계 카드 3장으로 사용자 반응을 먼저 확인한다.

---

## 3. 도전한 전제와 결정

| 전제 | 판정 | 결정 |
|---|---|---|
| 모든 카드가 같은 포즈여야 한다 | 폐기 | 완성 이미지 교체 방식이므로 카드마다 행동·카메라·포즈를 바꾼다 |
| 의상만 다르면 별도 카드가 된다 | 폐기 | 성공의 순간·공간·행동·대표 상징까지 달라야 한다 |
| 비싼 물건이 많을수록 매력적이다 | 수정 | 카드당 대표 성공 상징 1개, 보조 소품 최대 2개 |
| 럭셔리는 모든 단계에서 필요하다 | 폐기 | 1~3단계는 태도·자기관리, 4단계부터 자산을 보여준다 |
| 세 노선을 한 번 고르면 계속 고정한다 | 폐기 | 단계마다 자유롭게 선택하고, 연속 수집은 선택 보너스로 둔다 |
| 희소성은 뽑기와 기간 한정으로 만든다 | 폐기 | 초기에는 운동 노력·획득 기록·컬렉션 완성으로 희소성을 만든다 |
| 카드 이미지에 레벨과 포인트를 넣는다 | 폐기 | GPT는 그림만 만들고 앱이 동적 정보를 표시한다 |

---

## 4. 7단계 욕망 상승 곡선

| 단계 | 레벨 | 심리적 성장 | 허용되는 성공 상징 | 다음 단계 약속 |
|---|---:|---|---|---|
| 1 개노답 | 1~5 | 잠재력과 첫 결심 | 태도, 기본 패션 | 나에게 투자하기 시작한다 |
| 2 눈떴개 | 6~10 | 첫 자기 투자 | 좋은 신발, 헤드폰, G 시계 | 관리된 사람이 된다 |
| 3 일단하개 | 11~15 | 반복과 자기관리 | 프리미엄 패션, 가방, 도시 생활 | 첫 성과가 자산으로 보인다 |
| 4 물고가개 | 16~20 | 노력의 첫 증명 | 스포츠 쿠페, 고급 세단 | 누구나 알아보는 성공으로 간다 |
| 5 미쳐보개 | 21~25 | 사회가 인정하는 성공 | 슈퍼카, 펜트하우스, 무대 | 물건을 넘어 판을 소유한다 |
| 6 판을짜개 | 26~30 | 소유와 통제 | 차고, 스튜디오, 이사회실 | 개인 성공이 유산이 된다 |
| 7 전설이개 | 31~35 | 영향력과 유산 | 원오프 차량, 개인 갤러리, 전용기 | 최종 단계, 컬렉션 완성 |

1~3단계 유료 카드는 기본 캐릭터보다 멋있어야 하지만, 상위 단계의 자동차·펜트하우스를
미리 사용하지 않는다. 낮은 단계의 구매 욕구는 부가 아니라 잠재력·태도·스타일에서 만든다.

---

## 5. 21장 카드 기획표

카드 이름은 이미지 안에 넣지 않고 앱 UI가 표시한다. 아래 이름은 1차 확정안이며 사용자
검증에서 이해하기 어려운 이름만 바꾼다.

### 5.1 1단계 개노답 — 잠재력을 선택한다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 첫 시동 | 오래된 체육관 벤치에서 운동화 끈을 단단히 묶고 일어나려는 순간 | 운동화 | 오늘 시작하는 강한 나 |
| 스트리트 | 언더독 | 비 내린 골목에서 후드를 쓰고 주머니에 손을 넣은 채 정면을 응시 | 후드 실루엣 | 낮은 단계여도 반항적이고 힙한 나 |
| 클래식 | 리셋 | 새벽 카페에서 검은 코트를 정리하고 의자를 밀며 일어나는 순간 | 정돈된 코트 | 흐트러진 생활을 다시 통제하는 나 |

### 5.2 2단계 눈떴개 — 나에게 처음 투자한다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 새벽 출발 | 텅 빈 트랙 입구에서 G 스포츠 시계를 확인한 뒤 첫발을 내딛음 | G 스포츠 시계 | 남들보다 먼저 움직이는 나 |
| 스트리트 | 첫 드립 | 새 운동화와 봄버 재킷 차림으로 지하 주차장을 자신 있게 걸어 나옴 | 한정 색상 운동화 | 스타일이 생기기 시작한 나 |
| 클래식 | 데일리 루틴 | 단정한 니트와 가죽 백팩 차림으로 노트북을 닫고 하루를 시작함 | 가죽 백팩 | 생활을 관리하는 믿음직한 나 |

### 5.3 3단계 일단하개 — 자기관리가 외모로 보인다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 페이스 업 | 경기장 계단을 올라가며 프리미엄 헤드폰을 고쳐 씀 | 프리미엄 헤드폰 | 체력과 자신감이 붙은 나 |
| 스트리트 | 시티 무버 | 네온 도심 횡단보도를 빠르게 건너며 옆을 바라봄 | 강한 실루엣 재킷 | 도시 장면의 주인공이 된 나 |
| 클래식 | 첫 미팅 | 공유오피스 로비에서 서류가방을 들고 소매를 정리함 | 가죽 서류가방 | 첫 기회를 잡으러 가는 프로인 나 |

### 5.4 4단계 물고가개 — 첫 성공이 자산으로 보인다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 퍼스트 머신 | 성능형 스포츠 쿠페의 문을 열다가 카메라를 돌아봄 | GND 스포츠 쿠페 | 노력으로 첫 드림카를 얻은 나 |
| 스트리트 | 나이트 드립 | 네온 아래 커스텀 쿠페에 기대 선글라스를 고쳐 씀 | 커스텀 G 쿠페 | 밤거리에서 가장 눈에 띄는 나 |
| 클래식 | 첫 계약 | 호텔 입구 고급 세단 옆에서 커프스를 정리하고 안으로 걸어감 | GND 이그제큐티브 세단 | 계약을 성사시킨 사업가인 나 |

세 카드의 차량 등급과 화면 점유율을 비슷하게 맞춘다. 특정 노선만 더 비싸 보이면 같은
단계·같은 가격이라는 규칙이 무너진다.

### 5.5 5단계 미쳐보개 — 누가 봐도 성공했다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 트랙 브레이커 | 서킷에서 헬멧을 옆구리에 끼고 슈퍼카를 향해 걸어감 | GND 슈퍼카 | 속도와 승리를 가진 챔피언인 나 |
| 스트리트 | 헤드라이너 | 백스테이지 출입구에서 주얼리를 고쳐 매며 카메라 플래시 속으로 등장 | 전용 백스테이지 출입구 | 모두가 기다리는 셀럽인 나 |
| 클래식 | 스카이라인 스위트 | 펜트하우스 창가에서 계획서를 닫고 도시를 내려다봄 | 펜트하우스 야경 | 내 결정이 도시를 움직이는 듯한 나 |

사회적 인정은 군중을 많이 그리는 대신 플래시, 전용 출입구, 기다리는 차량 등 간접
신호로 표현한다. 캐릭터 외 추가 인물은 최소화한다.

### 5.6 6단계 판을짜개 — 물건이 아니라 판을 소유한다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 팀 오너 | 프라이빗 퍼포먼스 차고의 중앙 통로를 여유 있게 걸어감 | 팀 전용 차고 | 선수가 아니라 팀의 주인인 나 |
| 스트리트 | 컬처 메이커 | 커스텀 G 차량이 전시된 개인 디자인 스튜디오에서 스케치를 승인함 | 개인 디자인 스튜디오 | 유행을 따르지 않고 만드는 나 |
| 클래식 | 체어맨 | 고층 이사회실의 가장 높은 자리에서 도시 쪽으로 몸을 돌림 | 전용 이사회실 | 중요한 결정을 내리는 나 |

차량과 소품을 여러 개 늘어놓기보다 공간을 통제하는 행동으로 단계 상승을 보여준다.

### 5.7 7단계 전설이개 — 영향력과 유산을 남긴다

| 노선 | 카드 | 성공 장면·행동 | 대표 상징 | 사고 싶은 이유 |
|---|---|---|---|---|
| 퍼포먼스 | 골든 랩 | 프라이빗 서킷에서 원오프 하이퍼카 옆 우승 트로피를 내려놓음 | 원오프 G 하이퍼카 | 정상에 오른 챔피언인 나 |
| 스트리트 | 리빙 아이콘 | 개인 갤러리에서 상징적인 G 차량과 작품 사이를 천천히 걸어감 | 개인 문화 갤러리 | 존재 자체가 문화가 된 나 |
| 클래식 | 레거시 | 황금빛 활주로에서 전용기 계단을 오르다 도시를 돌아봄 | GND 전용기 | 모든 성장을 완성하고 떠나는 나 |

최상위 카드는 큰 로고·과도한 장신구보다 여유, 전용 공간, 접근 권한으로 지위를 표현한다.

---

## 6. 가격과 컬렉션

현재 포인트 경제 설계는 운동 1회 100P에 불꽃 배수를 적용하며, 주 4회 성숙 사용자의
월수입을 약 6,400P, 1년차 총수입을 약 110,000P로 추정한다. 이를 기준으로 한 잠정
가격은 다음과 같다.

| 단계 | 카드 1장 가격 | 같은 단계 3장 | 노선에서의 역할 |
|---|---:|---:|---|
| 1 | 500P | 1,500P | 첫 구매 경험 |
| 2 | 1,500P | 4,500P | 선택 취향 형성 |
| 3 | 4,000P | 12,000P | 관리된 자아 |
| 4 | 8,000P | 24,000P | 첫 자산 |
| 5 | 15,000P | 45,000P | 확실한 성공 |
| 6 | 35,000P | 105,000P | 소유와 통제 |
| 7 | 75,000P | 225,000P | 최종 목표 |

한 노선 7장 완성은 139,000P, 21장 전체는 417,000P다. 가격은 사용자 테스트 전에는
확정값이 아니다. 4단계 카드 3장의 지불의향과 실제 포인트 보유 분포를 보고 조정한다.

같은 노선 7장을 모으면 `정복자 컬렉션`, `아이콘 컬렉션`, `레거시 컬렉션`을 완성한다.
완성 보상은 추가 캐릭터가 아니라 특별 카드 테두리, 프로필 칭호, 장착 전환 연출이다.

---

## 7. 해금·구매·장착 경험

```text
단계 도달
  → 해당 단계 카드 3장 공개
  → 전체 화면 미리보기
  → 목표 카드 1장 지정
  → 실제 포인트 진행률과 예상 운동 횟수 표시
  → 포인트 구매
  → 획득 연출과 개인 운동 기록 연결
  → 대표 캐릭터 장착
  → 홈·프로필·피드·크루에 노출
```

### 7.1 단계 도달과 미리보기

- 단계에 도달하기 전에는 카드 실루엣과 성공 장면의 일부만 보여준다.
- 단계에 도달하면 3장을 모두 공개한다.
- 한 번 도달한 단계의 카드 3장은 영구 해금된다. 이후 XP 역산으로 현재 단계가 내려가도
  다시 잠그지 않으며, 이전 단계 카드도 언제든 구매할 수 있다.
- 구매 가능 여부는 현재 단계 숫자가 아니라 단계 해금 기록을 단일 기준으로 사용한다.
- 사용자는 구매 전에도 완성 이미지를 충분히 확대해 볼 수 있다.
- 자동 장착 체험 후 회수하는 손실회피 장치는 사용하지 않는다.

### 7.2 목표 카드

- 사용자는 구매 전 카드 하나를 `목표 카드`로 지정할 수 있다.
- `현재 포인트 / 가격 / 실제 달성률 / 예상 운동 횟수`를 표시한다.
- 예상 운동 횟수는 현재 불꽃 배수를 사용한 참고값이며 확정값처럼 말하지 않는다.
- 가짜 보너스 진행률, 카운트다운, 허위 품절은 사용하지 않는다.

### 7.3 구매와 개인 기록

카드 소유 기록에는 최소한 다음 값을 보존한다.

- 구매 가격과 구매 시각
- 획득 당시 레벨·성장 단계
- 획득 당시 불꽃 일수
- 획득 당시 누적 운동 횟수

이 값은 카드 이미지에 들어가지 않고 상세 화면에서 앱 UI로 표시한다.
획득 당시 운동 횟수·불꽃 등 개인 운동 기록은 기본적으로 본인에게만 보인다. 다른
사용자에게는 장착 카드와 카드명만 보이며, 획득 기록 공개는 사용자가 별도로 선택한다.

### 7.4 장착 우선순위

1. 장착된 구매 카드가 있으면 그 카드를 표시한다.
2. 없으면 현재 성장 단계의 기존 기본 캐릭터를 표시한다.
3. 레벨 상승은 기본 캐릭터를 바꾸지만 장착한 구매 카드를 자동 해제하지 않는다.
4. 사용자가 `기본 성장 캐릭터로 돌아가기`를 선택하면 장착을 해제한다.

### 7.5 사회적 노출

장착 카드는 홈·내 정보뿐 아니라 크루 멤버 목록과 운동 피드의 캐릭터 썸네일에도 보인다.
공유는 선택이며, 구매나 장착을 위해 공유를 강제하지 않는다.

---

## 8. 이미지 제작 전 카드 브리프

GPT 프롬프트를 쓰기 전에 카드마다 아래 항목을 한 줄씩 확정한다.

| 필드 | 질문 |
|---|---|
| `ideal_self` | 사용자는 이 카드에서 어떤 사람이 되고 싶은가? |
| `earned_story` | 무엇을 노력해 얻은 성공처럼 보여야 하는가? |
| `hero_symbol` | 한눈에 읽히는 성공 상징 하나는 무엇인가? |
| `signature_action` | 캐릭터가 무엇을 하고 있어야 빌린 사치가 아닌가? |
| `location` | 그 성공이 자연스러운 장소는 어디인가? |
| `pose_camera` | 행동을 가장 매력적으로 보이는 포즈와 카메라는 무엇인가? |
| `stage_ceiling` | 다음 단계의 보상을 침범하지 않는가? |
| `social_thumbnail` | 작은 피드 썸네일에서도 차이가 읽히는가? |
| `next_promise` | 다음 단계에서 무엇이 더 커질 것인가? |

브리프가 비어 있으면 이미지를 생성하지 않는다.

---

## 9. GPT 이미지 제작 전역지침

이 지침은 GND 카드 제작 세션마다 고정한다. Codex 전체 작업 지침이나 다른 이미지 작업에
적용하지 않는다.

```text
ROLE
You are the art director for GND collectible character cards.
Every output must look like an official card from one coherent premium mobile game.

PRODUCT PURPOSE
The user is not buying clothing or a vehicle alone. The user is buying an earned,
aspirational version of the self. Show a specific moment of success, not a product display.

REFERENCE PRIORITY
1. Stage base character: absolute identity, face, fur pattern, body and growth-stage reference.
2. Approved GND golden-master card: rendering, material, contrast and lighting reference.
3. Composition reference: layout and mood only.
If references conflict, follow this priority order.

IDENTITY INVARIANTS
- Preserve the recognizable GND bulldog face, forehead marking, muzzle color, ear shape,
  eye character, facial folds and stage-appropriate body proportions.
- Keep bulldog anatomy throughout: large head, short thick neck, stocky torso and compact limbs.
- Never create a human bodybuilder with a dog head.
- Keep the gritty semi-realistic 3D character illustration style.
- Do not turn the character into a plush toy, vinyl figure, flat cartoon or animal photograph.

POSE FREEDOM
- Do not repeat a fixed pose across cards.
- Standing, walking, sitting, leaning, turning, climbing stairs and interacting with the scene
  are allowed when they strengthen the card's success story.
- Use front, side or three-quarter body angles as appropriate.
- Full-body or a natural three-quarter crop is allowed, but the face and signature action
  must be immediately readable.

CARD COMPOSITION
- Vertical 5:6 composition.
- Keep the character and main action mainly in the left half.
- Reserve approximately 45 percent of the right side as dark, quiet space for live app UI.
- Reserve a calm top safe area for the title.
- The hero success symbol may cross behind the character but must not clutter the right UI zone.
- Use eye-level or a subtly low camera angle. Avoid exaggerated wide-angle distortion.
- Make ground contact, perspective and cast shadows physically convincing.

ART DIRECTION
- Premium black and charcoal foundation, cinematic low-key lighting and high contrast.
- Warm key light from the upper left plus a restrained stage accent rim light.
- Clearly differentiate fur, cloth, leather, metal, glass and paint materials.
- Use one dominant success symbol and at most two supporting accessories.
- Luxury must be appropriate to the current growth stage and must not steal the next stage's reward.
- The character must be acting with the object or space, not posing beside a random product.

BRAND AND UI RULES
- Use fictional GND-world designs and a simple G emblem only when needed.
- Do not reproduce real-world brand names, trademarks or recognizable logos.
- Do not generate Korean or English sentences, numbers, level labels, XP bars, points,
  streaks, badges, prices, buttons, card borders, watermarks or signatures.
- The image contains only character, wardrobe, success symbol, environment and lighting.
- The app renders every dynamic UI element.

TECHNICAL OUTPUT
- Produce one background-inclusive finished card artwork, not a transparent cutout.
- Generate at the highest supported resolution in a 5:6 composition.
- The production pipeline normalizes the approved master to 1200x1440 PNG and runtime WebP.

FAIL CONDITIONS
Reject and revise if character identity drifts, the desired-self trait is unclear,
the signature action is unreadable, the luxury level breaks the stage ceiling,
the right UI area is cluttered, or anatomy/perspective/ground contact is malformed.
```

---

## 10. 카드별 재사용 프롬프트

```text
Create one premium GND collectible character card artwork.

CARD BRIEF
- Growth stage: {stage_index} {stage_name}, Lv.{level_range}
- Visual line: {performance|street|classic}
- Ideal-self trait: {ideal_self}
- Earned success story: {earned_story}
- Signature action: {signature_action}
- Wardrobe: {wardrobe}
- Hero success symbol: {hero_symbol}
- Supporting accessories, maximum two: {supporting_accessories}
- Location: {location}
- Stage accent color: {accent_color}
- Expression: {expression}
- Pose and camera: {pose_camera}
- Next-stage reward that must not appear yet: {stage_ceiling_exclusion}

REFERENCE ROLES
- Image 1 is the absolute identity and growth-stage reference.
- Image 2 is the approved GND rendering and lighting reference.
- Image 3, if supplied, is a composition reference only.

PRIMARY REQUEST
Show the exact moment described in the card brief. Preserve the recognizable GND bulldog
identity while changing wardrobe, pose, action and environment as required by this card.
The result must communicate {ideal_self} before the viewer notices individual products.

COMPOSITION
Use a vertical 5:6 card composition. Build the character and signature action mainly in the
left half and leave approximately 45 percent of the right side dark, calm and uncluttered
for live app information. Keep a quiet title-safe area near the top. Use the specified pose
and camera; do not force the standard standing pose.

STORY AND STATUS
Make {hero_symbol} the single dominant success signal. Show the character naturally using,
approaching, controlling or leaving it so the success feels earned rather than borrowed.
The scene must feel appropriate to {stage_name} and must not include {stage_ceiling_exclusion}.

STYLE
Gritty semi-realistic 3D GND character illustration, detailed fur and facial folds,
premium black-charcoal environment, cinematic low-key lighting, warm upper-left key light,
restrained {accent_color} rim light, high contrast and convincing material reflections.

STRICTLY AVOID
Any text, numbers, UI, XP, points, badges, prices, buttons, card borders, real-world brand
names or logos, watermarks, extra characters, duplicated limbs, malformed paws, floating
shoes, broken ground contact, plush-toy styling, flat cartoon styling, animal photography,
excessive props, or clutter in the right-side information area.

OUTPUT
Return only the clean background-inclusive artwork without app UI.
```

### 10.1 수정 프롬프트

```text
Revise the current card image. Preserve every element that is not explicitly listed below,
including character identity, face, body proportions, wardrobe, environment, color grading,
camera angle and composition.

CHANGE ONLY
- {single_targeted_change_1}
- {single_targeted_change_2_if_needed}

Do not redesign or replace the bulldog. Do not add text, UI, logo, watermark or new objects.
Keep the right-side information area clear. Return the revised clean card artwork only.
```

한 번에 얼굴·포즈·배경을 모두 고치지 않는다. 실패 원인 하나를 고치고 비교한 뒤 다음
수정으로 넘어간다.

---

## 11. 이미지 제작·파일 관리 흐름

1. 단계 기본 캐릭터 이미지를 `identity reference`로 고정한다.
2. 카드 브리프 9개 필드를 작성하고 단계 상한을 검토한다.
3. 카드별 프롬프트로 초안을 1장 생성한다.
4. 100점 QA에서 85점 미만이거나 치명 실패가 있으면 수정한다.
5. 승인본을 해당 노선의 `golden master` 참조로 저장한다.
6. 생성 프롬프트, 참조 원본, 승인본, 수정 이력을 함께 보존한다.
7. 승인 마스터를 1200×1440 PNG로 규격화한다.
8. 앱용 WebP와 목록용 썸네일 WebP를 파생 생성한다.

파일명 예시:

```text
docs/design-sources/avatar-cards/stage-04/performance-first-machine/
  brief.md
  prompt.md
  references/
  master-approved.png

public/avatar-cards/
  stage-04-performance-first-machine.webp
  stage-04-performance-first-machine-thumb.webp
```

런타임 이미지에는 제작 프롬프트와 참조 원본을 넣지 않는다.

---

## 12. 카드 이미지 100점 QA

| 항목 | 배점 | 통과 기준 |
|---|---:|---|
| 캐릭터 동일성 | 20 | 얼굴·털 무늬·귀·주둥이·단계 체형이 기준과 일치 |
| 구매 욕구 | 20 | 한눈에 갖고 싶은 성공 장면이 읽힘 |
| 이상적 자아·서사 | 15 | 정복자·아이콘·마스터 중 의도한 자아가 설명 없이 읽힘 |
| 단계 적합성 | 15 | 이전보다 성장했고 다음 단계 보상은 침범하지 않음 |
| 포즈·행동 | 10 | 반복 포즈가 아니며 성공 상징과 자연스럽게 상호작용 |
| UI 구성 | 10 | 오른쪽 정보 영역과 상단 제목 영역이 비어 있음 |
| 화풍·기술 품질 | 10 | GND 화풍, 광원·원근·접지·해부·재질 오류 없음 |

승인 기준은 85점 이상이다. 다음은 총점과 무관한 치명 실패다.

- 다른 불독으로 보이는 정체성 이탈
- 추가 팔다리·귀·손가락 또는 심각한 해부 오류
- 실제 브랜드 로고·워터마크·읽을 수 없는 글자
- 오른쪽 UI 영역을 핵심 오브젝트가 막음
- 성공 장면보다 제품 카탈로그처럼 보임
- 단계 상한을 넘어 다음 단계의 보상을 소진함

---

## 13. 가장 작은 검증: 4단계 카드 3장

21장을 한 번에 만들지 않는다. 첨부된 Lv.18 참고 이미지와 같은 성장 구간인 4단계에서
`퍼스트 머신`, `나이트 드립`, `첫 계약` 3장만 먼저 제작한다.

### 13.1 검증 순서

1. 브리프 3장 작성
2. 이미지 3장 생성·QA
3. 현재 개발 화면에 완성 이미지 교체 방식으로만 목업
4. 카드 목록·상세·목표 지정·장착을 직접 조작
5. 목표 사용자 5~8명에게 순서가 무작위인 3장을 제시
6. 정성 반응과 지불의향을 기록

### 13.2 사용자 질문

- 설명 없이 가장 갖고 싶은 카드는 무엇인가?
- 그 카드를 고른 이유는 물건, 장면, 또는 되고 싶은 모습 중 무엇인가?
- 보유 포인트가 충분하다면 8,000P를 쓸 것인가?
- 다른 크루원에게 이 카드를 보여주고 싶은가?
- 이 카드가 4단계에 어울리는가, 너무 이르거나 늦어 보이는가?
- 다음 단계에서 무엇이 더 좋아지길 기대하는가?

### 13.3 진입 기준

다음 조건을 만족할 때 나머지 18장 제작으로 진행한다.

- 참여자의 60% 이상이 3장 중 최소 1장에 8,000P 지불 의향을 보임
- 선택 이유에서 물건명 외에 이상적 자아나 성공 장면이 반복적으로 언급됨
- 세 카드가 서로 다른 취향으로 인식됨
- 장착 카드를 크루에게 보여주고 싶다는 반응이 과반임
- `4단계와 맞지 않는다`는 반응이 반복되지 않음

표본 5~8명은 통계적 검증이 아니라 방향성 검증이다. 결과가 약하면 이미지를 더 만드는
대신 카드 브리프와 가격부터 수정한다.

---

## 14. 개념 데이터 경계

구현 계획에서는 기존 포인트 원장과 성장 단계 정의를 재사용하고 다음 개념을 분리한다.

- 카드 카탈로그: 카드명, 단계, 노선, 가격, 이미지, 정렬, 판매 상태
- 카드 소유: 사용자, 카드, 구매 가격·시각, 획득 당시 운동 기록
- 카드 장착: 사용자당 대표 카드 0개 또는 1개
- 목표 카드: 사용자당 구매 전 목표 카드 0개 또는 1개

실제 테이블명·마이그레이션·RLS 정책은 사용자 문서 승인 후 구현 계획에서 확정한다.
구매는 서버가 카탈로그 가격을 읽어 단일 트랜잭션으로 처리하며, 클라이언트가 가격을
보내지 않는다.

---

## 15. 범위 제외와 안전장치

- 개별 의상·모자·신발 레이어 합성의 추가 개발
- 기존 레이어 실험 자산 삭제
- 확률형 뽑기, 유료 재화, 현금 결제
- 인위적 기간 한정, 허위 품절, 가짜 진행률
- 카드의 운동 능력·XP·포인트 배수 효과
- 실제 브랜드 로고와 상표를 그대로 복제한 이미지
- 구매·공유 강제
- 21장 일괄 생성
- 운영 배포

기존 다중 레이어 모자 구현은 기술 실험 기록으로 보존하되, 이 카드 MVP의 선행 조건이나
런타임 의존성으로 사용하지 않는다.

---

## 16. 설계 완료 조건

- 21장 각각에 이상적 자아·성공 장면·행동·대표 상징이 정의돼 있다.
- 포즈 통일 규칙이 제거되고 캐릭터 정체성과 UI 안전 영역만 고정돼 있다.
- 단계별 럭셔리 상한과 다음 단계 약속이 명확하다.
- 카드 획득이 실제 운동 기록과 연결된다.
- 목표 카드·구매·장착·기본 캐릭터 복귀 흐름이 모호하지 않다.
- 전역지침과 카드별 프롬프트가 UI 없는 완성 카드 이미지를 생성하도록 분리돼 있다.
- 21장 제작 전 4단계 3장으로 검증하는 중단 기준이 있다.
