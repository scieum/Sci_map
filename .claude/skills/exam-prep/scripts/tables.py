#!/usr/bin/env python3
"""Q2 정답·성취기준 결합 — `문항정보표` 를 읽어 문항에 붙인다.

설계서 §5.1 Q2. 정답표 파싱과 문항–정답 결합이다. 이 자료는 발행사가 표로
정리해 둔 덕에 정답만이 아니라 **성취기준 코드·평가 영역·난이도**까지 함께
온다. 성취기준 코드는 Q3(개념 매핑)의 출발점이 된다 — 카드의 관계 명제에도
같은 코드가 붙어 있다.

★ 앱에 싣는 정답은 **객관식 번호(①~⑤)뿐이다.** 서술형·단답형의 모범답안은
  발행사가 쓴 글이라 옮기지 않는다 (CLAUDE.md §6). 그런 문항은 '스스로 확인'
  으로 두고, 우리가 카드 관계 명제를 인용해 쓴 해설이 답을 설명한다.

★ `정답및해설` 파일은 아예 읽지 않는다. 정답은 이 표에 있고, 해설은 쓰지
  않는다 — 읽어 두면 언젠가 섞여 들어간다.

사용:
    python tables.py --all
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SRC = REPO / "output" / "source" / "exam"
OUT = REPO / "output" / "items"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"

CHOICE = "①②③④⑤"
CURRICULUM = re.compile(r"\[?((?:10통과\d|12물에)\d?-?\d\d-\d\d)\]?")

# 교사용 문제지 끝의 정답 블록 — `01 ① 02 ② 03 ④ …`
#
# ★ 여기서 가져오는 것은 **번호와 기호뿐**이다. 같은 지면에 해설이 잔뜩 있지만
#   한 글자도 읽지 않는다 (CLAUDE.md §6). 해설 본문에는 "01 ㄱ. 수은을…" 처럼
#   번호가 다시 나오는데, 그 뒤에 ①~⑤ 가 붙지 않으므로 이 패턴에 걸리지 않는다.
TEACHER_ANSWER = re.compile(r"(?<![\d])(\d{2})\s*([①②③④⑤])")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), "stage": "Q2", **row}, ensure_ascii=False) + "\n")


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


def cell(row: list, idx: int) -> str:
    if idx is None or idx >= len(row) or row[idx] is None:
        return ""
    return re.sub(r"\s+", " ", str(row[idx])).strip()


def header_map(rows: list[list]) -> tuple[dict[str, int], int]:
    """표 머리글에서 열 위치를 찾는다. 회차마다 열 구성이 조금씩 다르다."""
    for i, row in enumerate(rows[:3]):
        joined = [cell(row, j) for j in range(len(row))]
        if any("번호" in c for c in joined):
            idx = {}
            for j, c in enumerate(joined):
                if "번호" in c and "번호" not in idx:
                    idx["번호"] = j
                elif "정답" in c and "정답" not in idx:
                    idx["정답"] = j
                elif "성취" in c and "성취" not in idx:
                    idx["성취"] = j
                elif "평가 내용" in c or "평가내용" in c:
                    idx.setdefault("내용", j)
                elif "영역" in c:
                    idx.setdefault("영역", j)
                elif "난이도" in c:
                    idx.setdefault("난이도", j)
            return idx, i
    return {}, 0


def parse_info(pdf_path: Path) -> dict[int, dict]:
    import pdfplumber

    found: dict[int, dict] = {}
    # 표가 다음 쪽으로 이어질 때는 머리글이 다시 찍히지 않는다. 앞에서 읽어 둔
    # 열 위치를 그대로 쓴다 — 이걸 안 하면 이어진 쪽의 문항이 정답 없이 남는다
    last_idx: dict[str, int] = {}
    last_cols = 0
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                idx, head_at = header_map(table)
                if "번호" not in idx:
                    first = cell(table[0], 0) if table else ""
                    if last_idx and table and len(table[0]) == last_cols and re.fullmatch(r"\d{1,2}", first):
                        idx, head_at = last_idx, -1
                    else:
                        continue
                else:
                    last_idx, last_cols = idx, len(table[head_at])
                for row in table[head_at + 1:]:
                    no_raw = cell(row, idx["번호"])
                    m = re.fullmatch(r"(\d{1,2})", no_raw)
                    if not m:
                        continue
                    no = int(m.group(1))
                    answer = cell(row, idx.get("정답"))
                    code = CURRICULUM.search(cell(row, idx.get("성취")))
                    found[no] = {
                        "answer_raw": answer,
                        # 객관식만 앱으로 간다. 나머지는 내부에만 남는다
                        "answer": answer if answer in list(CHOICE) else None,
                        "kind": "choice" if answer in list(CHOICE) else "written",
                        "curriculum": code.group(1) if code else None,
                        "topic_label": cell(row, idx.get("내용")) or None,
                        "domain": cell(row, idx.get("영역")) or None,
                        "difficulty": cell(row, idx.get("난이도")) or None,
                    }
    return found


def parse_teacher(pdf_path: Path) -> dict[int, dict]:
    """교사용 문제지에서 **객관식 정답만** 읽는다.

    발행사에 따라 문항정보표가 없고 교사용 문제지에 정답이 표시돼 오는 자료가
    있다(물질과 에너지). 그 지면에는 해설도 함께 있지만 우리는 끝의 정답
    블록에서 번호와 기호만 가져온다 — 서술형은 기호가 없으므로 자연히 빠진다.
    """
    import pdfplumber

    found: dict[int, dict] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for m in TEACHER_ANSWER.finditer(page.extract_text() or ""):
                no = int(m.group(1))
                if 1 <= no <= 40:
                    found.setdefault(no, {
                        "answer_raw": m.group(2),
                        "answer": m.group(2),
                        "kind": "choice",
                        "curriculum": None,
                        "topic_label": None,
                        "domain": None,
                        "difficulty": None,
                    })
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    meta, papers = load_papers()
    if args.paper:
        papers = [p for p in papers if p["paper_id"] == args.paper]
    elif not args.all:
        print("--paper 또는 --all 이 필요하다", file=sys.stderr)
        return 2

    total = choice = written = missing = 0
    for rec in papers:
        pid = rec["paper_id"]
        items_path = OUT / pid / "items.json"
        if not items_path.exists():
            print(f"  {pid}: 크롭이 없다 — split.py 를 먼저 돌려라")
            continue
        pdfs = rec.get("pdf", {})
        info_pdf = pdfs.get("info")
        teacher_pdf = pdfs.get("answers-teacher")
        if info_pdf:
            table = parse_info(REPO / info_pdf)
            source = info_pdf
        elif teacher_pdf:
            table = parse_teacher(REPO / teacher_pdf)
            source = teacher_pdf
        else:
            table, source = {}, None

        doc = json.loads(items_path.read_text(encoding="utf-8"))
        gaps: list[int] = []
        # 회차 전체가 한 성취기준인 자료가 있다(최소성취수준평가). 그 값은
        # 파일 이름에서 왔고, 문항마다 따로 적혀 있지 않다
        paper_code = rec.get("curriculum")
        for item in doc["items"]:
            row = table.get(item["no"])
            if not row:
                # 정답표에 없는 문항 = 서술형. 정답표가 객관식만 담는 자료에서는
                # 이것이 결함이 아니라 형식이다 — 교사용에서 온 경우만 그렇게 본다
                if teacher_pdf:
                    item.update({"answer": None, "kind": "written",
                                 "curriculum": paper_code, "topic_label": None,
                                 "domain": None, "difficulty": None})
                    written += 1
                    total += 1
                    continue
                gaps.append(item["no"])
                item["answer"] = None
                item["kind"] = "unknown"
                continue
            if paper_code and not row.get("curriculum"):
                row["curriculum"] = paper_code
            item.update({k: row[k] for k in
                         ("answer", "kind", "curriculum", "topic_label", "domain", "difficulty")})
            # 발행사가 쓴 모범답안은 앱으로 가지 않는다. 대조용으로만 남긴다
            item["answer_internal"] = row["answer_raw"]
            total += 1
            choice += row["kind"] == "choice"
            written += row["kind"] == "written"
        missing += len(gaps)
        if gaps:
            doc.setdefault("problems", []).append(f"정답표에 없는 문항: {gaps}")
        doc["answers_from"] = source
        items_path.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        mark = "⚠ " if gaps else "  "
        print(f"{mark}{pid:24s} 정답 {len(doc['items']) - len(gaps)}/{len(doc['items'])}"
              f"  객관식 {sum(1 for i in doc['items'] if i.get('kind') == 'choice')}")

    print(f"\n합계 {total}문항 · 객관식 {choice} · 서술형·단답 {written}"
          + (f" · 정답 못 찾음 {missing}" if missing else ""))
    log(result="ok" if not missing else "warn", items=total, choice=choice,
        written=written, missing=missing)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
