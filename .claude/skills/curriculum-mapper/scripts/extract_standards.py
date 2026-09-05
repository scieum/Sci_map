#!/usr/bin/env python3
"""지도서에서 2022 개정 성취기준 전문을 뽑아 references/standards.yaml 로 만든다.

성취기준 원문은 NCIC 공공저작물이다. 지도서 총론의 **교육과정 내용 체계 표**를
1차 출처로 삼고, **각론 평가 자료**에 다시 실린 같은 문장을 2차 출처로 삼아
서로 대조한다. 두 판본이 어긋나면 고르지 않고 사람에게 넘긴다.

★ 지도서 고유의 해설(최소 성취 수준 등)은 천재교과서 저작물이므로 옮기지 않는다.
   필요하면 쪽 번호만 적어 두고 원본을 편다.

사용: extract_standards.py [--guide <pdf>] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "textbook-parser" / "scripts"))
from _common import ROOT, clean, load_backlog, log_event  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "references" / "standards.yaml"

# 1차 출처 — 총론의 교육과정 내용 체계 표 (코드 열 + 문장 열의 단순한 2단)
PRIMARY_PAGES = (16, 19)
# 2차 출처 — 각론 평가 자료. 같은 문장이 다른 조판으로 다시 실린다.
CROSSCHECK_PAGES = (146, 234)

LAPARAMS = {"line_margin": 1.0, "char_margin": 1.2, "word_margin": 0.1, "boxes_flow": 0.5}

# 코드 안에 조판용 공백이 끼어 있다: '[12물 에01 - 01]'
CODE_RE = re.compile(r"\[\s*12\s*(물\s*에|화\s*학)\s*(\d{2})\s*-\s*(\d{2})\s*\]")
# 표의 행 이름 칸. 문장 사이에 끼어들므로 미리 걷어낸다.
ROW_LABELS = {"핵심 아이디어", "성취기준", "탐구 활동", "내용 요소", "범주", "구분",
              "교육과정 성취기준", "교육과정성취기준"}
ROW_TOL = 5.0
# 성취기준은 '~ㄴ다.' 로 끝나는 한 문장이다. 문장 안에 '다.' 가 다시 나오지 않는다.
SENTENCE_END = "다."
MIN_LEN, MAX_LEN = 20, 200

AREA_NAMES = {
    "01": "물질의 세 가지 상태",
    "02": "용액의 성질",
    "03": "화학 변화의 자발성",
    "04": "반응 속도",
}


def page_stream(page) -> str:
    """표를 행 단위로 왼쪽에서 오른쪽으로 읽어 한 줄 글자열로 만든다.

    글자 좌표만 보고 위에서 아래로 읽으면 코드 칸과 문장 칸이 어긋나 짝이 깨진다.
    같은 높이의 줄을 한 행으로 묶고 행 안에서 x 순으로 이어야 표가 읽힌다.
    줄 끝 공백은 낱말 경계 신호이므로 지우지 않는다.
    """
    lines = [{"x0": l["x0"], "top": l["top"], "raw": clean(l["text"].replace("\n", ""))}
             for l in page.objects.get("textlinehorizontal", [])]
    lines = [l for l in lines if l["raw"].strip() and l["raw"].strip() not in ROW_LABELS]
    lines.sort(key=lambda l: l["top"])

    rows: list[list[dict]] = []
    for line in lines:
        if rows and abs(line["top"] - rows[-1][0]["top"]) <= ROW_TOL:
            rows[-1].append(line)
        else:
            rows.append([line])
    return "".join("".join(x["raw"] for x in sorted(r, key=lambda y: y["x0"]))
                   for r in rows)


def harvest(doc, first: int, last: int) -> dict[str, tuple[int, str]]:
    """쪽 범위에서 코드 → (쪽, 성취기준 문장) 을 모은다. 먼저 나온 것을 남긴다."""
    out: dict[str, tuple[int, str]] = {}
    for pno in range(first, min(last, len(doc.pages)) + 1):
        stream = page_stream(doc.pages[pno - 1])
        for m in CODE_RE.finditer(stream):
            code = re.sub(r"\s", "", m.group(0))[1:-1]
            if code in out:
                continue
            tail = stream[m.end():]
            cut = tail.find(SENTENCE_END)
            if cut <= 0:
                continue
            out[code] = (pno, " ".join(tail[:cut + len(SENTENCE_END)].split()))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--guide", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    backlog = load_backlog()
    guide = args.guide or (ROOT / backlog["subject"]["guide"]["file"])

    with pdfplumber.open(str(guide), laparams=LAPARAMS) as doc:
        primary = harvest(doc, *PRIMARY_PAGES)
        cross = harvest(doc, *CROSSCHECK_PAGES)

    records, problems = [], []
    for code in sorted(primary):
        pno, text = primary[code]
        area, seq = code[len("12물에"):].split("-") if code.startswith("12물에") \
            else (code[-5:-3], code[-2:])

        if not (MIN_LEN <= len(text) <= MAX_LEN and text.endswith(SENTENCE_END)):
            problems.append(f"{code}: 문장 형태가 이상하다 ({len(text)}자) — {text[:60]}")

        agreement, note = "미대조", None
        if code in cross:
            a = re.sub(r"\s", "", text)
            b = re.sub(r"\s", "", cross[code][1])
            if a == b:
                agreement = "일치"
            else:
                agreement = "불일치"
                note = f"각론 {cross[code][0]}쪽 판본: {cross[code][1]}"
                problems.append(f"{code}: 총론·각론 판본 불일치 — 사람이 NCIC 원문으로 확정해야 한다")

        records.append({"code": code, "area": area, "seq": seq,
                        "area_name": AREA_NAMES.get(area, ""), "text": text,
                        "source_page": pno, "crosscheck": agreement, "note": note})

    if args.dry_run:
        print(json.dumps(records, ensure_ascii=False, indent=2))
        for p in problems:
            print("⚠️ " + p, file=sys.stderr)
        return 1 if problems else 0

    header = """\
