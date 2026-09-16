#!/usr/bin/env python3
"""Q3·Q4 준비 — 문항 텍스트를 뽑고 단원별 작업 파일을 만든다.

설계서 §5.1 Q2 의 나머지 절반이다. 크롭 영역의 텍스트를 뽑아 두면 LLM 이
"이 문항이 무엇을 묻는가" 를 읽을 수 있다.

★ 이 텍스트는 **매핑용 내부 자료다. 배포하지 않는다** (설계서 §5.1 Q2,
  CLAUDE.md §9.4). `build_items.py` 는 이 필드를 앱 번들에 담지 않는다.

★ 함께 실어 주는 카드 자료는 **관계 명제 id 와 원문**이다. 해설은 그 명제를
  인용해 써야 하고(Q4), 인용한 id 를 적어야 형식 검사를 통과한다. 발행사
  해설은 애초에 이 파일에 들어오지 않는다 — 우리가 읽지 않기 때문이다.

사용:
    python curation_prep.py --all
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "output" / "source" / "exam"
ITEMS = REPO / "output" / "items"
CONCEPTS = REPO / "output" / "concepts"
TASKS = ITEMS / "_curation"


def item_text(pdf_path: Path, boxes: list[tuple[int, list[float]]]) -> dict[int, str]:
    """크롭 영역 안의 글자만 모은다. 그림뿐인 문항은 짧게 나온다 — 그것도 정보다."""
    import pdfplumber

    out: dict[int, str] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for no, (page_no, bbox) in boxes:
            page = pdf.pages[page_no - 1]
            x0, top, x1, bottom = bbox
            crop = page.crop((max(0, x0), max(0, top),
                              min(float(page.width), x1), min(float(page.height), bottom)))
            text = (crop.extract_text() or "").strip()
            out[no] = " ".join(text.split())
    return out


def card_brief(subject_code: str, ids: set[str]) -> dict[str, dict]:
    """후보 카드의 요약 — 표제어·정의·관계 명제(id 와 원문)."""
    briefs: dict[str, dict] = {}
    for path in CONCEPTS.glob(f"{subject_code}-*/*.json"):
        card = json.loads(path.read_text(encoding="utf-8"))
        if card["id"] not in ids:
            continue
        briefs[card["id"]] = {
            "id": card["id"],
            "term": card["term"],
            "definition": card.get("definition", ""),
            "relations": [
                {"id": r["id"], "text": r["text"],
                 "condition": (r.get("form") or {}).get("condition") or r.get("condition")}
                for r in card.get("relations", [])
            ],
        }
    return briefs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--unit", help="단원 하나만 (isci2-2 …)")
    args = ap.parse_args()
    if not args.all and not args.unit:
        print("--all 또는 --unit 이 필요하다", file=sys.stderr)
        return 2

    docs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(ITEMS.glob("*/items.json"))]

    # 1) 문항 텍스트 — 아직 없는 것만 뽑는다 (다시 돌려도 싸다)
    for doc in docs:
        if args.unit and doc["unit_id"] != args.unit:
            continue
        if all(i.get("text_internal") is not None for i in doc["items"]):
            continue
        boxes = [(i["no"], (i["page"], i["bbox"])) for i in doc["items"]]
        texts = item_text(REPO / doc["source_pdf"], boxes)
        for i in doc["items"]:
            i["text_internal"] = texts.get(i["no"], "")
        path = ITEMS / doc["paper_id"] / "items.json"
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8", newline="\n")
        print(f"  텍스트 {doc['paper_id']}: {len(texts)}문항")

    # 2) 단원별 작업 파일
    by_unit: dict[str, list[dict]] = {}
    for doc in docs:
        if args.unit and doc["unit_id"] != args.unit:
            continue
        by_unit.setdefault(doc["unit_id"], []).append(doc)

    TASKS.mkdir(parents=True, exist_ok=True)
    made = []
    for unit_id, unit_docs in sorted(by_unit.items()):
        subject_code = unit_docs[0]["subject_code"]
        items = []
        cand_ids: set[str] = set()
        for doc in unit_docs:
            for i in doc["items"]:
                cands = i.get("concept_candidates", [])
                cand_ids.update(cands)
                items.append({
                    "item_id": i["item_id"],
                    "paper": doc["label"],
                    "no": i["no"],
                    "kind": i.get("kind"),
                    "answer": i.get("answer"),
                    "curriculum": i.get("curriculum") or doc.get("curriculum"),
                    "topic_label": i.get("topic_label"),
                    "text": i.get("text_internal", ""),
                    "candidates": cands,
                })
        task = {
            "unit_id": unit_id,
            "subject_code": subject_code,
            "cards": card_brief(subject_code, cand_ids),
            "items": items,
        }
        out = TASKS / f"{unit_id}.task.json"
        out.write_text(json.dumps(task, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8", newline="\n")
        made.append((unit_id, len(items), len(task["cards"])))

    for unit_id, n, c in made:
        print(f"{unit_id}: 문항 {n} · 후보 카드 {c} → output/items/_curation/{unit_id}.task.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
