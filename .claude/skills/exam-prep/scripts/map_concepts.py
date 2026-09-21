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
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "output" / "source" / "exam"
ITEMS = REPO / "output" / "items"
CONCEPTS = REPO / "output" / "concepts"
REVIEW = REPO / "output" / "review"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), "stage": "Q3", **row}, ensure_ascii=False) + "\n")


def load_papers(subject: str | None = None) -> tuple[dict, list[dict]]:
    """papers.json 을 읽어 (과목 메타, 회차 목록) 을 돌려준다.

    여러 과목이 한 파일에 담긴다. 과목을 지정하지 않으면 전부 이어 붙인다 —
    `--all` 은 "들어온 자료 전부" 라는 뜻이지 "마지막에 넣은 과목" 이 아니다.
    """
    index = json.loads((SRC / "papers.json").read_text(encoding="utf-8"))
    subjects = index.get("subjects") or {}
    out: list[dict] = []
    meta: dict = {}
    for code, entry in subjects.items():
        if subject and code != subject:
            continue
        for rec in entry["papers"]:
            rec = dict(rec)
            rec["subject"] = entry["subject"]
            rec["publisher"] = entry.get("publisher", "발행사")
            out.append(rec)
        meta[code] = entry
    return meta, out


def card_index(subject_code: str) -> tuple[dict[str, list[dict]], list[dict]]:
    """(성취기준 코드 → 그 코드를 인용한 카드들, 그 과목의 카드 전부).

    코드는 카드가 아니라 **관계 명제**에 붙어 있다. 한 카드의 명제 여럿이 같은
    코드를 들 수 있으므로 카드 단위로 접어 둔다. 코드가 하나도 붙지 않은 카드도
    소단원 후보로는 쓸 수 있으므로 함께 돌려준다.
    """
    by_code: dict[str, list[dict]] = defaultdict(list)
    cards: list[dict] = []
    for path in sorted(CONCEPTS.glob(f"{subject_code}-*/*.json")):
        card = json.loads(path.read_text(encoding="utf-8"))
        codes: set[str] = set()
        for rel in card.get("relations", []):
            for c in rel.get("curriculum", []) or []:
                codes.add(c)
        for c in card.get("curriculum", []) or []:
            codes.add(c)
        brief = {
            "id": card["id"],
            "term": card["term"],
            "topic_id": card.get("topic_id") or card.get("topicId"),
        }
        cards.append(brief)
        for c in sorted(codes):
            by_code[c].append(brief)
    return by_code, cards


def widen_by_topic(cands: list[dict], cards: list[dict]) -> list[dict]:
    """코드로 찾은 카드와 **같은 소단원**의 카드를 후보에 넣는다.

    발행사가 문항에 적어 둔 성취기준 코드와 우리 카드가 인용한 코드가 늘
    맞지는 않는다. TCA 회로 문항은 `12세포03-03` 으로 적혀 있는데 `cell-tca-cycle`
    카드는 `12세포03-02` 를 인용한 식이다. 코드 교집합만 후보로 주면 정작 그
    문항이 묻는 카드가 후보에서 빠지고, LLM 은 옆 카드로 우회하게 된다.

    그래서 코드로 찾은 카드가 속한 **중단원(소단원 id 의 윗자리)** 까지 후보를
    넓힌다. 발행사의 코드가 옆 소단원을 가리켜도 그 중단원 안에는 들어온다.

    넓히는 근거는 **소단원 id 대조**다 — 표제어가 비슷하다는 이유로 넣지 않는다
    (CLAUDE.md §9.5). 어느 카드를 묻는 문항인지 고르는 일은 여전히 LLM 몫이다.
    """
    scopes = {c["topic_id"].rsplit("-", 1)[0] for c in cands if c.get("topic_id")}
    if not scopes:
        return cands
    out = {c["id"]: c for c in cands}
    for card in cards:
        tid = card.get("topic_id") or ""
        if any(tid == s or tid.startswith(s + "-") for s in scopes):
            out.setdefault(card["id"], card)
    return sorted(out.values(), key=lambda c: c["id"])


