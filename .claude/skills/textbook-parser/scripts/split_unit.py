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
import unicodedata
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ROOT, clean, escalate, find_unit, find_subject, load_backlog, log_event  # noqa: E402

# 쪽 번호는 판면 아래쪽 **바깥 여백**에 찍힌다. 자릿수는 판형마다 다르다 —
# 천재교과서는 세 자리(012), 비상교육은 두 자리(14). 그래서 자릿수로 가르지 않고
# **자리**로 가른다: 하단 12% 안, 그리고 좌우 바깥 20% 안. 본문 속 숫자가 걸리는
# 것을 막는 것은 자릿수가 아니라 이 위치 조건이다.
FOLIO_BAND = 0.88
FOLIO_MARGIN = 0.20
FOLIO_RE = re.compile(r"^\d{1,3}$")


def normalize_title(s: str) -> str:
    """제목 대조용 정규화 — 공백과 가운뎃점류를 지운다.

    본문 제목은 자간 조절 때문에 '기 체 의  성 질' 처럼 낱자로 흩어져 뽑히는 일이
    잦다. 공백을 모두 제거하고 비교하면 그 경우까지 잡힌다.

    제어·서식 문자도 지운다. 비상교육 통합과학2 는 제목 글자 사이에 U+0081 같은
    C1 제어 문자가 끼어 '산화환원' 으로 뽑힌다 — 눈에는 멀쩡한데 대조에서만
    어긋나 원인을 찾기 어렵다. 폭 0 문자(U+200B)와 소프트 하이픈도 같은 부류다.
    """
    t = "".join(ch for ch in clean(s) if unicodedata.category(ch) not in ("Cc", "Cf"))
    return re.sub(r"[\s·ㆍ‧・,]", "", t)


def title_on_page(title: str, page_text: str) -> bool:
    """제목이 이 쪽에 있는가 — **토막이 순서대로** 나오면 있다고 본다.

    통째로 이어 붙여 찾으면 판형에 따라 못 찾는다. 비상교육 통합과학2 는 제목
    글자 사이에 말풍선 대사가 끼어들어, 추출하면 이렇게 나온다:

        "이곳은 | 과거에 물속 | 지질 시대의 환경과 이었군. | 생물의 변화"

    제목('지질 시대의 환경과 생물의 변화')은 분명히 그 쪽에 있는데 사이에 '이었군.'
    이 끼어 통짜 대조가 실패한다. 그래서 제목을 띄어쓰기로 토막 내어 **모든 토막이
    앞에서부터 순서대로** 나오는지 본다. 순서를 요구하므로 낱말이 우연히 흩어져
    있는 쪽을 제목으로 오인하지 않는다.
    """
    flat = normalize_title(page_text)
    return seq_match(title, flat) or seq_match(doubled(title), flat)


def doubled(s: str) -> str:
    """글자마다 두 벌로 겹쳐 찍힌 제목 — '화학의 언어' → '화화학학의의 언언어어'.

    화학(임희준) 1단원 여는 쪽(010)이 그렇다. 장식 제목이 두 벌 겹쳐 조판돼
    추출하면 글자가 두 번씩 나온다. 눈에는 멀쩡하고 쪽 번호·판면 아래 indd
    파일명((0010-0055)…1단원)·차례가 모두 이 쪽을 가리키는데 제목 대조만 어긋난다.

    쪽 텍스트를 접지 않고 **제목을 부풀려** 찾는다. 접는 쪽을 택하면 '각각'
    처럼 원래 겹치는 낱말까지 접혀 엉뚱한 쪽을 제목으로 오인할 수 있는데,
    부풀리는 쪽은 찾는 문자열이 길어질 뿐이라 그런 위험이 없다.
    """
    return "".join(ch * 2 if not ch.isspace() else ch for ch in s)


def seq_match(title: str, flat: str) -> bool:
    """제목 토막이 앞에서부터 순서대로 나오는가."""
    if normalize_title(title) in flat:
        return True
    at = 0
    for chunk in title.split():
        c = normalize_title(chunk)
        if not c:
            continue
        i = flat.find(c, at)
        if i < 0:
            return False
        at = i + len(c)
    return True