# 2022 개정 교육과정 성취기준 — curriculum-mapper 참조 자료
#
# 성취기준 원문은 NCIC 공공저작물이다. 이 파일은 지도서에 실린 두 판본
# (총론 교육과정 내용 체계 표 / 각론 평가 자료) 을 대조해 만들었다.
# 지도서 고유 해설(최소 성취 수준 등)은 천재교과서 저작물이라 옮기지 않았다.
#
# crosscheck: 일치   = 두 판본이 (공백 무시) 같다
#             불일치 = 판본이 갈린다. note 에 각론 판본을 적어 두었으니
#                      **사람이 NCIC 원문으로 확정**해야 한다. 그 전에는 C5 태깅에 쓰지 마라.
#             미대조 = 각론에서 짝을 못 찾았다
#
# 생성: scripts/extract_standards.py — 손으로 고치지 말고 스크립트를 고쳐라.

"""
    footer = """
# ── 아직 수록하지 않은 과목 ──────────────────────────────────────────────────
# 통합과학1·2, 화학의 성취기준은 이 지도서에 전문이 실려 있지 않다.
# 총론 22~27쪽의 2015↔2022 비교표에 일부가 보이지만 5단 표라 기계로 읽으면
# 문장이 뒤섞인다. 반쯤 맞는 문장을 넣느니 비워 둔다.
# 3차(통합과학1)·5차(화학) 착수 시 NCIC 원문에서 받아 여기에 추가한다.
"""
    payload = {"courses": {"12물에": {
        "name": "물질과 에너지",
        "type": "진로선택",
        "source": "지도서 총론 16~19쪽 (대조 - 각론 평가 자료 146~234쪽)",
        "standards": [{k: v for k, v in r.items() if v is not None} for r in records],
    }}}
    body = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False,
                          default_flow_style=False, width=1000)
    OUT.write_text(header + body + footer, encoding="utf-8")

    agreed = sum(1 for r in records if r["crosscheck"] == "일치")
    log_event("0차", "pass", "성취기준 참조 자료 생성",
              codes=len(records), crosscheck_agreed=agreed, problems=len(problems))
    print(f"성취기준 {len(records)}건 → {OUT.relative_to(ROOT)}")
    print(f"  교차 대조 일치 {agreed}건 / 불일치 {len(records) - agreed}건")
    for p in problems:
        print("  ⚠️ " + p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
