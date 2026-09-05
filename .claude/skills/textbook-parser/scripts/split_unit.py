#!/usr/bin/env python3
"""C0-2. 단원 경계 검출·검증 (Sci_Map §4.3 C0).

`docs/unit_backlog.yaml` 의 선언을 정답으로 보지 않는다. 교과서 본문을 읽어
다음 세 가지를 대조하고, 하나라도 어긋나면 **에스컬레이션**한다 (자동 보정 금지 —
단원 경계 판별 실패는 Sci_Map §4.3 C0 에서 에스컬레이션 대상이다).

  1. 쪽 번호 정합 — 인쇄 쪽수와 PDF 쪽수가 같은가 (판권지·간지로 밀리는 판형이 있다)
  2. 단원·중단원·소단원 제목이 선언된 시작 쪽에 실제로 있는가
  3. 소단원 페이지 범위가 겹치거나 비지 않는가

사용: split_unit.py <unit-id> [--json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ROOT, clean, escalate, find_unit, load_backlog, log_event  # noqa: E402

# 쪽 번호는 판면 아래쪽에 세 자리로 찍힌다 (예: 012). 하단 12% 영역에서만 찾는다.
FOLIO_BAND = 0.88
FOLIO_RE = re.compile(r"^\d{3}$")


def normalize_title(s: str) -> str:
    """제목 대조용 정규화 — 공백과 가운뎃점류를 지운다.

    본문 제목은 자간 조절 때문에 '기 체 의  성 질' 처럼 낱자로 흩어져 뽑히는 일이
    잦다. 공백을 모두 제거하고 비교하면 그 경우까지 잡힌다.
    """
    return re.sub(r"[\s·ㆍ‧・,]", "", clean(s))


def page_folio(page) -> int | None:
    """페이지 하단에서 인쇄 쪽 번호를 읽는다. 없으면 None."""
    band_top = page.height * FOLIO_BAND
    for word in page.extract_words():
        if word["top"] < band_top:
            continue
        token = clean(word["text"]).strip()
        if FOLIO_RE.match(token):
            return int(token)
    return None


def check_unit(unit: dict, pdf_path: Path) -> dict:
    first, last = unit["pages"]
    problems: list[str] = []
    folio_offsets: list[int] = []
    page_titles: dict[int, str] = {}

    with pdfplumber.open(str(pdf_path)) as doc:
        if last > len(doc.pages):
            escalate("C0", f"{unit['id']}: 선언된 마지막 쪽 {last} 가 PDF 총 {len(doc.pages)}쪽을 넘는다",
                     unit=unit["id"])
        for pno in range(first, last + 1):
            page = doc.pages[pno - 1]
            folio = page_folio(page)
            if folio is not None:
                folio_offsets.append(folio - pno)
            page_titles[pno] = normalize_title(page.extract_text() or "")

    # 1. 쪽 번호 정합 — offset 이 0 으로 일정해야 한다
    offsets = set(folio_offsets)
    if not folio_offsets:
        problems.append("인쇄 쪽 번호를 한 쪽에서도 읽지 못했다 (판형 가정 확인 필요)")
    elif offsets != {0}:
        problems.append(f"인쇄 쪽수 ≠ PDF 쪽수. 관측된 offset {sorted(offsets)}")

    # 2. 제목 실재 확인
    def expect(page_no: int, title: str, what: str) -> None:
        if page_no not in page_titles:
            problems.append(f"{what} '{title}' 의 시작 쪽 {page_no} 가 단원 범위 밖이다")
        elif normalize_title(title) not in page_titles[page_no]:
            problems.append(f"{page_no}쪽에서 {what} 제목 '{title}' 을 찾지 못했다")

    expect(first, unit["title"], "대단원")
    for sec in unit["sections"]:
        expect(sec["pages"][0], sec["title"], "중단원")
        for topic in sec["topics"]:
            expect(topic["pages"][0], topic["title"], "소단원")

    # 3. 소단원 범위 연속성 — 겹침·빈틈 없이 이어져야 한다
    for sec in unit["sections"]:
        cursor = sec["pages"][0]
        for topic in sec["topics"]:
            t_first, t_last = topic["pages"]
            if t_first != cursor:
                problems.append(
                    f"{sec['id']}: {topic['id']} 시작 {t_first} 이 직전 소단원 끝 다음({cursor})과 다르다")
            if t_last < t_first:
                problems.append(f"{topic['id']}: 범위가 뒤집혔다 {topic['pages']}")
            cursor = t_last + 1
        if cursor != sec["review"]:
            problems.append(
                f"{sec['id']}: 마지막 소단원 끝 다음({cursor})이 중단원 정리하기 쪽({sec['review']})과 다르다")

    return {
        "unit_id": unit["id"],
        "pages": [first, last],
        "folio_offset": sorted(offsets) if offsets else None,
        "problems": problems,
        "ok": not problems,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("unit_id")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    backlog = load_backlog()
    unit = find_unit(backlog, args.unit_id)
    pdf_path = ROOT / backlog["subject"]["textbook"]["file"]
    result = check_unit(unit, pdf_path)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"{unit['id']} {unit['numeral']}. {unit['title']}  p{result['pages'][0]}~{result['pages'][1]}")
        print(f"  쪽번호 offset : {result['folio_offset']}")
        if result["ok"]:
            print("  단원 경계     : 확정")
        else:
            print(f"  단원 경계     : 불일치 {len(result['problems'])}건")
            for p in result["problems"]:
                print("    - " + p)

    if not result["ok"]:
        escalate("C0", f"{unit['id']}: 단원 경계 판별 실패 {len(result['problems'])}건",
                 unit=unit["id"], problems=result["problems"])
    log_event("C0", "pass", f"{unit['id']}: 단원 경계 확정", unit=unit["id"], pages=result["pages"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