def page_folios(page) -> list[int]:
    """페이지 하단 바깥 여백에서 쪽 번호 **후보**를 모은다.

    하나만 고르지 않는다. 자릿수를 1~3 으로 넓히면 여백의 다른 숫자(그림 번호,
    문항 번호)까지 걸리기 때문이다 — 실제로 천재교과서 reac-3 에서 -107 같은
    엉뚱한 offset 이 나왔다. 어느 것이 진짜 쪽 번호인지는 한 쪽만 봐서는 알 수
    없고, 단원 전체에서 **일정한 offset 을 내는 쪽**이 진짜다. 그 판정은
    check_unit 이 다수결로 한다.
    """
    band_top = page.height * FOLIO_BAND
    left = page.width * FOLIO_MARGIN
    right = page.width * (1 - FOLIO_MARGIN)
    out: list[int] = []
    for word in page.extract_words():
        if word["top"] < band_top:
            continue
        if left < word["x0"] < right:   # 판면 가운데는 쪽 번호 자리가 아니다
            continue
        token = clean(word["text"]).strip()
        if FOLIO_RE.match(token):
            out.append(int(token))
    return out


def check_unit(unit: dict, pdf_path: Path) -> dict:
    first, last = unit["pages"]
    problems: list[str] = []
    offset_pages: dict[int, int] = {}   # offset -> 그 offset 이 나온 쪽 수
    pages_with_folio = 0
    page_titles: dict[int, str] = {}

    with pdfplumber.open(str(pdf_path)) as doc:
        if last > len(doc.pages):
            escalate("C0", f"{unit['id']}: 선언된 마지막 쪽 {last} 가 PDF 총 {len(doc.pages)}쪽을 넘는다",
                     unit=unit["id"])
        for pno in range(first, last + 1):
            page = doc.pages[pno - 1]
            cands = page_folios(page)
            if cands:
                pages_with_folio += 1
                for c in set(cands):
                    offset_pages[c - pno] = offset_pages.get(c - pno, 0) + 1
            page_titles[pno] = normalize_title(page.extract_text() or "")

    # 1. 쪽 번호 정합 — **거의 모든 쪽에 걸리는 offset** 이 0 이어야 한다.
    #    후보 중 여백의 다른 숫자가 섞이므로 집합이 아니라 다수결로 본다.
    total = last - first + 1
    best_offset, best_count = None, 0
    for off, cnt in offset_pages.items():
        if cnt > best_count:
            best_offset, best_count = off, cnt
    if pages_with_folio == 0:
        problems.append("인쇄 쪽 번호를 한 쪽에서도 읽지 못했다 (판형 가정 확인 필요)")
    elif best_count < total * 0.9:
        problems.append(
            f"쪽 번호가 일정하지 않다 — 가장 흔한 offset {best_offset} 이 {best_count}/{total}쪽에서만 보인다")
    elif best_offset != 0:
        problems.append(f"인쇄 쪽수 ≠ PDF 쪽수. offset {best_offset} ({best_count}/{total}쪽)")
    offsets = {best_offset} if best_offset is not None else set()

    # 2. 제목 실재 확인
    def expect(page_no: int, title: str, what: str) -> None:
        if page_no not in page_titles:
            problems.append(f"{what} '{title}' 의 시작 쪽 {page_no} 가 단원 범위 밖이다")
        elif not title_on_page(title, page_titles[page_no]):
            problems.append(f"{page_no}쪽에서 {what} 제목 '{title}' 을 찾지 못했다")

    expect(first, unit["title"], "대단원")
    for sec in unit["sections"]:
        expect(sec["pages"][0], sec["title"], "중단원")
        for topic in sec["topics"]:
            expect(topic["pages"][0], topic["title"], "소단원")

    # 3. 소단원 범위 연속성 — 겹침·빈틈 없이 이어져야 한다
    for sec in unit["sections"]:
        # 중단원이 표지(도입) 쪽으로 시작하는 판형이 있다 — 비상교육 통합과학2 는
        # 중단원마다 두 쪽짜리 도입면을 두고 그다음에 첫 소단원이 온다. 그래서
        # "첫 소단원은 중단원 첫 쪽에서 시작한다" 를 요구하지 않고, **뒤로만**
        # 벌어지되 그 간격이 도입면 크기(4쪽)를 넘지 않는지 본다.
        lead = sec["topics"][0]["pages"][0] - sec["pages"][0] if sec["topics"] else 0
        if lead < 0:
            problems.append(
                f"{sec['id']}: 첫 소단원이 중단원 시작({sec['pages'][0]})보다 앞선다")
        elif lead > 4:
            problems.append(
                f"{sec['id']}: 중단원 시작({sec['pages'][0]})과 첫 소단원({sec['topics'][0]['pages'][0]}) "
                f"사이가 {lead}쪽이다 — 도입면치고 너무 넓다")
        cursor = sec["topics"][0]["pages"][0] if sec["topics"] else sec["pages"][0]
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
    pdf_path = ROOT / find_subject(backlog, args.unit_id)["textbook"]["file"]
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
