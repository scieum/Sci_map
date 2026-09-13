---
name: textbook-parser
description: 교과서 PDF에서 단원 경계·본문 텍스트·레이아웃 박스·그림 후보를 뽑는다. 개념 파이프라인 C0(교과서 전처리) 단계 전용. 새 교과서를 /inbox/textbook/ 에 투입했을 때, 단원 하나의 원문을 /output/source/<unit-id>/ 로 만들어야 할 때 쓴다.
---

# textbook-parser — C0 교과서 전처리

`Sci_Map_에이전트_설계서.md` §4.3 C0 를 수행한다. **코드 단계다** — 판단은 없다.

산출물은 **배포 대상이 아니다**. C4 의 원문 n-gram 대조(R4 재서술 의무) 기준이자
C1 의 입력인 내부 자료다 (CLAUDE.md §9-4).

## ⚠️ 라이브러리

`pypdfium2`(Apache-2.0) + `pdfplumber`(MIT) 만 쓴다. **PyMuPDF 는 금지**
(AGPL/상용 이중 라이선스, Sci_Map R11). `references/forbidden_libraries.md` 참조.

실행은 리포 밖 가상환경으로 한다 — 리포가 OneDrive 동기화 폴더 안에 있다.

```
~/.venvs/scimap/bin/python .claude/skills/textbook-parser/scripts/<script>.py ...
```

## 실행 순서

```bash
V=~/.venvs/scimap/bin/python
S=.claude/skills/textbook-parser/scripts

$V $S/check_licenses.py                                   # 0. 금지 임포트 점검
$V $S/detect_layer.py "inbox/textbook/<판>/<계열>/<책>.pdf" --first 10 --last 45   # 1. 텍스트 레이어·추출률
$V $S/split_unit.py mate-1                                # 2. 단원 경계 확정
$V $S/extract_text.py mate-1                              # 3. 원문·레이아웃·그림 후보
```

| 스크립트 | 하는 일 | 실패 시 |
|---|---|---|
| `check_licenses.py` | 리포 전체에서 금지 임포트 탐색 | 1건이라도 있으면 비정상 종료 |
| `detect_layer.py` | pdfplumber ↔ pypdfium2 교차검증으로 추출률 측정 | 추출률 < 50% → `ocr.py` 경로 / 50~95% → **에스컬레이션** |
| `split_unit.py` | 인쇄 쪽수·제목·범위 연속성 3종 대조 | 불일치 1건이라도 **에스컬레이션** (자동 보정 금지) |
| `extract_text.py` | `text.jsonl` · `layout.json` · `figures.json` 생성 | 추출 0자 → **에스컬레이션** |
| `ocr.py` | 텍스트 레이어 없는 PDF 에 OCR 덧입힘 (R10) | ⚠️ **미검증 경로** — 스크립트 머리말 참조 |

모든 결과는 `output/logs/pipeline.jsonl` 에 남는다 (CLAUDE.md §12).

## 입력

교과서는 `inbox/textbook/<교육과정 판>/<과목 계열>/` 에 있다 (`15개정`|`22개정` ×
`통합과학`|`물리학`|`화학`|`생명과학`|`지구과학`). 2026-09-13 에 평평한 한 폴더에서
이 구조로 갈랐다. **경로를 쓰는 곳이 백로그·plan·후보 목록에 흩어져 있으니**
파일을 옮기거나 이름을 바꿀 때는 같은 커밋에서 참조도 함께 고쳐라 —
자세한 것은 `inbox/README.md` 에 있다.

`docs/unit_backlog.yaml` 이 단원 구조와 쪽 범위의 선언이다. **선언을 정답으로 믿지 않는다** —
`split_unit.py` 가 본문과 대조해 확정한다. 확정 실패는 스킵이 아니라 에스컬레이션이다.

YAML 키에 `no:` 를 쓰지 마라. YAML 1.1 에서 불리언 `false` 로 읽힌다. 이 백로그는 `numeral:` 을 쓴다.

## 산출물

```
output/source/<unit-id>/
  text.jsonl     1행 = 1쪽. {page, unit_id, section_id, topic_id, role, chars, blocks[], text}
  layout.json    쪽별 {width, height, lines[{text, bbox, size, font}]}
  figures.json   쪽별 [{figure_id, kind, bbox, area_ratio}]  ← 후보다. 확정은 C7.
```

`role` 은 `front` / `body` / `section_review` / `unit_review` / `project` / `career` 중 하나다.
카드 원천은 `body` 다. 나머지는 맥락 참고용이다.

## 이 판형에서 확인된 것 (천재교과서 · 물질과 에너지)

판형이 다른 교과서를 투입하면 아래 가정부터 다시 확인한다.

- **인쇄 쪽수 == PDF 쪽수** (1-base). `split_unit.py` 가 쪽마다 검증한다.
- **2단 판형** — 본문 단과 곁주 단이 나란히 놓인다. 글자 좌표만 보고 위에서 아래로
  읽으면 본문 문장 사이에 곁주가 끼어들어 문장이 끊긴다. pdfminer 레이아웃 분석
  (`LAPARAMS`, `line_margin=1.0`) 에 맡겨 단을 가르고 읽기 순서를 잡는다.
  `line_margin` 을 1.4 까지 올리면 곁주 항목끼리 들러붙고, 기본값 0.5 로 내리면
  한 문단이 줄마다 쪼개진다.
- **띄어쓰기 자리에 U+00AD(소프트 하이픈)** 를 넣는 조판 블록이 있다 (mate-1 본문의 6.7%).
  `_common.clean()` 이 보통 공백으로 바꾼다. 그냥 지우면 낱말이 들러붙는다.
- **줄바꿈은 보존한다.** 한국어는 낱말 도중에도 줄이 바뀌므로('끌어당' / '기는'),
  줄을 공백으로 이으면 원문에 없던 공백이 생긴다. 원문 대조는
  `_common.normalize_for_overlap()` 이 공백을 지우고 처리한다 — **C4 는 반드시 이 함수를 거쳐라.**
- **수식은 깨진다.** 전용 수식 글꼴이 사설 인코딩을 써서 `;27!3;`, `¾`(℃) 처럼 나온다.
  카드 정의·관계 명제를 수식 글자열에 기대지 마라. 수식이 필요하면 C7 에서 그림으로 붙인다.

## 다음 단계

C0 통과 → **C1 개념 추출**(`textbook-analyst` 서브에이전트)에 `text.jsonl` **경로만** 넘긴다.
내용을 프롬프트에 붙여넣지 않는다 (CLAUDE.md §4).
