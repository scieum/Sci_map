#!/usr/bin/env python3
"""C0-3. 본문 텍스트·레이아웃 박스·그림 후보 추출 (Sci_Map §4.3 C0).

산출물 → /output/source/<unit-id>/
  text.jsonl    페이지 1건 = 1행. 블록(문단) 단위. C4 의 원문 n-gram 대조 기준.
  layout.json   페이지별 줄 상자(bbox·글자 크기·글꼴) — 제목 판별과 C7 그림 배치의 바탕
  figures.json  그림 후보 영역 좌표 — C7 크롭 후보

★ 이 산출물은 배포 대상이 아니다 (CLAUDE.md §9-4). 대조용 내부 자료다.

사용: extract_text.py <unit-id>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ROOT, clean, escalate, find_unit, find_subject, load_backlog, log_event  # noqa: E402

# ── 레이아웃 분석 설정 ───────────────────────────────────────────────────────
# 이 교과서는 본문 단과 곁주 단이 나란히 놓인 2단 판형이다. 글자 좌표만 보고 위에서
# 아래로 읽으면 본문 문장 사이에 곁주가 끼어들어 문장이 끊긴다. pdfminer 의 레이아웃
# 분석에 맡기면 단을 갈라 주고 읽기 순서(본문 단 전체 → 곁주 단)까지 잡아 준다.
#
#   line_margin=1.0 — 줄 간격이 글자 높이의 0.83배라 기본값(0.5)으로는 한 문단이
#                     줄마다 쪼개진다. 1.4 까지 올리면 곁주 항목끼리 들러붙는다.
#   char_margin=1.2 — 단 사이가 10pt 넘게 벌어져 있어 이 값으로 단이 섞이지 않는다.
LAPARAMS = {"line_margin": 1.0, "char_margin": 1.2, "word_margin": 0.1,
            "boxes_flow": 0.5}

# 그림 후보 최소 크기 — 이보다 작으면 아이콘·글머리표다
MIN_FIGURE_W = 40
MIN_FIGURE_H = 40
# 두 상자의 IoU 가 이 값을 넘으면 같은 그림으로 보고 합친다
MERGE_IOU = 0.30
# 글자를 줄 상자에 배정할 때 허용할 여유 (pt)
SNAP_TOL = 1.0


def page_roles(unit: dict) -> dict[int, dict]:
    """단원 안의 각 쪽이 어느 소단원·어떤 성격의 쪽인지 미리 표를 만든다."""
    roles: dict[int, dict] = {}
    first, last = unit["pages"]
    for pno in range(first, last + 1):
        roles[pno] = {"section_id": None, "topic_id": None, "role": "front"}

    for sec in unit["sections"]:
        for pno in range(sec["pages"][0], sec["pages"][1] + 1):
            if pno in roles:
                roles[pno] = {"section_id": sec["id"], "topic_id": None, "role": "body"}
        for topic in sec["topics"]:
            for pno in range(topic["pages"][0], topic["pages"][1] + 1):
                if pno in roles:
                    roles[pno] = {"section_id": sec["id"], "topic_id": topic["id"],
                                  "role": "body"}
        if sec["review"] in roles:
            roles[sec["review"]] = {"section_id": sec["id"], "topic_id": None,
                                    "role": "section_review"}

    # 단원 마무리하기·프로젝트·직업 탐구는 여러 쪽에 걸친다. 백로그에는 시작 쪽만
    # 적혀 있으므로, 다음 항목의 시작 쪽 직전까지를 그 항목의 범위로 본다.
    extras = unit.get("extras", {})
    marks = sorted((pno, role) for pno, role in (
        (extras.get("wrapup"), "unit_review"),
        (extras.get("project"), "project"),
        (extras.get("career"), "career"),
    ) if pno)
    #
    # ★ 중단원으로 선언된 쪽은 덮지 않는다. 이 표시들은 단원 끝에 모여 있는 것이
    #   보통이지만(물질과 에너지·화학 반응의 세계), 화학 Ⅰ단원은 직업 탐구가 024쪽
    #   — 중단원 1(014~027) **안**에 있다. 덮게 두면 다음 표시(단원 마무리 050) 직전인
    #   049쪽까지가 통째로 career 가 되어 중단원 2 본문 전체가 활동 지면으로 잘못
    #   표시된다. 카드 원천은 role=body 라서 그대로 두면 C1 이 본문을 못 읽는다.
    in_section = {pno for sec in unit["sections"]
                  for pno in range(sec["pages"][0], sec["pages"][1] + 1)}
    for i, (start, role) in enumerate(marks):
        end = marks[i + 1][0] - 1 if i + 1 < len(marks) else last
        for pno in range(start, end + 1):
            if pno in roles and pno not in in_section:
                roles[pno] = {"section_id": None, "topic_id": None, "role": role}
    return roles


def extract_blocks(page) -> list[dict]:
    """문단 블록을 pdfminer 가 정한 읽기 순서 그대로 가져온다.

    한국어는 낱말 도중에도 줄이 바뀌므로('끌어당' / '기는') 줄을 공백으로 이으면
    원문에 없던 공백이 생긴다. 다행히 이 판형에서는 줄 끝 공백이 낱말 경계를
    그대로 알려 준다 — 낱말 경계에서 접힌 줄은 끝에 공백이 남고('무극성 ' + '분자로'),
    낱말 도중에 접힌 줄은 남지 않는다('끌어당' + '기는'). 그러니 **줄바꿈 문자만 빼고
    이어 붙이면 원문이 그대로 복원된다.** 공백을 지어내지도, 지우지도 않는다.

    (판형이 다른 교과서를 넣을 때는 이 성질부터 확인하라. 성립하지 않으면 줄바꿈을
    보존하고 대조를 _common.normalize_for_overlap() 에 맡기는 쪽으로 되돌린다.)
    """
    blocks = []
    for i, box in enumerate(page.objects.get("textboxhorizontal", []), start=1):
        text = " ".join(clean(box["text"].replace("\n", "")).split())
        if not text:
            continue
        blocks.append({
            "block_id": f"p{page.page_number}-b{i}",
            "bbox": [round(box["x0"], 1), round(box["top"], 1),
                     round(box["x1"], 1), round(box["bottom"], 1)],
            "text": text,
        })
    return blocks


def extract_lines(page) -> list[dict]:
    """줄 상자 + 대표 글자 크기·글꼴.

    글자 크기는 제목 줄과 본문 줄을 가르는 유일한 단서라 반드시 남긴다.
    줄 객체 자체에는 크기 정보가 없어 글자를 상자에 도로 배정해 구한다.
    """
    chars = page.chars
    lines = []
    for line in page.objects.get("textlinehorizontal", []):
        text = " ".join(clean(line["text"]).split())
        if not text:
            continue
        inside = [c for c in chars
                  if line["top"] - SNAP_TOL <= c["top"]
                  and c["bottom"] <= line["bottom"] + SNAP_TOL
                  and line["x0"] - SNAP_TOL <= c["x0"] <= line["x1"] + SNAP_TOL]
        sizes = [round(c.get("size") or 0, 1) for c in inside] or [0.0]
        fonts = [c.get("fontname") or "" for c in inside] or [""]
        lines.append({
            "text": text,
            "bbox": [round(line["x0"], 1), round(line["top"], 1),
                     round(line["x1"], 1), round(line["bottom"], 1)],
            "size": max(set(sizes), key=sizes.count),
            "font": max(set(fonts), key=fonts.count),
        })
    return lines


def _iou(a: list[float], b: list[float]) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter)


def extract_figures(page) -> list[dict]:
    """그림 후보 영역. 삽입 이미지와 벡터 도형 묶음을 함께 모아 겹치면 합친다.

    교과서 삽화는 벡터로 그려진 것이 많아 삽입 이미지만 보면 절반을 놓친다.
    확정이 아니라 후보다 — 어느 그림이 어느 개념의 것인지는 C7 에서 고른다.
    """
    raw: list[dict] = []
    for image in page.images:
        raw.append({"kind": "raster",
                    "bbox": [image["x0"], image["top"], image["x1"], image["bottom"]]})
    for fig in page.objects.get("figure", []):
        raw.append({"kind": "vector",
                    "bbox": [fig["x0"], fig["top"], fig["x1"], fig["bottom"]]})

    candidates = [
        c for c in raw
        if c["bbox"][2] - c["bbox"][0] >= MIN_FIGURE_W
        and c["bbox"][3] - c["bbox"][1] >= MIN_FIGURE_H
    ]

    merged: list[dict] = []
    for cand in sorted(candidates, key=lambda c: -(c["bbox"][2] - c["bbox"][0])
                       * (c["bbox"][3] - c["bbox"][1])):
        for kept in merged:
            if _iou(cand["bbox"], kept["bbox"]) >= MERGE_IOU:
                kept["bbox"] = [min(kept["bbox"][0], cand["bbox"][0]),
                                min(kept["bbox"][1], cand["bbox"][1]),
                                max(kept["bbox"][2], cand["bbox"][2]),
                                max(kept["bbox"][3], cand["bbox"][3])]
                if cand["kind"] not in kept["kind"]:
                    kept["kind"] = "mixed"
                break
        else:
            merged.append(dict(cand))

    page_area = page.width * page.height
    out = []
    for i, fig in enumerate(merged, start=1):
        bbox = [round(v, 1) for v in fig["bbox"]]
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        out.append({
            "figure_id": f"p{page.page_number}-f{i}",
            "kind": fig["kind"],
            "bbox": bbox,
            "area_ratio": round(area / page_area, 4),
        })
    return out


def run(unit_id: str) -> dict:
    backlog = load_backlog()
    unit = find_unit(backlog, unit_id)
    subject = find_subject(backlog, unit_id)
    pdf_path = ROOT / subject["textbook"]["file"]
    out_dir = ROOT / "output" / "source" / unit_id
    out_dir.mkdir(parents=True, exist_ok=True)

    roles = page_roles(unit)
    first, last = unit["pages"]
    layout, figures = {}, {}
    total_chars = total_blocks = total_lines = 0

    with pdfplumber.open(str(pdf_path), laparams=LAPARAMS) as doc, \
            (out_dir / "text.jsonl").open("w", encoding="utf-8") as tf:
        for pno in range(first, last + 1):
            page = doc.pages[pno - 1]
            blocks = extract_blocks(page)
            lines = extract_lines(page)
            text = "\n".join(b["text"] for b in blocks)
            total_chars += len(text)
            total_blocks += len(blocks)
            total_lines += len(lines)

            tf.write(json.dumps({"page": pno, "unit_id": unit_id, **roles[pno],
                                 "chars": len(text), "blocks": blocks, "text": text},
                                ensure_ascii=False) + "\n")
            layout[str(pno)] = {"width": round(page.width, 1),
                                "height": round(page.height, 1),
                                "lines": lines}
            page_figs = extract_figures(page)
            if page_figs:
                figures[str(pno)] = page_figs

    meta = {"unit_id": unit_id, "title": unit["title"], "pages": [first, last],
            "source_pdf": subject["textbook"]["file"],
            "laparams": LAPARAMS}
    (out_dir / "layout.json").write_text(
        json.dumps({**meta, "pages_layout": layout}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    (out_dir / "figures.json").write_text(
        json.dumps({**meta, "note": "그림 '후보'다. 확정·권리 태깅은 C7 에서 한다.",
                    "pages_figures": figures}, ensure_ascii=False, indent=1),
        encoding="utf-8")

    if total_chars == 0:
        escalate("C0", f"{unit_id}: 본문 텍스트가 한 글자도 추출되지 않았다", unit=unit_id)

    return {"unit_id": unit_id, "pages": last - first + 1, "chars": total_chars,
            "blocks": total_blocks, "lines": total_lines,
            "figure_candidates": sum(len(v) for v in figures.values()),
            "out_dir": str(out_dir.relative_to(ROOT))}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("unit_id")
    args = ap.parse_args()
    result = run(args.unit_id)
    log_event("C0", "pass", f"{args.unit_id}: 원문 추출 완료", **result)
    print(f"{result['unit_id']}  {result['pages']}쪽 / {result['chars']:,}자 / "
          f"블록 {result['blocks']:,} / 줄 {result['lines']:,} / "
          f"그림 후보 {result['figure_candidates']}건")
    print(f"  → {result['out_dir']}/{{text.jsonl, layout.json, figures.json}}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
