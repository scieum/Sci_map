#!/usr/bin/env python3
"""C7 — figrefs(배정) + figbox(상자) 를 합쳐 crop.py 가 먹을 plan.json 을 만든다.

## 무엇이 원본인가

| 무엇 | 어디서 | 누가 정했나 |
|---|---|---|
| 어느 그림이 어느 카드의 것인가 | `output/concepts/<unit>.figrefs.json` | C2 `concept-writer` |
| 그림이 지면 어디에 있는가 | `output/media/<unit>.figbox.json` | `build_figbox.py` + 사람 확인 |
| 권리 메타 | 이 스크립트 + `docs/unit_backlog.yaml` | 규칙 |

**배정을 고치려면 figrefs 를 고쳐라.** 여기서 뒤집어 읽으므로 plan.json 을 손으로 고치면
다음 실행에서 되돌아간다.

## 좌표

figbox 의 bbox 는 **pdfplumber 좌표**이고 crop.py 는 **렌더 좌표**를 받는다. 이 스크립트가
`render = (x - page.bbox.x0, top - page.bbox.y0)` 로 바꿔 넣는다 — 쪽마다 상자가 다른
교과서가 있으므로 **쪽마다** page.bbox 를 읽는다 (「지구시스템과학」이 그런 판형이었다).
crop.py 는 보정하지 않는다.

## 같은 그림을 여러 카드가 쓸 때

같은 `(page, kind, no)` 는 크롭 한 장이고 `concept_ids` 에 카드가 여럿 달린다. 두 행으로
쪼개면 "교과서에서 몇 장을 가져왔나" 가 부풀려지는데, 상한을 푼 뒤로 그 숫자가 곧 감사
대상이다 (CLAUDE.md §6).

`asset_id` 는 `그림`/`표` 를 갈라 매긴다 — 한 쪽에서 그림과 표가 같은 번호를 쓸 수 있어
번호만으로 매기면 서로 덮어쓴다 (「지구시스템과학」 101쪽에서 실제로 겪었다).

## 권리

`rights` 4필드를 모두 채운다. 하나라도 비면 crop.py 가 그 자산을 제외한다 — 재시도하지
않는다 (CLAUDE.md §6). `teacher` 와 워터마크의 학교명은 **사람이 채워야 한다**. 기본값은
`○○고등학교` / `교사 본인` 이고 그대로 두면 C9 배포 전 검사에서 걸려야 한다.

사용: build_plan.py <unit-id> [--teacher 이름] [--school 학교명]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "textbook-parser" / "scripts"))
from _common import ROOT, find_subject, load_backlog  # noqa: E402

KIND_TAG = {"그림": "fig", "표": "tbl"}
KIND_NAME = {"그림": "figure", "표": "table"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("unit_id")
    ap.add_argument("--teacher", default="교사 본인")
    ap.add_argument("--school", default="○○고등학교")
    ap.add_argument("--out-dir", default="app/public/media")
    args = ap.parse_args()

    figbox = json.loads((ROOT / "output" / "media" / f"{args.unit_id}.figbox.json")
                        .read_text(encoding="utf-8"))
    figrefs = json.loads((ROOT / "output" / "concepts" / f"{args.unit_id}.figrefs.json")
                         .read_text(encoding="utf-8"))

    subject = find_subject(load_backlog(), args.unit_id)
    book = subject["textbook"]
    pdf_path = ROOT / book["file"]
    title = subject["name"]
    author = book.get("author", "")
    curriculum = subject.get("curriculum", "")

    boxes = {(f["page"], f["kind"], f["no"]): f for f in figbox["figures"]}

    # 배정 뒤집기 — (page, kind, no) -> [card_id …], figrefs 에 적힌 차례를 지킨다
    assigned: dict[tuple, list[str]] = {}
    ghosts: list[str] = []
    for card in figrefs["cards"]:
        for ref in card["figure_ref"]:
            key = (ref["page"], ref.get("kind", "그림"), ref["no"])
            if key not in boxes:
                ghosts.append(f"{card['card_id']} → {key} (figbox 에 없다)")
                continue
            assigned.setdefault(key, [])
            if card["card_id"] not in assigned[key]:
                assigned[key].append(card["card_id"])
    if ghosts:
        raise SystemExit("figrefs 가 figbox 에 없는 그림을 가리킨다:\n  " + "\n  ".join(ghosts))

    crops = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for key in sorted(assigned, key=lambda k: (k[0], KIND_TAG[k[1]], k[2])):
            page_no, kind, no = key
            f = boxes[key]
            px0, py0 = pdf.pages[page_no - 1].bbox[:2]
            x0, top, x1, bottom = f["bbox"]
            cards = assigned[key]
            crops.append({
                "id": f"{args.unit_id}-{KIND_TAG[kind]}-{no:02d}",
                "concept_id": cards[0],
                "concept_ids": cards,
                "figure_no": f"{kind} {no}",
                "caption": f["title"],
                "page": page_no,
                "bbox": [round(x0 - px0, 1), round(top - py0, 1),
                         round(x1 - px0, 1), round(bottom - py0, 1)],
                "kind": KIND_NAME[kind],
                "rights": {
                    "holder": book.get("publisher", ""),
                    "source": (f"{book.get('publisher', '')} 「{title}」({author}, {curriculum}) "
                               f"{page_no:03d}쪽 {kind} {no}"),
                    "basis": "저작권법 제25조 제3항 수업 목적 이용 (제6항에 따라 보상금 면제)",
                    "condition": "초대 코드 기반 수업 참여 학생 한정 · 학기 종료 시 만료 · 서명 URL · 검색 색인 차단",
                },
            })

    skipped = [{"figure": f"{p}쪽 {k} {n}", "caption": boxes[(p, k, n)]["title"],
                "reason": "이 그림을 받을 카드가 없다 — 억지로 붙이지 않는다"}
               for (p, k, n) in sorted(boxes, key=lambda x: (x[0], x[1], x[2]))
               if (p, k, n) not in assigned]

    plan = {
        "unit_id": args.unit_id,
        "source_pdf": book["file"],
        "out_dir": args.out_dir,
        "teacher": args.teacher,
        "watermark": f"{args.school} 수업 목적 이용 (저작권법 제25조 제3항) · {book.get('publisher', '')} 「{title}」",
        "note": (
            "★ watermark 의 학교명과 teacher 는 사람이 채워야 한다 (C9 배포 전 필수). "
            "★ bbox 는 **렌더 좌표**다 — build_plan.py 가 쪽마다 page.bbox 를 읽어 "
            "render = (x - bbox.x0, top - bbox.y0) 으로 이미 바꿔 넣었다. crop.py 는 보정하지 않는다. "
            "★ 배정표의 원본은 output/concepts/<unit>.figrefs.json 이다 — 여기서 뒤집어 읽으므로 "
            "배정을 고치려면 사이드카를 고치고 이 스크립트를 다시 돌려라. "
            "★ 같은 (page, kind, no) 는 크롭 한 장이고 concept_ids 에 카드가 여럿 달린다. "
            "skipped 는 크롭하지 않은 그림과 사유다."
        ),
        "skipped": skipped,
        "crops": crops,
    }
    out = ROOT / "output" / "media" / f"{args.unit_id}.plan.json"
    out.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    n_cards = len({c for v in assigned.values() for c in v})
    print(f"{args.unit_id}  크롭 {len(crops)}장 / 카드 {n_cards}장 / 제외 {len(skipped)}건 "
          f"→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