def deployed(subject_code: str) -> bool:
    """교사가 Q6 에서 승인해 이미 학생에게 나간 과목인가.

    후보 목록(`concept_candidates`)은 앱 번들에 실려 나가는 필드다. 승인된
    과목에 이 스크립트를 다시 돌리면 학생이 보고 있는 것이 조용히 바뀐다 —
    후보를 넓히는 일은 **승인 전에** 끝나야 한다.
    """
    path = REVIEW / f"{subject_code}-exam.review.md"
    if not path.exists():
        return False
    return bool(re.search(r"^approved:\s*true\s*$", path.read_text(encoding="utf-8"), re.M))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--wide-item", action="append", default=[], metavar="ITEM_ID",
                    help="그 문항만 단원 전체를 후보로 준다 — 발행사 성취기준 코드가 "
                         "문항 주제와 어긋나 코드로는 카드를 찾을 수 없을 때, 사람이 "
                         "문항을 보고 지정한다")
    ap.add_argument("--force", action="store_true",
                    help="이미 승인·배포된 과목도 다시 매핑한다 (기본은 건너뛴다)")
    args = ap.parse_args()
    wide = set(args.wide_item)

    meta, papers = load_papers()
    if args.paper:
        papers = [p for p in papers if p["paper_id"] == args.paper]
    elif not args.all:
        print("--paper 또는 --all 이 필요하다", file=sys.stderr)
        return 2

    # 카드 사전은 과목마다 따로 만든다 — 다른 과목 카드가 후보로 끼면 안 된다
    built = {code: card_index(code) for code in meta}
    indexes = {code: pair[0] for code, pair in built.items()}
    # 성취기준이 붙지 않은 카드도 단원·소단원 범위 후보로는 쓸 수 있다
    all_cards = {code: pair[1] for code, pair in built.items()}
    for code, idx in indexes.items():
        print(f"{code}: 성취기준 {len(idx)}개에 카드가 붙어 있다")

    total = unmapped = 0
    for rec in papers:
        pid = rec["paper_id"]
        path = ITEMS / pid / "items.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        if deployed(doc["subject_code"]) and not args.force:
            print(f"  {pid:24s} ⏸ 승인·배포된 과목이라 건너뛴다 (--force 로만 다시 돈다)")
            continue
        by_code = indexes.get(doc["subject_code"], {})
        cards = all_cards.get(doc["subject_code"], [])
        miss: list[int] = []
        for item in doc["items"]:
            total += 1
            # 문항에 성취기준이 붙어 있으면 그것, 없으면 회차 전체의 성취기준
            # (최소성취수준평가는 파일 이름이 곧 기준이다)
            code = item.get("curriculum") or doc.get("curriculum")
            cands = by_code.get(code, []) if code else []
            # 소단원 형성평가는 어느 소단원의 시험지인지 파일 이름이 말해 준다.
            # 같은 성취기준이라도 다른 소단원의 카드는 이 회차의 문항일 수 없다 —
            # 이것도 문자열이 아니라 id 대조다 (CLAUDE.md §9.5)
            topic = doc.get("topic_id")
            if topic:
                narrowed = [c for c in cands if c.get("topic_id") == topic]
                if narrowed:
                    cands = narrowed
            prefix = doc.get("topic_prefix")
            if prefix:
                narrowed = [c for c in cands if (c.get("topic_id") or "").startswith(prefix + "-")]
                if narrowed:
                    cands = narrowed

            # 성취기준이 아예 없는 자료(대단원 총괄평가)는 단원으로라도 좁힌다.
            # 문항을 읽어야 카드가 정해지므로 여기서는 범위만 준다 — 고르는 일은 LLM 몫
            if not cands or item["item_id"] in wide:
                scope = doc.get("topic_prefix") or doc["unit_id"]
                cands = [c for c in cards if (c.get("topic_id") or "").startswith(scope)]
            else:
                cands = widen_by_topic(cands, cards)
            item["concept_candidates"] = [c["id"] for c in cands]
            # ★ 이미 LLM(Q3)이 고른 카드는 건드리지 않는다. 후보를 넓히려고 다시
            #   돌렸을 뿐인데 확정된 매핑과 그 위에 쓴 해설이 함께 날아가면
            #   재실행이 곧 되돌리기가 된다
            curated = (item.get("mapping") == "llm" and item.get("concept_ids")
                       and item["item_id"] not in wide)
            if curated:
                item["mapping"] = "llm"
            else:
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
