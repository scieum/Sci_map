#!/usr/bin/env python3
"""Q6 검토 문서 — 교사가 보고 승인하는 자리.

설계서 §5.1 Q6. 승인은 `approved: true` 로 이 파일에 기록되고,
`app/scripts/build_items.py` 가 그 줄을 보고서야 문항을 앱 번들에 담는다.
**자동 통과 옵션은 없다** (CLAUDE.md §5).

이미 승인된 과목의 문서는 덮어쓰지 않는다 — 승인 기록을 스크립트가 지우면
게이트가 게이트가 아니다. 다시 만들려면 `--force` 를 준다.

사용:
    python review.py --subject mate
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
ITEMS = REPO / "output" / "items"
REVIEW = REPO / "output" / "review"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", required=True, help="과목 코드 (mate, isci2 …)")
    ap.add_argument("--force", action="store_true", help="이미 승인된 문서도 다시 만든다")
    args = ap.parse_args()

    docs = []
    for path in sorted(ITEMS.glob("*/items.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc["subject_code"] == args.subject:
            docs.append(doc)
    if not docs:
        print(f"{args.subject} 문항이 없다 — split.py 를 먼저 돌려라", file=sys.stderr)
        return 2

    out = REVIEW / f"{args.subject}-exam.review.md"
    if out.exists() and re.search(r"^approved:\s*true\s*$", out.read_text(encoding="utf-8"), re.M):
        if not args.force:
            print(f"{out.name} 은 이미 승인돼 있다 — 덮어쓰지 않는다 (--force 로 강제)")
            return 0

    total = sum(len(d["items"]) for d in docs)
    choice = sum(1 for d in docs for i in d["items"] if i.get("kind") == "choice")
    written = sum(1 for d in docs for i in d["items"] if i.get("kind") == "written")
    cand = collections.Counter(len(i.get("concept_candidates", [])) for d in docs for i in d["items"])
    rights = docs[0]["rights"]
    subject_name = rights["source"].split("「")[1].split("」")[0] if "「" in rights["source"] else args.subject

    lines = [
        f"# Q6 검토 — {subject_name} 평가 문항\n",
        f"> 생성 {dt.date.today().isoformat()} · 회차 {len(docs)} · 문항 {total}"
        f" (객관식 {choice} · 서술형·단답 {written})\n",
        "## 승인 전에는 배포하지 않는다\n",
        "아래 `approved` 가 `true` 가 되기 전까지 이 과목의 문항은 앱 번들에 담기지 않는다."
        " `app/scripts/build_items.py` 가 이 줄을 읽는다 (CLAUDE.md §5).\n",
        "```yaml\napproved: false\napproved_by: \napproved_at: \n```\n",
        "## 1. 권리 대장\n",
        "| 항목 | 값 |\n|---|---|",
        f"| holder | {rights['holder']} |",
        f"| basis | {rights['basis']} |",
        f"| condition | {rights['condition']} |",
        f"| access_tier | {docs[0]['access_tier']} (규칙 도출 — holder ≠ 교사) |",
        "| 워터마크 | 전 문항 하단 띠 (학교명·이용 근거·출처) |",
        f"| 대장 기록 | output/rights/ledger.jsonl 에 {total}행 |\n",
        "## 2. 회차별\n",
        "| 회차 | 범위 | 문항 | 객관식 | 확인 필요 |\n|---|---|---|---|---|",
    ]
    for d in docs:
        ch = sum(1 for i in d["items"] if i.get("kind") == "choice")
        scope = d.get("topic_id") or d.get("topic_prefix") or d["unit_id"]
        if d.get("curriculum"):
            scope += f" · {d['curriculum']}"
        problems = " / ".join(d.get("problems", [])) or "—"
        lines.append(f"| {d['paper_id']} | {scope} | {len(d['items'])} | {ch} | {problems} |")

    exact = sum(1 for d in docs for i in d["items"] if i.get("mapping") == "code-exact")
    need = sum(1 for d in docs for i in d["items"] if i.get("mapping") == "needs-llm")
    lines += [
        "\n## 3. 개념 매핑 상태\n",
        f"- 후보를 찾은 문항: {total - sum(1 for d in docs for i in d['items'] if i.get('mapping') == 'unmapped')}/{total}",
        f"- 카드 하나로 좁혀진 문항: {exact}",
        f"- 후보 여럿 — LLM(item-curator)이 골라야 하는 문항: {need}",
        f"- 후보 수 분포: {dict(sorted(cand.items()))}\n",
        "## 4. 해설\n",
        "아직 쓰지 않았다(Q4 미실행). 발행사 해설은 **옮기지 않는다** — 카드의 관계 명제를"
        " 인용해 자체 작성한다 (CLAUDE.md §6).\n",
        "## 5. 교사가 볼 것\n",
        "1. 크롭이 문항을 온전히 담고 있는가 (공통 지문·그림 포함 여부)\n"
        "2. 정답이 원자료와 맞는가 — 객관식 번호만 싣는다\n"
        "3. 권리 대장의 4필드와 워터마크 문구 — 학교명을 실제 학교명으로 바꿔야 한다\n"
        "4. 로그인 한정 공개가 맞는가 (docs/rights_policy.md §2.7)\n",
    ]

    REVIEW.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"{out.relative_to(REPO)} — 회차 {len(docs)} · 문항 {total} (승인 대기)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
