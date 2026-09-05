#!/usr/bin/env python3
"""C7 그림 크롭 — 크롭 → 리사이즈 → 워터마크 → 권리 메타 → 대장 기록.

Sci_Map 설계서 §4.3 C7 을 그대로 구현한다.

★ 어느 그림이 어느 개념의 것인가는 **이 스크립트가 정하지 않는다.** LLM 이
  정해서 plan.json 에 적어 주면 이 스크립트는 그대로 오려낸다. 스크립트는
  형식만 본다 (§3.1).

★ PyMuPDF(fitz) 를 쓰지 않는다 — AGPL/상용 이중 라이선스 (R11, CLAUDE.md §8).
  렌더링은 pypdfium2(Apache-2.0).

사용:
    python crop.py --plan output/media/mate-1.plan.json
    python crop.py --plan ... --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]

# ── 규칙 상수 (설계서 §4.4) ─────────────────────────────────────────────────
# 단원당 교과서 그림 크롭 상한. None = 상한 없음.
# 2026-09-05 교사 결정으로 상한을 풀었다 (CLAUDE.md §0, docs/rights_policy.md §2).
# 되살리려면 정수로 두면 된다 — 초과분이 자동 제외된다.
UNIT_CROP_LIMIT = None
RENDER_SCALE = 2.0         # PDF 포인트 → 픽셀 배율 (레티나)
MAX_WIDTH = 1200           # 리사이즈 상한. 원본 해상도 대비 축소가 C7 성공 기준
PAD = 6                    # bbox 여백(pt)

LEDGER = REPO / "output" / "rights" / "ledger.jsonl"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), **row}, ensure_ascii=False) + "\n")


def derive_access_tier(holder: str, teacher: str) -> str:
    """★판단이 아니라 규칙이다 (§0.4, CLAUDE.md §6).

    권리자가 교사 자신이 아니면 무조건 restricted. 예외 없다.
    """
    return "public" if holder.strip() == teacher.strip() else "restricted"


def render_crop(pdf_path: Path, page_no: int, bbox, scale: float):
    """PDF 한 쪽을 렌더해 bbox 만 오려낸다. bbox 는 pdfplumber 좌표(상단 원점)."""
    import pypdfium2 as pdfium
    from PIL import Image

    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        page = pdf[page_no - 1]  # 1-base → 0-base
        pw, ph = page.get_width(), page.get_height()
        bitmap = page.render(scale=scale)
        img: Image.Image = bitmap.to_pil()

        x0, top, x1, bottom = bbox
        # 여백을 주되 지면 밖으로 나가지 않게 자른다
        x0 = max(0.0, x0 - PAD)
        top = max(0.0, top - PAD)
        x1 = min(pw, x1 + PAD)
        bottom = min(ph, bottom + PAD)
        if x1 <= x0 or bottom <= top:
            raise ValueError(f"빈 bbox: {bbox}")

        box = (round(x0 * scale), round(top * scale), round(x1 * scale), round(bottom * scale))
        return img.crop(box)
    finally:
        pdf.close()


def watermark(img, text: str):
    """워터마크 — 학교명·수업목적 이용 문구 (§4.3 C7).

    그림 위에 겹치지 않는다. 아래에 띠를 덧대 거기 적는다 —
    그림을 덮으면 학습 자료로서 못 쓰게 된다.
    """
    from PIL import Image, ImageDraw, ImageFont

    # 좁은 크롭에서 문구가 잘리면 워터마크가 제 구실을 못한다.
    # 폭에 맞을 때까지 글자를 줄이고, 그래도 안 맞으면 두 줄로 접는다.
    def load(size):
        for name in ("malgun.ttf", "malgunsl.ttf", "NanumGothic.ttf", "gulim.ttc"):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default()

    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    avail = img.width - 12
    size, font = 11, load(11)
    while size > 7 and probe.textlength(text, font=font) > avail:
        size -= 1
        font = load(size)

    lines = [text]
    if probe.textlength(text, font=font) > avail:
        parts, cur = text.split(" · "), ""
        lines = []
        for part in parts:
            trial = f"{cur} · {part}" if cur else part
            if probe.textlength(trial, font=font) > avail and cur:
                lines.append(cur)
                cur = part
            else:
                cur = trial
        if cur:
            lines.append(cur)

    line_h = size + 5
    band = line_h * len(lines) + 8
    out = Image.new("RGB", (img.width, img.height + band), "white")
    out.paste(img.convert("RGB"), (0, 0))

    draw = ImageDraw.Draw(out)
    draw.rectangle([0, img.height, out.width, out.height], fill="#f2f4f7")

    for i, line in enumerate(lines):
        draw.text((6, img.height + 4 + i * line_h), line, fill="#5b6b7f", font=font)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True, help="크롭 계획 JSON")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    unit_id = plan["unit_id"]
    pdf_path = REPO / plan["source_pdf"]
    out_dir = REPO / plan["out_dir"]
    teacher = plan["teacher"]
    crops = plan["crops"]

    if not pdf_path.exists():
        print(f"원본 PDF 없음: {pdf_path}", file=sys.stderr)
        return 2

    # ── 상한 검사 — 초과분은 자동 제외 + 로그 (상한이 있을 때만) ────────────
    if UNIT_CROP_LIMIT is None:
        kept, dropped = crops, []
    else:
        kept, dropped = crops[:UNIT_CROP_LIMIT], crops[UNIT_CROP_LIMIT:]
    for c in dropped:
        log(stage="C7", result="skip", unit_id=unit_id,
            reason=f"단원 크롭 상한({UNIT_CROP_LIMIT}장) 초과로 제외",
            asset=c.get("id"), figure=c.get("figure_no"))
        print(f"[제외] {c.get('id')} — 상한 초과")

    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
        LEDGER.parent.mkdir(parents=True, exist_ok=True)

    # ── 같은 그림을 여러 카드가 쓰는 경우 ────────────────────────────────────
    # 같은 (page, bbox) 는 **한 장의 크롭**이다. 파일도 대장도 하나로 둔다.
    # 두 행으로 쪼개면 "교과서에서 몇 장을 가져왔나" 가 부풀려지는데,
    # 상한을 푼 뒤로는 그 숫자가 곧 감사 대상이다 (docs/rights_policy.md).
    merged: list[dict] = []
    seen: dict[tuple, dict] = {}
    for c in kept:
        key = (c["page"], tuple(c["bbox"]))
        if key in seen:
            seen[key].setdefault("concept_ids", [seen[key].get("concept_id")])
            seen[key]["concept_ids"].append(c.get("concept_id"))
            print(f"[공유] {c.get('id')} -> {seen[key]['id']} 와 같은 크롭 "
                  f"({c.get('concept_id')} 가 함께 쓴다)")
            continue
        seen[key] = c
        merged.append(c)
    kept = merged

    rows, failures = [], []
    for c in kept:
        rights = c["rights"]

        # 권리 메타 필수 — 하나라도 없으면 배포 제외 (재시도 없음)
        missing = [k for k in ("holder", "source", "basis", "condition") if not rights.get(k)]
        if missing:
            failures.append((c["id"], f"권리 메타 누락: {', '.join(missing)}"))
            log(stage="C7", result="exclude", unit_id=unit_id, asset=c["id"],
                reason=f"권리 메타 누락({', '.join(missing)}) — 배포 제외")
            print(f"[제외] {c['id']} — 권리 메타 누락: {', '.join(missing)}")
            continue

        tier = derive_access_tier(rights["holder"], teacher)

        img = render_crop(pdf_path, c["page"], c["bbox"], RENDER_SCALE)
        if img.width > MAX_WIDTH:  # 원본 대비 축소 (C7 성공 기준)
            from PIL import Image
            h = round(img.height * MAX_WIDTH / img.width)
            img = img.resize((MAX_WIDTH, h), Image.LANCZOS)

        img = watermark(img, plan["watermark"])

        fname = f"{c['id']}.png"
        if not args.dry_run:
            img.save(out_dir / fname, "PNG", optimize=True)
            digest = hashlib.sha256((out_dir / fname).read_bytes()).hexdigest()[:16]
        else:
            digest = "(dry-run)"

        row = {
            "ts": now(), "asset_id": c["id"], "unit_id": unit_id,
            "concept_id": c.get("concept_id"),
            "concept_ids": c.get("concept_ids", [c.get("concept_id")]),
            "file": f"{plan['out_dir']}/{fname}",
            "sha256_16": digest, "kind": c.get("kind", "figure"),
            "caption": c.get("caption"), "figure_no": c.get("figure_no"),
            "page": c["page"], "bbox": c["bbox"],
            "width": img.width, "height": img.height,
            "rights": rights, "access_tier": tier,
        }
        rows.append(row)
        print(f"[크롭] {c['id']:26s} p{c['page']:<3} {img.width}x{img.height}  tier={tier}  {c.get('caption','')}")

    if not args.dry_run and rows:
        with LEDGER.open("a", encoding="utf-8", newline="\n") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    tiers = {}
    for r in rows:
        tiers[r["access_tier"]] = tiers.get(r["access_tier"], 0) + 1
    print()
    used_by = sum(len(r.get("concept_ids") or []) for r in rows)
    print(f"=> C7 {'(dry-run) ' if args.dry_run else ''}크롭 {len(rows)}장"
          f" (카드 {used_by}장이 사용) / 계획 {len(crops)}"
          f" · 상한 제외 {len(dropped)} · 메타 누락 제외 {len(failures)}")
    print(f"   access_tier: {tiers}")
    if not args.dry_run:
        print(f"   대장: {LEDGER.relative_to(REPO)} (+{len(rows)}행)")

    if not args.dry_run:
        log(stage="C7", result="pass" if not failures else "partial", unit_id=unit_id,
            reason=f"그림 크롭 {len(rows)}장",
            cropped=len(rows), planned=len(crops),
            over_limit=len(dropped), meta_missing=len(failures),
            access_tier=tiers, out_dir=plan["out_dir"])

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
