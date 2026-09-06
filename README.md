# Sci_Map (사이맵)

2022 개정 교육과정 과학과 **개념 학습 플랫폼**. 교과서에서 개념 카드를 뽑아
데일리 인출 문항까지 자동으로 잇는 콘텐츠 파이프라인과, 그 결과를 학생이 쓰는 웹앱.

> 앱 이름은 **사이셀파** (가칭) — "과학 개념의 길을 안내하는 학습 셀파".

## 지금 어디까지 왔나

| | `mate-1` 물질의 세 가지 상태 | `mate-2` 용액의 성질 | `mate-3` 화학 변화의 자발성 |
|---|---|---|---|
| 개념 카드 | **30장** | **24장** | **27장** |
| 관계 명제 | 89 (`invertible` 58) | 72 (`invertible` 53) | 82 (`invertible` 53) |
| 오개념 | 60 (전부 `source: llm`) | 49 (전부 `source: llm`) | 55 (전부 `source: llm`) |
| 교과서 자산 | 28장 → 카드 30/30 | 23장 → 카드 24/24 | 35장 → 카드 27/27 |
| 단계 | **C8 통과** · C9 대기 | **C8 통과** · C9 대기 | **C7 완료 → C8 대기** |

자산은 삽화만이 아니다. 그림이 없는 개념에는 교과서의 **표시 수식·표·그래프·곁주**를
붙인다(2026-09-06 교사 결정). 카드 한 장에 자산이 여럿 붙을 수 있다 — 헤스 법칙은
반응 경로 그림·엔탈피 다이어그램·적용 과정 식이 함께 있어야 읽힌다.

> ⚠️ **번호 없는 그래프를 놓치기 쉽다.** 처음에는 `그림 Ⅲ-n` 캡션으로만 훑어
> p85 헤스 엔탈피 다이어그램, p89 곁주 그래프, 보일·샤를 법칙의 축 그래프가
> 통째로 빠져 있었다. 캡션 훑기 뒤에 **박스(rect) 훑기**를 한 번 더 돌려야 한다.

C5(범위 태깅)·C6(명제 결함 탐지)는 담당 서브에이전트(`concept-fact-validator`)가
아직 없어 세 단원 모두 건너뛰었다 — CLAUDE.md §3 과 실제가 어긋나는 지점이다.

C8 은 사람(교사)이 관계 명제의 진위를 판정하는 자리다. **우회할 수 없다.**

## 구조

```
/CLAUDE.md                     메인 에이전트(오케스트레이터) 지침 — §0 그림 정책이 최우선
/Sci_Map_에이전트_설계서.md      개념·문항·그래프·퀴즈 계열 설계
/SciMetro_에이전트_설계서.md     노선 계열(타이핑 게임) 설계
/Design.md                     앱 UI/UX 설계

/.claude/skills/               파이프라인 스킬 (PDF 파싱·성취기준·스키마 검증·그림 크롭)
/.claude/agents/               서브에이전트 지침 (개념 추출·카드 작성)
/docs/                         공용 자산 — 개념 키 사전·동음이의·표기 정책·저작권 방침
/output/                       파이프라인 산출물 (카드·검증·권리 대장·로그)
/app/                          Next.js + Supabase 웹앱 (PWA)
```

### 다섯 개의 콘텐츠 계열

개념 · 문항 · 지도 · 오늘 · 노선. 학습 방식도 파이프라인도 다르지만 **가리키는 개념은
같다** — 통합의 근거는 `concept_key` 하나뿐이다. 표기가 같다는 이유로 잇지 않는다.

## 이 리포에 **없는** 것

저작권상 공개 리포에 올리지 않은 것이 둘 있다. 클론해도 이것들은 따라오지 않는다.

| 무엇 | 왜 |
|---|---|
| `/inbox/` 교과서·기출 PDF | 발행사 저작물. 공개 배포 대상이 아니다 |
| `/output/source/` 교과서 원문 텍스트 | C4 원문 대조용 내부 자료 (CLAUDE.md §9.4) |
| — | (교과서 그림 크롭은 2026-09-06 결정으로 리포에 **포함**된다. `docs/rights_policy.md` §2.5) |

**권리 대장(`/output/rights/ledger.jsonl`)은 올라와 있다.** 어떤 그림을 어디서
어떤 근거로 가져왔는지는 기록으로 남아야 하고, 그 기록 자체에는 저작물이 없다.

크롭을 다시 만들려면 교과서 PDF 를 `/inbox/textbook/` 에 넣고:

```bash
python .claude/skills/figure-cropper/scripts/crop.py --plan output/media/mate-1.plan.json
python .claude/skills/figure-cropper/scripts/crop.py --plan output/media/mate-1.formula.crops.json
python .claude/skills/figure-cropper/scripts/crop.py --plan output/media/mate-1.chem2.crops.json
python app/scripts/build_concepts.py
```

계획 파일에 쪽수와 bbox 가 그대로 있으므로 같은 크롭이 재현된다.

## 저작권을 아키텍처로 다룬다

타인 저작물(교과서 그림, 평가원 문항)의 게재 근거는 저작권법 제25조 제3항
**수업 목적 이용**뿐이다. 이 조항은 공짜 통행증이 아니라 기술적 의무를 동반하므로,
이 프로젝트는 저작권을 법적 주석이 아니라 **설계 제약**으로 다룬다.

- `access_tier` 는 **판단이 아니라 규칙** — 권리자가 교사 자신이 아니면 무조건 `restricted`
- 권리 메타 4필드가 없는 자산은 **배포하지 않는다** (재시도 없이 제외 + 로그)
- 카드 본문은 **재서술 의무** — 원문 연속 12어절 이상 일치 시 자동 fail
- 경계선은 앱이 아니라 **자산 단위**로 긋는다. `restricted` 그림이 붙은 카드도
  본문은 열려 있고 그림 자리만 잠긴다

상세는 [`docs/rights_policy.md`](docs/rights_policy.md).

## 실행

```bash
# 웹앱
cd app && npm install && npm run dev        # http://localhost:3000

# 파이프라인 (Python 3.13, PyYAML·jsonschema·pdfplumber·pypdfium2)
pip install -r requirements.txt
python .claude/skills/concept-schema/scripts/validate_cards.py output/concepts/mate-1/ --unit mate-1
python app/scripts/build_concepts.py
```

> ⚠️ PDF 처리는 **pdfplumber + pypdfium2** 로 고정한다. PyMuPDF 는 AGPL/상용
> 이중 라이선스라 쓰지 않는다.

## 누가 무엇을 판정하나

이 프로젝트의 뼈대가 되는 경계다.

| | 무엇을 |
|---|---|
| **스크립트** | 형식 — 스키마·중복·순환·원문 일치·권리 메타 |
| **LLM** | 정성 — 개념 추출·카드 작성·결함 탐지 |
| **사람** | **진위** — 관계 명제가 참인가 (C8, 우회 불가) |

LLM 은 과학적 진위를 확정하지 않는다. 결함을 지적하고 사람에게 넘긴다.
