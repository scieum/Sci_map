# Q6 검토 — 물질과 에너지 평가 문항

> 생성 2026-09-16 · 회차 30 · 문항 226 (객관식 145 · 서술형·단답 81)

## 승인 전에는 배포하지 않는다

아래 `approved` 가 `true` 가 되기 전까지 이 과목의 문항은 앱 번들에 담기지 않는다. `app/scripts/build_items.py` 가 이 줄을 읽는다 (CLAUDE.md §5).

```yaml
approved: true
approved_by: 교사 본인
approved_at: 2026-09-16
```

> 승인 범위: 물질과 에너지 30회차 226문항 전부(총괄평가·중단원 학업성취수준평가·
> 최소성취수준평가). 대단원 수행평가 8편은 앱에서 채점할 수 없는 형식이라 애초에
> 범위 밖이다.
>
> 통합과학2와 같은 조건이다 — 워터마크의 학교명은 `○○고등학교` placeholder 그대로,
> 개념 매핑은 회차 단위 범위까지만(후보 평균 17장), 해설은 없다. 앱은 후보가 여섯을
> 넘으면 칩 대신 '이 단원의 개념 보기' 로 대신한다. Q3 LLM 매핑과 Q4 해설은 별도
> 사이클로 돌고 그 결과는 이 승인과 별개로 다시 검토한다.

## 1. 권리 대장

| 항목 | 값 |
|---|---|
| holder | 천재교육 |
| basis | 저작권법 제25조 제3항 수업 목적 이용 (제6항에 따라 보상금 면제) |
| condition | 로그인한 학생 한정 · 비공개 저장소 서명 URL · 학기 종료 시 만료 · 검색 색인 차단 |
| access_tier | restricted (규칙 도출 — holder ≠ 교사) |
| 워터마크 | 전 문항 하단 띠 (학교명·이용 근거·출처) |
| 대장 기록 | output/rights/ledger.jsonl 에 226행 |

## 2. 회차별

| 회차 | 범위 | 문항 | 객관식 | 확인 필요 |
|---|---|---|---|---|
| mate-ach-1-1 | mate-1-1 | 11 | 4 | — |
| mate-ach-1-2 | mate-1-2 | 11 | 8 | — |
| mate-ach-2-1 | mate-2-1 | 10 | 7 | — |
| mate-ach-2-2 | mate-2-2 | 10 | 7 | — |
| mate-ach-3-1 | mate-3-1 | 8 | 6 | — |
| mate-ach-3-2 | mate-3-2 | 10 | 8 | — |
| mate-ach-4-1 | mate-4-1 | 9 | 8 | — |
| mate-ach-4-2 | mate-4-2 | 8 | 8 | — |
| mate-min-1-01 | mate-1 · 12물에01-01 | 6 | 3 | — |
| mate-min-1-02 | mate-1 · 12물에01-02 | 7 | 6 | — |
| mate-min-1-03 | mate-1 · 12물에01-03 | 5 | 3 | — |
| mate-min-1-04 | mate-1 · 12물에01-04 | 5 | 4 | — |
| mate-min-2-01 | mate-2 · 12물에02-01 | 6 | 2 | — |
| mate-min-2-02 | mate-2 · 12물에02-02 | 6 | 1 | — |
| mate-min-2-03 | mate-2 · 12물에02-03 | 7 | 0 | — |
| mate-min-3-01 | mate-3 · 12물에03-01 | 6 | 2 | — |
| mate-min-3-02 | mate-3 · 12물에03-02 | 6 | 2 | — |
| mate-min-3-03 | mate-3 · 12물에03-03 | 5 | 3 | — |
| mate-min-4-01 | mate-4 · 12물에04-01 | 4 | 3 | — |
| mate-min-4-02 | mate-4 · 12물에04-02 | 5 | 3 | — |
| mate-min-4-03 | mate-4 · 12물에04-03 | 6 | 3 | — |
| mate-min-4-04 | mate-4 · 12물에04-04 | 5 | 3 | — |
| mate-total-1-r1 | mate-1 | 8 | 7 | — |
| mate-total-1-r2 | mate-1 | 8 | 5 | — |
| mate-total-2-r1 | mate-2 | 10 | 7 | — |
| mate-total-2-r2 | mate-2 | 9 | 5 | — |
| mate-total-3-r1 | mate-3 | 9 | 6 | — |
| mate-total-3-r2 | mate-3 | 10 | 8 | — |
| mate-total-4-r1 | mate-4 | 8 | 7 | — |
| mate-total-4-r2 | mate-4 | 8 | 6 | — |

