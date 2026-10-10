# Q6 검토 — 통합과학2 평가 문항

> 생성 2026-09-16 · 회차 14 · 문항 190 (객관식 145 · 서술형·단답 45)

## 승인 전에는 배포하지 않는다

`approved: true` 가 이 파일에 적히기 전까지 문항은 앱 배포 대상이 아니다 (CLAUDE.md §5).

```yaml
approved: true
approved_by: 교사 본인
approved_at: 2026-09-16
```

> 승인 범위: 통합과학2 선택형 14회차 190문항 전부. 크롭·정답·로그인 한정 공개를
> 확인했다. 워터마크의 학교명은 `○○고등학교` placeholder 그대로 두기로 했다 —
> 실제 학교명으로 바꾸려면 190장을 다시 크롭·업로드해야 한다(split.py → upload).
>
> 개념 매핑은 아직 성취기준 코드까지만 좁혀져 있고(후보 평균 6.3개), 해설은 없다.
> 앱은 그것을 '이 성취기준의 개념들' 로 **후보임을 밝혀** 보여 준다. Q3 LLM 매핑과
> Q4 자체 해설은 별도 사이클로 돈다 — 그 결과는 이 승인과 별개로 다시 검토한다.

## 1. 권리 대장

| 항목 | 값 |
|---|---|
| holder | 천재교육 |
| basis | 저작권법 제25조 제3항 수업 목적 이용 (제6항에 따라 보상금 면제) |
| condition | 로그인한 학생 한정 · 비공개 저장소 서명 URL · 학기 종료 시 만료 · 검색 색인 차단 |
| access_tier | restricted (규칙 도출 — holder ≠ 교사) |
| 워터마크 | 전 문항 하단 띠 (학교명·이용 근거·출처) |
| 대장 기록 | output/rights/ledger.jsonl 에 190행 |

## 2. 회차별

| 회차 | 단원 | 문항 | 객관식 | 확인 필요 |
|---|---|---|---|---|
| isci2-form-1-2-04-r2 | isci2-1 · isci2-1-2-04 | 5 | 2 | — |
| isci2-form-1-2-04-r3 | isci2-1 · isci2-1-2-04 | 5 | 4 | — |
| isci2-form-1-2-05-r1 | isci2-1 · isci2-1-2-05 | 5 | 4 | — |
| isci2-form-1-2-05-r2 | isci2-1 · isci2-1-2-05 | 5 | 2 | — |
| isci2-form-1-2-05-r3 | isci2-1 · isci2-1-2-05 | 5 | 4 | — |
| isci2-form-3-1-01-r1 | isci2-3 · isci2-3-1-01 | 5 | 4 | — |
| isci2-form-3-1-01-r2 | isci2-3 · isci2-3-1-01 | 5 | 4 | — |
| isci2-form-3-1-01-r3 | isci2-3 · isci2-3-1-01 | 5 | 4 | — |
| isci2-mid-2-r1 | isci2-2 | 25 | 20 | — |
| isci2-mid-2-r2 | isci2-2 | 25 | 19 | — |
| isci2-mid-2-r3 | isci2-2 | 25 | 19 | — |
| isci2-mid-3-r1 | isci2-3 | 25 | 20 | — |
| isci2-mid-3-r2 | isci2-3 | 25 | 20 | — |
| isci2-mid-3-r3 | isci2-3 | 25 | 19 | — |

## 3. 개념 매핑 상태

- 성취기준 코드로 후보를 찾은 문항: 190/190 (unmapped 0)
- 후보가 하나로 좁혀진 문항: 0
- 후보 여럿 — LLM(item-curator)이 골라야 하는 문항: 190
- 후보 수 분포: {2: 15, 3: 26, 4: 10, 5: 11, 6: 45, 8: 47, 9: 15, 10: 21}

## 4. 해설

아직 쓰지 않았다(Q4 미실행). 발행사 해설은 **옮기지 않는다** — 카드의 관계 명제를 인용해 자체 작성한다 (CLAUDE.md §6).

## 5. 교사가 볼 것

1. 크롭이 문항을 온전히 담고 있는가 (공통 지문 포함 여부)
2. 정답이 문항정보표와 맞는가
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

회차 11 · 문항 92 (객관식 65 · 서술형 27). 서술형·수행평가·서논술형은 기호 정답이
없어 `answer: null` 이며 앱은 "스스로 확인" 으로 다룬다. 모범답안·해설 텍스트는 가져오지
않았다(split.py 가 정답·해설 쪽을 `answer_pages` 로 기록하고 크롭에서 제외, tables.py 는 그
쪽에서 번호+기호만 읽음). 권리 대장: ledger.jsonl 에 92행, access_tier=restricted.

| 회차 | 유형 | 범위 | 문항 | 객관식 | 정답 출처 |
|---|---|---|---|---|---|
| isci2-ach-2-1 | 학업성취도평가 | isci2-2-1 | 16 | 11 | output/source/exam/isci2-ach-2-1/paper.pdf |
| isci2-ach-2-2 | 학업성취도평가 | isci2-2-2 | 17 | 17 | output/source/exam/isci2-ach-2-2/paper.pdf |
| isci2-ach-3-1 | 학업성취도평가 | isci2-3-1 | 8 | 8 | output/source/exam/isci2-ach-3-1/paper.pdf |
| isci2-essay-2-1 | 서논술형평가 | isci2-2-1 | 8 | 0 | output/source/exam/isci2-essay-2-1/paper.pdf |
| isci2-essay-3-1 | 서논술형평가 | isci2-3-1 | 2 | 0 | output/source/exam/isci2-essay-3-1/paper.pdf |
| isci2-min-2-1 | 최소성취수준평가 | isci2-2-1 | 11 | 9 | output/source/exam/isci2-min-2-1/paper.pdf |
| isci2-min-2-2 | 최소성취수준평가 | isci2-2-2 | 10 | 10 | output/source/exam/isci2-min-2-2/paper.pdf |
| isci2-min-3-1 | 최소성취수준평가 | isci2-3-1 | 10 | 10 | output/source/exam/isci2-min-3-1/paper.pdf |
| isci2-perf-2-1 | 수행평가 | isci2-2-1 | 4 | 0 | output/source/exam/isci2-perf-2-1/paper.pdf |
| isci2-perf-2-2 | 수행평가 | isci2-2-2 | 4 | 0 | output/source/exam/isci2-perf-2-2/paper.pdf |
| isci2-perf-3-1 | 수행평가 | isci2-3-1 | 2 | 0 | output/source/exam/isci2-perf-3-1/paper.pdf |

확인이 남은 것: 성취기준이 문항마다 적혀 있지 않은 자료라 `curriculum` 이 전부 null 이고,
후보 카드는 중단원(topic_prefix) 또는 단원 범위다. Q3·Q4 매핑은 `isci2-curation.review.md`
의 추가 회차 절에 따로 기록한다. 문항 이미지는 교사가 `upload_exam_assets.py` 로 올려야
학생에게 보인다.
