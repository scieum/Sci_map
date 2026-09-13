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

# 코드 안에 조판용 공백이 끼어 있다: '[12물 에01 - 01]', '[ 12반응01-05]'
# 진로선택(천재교과서)은 대괄호로 감싸지만, 공통 통합과학(비상교육)은 대괄호 없이
# '10통과1-01-01 자연을 …' 처럼 문장 앞에 그대로 붙는다. 두 조판을 함께 받는다.
CODE_RE = re.compile(
    r"\[\s*12\s*(?:물\s*에|화\s*학|반\s*응|세\s*포|생\s*과|유\s*전)\s*\d{2}\s*-\s*\d{2}\s*\]"
    r"|1\s*0\s*통\s*과\s*[12]\s*-\s*\d{2}\s*-\s*\d{2}")
# 표의 행 이름 칸. 문장 사이에 끼어들므로 미리 걷어낸다.
ROW_LABELS = {"핵심 아이디어", "성취기준", "탐구 활동", "내용 요소", "범주", "구분",
              "교육과정 성취기준", "교육과정성취기준",
              # 비상교육 각론은 성취기준 문장 옆에 곁주 라벨을 같은 높이로 놓는다.
              # 걷어내지 않으면 '…알고, 이러[단원 핵심 질문]한 정보를…' 로 끼어들어
              # 총론과 대조할 때 없는 불일치가 생긴다.
              "단원 핵심 질문", "단원핵심질문", "탐구활동"}
ROW_TOL = 5.0
# 성취기준은 '~ㄴ다.' 로 끝나는 한 문장이다. 문장 안에 '다.' 가 다시 나오지 않는다.
SENTENCE_END = "다."
MIN_LEN, MAX_LEN = 20, 200

# 과목별 영역 이름·기본 쪽 범위. 지도서 판형이 같은 천재교과서 시리즈라 총론 표의
# 자리가 비슷하지만, 과목마다 다르므로 인자로 덮어쓸 수 있다.
COURSES = {
    "12물에": {"name": "물질과 에너지", "type": "진로선택", "primary": (16, 19), "cross": (146, 234),
              "areas": {"01": "물질의 세 가지 상태", "02": "용액의 성질",
                        "03": "화학 변화의 자발성", "04": "반응 속도"}},
    # 공통 통합과학은 비상교육 판형이다. 지도서 한 권이 1·2 두 과목을 함께 싣고 있어
    # 총론 표의 자리가 과목마다 다르다 — 1은 p10~13, 2는 p15~17.
    "10통과1": {"name": "통합과학1", "type": "공통", "primary": (10, 13), "cross": (44, 179),
               "areas": {"01": "과학의 기초", "02": "물질과 규칙성",
                         "03": "시스템과 상호작용"}},
    "10통과2": {"name": "통합과학2", "type": "공통", "primary": (15, 17), "cross": (44, 179),
               "areas": {"01": "변화와 다양성", "02": "환경과 에너지",
                         "03": "과학과 미래 사회"}},
    "12반응": {"name": "화학 반응의 세계", "type": "진로선택", "primary": (17, 19), "cross": (146, 200),
              "areas": {"01": "산 염기 평형", "02": "산화·환원 반응", "03": "탄소 화합물과 반응"}},
    # 화학 지도서(248쪽)는 총론 표가 17~19쪽, 각론 평가 자료가 168~214쪽이다.
    # 22~23쪽에도 같은 코드가 나오지만 그쪽은 성취기준 '해설' 절이라 1차 출처로 쓰지 않는다.
    "12화학": {"name": "화학", "type": "일반선택", "primary": (17, 19), "cross": (168, 214),
              "areas": {"01": "화학의 언어", "02": "물질의 구조와 성질",
                        "03": "화학 평형", "04": "역동적인 화학 반응"}},
    # ★세포와 물질대사(336쪽)는 두 출처의 자리가 뒤바뀐다 — 여기서만 각론이 1차다.
    #
    #   총론 24~26쪽('나. 성취 기준')에도 같은 문장이 있지만 그 절은 **띄어쓰기가
    #   글자로 남아 있지 않다**. 양끝맞춤 조판이라 낱말 사이가 글자 간격으로만
    #   벌어져 있어 어느 추출기로도 '탄수화물과지질의종류와…' 로 나온다. 저장하는
    #   문장이 1차 출처에서 오므로, 그대로 두면 성취기준 전문이 붙어 버린다.
    #
    #   각론의 단원 개관 쪽(Ⅰ 60쪽, Ⅱ·Ⅲ 은 그 뒤)에 같은 문장이 띄어쓰기까지
    #   살아 있는 판본으로 실려 있다. 그래서 각론을 1차로, 총론을 대조본으로 쓴다.
    #   대조는 norm_for_compare 가 공백을 지우고 하므로 총론의 공백 없음은 문제가
    #   되지 않는다 — 오히려 두 판본이 같은지 보는 데는 그대로 쓸 수 있다.
    # 생명과학(456쪽)은 총론 24~26쪽 '나. 성취 기준' 절에 띄어쓰기가 살아 있다 —
    # 같은 저자·같은 판형인 세포와 물질대사와 달리 조판이 무너지지 않았다.
    # 그래서 이 과목은 표준 배치를 그대로 쓴다: 총론이 1차, 각론(62~229쪽)이 대조본.
    "12생과": {"name": "생명과학", "type": "일반선택", "primary": (24, 26), "cross": (62, 229),
              "areas": {"01": "생명 시스템의 구성", "02": "항상성과 몸의 조절",
                        "03": "생명의 연속성과 다양성"}},
    "12세포": {"name": "세포와 물질대사", "type": "진로선택", "primary": (60, 214), "cross": (24, 26),
              "primary_label": "각론", "cross_label": "총론",
              "areas": {"01": "세포", "02": "물질대사와 에너지", "03": "세포호흡과 광합성"}},
    # ★생물의 유전(352쪽)도 세포와 물질대사와 같은 자리 뒤바뀜이다 — 각론이 1차다.
    #   총론 24~26쪽 '나. 성취기준' 절이 양끝맞춤 조판이라 띄어쓰기가 글자로 남지 않는다
    #   ('유전형질이유전자를통해자손에게유전됨을…'). 각론 단원 개관 쪽(Ⅰ 62쪽, Ⅱ 132쪽,
    #   Ⅲ 176쪽)에 띄어쓰기가 살아 있는 같은 문장이 있어 그쪽을 1차로 삼는다.
    "12유전": {"name": "생물의 유전", "type": "진로선택", "primary": (62, 181), "cross": (24, 26),
              "primary_label": "각론", "cross_label": "총론",
              "areas": {"01": "유전자와 유전물질", "02": "유전자의 발현", "03": "생명공학기술"}},
}
AREA_NAMES = COURSES["12물에"]["areas"]  # 하위 호환


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


