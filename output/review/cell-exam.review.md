# Q6 검토 — 세포와 물질대사 평가 문항

> 생성 2026-09-19 · 회차 6 · 문항 120 (객관식 91 · 서술형·단답 29)

## 승인 전에는 배포하지 않는다

아래 `approved` 가 `true` 가 되기 전까지 이 과목의 문항은 앱 번들에 담기지 않는다. `app/scripts/build_items.py` 가 이 줄을 읽는다 (CLAUDE.md §5).

```yaml
approved: true
approved_by: 교사 본인
approved_at: 2026-09-21
```

> 승인 범위: 세포와 물질대사 6회차 120문항 중 **119문항**. 크롭·정답·로그인 한정
> 공개를 확인했다.
>
> **제외 1문항** — `cell-mid-2-r1-q02`. 정답 ④가 포함하는 보기가 카드 명제
> `rel-meta-enzyme` 과 어긋나 원자료 대조 전까지 뺀다. `items.json` 의
> `excluded` 필드에 사유를 적었고 `build_items.py` 가 그 한 문항만 거른다.
>
> 워터마크의 학교명은 `○○고등학교` placeholder 그대로 두기로 했다 — 실제
> 학교명으로 바꾸려면 120장을 다시 크롭·업로드해야 한다(split.py → upload).
> `docs/rights_policy.md` §가 배포 전 필수로 적어 둔 항목이므로, 학교명을
> 정하면 그때 다시 떠서 대장과 함께 갱신한다.

## 1. 권리 대장

| 항목 | 값 |
|---|---|
| holder | 천재교육 |
| basis | 저작권법 제25조 제3항 수업 목적 이용 (제6항에 따라 보상금 면제) |
| condition | 로그인한 학생 한정 · 비공개 저장소 서명 URL · 학기 종료 시 만료 · 검색 색인 차단 |
| access_tier | restricted (규칙 도출 — holder ≠ 교사) |
| 워터마크 | 전 문항 하단 띠 (학교명·이용 근거·출처) |
| 대장 기록 | output/rights/ledger.jsonl 에 120행 |

## 2. 회차별

| 회차 | 범위 | 문항 | 객관식 | 확인 필요 |
|---|---|---|---|---|
| cell-mid-1-r1 | cell-1 | 20 | 16 | — |
| cell-mid-1-r2 | cell-1 | 20 | 16 | — |
| cell-mid-2-r1 | cell-2 | 20 | 13 | — |
| cell-mid-2-r2 | cell-2 | 20 | 15 | — |
| cell-mid-3-r1 | cell-3 | 20 | 16 | — |
| cell-mid-3-r2 | cell-3 | 20 | 15 | — |

## 3. 개념 매핑 상태

- 후보를 찾은 문항: 120/120
- 카드 하나로 좁혀진 문항: 0
- 후보 여럿 — LLM(item-curator)이 골라야 하는 문항: 120
- 후보 수 분포: {2: 2, 5: 21, 6: 18, 7: 10, 8: 11, 11: 10, 13: 29, 16: 19}

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

회차 17 · 문항 146 (객관식 71 · 서술형 75). 서술형·수행평가·서논술형은 기호 정답이
없어 `answer: null` 이며 앱은 "스스로 확인" 으로 다룬다. 모범답안·해설 텍스트는 가져오지
않았다(split.py 가 정답·해설 쪽을 `answer_pages` 로 기록하고 크롭에서 제외, tables.py 는 그
쪽에서 번호+기호만 읽음). 권리 대장: ledger.jsonl 에 146행, access_tier=restricted.

| 회차 | 유형 | 범위 | 문항 | 객관식 | 정답 출처 |
|---|---|---|---|---|---|
| cell-min-1-01 | 최소성취수준평가 | cell-1-1 | 5 | 3 | output/source/exam/cell-min-1-01/paper.pdf |
| cell-min-1-02 | 최소성취수준평가 | cell-1-2 | 5 | 3 | output/source/exam/cell-min-1-02/paper.pdf |
| cell-min-1-03 | 최소성취수준평가 | cell-1-3 | 5 | 2 | output/source/exam/cell-min-1-03/paper.pdf |
| cell-min-1-04 | 최소성취수준평가 | cell-1-4 | 5 | 3 | output/source/exam/cell-min-1-04/paper.pdf |
| cell-min-2-01 | 최소성취수준평가 | cell-2-1 | 6 | 1 | output/source/exam/cell-min-2-01/paper.pdf |
| cell-min-2-02 | 최소성취수준평가 | cell-2-2 | 6 | 0 | output/source/exam/cell-min-2-02/paper.pdf |
| cell-min-3-01 | 최소성취수준평가 | cell-3-1 | 6 | 1 | output/source/exam/cell-min-3-01/paper.pdf |
| cell-min-3-02 | 최소성취수준평가 | cell-3-2 | 5 | 0 | output/source/exam/cell-min-3-02/paper.pdf |
| cell-min-3-03 | 최소성취수준평가 | cell-3-3 | 5 | 1 | output/source/exam/cell-min-3-03/paper.pdf |
| cell-min-3-04 | 최소성취수준평가 | cell-3-4 | 5 | 2 | output/source/exam/cell-min-3-04/paper.pdf |
| cell-min-3-05 | 최소성취수준평가 | cell-3-5 | 5 | 1 | output/source/exam/cell-min-3-05/paper.pdf |
| cell-perf-1 | 수행평가 | cell-1 | 4 | 0 | output/source/exam/cell-perf-1/paper.pdf |
| cell-perf-2 | 수행평가 | cell-2 | 4 | 0 | output/source/exam/cell-perf-2/paper.pdf |
| cell-perf-3 | 수행평가 | cell-3 | 4 | 0 | output/source/exam/cell-perf-3/paper.pdf |
| cell-unit-1 | 대단원평가 | cell-1 | 25 | 20 | output/source/exam/cell-unit-1/paper.pdf |
| cell-unit-2 | 대단원평가 | cell-2 | 21 | 13 | output/source/exam/cell-unit-2/paper.pdf |
| cell-unit-3 | 대단원평가 | cell-3 | 30 | 21 | output/source/exam/cell-unit-3/paper.pdf |

확인이 남은 것: 성취기준이 문항마다 적혀 있지 않은 자료라 `curriculum` 이 전부 null 이고,
후보 카드는 중단원(topic_prefix) 또는 단원 범위다. Q3·Q4 매핑은 `cell-curation.review.md`
의 추가 회차 절에 따로 기록한다. 문항 이미지는 교사가 `upload_exam_assets.py` 로 올려야
학생에게 보인다.
