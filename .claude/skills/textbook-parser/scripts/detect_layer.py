#!/usr/bin/env python3
"""C0-1. 텍스트 레이어 유무 판별 + 추출률 측정 (Sci_Map §4.3 C0, R10).

pdfplumber(MIT)로 뽑은 문자 수를 pypdfium2(Apache-2.0)로 뽑은 문자 수와 대조한다.
서로 다른 엔진이므로, 한쪽만 유독 적게 뽑히면 추출기 문제이지 원본 문제가 아니다.

추출률 = Σ min(plumber, pdfium) 가 아니라 Σ plumber / Σ max(plumber, pdfium).
두 엔진이 모두 0인 페이지(전면 그림 페이지)는 분모에서 뺀다 — 텍스트가 없는 것이지
못 뽑은 것이 아니다. 대신 그런 페이지 수를 따로 보고한다.

사용: detect_layer.py <pdf> [--first N] [--last N] [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import clean  # noqa: E402

# 이 값 미만이면 "텍스트 레이어 없음"으로 보고 OCR 경로로 분기한다
TEXT_LAYER_MIN_RATE = 0.50
# C0 성공 기준 (Sci_Map §4.3)
EXTRACTION_MIN_RATE = 0.95
# 페이지에 이 글자 수 미만이면 '텍스트 없는 페이지'로 센다
EMPTY_PAGE_CHARS = 20


def measure(pdf_path: Path, first: int, last: int) -> dict:
    pages = []
    doc = pdfium.PdfDocument(str(pdf_path))
    try:
        with pdfplumber.open(str(pdf_path)) as plumber_doc:
            total = len(plumber_doc.pages)
            last = min(last or total, total)
            for pno in range(first, last + 1):
                plumber_text = clean(plumber_doc.pages[pno - 1].extract_text() or "")
                pdfium_text = clean(doc[pno - 1].get_textpage().get_text_bounded() or "")
                pages.append({
                    "page": pno,
                    "plumber_chars": len(plumber_text.strip()),
                    "pdfium_chars": len(pdfium_text.strip()),
                })
    finally:
        doc.close()

    textual = [p for p in pages
               if max(p["plumber_chars"], p["pdfium_chars"]) >= EMPTY_PAGE_CHARS]
    empty = [p["page"] for p in pages if p not in textual]

    num = sum(p["plumber_chars"] for p in textual)
    den = sum(max(p["plumber_chars"], p["pdfium_chars"]) for p in textual)
    rate = (num / den) if den else 0.0

    # 페이지별로 크게 뒤처지는 곳 = 조판이 특이한 페이지. C0 이후 눈으로 볼 목록.
    laggards = [
        {"page": p["page"], "plumber": p["plumber_chars"], "pdfium": p["pdfium_chars"]}
        for p in textual
        if p["plumber_chars"] < 0.80 * max(p["pdfium_chars"], 1)
    ]

    return {
        "pdf": str(pdf_path),
        "page_range": [first, last],
        "pages_measured": len(pages),
        "pages_with_text": len(textual),
        "pages_without_text": empty,
        "extraction_rate": round(rate, 4),
        "has_text_layer": rate >= TEXT_LAYER_MIN_RATE,
        "meets_c0_threshold": rate >= EXTRACTION_MIN_RATE,
        "laggard_pages": laggards,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--first", type=int, default=1)
    ap.add_argument("--last", type=int, default=0)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    result = measure(args.pdf, args.first, args.last)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"{args.pdf.name}  p{result['page_range'][0]}~{result['page_range'][1]}")
        print(f"  텍스트 레이어 : {'있음' if result['has_text_layer'] else '없음 → OCR 경로'}")
        print(f"  추출률        : {result['extraction_rate']:.1%} "
              f"({'통과' if result['meets_c0_threshold'] else '미달'} / 기준 {EXTRACTION_MIN_RATE:.0%})")
        print(f"  텍스트 없는 쪽: {len(result['pages_without_text'])}쪽 "
              f"{result['pages_without_text'][:12]}")
        if result["laggard_pages"]:
            print(f"  추출 뒤처진 쪽: {[p['page'] for p in result['laggard_pages']][:12]}")
    return 0 if result["meets_c0_threshold"] else 1


if __name__ == "__main__":
    sys.exit(main())