def norm_for_compare(s: str) -> str:
    """총론↔각론 대조용 정규화. 저장하는 문장은 총론 판본 그대로 두고, 비교할 때만 쓴다.

    같은 문장을 두 조판이 서로 다른 가운뎃점으로 찍는다 — 총론은 '측정·분석'(U+00B7),
    각론은 '측정ㆍ분석'(U+318D). 글자가 아니라 조판의 차이라서, 이것까지 불일치로
    보면 사람이 NCIC 원문을 뒤져야 할 목록이 실제 이견 없는 것으로 채워진다.
    """
    # 행 이름 칸이 **문장 안으로** 들어와 붙는 판형이 있다. 화학 지도서 각론 168쪽은
    # '…화학에 흥미와 교육과정 성취기준호기심을 가질 수 있다.' 로 뽑힌다 — 라벨과 본문이
    # 한 textline 으로 묶여 나와 줄 단위 걸러내기(ROW_LABELS)로는 잡히지 않는다.
    # 저장하는 총론 문장은 건드리지 않고 **비교할 때만** 걷어낸다.
    # 긴 라벨부터 지운다 — '성취기준' 을 먼저 지우면 '교육과정 성취기준' 이 더는 맞지 않아
    # '교육과정' 이 문장에 남는다.
    for label in sorted(ROW_LABELS, key=len, reverse=True):
        s = s.replace(label, "")
    # 쉼표와 가운뎃점도 같은 부류다 — 총론 '물질의 물리적, 화학적 성질' 과
    # 각론 '물질의 물리적·화학적 성질'(12화학02-04). 2026-09-09 교사가 두 판본을
    # 같은 문장으로 확정했다. 그 판단을 규칙으로 옮긴 것이지 스크립트가 정한 것이 아니다.
    return re.sub(r"[\s·ㆍ‧・･·,]", "", s)


