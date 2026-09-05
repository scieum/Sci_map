#!/usr/bin/env python3
"""직접 만든 그림을 권리 대장에 등록한다.

⚠️ 현재 정책에서 쓰이지 않는다 — 2026-09-05 교사 결정으로 개념 카드의 그림은
   교과서 삽화만 쓴다 (CLAUDE.md §0). 정책이 바뀌면 그대로 동작한다.

교과서 크롭(crop.py)과 나란히 서는 다른 길이다. 무엇이 다른가:

|              | crop.py (교과서 그림)        | register_own.py (직접 만든 그림) |
|--------------|------------------------------|----------------------------------|
| 권리자       | 천재교과서                   | 교사 본인                        |
| access_tier  | restricted (규칙상 자동)     | public                           |
| 개수 상한    | 단원당 8장 (R2 "일부분")     | **없음** — 내 저작물이다         |
| 워터마크     | 수업목적 이용 문구 필수      | 불필요                           |

★ 상한이 없다고 해서 권리 기록을 건너뛰지 않는다. **권리 메타 없는 자산은
  배포하지 않는다**(CLAUDE.md §6). 내 저작물이라는 사실도 기록되어야
  나중에 누가 봐도 왜 public 인지 알 수 있다.

사용:
    # app/public/media/own/<card-id>.png 로 파일을 넣은 뒤
    python register_own.py --unit mate-1 --author "홍길동"
    python register_own.py --unit mate-1 --author "홍길동" --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
OWN_DIR = REPO / "app" / "public" / "media" / "own"
LEDGER = REPO / "output" / "rights" / "ledger.jsonl"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"

# crop.py 와 같은 규칙을 쓴다 — 판단이 아니라 규칙이다 (§0.4)
def derive_access_tier(holder: str, teacher: str) -> str:
    return "public" if holder.strip() == teacher.strip() else "restricted"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", required=True, help="단원 id (예: mate-1)")
    ap.add_argument("--author", required=True, help="그림을 만든 사람 = 권리자")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not OWN_DIR.is_dir():
        print(f"폴더가 없다: {OWN_DIR}", file=sys.stderr)
        return 2

    # 파일명이 곧 카드 id 다. 카드가 없으면 등록하지 않는다 — 붙을 데 없는 자산이다.
    cards_dir = REPO / "output" / "concepts" / args.unit
    card_ids = {f.stem for f in cards_dir.glob("*.json")} if cards_dir.is_dir() else set()

    existing = set()
    if LEDGER.exists():
        existing = {json.loads(l)["asset_id"] for l in LEDGER.open(encoding="utf-8")}

    rows, skipped = [], []
    for f in sorted(OWN_DIR.glob("*.*")):
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".svg", ".webp"):
            continue
        card_id = f.stem
        if card_ids and card_id not in card_ids:
            skipped.append((f.name, f"{args.unit} 에 그런 카드가 없다"))
            continue

        asset_id = f"{card_id}-own"
        if asset_id in existing:
            skipped.append((f.name, "이미 대장에 있다"))
            continue

        w = h = None
        if f.suffix.lower() == ".svg":
            # SVG 는 래스터가 아니라 PIL 이 열지 못한다. viewBox 에서 읽는다.
            import re as _re
            head = f.read_text(encoding="utf-8", errors="replace")[:2000]
            m = _re.search(r'viewBox\s*=\s*"[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"', head)
            if m:
                w, h = round(float(m.group(1))), round(float(m.group(2)))
        else:
            try:
                from PIL import Image
                with Image.open(f) as im:
                    w, h = im.size
            except Exception:
                pass

        holder = args.author
        rows.append({
            "ts": now(), "asset_id": asset_id, "unit_id": args.unit,
            "concept_id": card_id, "file": f"app/public/media/own/{f.name}",
            "sha256_16": hashlib.sha256(f.read_bytes()).hexdigest()[:16],
            "kind": "own-figure", "caption": None, "figure_no": None,
            "page": None, "bbox": None, "width": w, "height": h,
            "rights": {
                "holder": holder,
                "source": "자체 제작",
                "basis": "교사 본인의 저작물",
                "condition": "제한 없음",
            },
            "access_tier": derive_access_tier(holder, args.author),
        })
        print(f"[등록] {asset_id:34s} {f.name}  {w}x{h}")

    for name, why in skipped:
        print(f"[건너뜀] {name} — {why}")

    if rows and not args.dry_run:
        LEDGER.parent.mkdir(parents=True, exist_ok=True)
        with LEDGER.open("a", encoding="utf-8", newline="\n") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps({
                "ts": now(), "stage": "C7", "result": "pass", "unit_id": args.unit,
                "reason": f"직접 만든 그림 {len(rows)}장 등록 (access_tier: public, 상한 없음)",
                "registered": len(rows), "skipped": len(skipped),
            }, ensure_ascii=False) + "\n")

    print()
    print(f"=> {'(dry-run) ' if args.dry_run else ''}등록 {len(rows)}장 · 건너뜀 {len(skipped)}장")
    if rows and not args.dry_run:
        print("   다음: python app/scripts/build_concepts.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
