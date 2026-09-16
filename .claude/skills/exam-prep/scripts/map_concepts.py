#!/usr/bin/env python3
"""Q3 개념 매핑(기계 몫) — 성취기준 코드로 후보 카드를 좁힌다.

설계서 §5.1 Q3 은 LLM(item-curator) 이 하는 단계지만, 이 자료에는 발행사가
적어 둔 **성취기준 코드**가 문항마다 붙어 있고 개념 카드의 관계 명제에도 같은
코드가 붙어 있다. 그래서 "어느 성취기준의 문항인가" 는 **대조로 정해진다.**

이 스크립트가 하는 일은 거기까지다. 같은 성취기준 아래 카드가 여럿일 때
**어느 카드를 묻는 문항인가**는 문항을 읽어야 알 수 있고, 그것은 LLM 의 몫이다
(CLAUDE.md §9.7 — 스크립트는 형식, LLM 은 정성, 사람이 진위).

★ 문자열이 비슷하다고 링크를 걸지 않는다 (CLAUDE.md §9.5). 근거는 성취기준
  코드 일치뿐이고, 코드가 없으면 `unmapped` 로 남긴다.

사용:
    python map_concepts.py --all
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "output" / "source" / "exam"
ITEMS = REPO / "output" / "items"
CONCEPTS = REPO / "output" / "concepts"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), "stage": "Q3", **row}, ensure_ascii=False) + "\n")


def card_index(subject_code: str) -> dict[str, list[dict]]:
    """성취기준 코드 → 그 코드를 인용한 카드들.

    코드는 카드가 아니라 **관계 명제**에 붙어 있다. 한 카드의 명제 여럿이 같은
    코드를 들 수 있으므로 카드 단위로 접어 둔다.
    """
    by_code: dict[str, list[dict]] = defaultdict(list)
    for path in sorted(CONCEPTS.glob(f"{subject_code}-*/*.json")):
        card = json.loads(path.read_text(encoding="utf-8"))
        codes: set[str] = set()
        for rel in card.get("relations", []):
            for c in rel.get("curriculum", []) or []:
                codes.add(c)
        for c in card.get("curriculum", []) or []:
            codes.add(c)
        for c in sorted(codes):
            by_code[c].append({
                "id": card["id"],
                "term": card["term"],
                "topic_id": card.get("topic_id") or card.get("topicId"),
            })
    return by_code


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    index = json.loads((SRC / "papers.json").read_text(encoding="utf-8"))
    papers = index["papers"]
    if args.paper:
        papers = [p for p in papers if p["paper_id"] == args.paper]
    elif not args.all:
        print("--paper 또는 --all 이 필요하다", file=sys.stderr)
        return 2

    by_code = card_index(index["subject_code"])
    print(f"성취기준 {len(by_code)}개에 카드가 붙어 있다")

    total = unmapped = 0
    for rec in papers:
        pid = rec["paper_id"]
        path = ITEMS / pid / "items.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        miss: list[int] = []
        for item in doc["items"]:
            total += 1
            code = item.get("curriculum")
            cands = by_code.get(code, []) if code else []
            # 소단원 형성평가는 어느 소단원의 시험지인지 파일 이름이 말해 준다.
            # 같은 성취기준이라도 다른 소단원의 카드는 이 회차의 문항일 수 없다 —
            # 이것도 문자열이 아니라 id 대조다 (CLAUDE.md §9.5)
            topic = doc.get("topic_id")
            if topic:
                narrowed = [c for c in cands if c.get("topic_id") == topic]
                if narrowed:
                    cands = narrowed
            item["concept_candidates"] = [c["id"] for c in cands]
            # 후보가 하나뿐이면 그 카드가 곧 답이다. 여럿이면 고르는 일은 LLM 몫
            item["concept_ids"] = [cands[0]["id"]] if len(cands) == 1 else []
            item["mapping"] = (
                "code-exact" if len(cands) == 1 else
                "needs-llm" if cands else "unmapped"
            )
            if not cands:
                unmapped += 1
                miss.append(item["no"])
        if miss:
            doc.setdefault("problems", []).append(f"성취기준으로 카드를 못 찾은 문항: {miss}")
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8", newline="\n")
        need = sum(1 for i in doc["items"] if i["mapping"] == "needs-llm")
        exact = sum(1 for i in doc["items"] if i["mapping"] == "code-exact")
        print(f"  {pid:24s} 후보 있음 {len(doc['items']) - len(miss)}/{len(doc['items'])}"
              f" · 확정 {exact} · LLM 필요 {need}")

    rate = unmapped / total * 100 if total else 0
    print(f"\n합계 {total}문항 · 후보 없음 {unmapped} ({rate:.0f}%)")
    # 설계서 §5.1 Q3: unmapped 25% 초과면 개념 파이프라인이 선행돼야 한다는 뜻
    if rate > 25:
        print("⚠ unmapped 25% 초과 — 해당 단원 카드가 아직 모자라다 (설계서 §5.1 Q3)")
    log(result="ok" if rate <= 25 else "warn", items=total, unmapped=unmapped)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
