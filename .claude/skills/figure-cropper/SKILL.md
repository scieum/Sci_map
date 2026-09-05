---
name: figure-cropper
description: C7 시각자료 부착 — 교과서 PDF에서 그림을 크롭·리사이즈·워터마크하고 권리 메타를 붙여 rights/ledger.jsonl 에 기록한다. 개념 카드에 교과서 그림을 붙일 때 쓴다.
---

# figure-cropper — C7 그림 크롭·권리 태깅

## 경계선

| 누가 | 무엇을 |
|---|---|
| **LLM** | 어느 그림이 어느 개념의 것인가 — `plan.json` 작성 |
| **스크립트** | 오려내기 · 축소 · 워터마크 · `access_tier` 도출 · 상한 검사 · 대장 기록 |
| **사람** | 학교명·교사명 확정, C8 게이트에서 최종 승인 |

`access_tier` 는 **판단이 아니라 규칙이다.** `rights.holder` 가 `teacher` 와 다르면
무조건 `restricted`. 스크립트가 계산하고, 사람도 LLM도 뒤집지 않는다 (§0.4, CLAUDE.md §6).

⚠️ **PyMuPDF(fitz) 금지** — AGPL/상용 이중 라이선스 (R11). 렌더링은 pypdfium2(Apache-2.0).

## 실행

```bash
python .claude/skills/figure-cropper/scripts/crop.py --plan output/media/<unit-id>.plan.json
python .claude/skills/figure-cropper/scripts/crop.py --plan ... --dry-run
```

## plan.json

```jsonc
{
  "unit_id": "mate-1",
  "source_pdf": "inbox/textbook/....pdf",
  "out_dir": "app/public/media",
  "teacher": "교사 본인",              // ★ 실명으로 채워야 한다 (대장은 감사 추적용)
  "watermark": "○○고등학교 수업 목적 이용 (저작권법 제25조 제3항) · 천재교과서 「물질과 에너지」",
  "crops": [{
    "id": "mate-1-fig-23",
    "concept_id": "mate-vapor-pressure",   // 이 그림이 붙을 카드
    "figure_no": "그림 Ⅰ-23",
    "caption": "물의 증기 압력 곡선",
    "page": 35,                            // 인쇄 쪽수 (= PDF 쪽수, C0 에서 검증됨)
    "bbox": [392, 98, 548, 228],           // 상단 원점 pt. 캡션을 포함시켜라
    "kind": "graph",
    "rights": {
      "holder":    "천재교과서",
      "source":    "천재교과서 「물질과 에너지」(임희준 외 7인) 035쪽 그림 Ⅰ-23",
      "basis":     "저작권법 제25조 제3항 수업 목적 이용 (제6항에 따라 보상금 면제)",
      "condition": "초대 코드 기반 수업 참여 학생 한정 · 학기 종료 시 만료 · 서명 URL · 검색 색인 차단"
    }
  }]
}
```

`rights` 4필드 중 하나라도 비면 그 자산은 **크롭하지 않고 제외 + 로그**한다.
재시도하지 않는다 — 권리 미상 자산은 절대 배포하지 않는다 (CLAUDE.md §6).

### bbox 는 캡션을 포함시켜라

"|그림 Ⅰ-23| 물의 증기 압력 곡선"을 크롭 안에 넣는다. 출처 표시가 그림에
**붙어 다니게** 하기 위해서다. 이미지가 앱 밖으로 새어 나가도 출처가 따라간다.

## ★ bbox 잡는 법 — figures.json 을 그대로 믿지 마라

C0 의 `figures.json` 은 **후보일 뿐이다.** pdfplumber 의 `figure` 객체는 지면 밖으로
잘려 나간 벡터 경로까지 잡아, bbox 에 음수 top 이나 지면 폭을 넘는 x1 이 들어온다.
그대로 쓰면 엉뚱한 데가 잘린다.

**쪽을 렌더해 좌표 격자를 얹고 눈으로 잡아라.**

```python
import pypdfium2 as pdfium
from PIL import ImageDraw, ImageFont
SC = 1.4
pdf = pdfium.PdfDocument("inbox/textbook/....pdf")
img = pdf[page - 1].render(scale=SC).to_pil().convert("RGB")
d = ImageDraw.Draw(img)
font = ImageFont.truetype("malgun.ttf", 13)
for x in range(0, 650, 50):
    d.line([(x*SC, 0), (x*SC, img.height)], fill=(255, 0, 0))
    d.text((x*SC + 2, 2), str(x), fill=(255, 0, 0), font=font)
for y in range(0, 800, 50):
    d.line([(0, y*SC), (img.width, y*SC)], fill=(0, 90, 255))
    d.text((3, y*SC + 2), str(y), fill=(0, 90, 255), font=font)
img.save("grid.png")
```

