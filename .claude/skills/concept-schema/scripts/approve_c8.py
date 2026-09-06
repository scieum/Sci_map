#!/usr/bin/env python3
"""C8 승인 기록 — 사람의 판정을 카드에 반영한다.

**이 스크립트는 판정하지 않는다.** 사람이 내린 판정을 받아 적을 뿐이다.
그래서 `--by`(누가)를 필수로 받고, 항목별 검토 없이 일괄 승인한 경우
`--blanket` 로 그 사실을 기록에 남긴다 — 나중에 "이건 누가 언제 어떻게
승인한 것인가" 를 물을 수 있어야 한다 (CLAUDE.md §5, §12).

승인된 명제만 `verified_by: teacher` 가 되고, 그것만 데일리 문항이 된다.
명제 하나도 승인되지 않은 카드는 `quiz_ready: false` 로 둔다 (부분 승인).

사용:
    python approve_c8.py mate-2 --all --by "홍길동" --blanket
    python approve_c8.py mate-2 --relations rel-a1 rel-b2 --by "홍길동"
    python approve_c8.py mate-2 --revoke --by "홍길동"      # 되돌리기
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
LOG = REPO / "output" / "logs" / "pipeline.jsonl"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("unit")
    ap.add_argument("--by", required=True, help="판정한 사람. 대장은 감사 추적용이다")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="이 단원의 명제 전부 승인")
    g.add_argument("--relations", nargs="+", help="승인할 명제 id")
    g.add_argument("--revoke", action="store_true", help="승인을 전부 되돌린다")
    ap.add_argument("--blanket", action="store_true",
                    help="항목별 검토 없이 일괄 승인했음을 기록에 남긴다")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    d = REPO / "output" / "concepts" / args.unit
    files = sorted(f for f in d.glob("*.json") if not f.name.endswith(".candidates.json"))
    if not files:
        print(f"카드가 없다: {d}", file=sys.stderr)
        return 2

    want = set(args.relations or [])
    approved, revoked, cards_ready, cards_blocked = [], [], [], []

    for f in files:
        card = json.loads(f.read_text(encoding="utf-8"))
        changed = False
        for r in card["relations"]:
            if args.revoke:
                if r.get("verified_by") == "teacher":
                    r["verified_by"] = "pending"; revoked.append(r["id"]); changed = True
            elif args.all or r["id"] in want:
                if r.get("verified_by") != "teacher":
                    r["verified_by"] = "teacher"; approved.append(r["id"]); changed = True
        ok = any(r.get("verified_by") == "teacher" for r in card["relations"])
        if card.get("quiz_ready") != ok:
            card["quiz_ready"] = ok; changed = True
        (cards_ready if ok else cards_blocked).append(card["id"])
        if changed:
            f.write_text(json.dumps(card, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8", newline="\n")

    record = {
        "ts": now(), "unit_id": args.unit, "gate": "C8",
        "approved_by": args.by,
        "mode": "revoke" if args.revoke else ("all" if args.all else "partial"),
        "reviewed_item_by_item": not args.blanket,
        "approved": bool(approved) and not args.revoke,
        "relations_approved": sorted(approved),
        "relations_revoked": sorted(revoked),
        "cards_quiz_ready": sorted(cards_ready),
        "cards_blocked": sorted(cards_blocked),
        "note": args.note,
    }
    out = REPO / "output" / "review" / f"{args.unit}.approval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8", newline="\n")

    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({
            "ts": now(), "stage": "C8",
            "result": "revoke" if args.revoke else "approve",
            "unit_id": args.unit, "approved_by": args.by,
            "reviewed_item_by_item": not args.blanket,
            "relations": len(revoked if args.revoke else approved),
            "cards_quiz_ready": len(cards_ready),
            "reason": args.note or ("항목별 검토 없이 일괄 승인" if args.blanket else "C8 사람 게이트 판정"),
        }, ensure_ascii=False) + "\n")

    verb = "승인 철회" if args.revoke else "승인"
    print(f"C8 {verb} — {args.unit} · 명제 {len(revoked if args.revoke else approved)}개 · "
          f"quiz_ready 카드 {len(cards_ready)}/{len(cards_ready)+len(cards_blocked)}")
    print(f"   판정: {args.by}"
          + ("  (★항목별 검토 없이 일괄)" if args.blanket else ""))
    print(f"   기록: {out.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
