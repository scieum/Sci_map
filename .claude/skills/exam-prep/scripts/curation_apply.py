#!/usr/bin/env python3
"""Q3·Q4 결과 검증·반영 — LLM 이 고른 카드와 쓴 해설을 형식으로 거른다.

설계서 §5.1 Q3·Q4 의 검증 절반이다. LLM 은 정성을 보고, **형식은 스크립트가**
본다 (CLAUDE.md §9.7). 여기서 거르는 것은 다음 다섯 가지다.

① 없는 문항 id → 버린다 (작업 파일에 없던 것을 지어낸 것이다)
② 후보 밖 카드 → 버린다 (Q3 의 근거는 성취기준·단원 범위뿐이다)
③ 없는 관계 명제 id → 버린다
④ **인용 명제가 없는 해설 → 버린다.** 설계서 §5.1 Q4 의 형식 요건이다 —
   해설이 카드에서 나왔다는 증거가 없으면 그것은 어디서 왔는지 알 수 없는 글이다
⑤ 문항 텍스트와 연속 12어절 이상 겹치는 해설 → 버린다 (재서술 의무, CLAUDE.md §6)

버린다는 것은 그 필드를 비운다는 뜻이지 문항을 버린다는 뜻이 아니다. 매핑 없는
문항은 예전처럼 후보를 보여 주고, 해설 없는 문항은 해설 없이 나간다.

사용:
    python curation_apply.py --all
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
ITEMS = REPO / "output" / "items"
TASKS = ITEMS / "_curation"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"

NGRAM = 12  # 원문 연속 일치 상한 (어절)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), "stage": "Q3Q4", **row}, ensure_ascii=False) + "\n")


def copies_source(explanation: str, source: str) -> bool:
    """문항 원문을 그대로 옮겼는가 — 연속 12어절 일치면 재서술이 아니다."""
    a, b = explanation.split(), source.split()
    if len(a) < NGRAM or len(b) < NGRAM:
        return False
    grams = {" ".join(b[i:i + NGRAM]) for i in range(len(b) - NGRAM + 1)}
    return any(" ".join(a[i:i + NGRAM]) in grams for i in range(len(a) - NGRAM + 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", help="단원 하나만")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if not args.all and not args.unit:
        print("--all 또는 --unit 이 필요하다", file=sys.stderr)
        return 2

    results: dict[str, dict] = {}
    rejected = {"unknown-item": 0, "outside-candidates": 0, "unknown-relation": 0,
                "no-citation": 0, "copied": 0}

    for task_path in sorted(TASKS.glob("*.task.json")):
        unit_id = task_path.name.split(".task")[0]
        if args.unit and unit_id != args.unit:
            continue
        res_path = TASKS / f"{unit_id}.result.json"
        if not res_path.exists():
            print(f"⚠ {unit_id}: 결과 파일이 없다 — 아직 안 돌았거나 실패했다")
            continue
        task = json.loads(task_path.read_text(encoding="utf-8"))
        res = json.loads(res_path.read_text(encoding="utf-8"))

        by_id = {i["item_id"]: i for i in task["items"]}
        rel_ids = {r["id"] for c in task["cards"].values() for r in c["relations"]}

        for row in res.get("results", []):
            item = by_id.get(row.get("item_id"))
            if not item:
                rejected["unknown-item"] += 1
                continue
            cands = set(item["candidates"])
            picked = [c for c in (row.get("concept_ids") or []) if c in cands]
            if len(picked) != len(row.get("concept_ids") or []):
                rejected["outside-candidates"] += 1
            cited = [r for r in (row.get("cited_relations") or []) if r in rel_ids]
            if len(cited) != len(row.get("cited_relations") or []):
                rejected["unknown-relation"] += 1

            explanation = (row.get("explanation") or "").strip() or None
            if explanation and not cited:
                rejected["no-citation"] += 1
                explanation = None
            if explanation and copies_source(explanation, item.get("text", "")):
                rejected["copied"] += 1
                explanation = None

            results[item["item_id"]] = {
                "concept_ids": picked[:2],
                "cited_relations": cited,
                "explanation": explanation,
                "reason": (row.get("reason") or "").strip() or None,
            }

    # 회차 파일에 반영
    touched = 0
    stat = {"mapped": 0, "explained": 0, "total": 0}
    for path in sorted(ITEMS.glob("*/items.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for item in doc["items"]:
            row = results.get(item["item_id"])
            if not row:
                continue
            stat["total"] += 1
            if row["concept_ids"]:
                item["concept_ids"] = row["concept_ids"]
                item["mapping"] = "llm"
                stat["mapped"] += 1
            if row["explanation"]:
                item["explanation"] = row["explanation"]
                item["cited_relations"] = row["cited_relations"]
                stat["explained"] += 1
            if row["reason"]:
                item["mapping_reason"] = row["reason"]
            changed = True
        if changed:
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8", newline="\n")
            touched += 1

    print(f"회차 {touched}개 갱신 · 결과 받은 문항 {stat['total']}")
    print(f"  카드 확정 {stat['mapped']} · 해설 {stat['explained']}")
    bad = {k: v for k, v in rejected.items() if v}
    if bad:
        print(f"  형식 검사에서 버림: {bad}")
    log(result="ok", **stat, rejected=bad)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