def harvest(doc, first: int, last: int) -> dict[str, tuple[int, str]]:
    """쪽 범위에서 코드 → (쪽, 성취기준 문장) 을 모은다. 먼저 나온 것을 남긴다."""
    out: dict[str, tuple[int, str]] = {}
    for pno in range(first, min(last, len(doc.pages)) + 1):
        stream = page_stream(doc.pages[pno - 1])
        for m in CODE_RE.finditer(stream):
            # 대괄호 조판(진로선택)만 껍질을 벗긴다. 통합과학은 맨몸으로 온다.
            code = re.sub(r"\s", "", m.group(0)).strip("[]")
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
    ap.add_argument("--course", default="12물에", choices=sorted(COURSES),
                    help="성취기준 코드 접두어. 영역 이름·기본 쪽 범위가 여기서 정해진다")
    ap.add_argument("--primary", type=int, nargs=2, metavar=("FIRST", "LAST"))
    ap.add_argument("--cross", type=int, nargs=2, metavar=("FIRST", "LAST"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    course = COURSES[args.course]
    primary_pages = tuple(args.primary) if args.primary else course["primary"]
    cross_pages = tuple(args.cross) if args.cross else course["cross"]
    area_names = course["areas"]

    backlog = load_backlog()
    subjects = backlog["subjects"] if "subjects" in backlog else [backlog["subject"]]
    with_guide = [s for s in subjects if s.get("guide")]
    if not args.guide and not with_guide:
        raise SystemExit("지도서가 있는 과목이 백로그에 없다 — --guide 로 지정하라")
    guide = args.guide or (ROOT / with_guide[0]["guide"]["file"])

    with pdfplumber.open(str(guide), laparams=LAPARAMS) as doc:
        primary = harvest(doc, *primary_pages)
        cross = harvest(doc, *cross_pages)
    # 다른 과목 코드가 같은 쪽에 섞여 있어도(2015↔2022 비교표) 이 과목만 남긴다
    primary = {c: v for c, v in primary.items() if c.startswith(args.course)}
    cross = {c: v for c, v in cross.items() if c.startswith(args.course)}

    records, problems = [], []
    for code in sorted(primary):
        pno, text = primary[code]
        # 진로선택은 '12물에01-01', 공통은 '10통과1-01-01' — 접두어 뒤 붙임표가 있고 없다
        area, seq = code[len(args.course):].lstrip("-").split("-")

        if not (MIN_LEN <= len(text) <= MAX_LEN and text.endswith(SENTENCE_END)):
            problems.append(f"{code}: 문장 형태가 이상하다 ({len(text)}자) — {text[:60]}")

        agreement, note = "미대조", None
        if code in cross:
            a = norm_for_compare(text)
            b = norm_for_compare(cross[code][1])
            if a == b:
                agreement = "일치"
            else:
                agreement = "불일치"
                # 라벨을 굳히면 1·2차가 뒤바뀐 과목(12세포)에서 출처가 거꾸로 적힌다.
                # source 문자열과 같은 이유다.
                note = (f"{course.get('cross_label', '각론')} "
                        f"{cross[code][0]}쪽 판본: {cross[code][1]}")
                problems.append(f"{code}: 총론·각론 판본 불일치 — 사람이 NCIC 원문으로 확정해야 한다")

        records.append({"code": code, "area": area, "seq": seq,
                        "area_name": area_names.get(area, ""), "text": text,
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
# crosscheck: 일치   = 두 판본이 (공백·가운뎃점 무시) 같다 — 같은 문장을 총론은 '·',
#                      각론은 'ㆍ' 로 찍는 판형이 있어 조판 차이는 이견으로 보지 않는다
#             불일치 = 판본이 갈린다. note 에 각론 판본을 적어 두었으니
#                      **사람이 NCIC 원문으로 확정**해야 한다. 그 전에는 C5 태깅에 쓰지 마라.
#             미대조 = 각론에서 짝을 못 찾았다
#
# 생성: scripts/extract_standards.py — 손으로 고치지 말고 스크립트를 고쳐라.

"""
    footer = """
# ── 지도서 자리가 과목마다 다르다 ────────────────────────────────────────────
# 통합과학1·2 는 지도서 한 권에 함께 실려 있다 (비상교육, 신영준 외).
# 총론 표의 자리가 과목마다 다르다 — 1은 p10~13, 2는 p15~17. COURSES 참조.
"""
    # 병합 — 다른 과목의 항목은 그대로 두고 이 과목만 갈아끼운다.
    # 파일 전체를 다시 쓰면 먼저 넣은 과목이 사라진다.
    existing = {}
    if OUT.exists():
        try:
            existing = (yaml.safe_load(OUT.read_text(encoding="utf-8")) or {}).get("courses", {}) or {}
        except Exception:
            existing = {}
    # 과목 note 는 사람이 적은 판단 기록이다 (어느 코드를 왜 믿지 못하는가).
    # 스크립트가 다시 돌 때 지워 버리면 그 판단이 소리 없이 사라지므로 이어받는다.
    kept_note = (existing.get(args.course) or {}).get("note")
    entry = {
        "name": course["name"],
        "type": course["type"],
        # 어느 절이 1차인지는 과목마다 다르다 — 세포와 물질대사만 각론이 1차다.
        # 라벨을 굳혀 두면 뒤바뀐 과목에서 출처가 거꾸로 적힌다.
        "source": f"지도서 {guide.name} {course.get('primary_label', '총론')} "
                  f"{primary_pages[0]}~{primary_pages[1]}쪽 "
                  f"(대조 - {course.get('cross_label', '각론')} "
                  f"{cross_pages[0]}~{cross_pages[1]}쪽)",
    }
    if kept_note:
        entry["note"] = kept_note
    entry["standards"] = [{k: v for k, v in r.items() if v is not None} for r in records]
    existing[args.course] = entry
    payload = {"courses": dict(sorted(existing.items()))}
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