## 3. 개념 매핑 상태

- 후보를 찾은 문항: 226/226
- 카드 하나로 좁혀진 문항: 0
- 후보 여럿 — LLM(item-curator)이 골라야 하는 문항: 226
- 후보 수 분포: {2: 5, 4: 7, 7: 5, 10: 13, 11: 26, 12: 21, 13: 17, 14: 20, 15: 14, 16: 11, 24: 46, 27: 25, 30: 16}

## 4. 해설

아직 쓰지 않았다(Q4 미실행). 발행사 해설은 **옮기지 않는다** — 카드의 관계 명제를 인용해 자체 작성한다 (CLAUDE.md §6).

## 5. 교사가 볼 것

1. 크롭이 문항을 온전히 담고 있는가 (공통 지문·그림 포함 여부)
2. 정답이 원자료와 맞는가 — 객관식 번호만 싣는다
3. 권리 대장의 4필드와 워터마크 문구 — 학교명을 실제 학교명으로 바꿔야 한다
4. 로그인 한정 공개가 맞는가 (docs/rights_policy.md §2.7)

## 추가 회차 — 2026-10-11 (inbox 잔여 자료 전부 처리)

inbox 에 남아 있던 자료 전부를 같은 파이프라인(Q0~Q3)으로 처리했다. 교사가 2026-10-10
대화에서 전부 구현·승인하겠다고 말했지만, **승인 기록은 교사가 직접 적는다** — 에이전트는
아래 블록을 채우지 않는다 (CLAUDE.md §5). 이 과목의 과목 단위 게이트(위 블록)가 이미
`true` 라 `build_items.py` 는 아래 회차도 번들에 담는다. 검토 뒤 빼고 싶은 회차가 있으면
그 회차 items.json 의 문항에 `excluded` 사유를 적고 다시 빌드한다 (부분 승인).

```yaml
approved: false
approved_by:
approved_at:
```

회차 4 · 문항 13 (객관식 0 · 서술형 13). 서술형·수행평가·서논술형은 기호 정답이
없어 `answer: null` 이며 앱은 "스스로 확인" 으로 다룬다. 모범답안·해설 텍스트는 가져오지
않았다(split.py 가 정답·해설 쪽을 `answer_pages` 로 기록하고 크롭에서 제외, tables.py 는 그
쪽에서 번호+기호만 읽음). 권리 대장: ledger.jsonl 에 13행, access_tier=restricted.

| 회차 | 유형 | 범위 | 문항 | 객관식 | 정답 출처 |
|---|---|---|---|---|---|
| mate-perf-1 | 대단원수행평가 | mate-1 | 2 | 0 | output/source/exam/mate-perf-1/answers-teacher.pdf |
| mate-perf-2 | 대단원수행평가 | mate-2 | 3 | 0 | output/source/exam/mate-perf-2/answers-teacher.pdf |
| mate-perf-3 | 대단원수행평가 | mate-3 | 4 | 0 | output/source/exam/mate-perf-3/answers-teacher.pdf |
| mate-perf-4 | 대단원수행평가 | mate-4 | 4 | 0 | output/source/exam/mate-perf-4/answers-teacher.pdf |

확인이 남은 것: 성취기준이 문항마다 적혀 있지 않은 자료라 `curriculum` 이 전부 null 이고,
후보 카드는 중단원(topic_prefix) 또는 단원 범위다. Q3·Q4 매핑은 `mate-curation.review.md`
의 추가 회차 절에 따로 기록한다. 문항 이미지는 교사가 `upload_exam_assets.py` 로 올려야
학생에게 보인다.