### ★ 어긋남의 정체 — mediabox 오프셋

`text.jsonl` 의 좌표를 그대로 crop 에 넣으면 30~40pt 밀린다. 원인은 **PDF 의
mediabox 원점이 (0,0) 이 아니기 때문**이다. 이 교과서는 `page.bbox` 가
`(36.85, -36.85, 646.30, 756.85)` 라서 변환식이 이렇다:

```
render_x = plumber_x0  - 36.85
render_y = plumber_top + 36.85
```

교과서마다 값이 다르므로 **판본이 바뀌면 먼저 `page.bbox` 를 확인하라.**

```python
import pdfplumber
with pdfplumber.open(path) as pdf:
    print(pdf.pages[0].bbox)   # (x0, top, x1, bottom)
```

변환식을 알아도 **눈으로 확인하는 절차를 건너뛰지 마라.** 캡션과 그림 사이 여백,
옆단 사이드 노트, 지면 밖으로 흐르는 사진은 좌표만으로 판단할 수 없다.
mate-1 에서는 1차 시도 7장이 전부 어긋났다.

### 잉크 프로파일로 경계 찾기

본문과 그림 사이의 빈 띠를 pt 단위로 찾는 방법이다. 렌더한 뒤 열·행별로
비백색 픽셀이 있는 구간을 세면, 글자가 끝나고 그림이 시작하는 자리가 드러난다.
Ⅰ-1 은 캡션 행에서 본문이 x=356 에서 끝나고 캡션이 x=367.5 에서 시작해,
그 사이 362 를 경계로 잡았다.

`crop.py` 가 `PAD`(6pt)만큼 더 넓게 자르므로, 격자에서 확정한 값에 6 을 더해 넣으면
의도한 그대로 나온다.

## 규칙 상수 (§4.4)

| 항목 | 값 | 근거 |
|---|---|---|
| 단원당 크롭 | **상한 없음** | 2026-09-05 교사 결정 (CLAUDE.md §0, docs/rights_policy.md §2). 되살리려면 `UNIT_CROP_LIMIT` 를 정수로 |
| 렌더 배율 | 2.0 | 레티나 |
| 폭 상한 | 1200px | 원본 대비 축소가 C7 성공 기준 |

상한이 있을 때는 초과분이 계획 순서대로 잘려 나간다 — 그때는 **중요한 것을 앞에 두어라.**

### 같은 그림을 여러 카드가 쓸 때

같은 `(page, bbox)` 는 **한 장의 크롭**이다. `crop.py` 가 자동으로 묶어 파일 하나,
대장 한 행(`concept_ids` 에 카드 여럿)으로 만든다. 두 행으로 쪼개면 "교과서에서 몇 장을
가져왔나" 가 부풀려지는데, 상한을 푼 뒤로는 그 숫자가 곧 감사 대상이다.

## ★ 캡션 없는 그림은 쓰지 마라

크롭에 캡션을 넣는 이유는 **출처가 그림에 붙어 다니게** 하려는 것이다. 그림 번호와
캡션이 없는 삽화(「해 보기」 안의 표, 장식 사진 등)는 그 장치가 통하지 않는다.
카드 명제를 더 잘 받쳐 주더라도 **쓰지 않는다.**

마땅한 그림이 없으면 **그 카드는 그림 없이 둔다.** 억지로 붙이면 캡션과 표제어가
어긋나 학생이 헷갈린다. mate-1 은 30장 중 2장(기체 상수·몰분율)을 비워 두었다.

## 산출물

- `<out_dir>/<asset-id>.png` — 크롭 + 하단 워터마크 띠
- `output/rights/ledger.jsonl` — 자산 1건 = 1행 (권리 메타·`access_tier`·sha256·bbox)
- `output/logs/pipeline.jsonl` — 크롭 수·제외 사유

## 워터마크

그림 **위에 겹치지 않는다.** 아래에 띠를 덧대 거기 적는다 — 덮으면 학습 자료로
못 쓰게 된다. 좁은 크롭에서는 글자 크기를 줄이고, 그래도 안 맞으면 `·` 를 기준으로
두 줄로 접는다.

## 끝낸 뒤

**컨택트 시트를 만들어 눈으로 봐라.** 스크립트는 "잘렸는지"를 판정하지 못한다.

```python
# app/public/media/*.png 를 세로로 이어 붙여 한 장으로 보고 확인
```

그다음 카드에 연결할 때는 **대장에서 읽어라.** 앱 데이터를 손으로 짜맞추면
대장과 앱이 갈라지고, 갈라지면 어느 쪽이 맞는지 알 수 없게 된다.
