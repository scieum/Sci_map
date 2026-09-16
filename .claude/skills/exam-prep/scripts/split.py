#!/usr/bin/env python3
"""Q1 문항 단위 분할·크롭 — 문항 번호 좌표로 경계를 잡아 오려낸다.

설계서 §5.1 Q1. 문항 번호(`01`~)가 단(column) 왼쪽 끝에 같은 크기로 찍혀 있는
편집이라, **번호의 좌표가 곧 경계**다. 번호를 세로로 이어 붙인 것이 한 단이고,
한 번호부터 다음 번호 직전까지가 한 문항이다.

단 수를 고정하지 않는다. 같은 회차 안에서도 세로 2단(A4 세로)과 가로 4단
(A4 가로, 서술형 대비)이 섞여 들어왔다. 번호 토큰의 x 좌표를 모아 군집을
내면 단이 몇 개든 같은 코드로 잡힌다.

★ `[01~02]` 공통 지문은 **두 문항 모두에 붙인다.** 지문을 뺀 크롭은 문제가
  성립하지 않고, 지문만 따로 보여 주면 학생이 두 화면을 오가야 한다. 지문
  블록과 문항 블록을 세로로 이어 한 장으로 만든다.

★ `access_tier` 는 판단이 아니라 규칙이다 — `rights.holder` 가 교사가 아니면
  무조건 `restricted` (CLAUDE.md §6). 이 자료의 권리자는 발행사다.

⚠️ PyMuPDF(fitz) 금지 — 렌더링은 pypdfium2 (CLAUDE.md §8).

사용:
    python split.py --all
    python split.py --paper isci2-mid-2-r1 --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "output" / "source" / "exam"
OUT = REPO / "output" / "items"
LEDGER = REPO / "output" / "rights" / "ledger.jsonl"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"

sys.path.insert(0, str(REPO / ".claude" / "skills" / "figure-cropper" / "scripts"))
from crop import watermark  # noqa: E402  — 워터마크 규칙은 한 곳에만 둔다

RENDER_SCALE = 2.0      # PDF 포인트 → 픽셀
PAD = 5                 # 블록 여백(pt)
MIN_BLOCK_H = 45        # 이보다 낮은 블록은 잘린 문항으로 보고 보고서에 올린다
COL_TOL = 4             # 같은 단으로 볼 x 오차(pt)

TEACHER = "교사 본인"    # 대장의 access_tier 도출 기준 (figure-cropper 와 같은 값)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), "stage": "Q1", **row}, ensure_ascii=False) + "\n")


def derive_access_tier(holder: str) -> str:
    """★판단이 아니라 규칙이다 (CLAUDE.md §6). 예외 없다."""
    return "public" if holder.strip() == TEACHER else "restricted"


# ── 경계 검출 ──────────────────────────────────────────────────────────────

NUM_AT_START = re.compile(r"^(\d{1,2})(?!\d)")


def number_candidates(page) -> list[dict]:
    """문항 번호로 볼 만한 토큰 후보.

    ★ 번호가 뒤 글자에 붙어 나오는 쪽이 있다 — "09그림은" 처럼 한 낱말로
      잡힌다. `\d{1,2}` 전체 일치만 보면 그 문항이 통째로 사라진다(실제로
      한 회차에서 9번이 빠졌다). 낱말 **앞머리**의 숫자를 본다.
    """
    out = []
    for w in page.extract_words():
        m = NUM_AT_START.match(w["text"])
        if not m:
            continue
        n = int(m.group(1))
        if not (1 <= n <= 40):
            continue
        out.append({**w, "no": n, "h": round(w["bottom"] - w["top"], 1)})
    return out


def pick_number_band(cands: list[dict]) -> float | None:
    """어느 글자 크기가 문항 번호인가.

    두 가지를 본다. ① **1부터 이어지는 번호**가 가장 긴 크기 — 번호는 1, 2, 3
    으로 이어진다는 성질이 "그 쪽에서 가장 큰 글자" 보다 튼튼하다(표 안 숫자가
    더 클 때가 있다). ② 그것으로 못 가리면 **같은 x 에 여러 번 선 크기** —
    번호는 단 왼쪽 끝에 줄지어 서고 본문 숫자는 그렇지 않다.

    ★ 지면 모양(세로/가로)마다 따로 고른다. 한 회차 안에서 마지막 쪽만 세로로
      돌아가며 번호 글자가 작아지는 편집이 있었고, 회차 전체를 한 크기로 보면
      그 쪽의 문항이 빠졌다.
    """
    if not cands:
        return None
    heights = sorted({c["h"] for c in cands})

    best, best_run = None, 0
    for h in heights:
        nums = {c["no"] for c in cands if abs(c["h"] - h) <= 0.4}
        run = 0
        while run + 1 in nums:
            run += 1
        if run > best_run:
            best, best_run = h, run
    if best_run >= 3:
        return best

    def aligned(h: float) -> int:
        xs = sorted(round(c["x0"], 1) for c in cands if abs(c["h"] - h) <= 0.4)
        groups: list[list[float]] = []
        for x in xs:
            if groups and x - groups[-1][-1] <= COL_TOL:
                groups[-1].append(x)
            else:
                groups.append([x])
        return sum(len(g) for g in groups if len(g) >= 2)

    scored = max(heights, key=lambda h: (aligned(h), h))
    if aligned(scored) > 0:
        return scored
    # 번호가 두엇뿐인 쪽 — 가장 흔한 크기로 둔다. 여기서 None 을 돌려주면
    # 크기 거르기가 통째로 풀려 표 안 숫자까지 문항이 된다
    return max(heights, key=lambda h: sum(1 for c in cands if abs(c["h"] - h) <= 0.4))


def number_tokens(page, band: float | None) -> list[dict]:
    cands = number_candidates(page)
    if band is None:
        return cands
    return [c for c in cands if abs(c["h"] - band) <= 0.4]


def columns_of(tokens: list[dict]) -> list[float]:
    """번호들의 x 좌표를 군집 내 단의 왼쪽 경계를 얻는다.

    ★ 한 쪽만 보고 정하지 않는다. 마지막 쪽에 번호가 하나뿐이면 그 쪽에서는
      단이 하나로 보이고, 그러면 그 번호가 어느 단에 속하는지 알 수 없다.
      실제로 그렇게 해서 문항 하나가 통째로 빠졌다 — 단은 **회차 전체**의
      번호를 모아 정한다.
    """
    xs = sorted(round(w["x0"], 1) for w in tokens)
    cols: list[list[float]] = []
    for x in xs:
        if cols and x - cols[-1][-1] <= COL_TOL:
            cols[-1].append(x)
        else:
            cols.append([x])
    starts = [sum(c) / len(c) for c in cols if len(c) >= 2] or [sum(c) / len(c) for c in cols]
    return sorted(starts)


def band_of(col_starts: list[float], i: int, page_width: float) -> tuple[float, float]:
    """i 번째 단이 차지하는 x 구간. 다음 단 시작 직전까지가 제 몫이다."""
    left = max(0.0, col_starts[i] - 8)
    right = (col_starts[i + 1] - 8) if i + 1 < len(col_starts) else (page_width - 12)
    return left, right


def content_bottom(page, left: float, right: float, top: float) -> float:
    """이 단에서 글과 그림이 실제로 끝나는 지점. 그림은 words 에 잡히지 않는다."""
    bottom = top
    for w in page.extract_words():
        if left <= w["x0"] <= right and w["top"] >= top - 2:
            bottom = max(bottom, w["bottom"])
    for im in page.images:
        if left <= im["x0"] <= right and im["top"] >= top - 2:
            bottom = max(bottom, im["bottom"])
    for ln in page.lines + page.rects:
        if left <= ln["x0"] <= right and ln["top"] >= top - 2:
            bottom = max(bottom, ln["bottom"])
    return bottom


def blocks_from(page, starts: list[float], item_toks: list[dict]) -> tuple[list[dict], list[dict]]:
    """받아 둔 번호 토큰으로 한 쪽의 (문항 블록, 공통 지문 블록) 을 만든다.

    한 번호부터 같은 단의 다음 표지(다음 번호 또는 다음 공통 지문) 직전까지가
    한 문항이다. 단의 마지막 문항은 그 단에서 글·그림·선이 끝나는 곳까지다.
    """
    stim_toks = [w for w in page.extract_words() if re.match(r"^\[\d\d", w["text"])]
    items: list[dict] = []
    stims: list[dict] = []
    for i, cstart in enumerate(starts):
        left, right = band_of(starts, i, page.width)
        marks = sorted(
            [("item", w) for w in item_toks if abs(w["x0"] - cstart) <= COL_TOL]
            + [("stim", w) for w in stim_toks if left <= w["x0"] <= right],
            key=lambda t: t[1]["top"],
        )
        for j, (kind, w) in enumerate(marks):
            top = w["top"] - PAD
            nxt = marks[j + 1][1]["top"] - PAD if j + 1 < len(marks) else None
            bottom = nxt if nxt is not None else content_bottom(page, left, right, top) + PAD
            box = {
                "page": page.page_number,
                "bbox": [left, max(0.0, top), right, min(float(page.height), bottom)],
                "column": i,
            }
            if kind == "item":
                items.append(box | {"no": w["no"]})
            else:
                m = re.match(r"^\[(\d\d)\s*[~∼-]\s*(\d\d)", w["text"])
                if m:
                    stims.append(box | {"range": [int(m.group(1)), int(m.group(2))]})
    return items, stims


def detect(doc) -> tuple[dict[int, list[dict]], dict[tuple[int, int], list[float]], list[int]]:
    """회차 전체에서 문항 번호 토큰을 가려낸다.

    ① 지면 모양별로 번호 글자 크기와 단 위치를 정하고
    ② 그 크기·자리에 선 숫자를 번호로 받은 뒤
    ③ **빠진 번호를 다시 찾는다.**

    ③ 이 필요한 이유: 번호는 1, 2, 3 … 으로 이어진다. 24가 없는데 25가 있다면
    그것은 "24번이 없는 시험지" 가 아니라 **우리가 24를 놓친 것**이다. 실제로
    마지막 쪽만 세로로 돌아가며 번호 글자가 작아진 회차에서 그렇게 빠졌다.
    이어짐이 크기보다 튼튼한 단서이므로, 크기를 풀고 자리만 보고 다시 찾는다.
    """
    cands_of: dict[int, list[dict]] = {}
    by_shape: dict[tuple[int, int], list[dict]] = {}
    shape_of: dict[int, tuple[int, int]] = {}
    for page in doc.pages:
        cs = number_candidates(page)
        cands_of[page.page_number] = cs
        shape = (round(page.width), round(page.height))
        shape_of[page.page_number] = shape
        by_shape.setdefault(shape, []).extend(cs)

    bands = {shape: pick_number_band(cs) for shape, cs in by_shape.items()}
    starts_of = {
        shape: columns_of([c for c in cs
                           if bands[shape] is None or abs(c["h"] - bands[shape]) <= 0.4])
        for shape, cs in by_shape.items() if cs
    }

    def aligned_to(c: dict, shape) -> bool:
        return any(abs(c["x0"] - st) <= COL_TOL for st in starts_of.get(shape, []))

    taken: dict[int, list[dict]] = {}
    seen: dict[int, tuple[int, dict]] = {}
    for pno, cs in cands_of.items():
        shape = shape_of[pno]
        band = bands.get(shape)
        keep = [c for c in cs
                if aligned_to(c, shape) and (band is None or abs(c["h"] - band) <= 0.4)]
        taken[pno] = keep
        for c in keep:
            seen.setdefault(c["no"], (pno, c))

    if seen:
        for n in range(1, max(seen) + 1):
            if n in seen:
                continue
            for pno, cs in cands_of.items():
                hit = [c for c in cs if c["no"] == n and aligned_to(c, shape_of[pno])]
                if hit:
                    taken[pno].append(hit[0])
                    seen[n] = (pno, hit[0])
                    break

    return taken, starts_of, sorted(seen)


# ── 렌더 ───────────────────────────────────────────────────────────────────

def render_boxes(pdf, boxes: list[dict], scale: float):
    """여러 블록을 세로로 이어 한 장으로. 공통 지문 + 문항이 이 길로 합쳐진다."""
    from PIL import Image

    parts = []
    for b in boxes:
        page = pdf[b["page"] - 1]
        img = page.render(scale=scale).to_pil().convert("RGB")
        x0, top, x1, bottom = b["bbox"]
        box = (round(x0 * scale), round(top * scale), round(x1 * scale), round(bottom * scale))
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        parts.append(img.crop(box))
    if not parts:
        raise ValueError("빈 블록")
    if len(parts) == 1:
        return parts[0]
    width = max(p.width for p in parts)
    gap = 10
    height = sum(p.height for p in parts) + gap * (len(parts) - 1)
    out = Image.new("RGB", (width, height), "white")
    y = 0
    for p in parts:
        out.paste(p, (0, y))
        y += p.height + gap
    return out


def sha16(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


# ── 본체 ───────────────────────────────────────────────────────────────────

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


def split_paper(rec: dict, dry: bool) -> dict:
    import pdfplumber
    import pypdfium2 as pdfium

    pid = rec["paper_id"]
    pdf_path = REPO / rec["pdf"]["paper"]
    holder = rec["rights"]["holder"]
    tier = derive_access_tier(holder)

    items: list[dict] = []
    stims: list[dict] = []
    with pdfplumber.open(pdf_path) as doc:
        taken, starts_of, _ = detect(doc)
        for page in doc.pages:
            starts = starts_of.get((round(page.width), round(page.height)))
            if not starts:
                continue
            it, st = blocks_from(page, starts, taken.get(page.page_number, []))
            items += it
            stims += st

    items.sort(key=lambda b: b["no"])
    numbers = [b["no"] for b in items]
    problems: list[str] = []
    if not numbers:
        problems.append("문항 번호를 하나도 찾지 못했다")
    else:
        expected = list(range(1, max(numbers) + 1))
        if numbers != expected:
            problems.append(f"번호가 이어지지 않는다: {numbers}")
    short = [b["no"] for b in items if b["bbox"][3] - b["bbox"][1] < MIN_BLOCK_H]
    if short:
        problems.append(f"블록이 너무 낮다(잘렸을 수 있다): {short}")

    out_dir = OUT / pid
    result = {
        "paper_id": pid,
        "subject_code": rec["subject_code"],
        "unit_id": rec["unit_id"],
        "topic_id": rec.get("topic_id"),
        # 소단원까지는 몰라도 중단원까지는 아는 자료가 있다(학업성취수준평가).
        # 성취기준이 회차 전체에 하나뿐인 자료도 있다(최소성취수준평가)
        "topic_prefix": rec.get("topic_prefix"),
        "curriculum": rec.get("curriculum"),
        "exam_type": rec["exam_type"],
        "round": rec["round"],
        "label": rec["label"],
        "source_pdf": rec["pdf"]["paper"],
        "access_tier": tier,
        "rights": rec["rights"],
        "items": [],
        "problems": problems,
    }
    if dry:
        result["items"] = [{"no": b["no"], "page": b["page"],
                            "h": round(b["bbox"][3] - b["bbox"][1])} for b in items]
        return result

    out_dir.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(str(pdf_path))
    ledger_rows = []
    try:
        for b in items:
            boxes = [s for s in stims if s["range"][0] <= b["no"] <= s["range"][1]] + [b]
            img = render_boxes(pdf, boxes, RENDER_SCALE)
            img = watermark(img, rec["watermark"])
            name = f"{pid}-q{b['no']:02d}.png"
            path = out_dir / name
            img.save(path, "PNG", optimize=True)
            row = {
                "item_id": f"{pid}-q{b['no']:02d}",
                "no": b["no"],
                "file": name,
                "page": b["page"],
                "bbox": [round(v, 1) for v in b["bbox"]],
                "with_stimulus": len(boxes) > 1,
                "width": img.width,
                "height": img.height,
                "sha256_16": sha16(path),
            }
            result["items"].append(row)
            ledger_rows.append({
                "ts": now(),
                "asset_id": row["item_id"],
                "paper_id": pid,
                "unit_id": rec["unit_id"],
                "topic_id": rec.get("topic_id"),
                "file": f"output/items/{pid}/{name}",
                "sha256_16": row["sha256_16"],
                "kind": "exam-item",
                "caption": f"{rec['label']} {b['no']}번",
                "page": b["page"],
                "bbox": row["bbox"],
                "width": img.width,
                "height": img.height,
                "rights": rec["rights"],
                "access_tier": tier,
                "watermark": rec["watermark"],
            })
    finally:
        pdf.close()

    (out_dir / "items.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    # 대장은 **1건 1행**이다 (CLAUDE.md §6). 같은 회차를 다시 크롭하면 같은
    # asset_id 가 또 들어가므로, 이번에 쓴 것과 겹치는 옛 행을 걷어내고 쓴다
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    fresh = {row["asset_id"] for row in ledger_rows}
    kept: list[str] = []
    if LEDGER.exists():
        for line in LEDGER.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                if json.loads(line).get("asset_id") in fresh:
                    continue
            except json.JSONDecodeError:
                pass
            kept.append(line)
    with LEDGER.open("w", encoding="utf-8", newline="\n") as fh:
        for line in kept:
            fh.write(line + "\n")
        for row in ledger_rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    log(result="ok" if not problems else "warn", paper_id=pid,
        items=len(result["items"]), problems=problems)
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", help="회차 하나만")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    meta, papers = load_papers()
    if args.paper:
        papers = [p for p in papers if p["paper_id"] == args.paper]
        if not papers:
            print(f"그런 회차가 없다: {args.paper}", file=sys.stderr)
            return 2
    elif not args.all:
        print("--paper 또는 --all 이 필요하다", file=sys.stderr)
        return 2

    total = 0
    bad: list[str] = []
    for rec in papers:
        rec = dict(rec)
        # 권리 메타는 회차가 아니라 **과목(발행사 자료 한 벌)** 단위로 같다.
        # 과목마다 발행사가 다를 수 있으므로 회차가 들고 온 값을 쓴다
        publisher, subject = rec["publisher"], rec["subject"]
        rec["rights"] = {
            "holder": publisher,
            "source": f"{publisher} 「{subject}」 평가자료 ({rec['label']})",
            "basis": "저작권법 제25조 제3항 수업 목적 이용 (제6항에 따라 보상금 면제)",
            "condition": "로그인한 학생 한정 · 비공개 저장소 서명 URL · 학기 종료 시 만료 · 검색 색인 차단",
        }
        rec["watermark"] = (
            f"○○고등학교 수업 목적 이용 (저작권법 제25조 제3항) · {publisher} {subject} {rec['label']}")
        res = split_paper(rec, args.dry_run)
        n = len(res["items"])
        total += n
        mark = "  " if not res["problems"] else "⚠ "
        print(f"{mark}{res['paper_id']:24s} {n:3d}문항  {res['label']}")
        for p in res["problems"]:
            print(f"     └ {p}")
            bad.append(res["paper_id"])

    print(f"\n합계 {total}문항 · 회차 {len(papers)}개" + (f" · 확인 필요 {len(set(bad))}회차" if bad else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
