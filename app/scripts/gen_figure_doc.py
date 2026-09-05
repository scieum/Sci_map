#!/usr/bin/env python3
"""카드 + 권리 대장 → docs/figure_assets.md (그림이 필요한 카드 목록).

이모지 목록(docs/art_assets.md)과 같은 발상이다. 목록을 손으로 관리하면
카드와 어긋나므로, 카드에서 만들어 낸다.

무엇이 목록에 오르나: **그림이 아직 없는 카드.** 교과서 크롭이 붙은 카드는
상한(8장) 안에서 이미 채워졌으므로 제외한다.

사용:
    python app/scripts/gen_figure_doc.py
    python app/scripts/gen_figure_doc.py --units mate-1
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "figure_assets.md"

UNIT_CROP_LIMIT = 8  # 설계서 §4.4 — 교과서 그림만 해당


def load(unit_id: str):
    import yaml
    with (REPO / "docs" / "unit_backlog.yaml").open(encoding="utf-8") as fh:
        backlog = yaml.safe_load(fh)
    unit = next(u for u in backlog["units"] if u["id"] == unit_id)
    topic_of, section_of, order = {}, {}, {}
    for si, sec in enumerate(unit["sections"]):
        for ti, t in enumerate(sec["topics"]):
            topic_of[t["id"]] = t["title"]
            section_of[t["id"]] = sec["title"]
            order[t["id"]] = (si, ti)

    cards = [json.loads(f.read_text(encoding="utf-8"))
             for f in sorted((REPO / "output" / "concepts" / unit_id).glob("*.json"))]

    led = REPO / "output" / "rights" / "ledger.jsonl"
    ledger = {}
    if led.exists():
        for line in led.open(encoding="utf-8"):
            r = json.loads(line)
            if r.get("unit_id") == unit_id and r.get("concept_id"):
                ledger[r["concept_id"]] = r
    return unit, cards, ledger, topic_of, section_of, order


def esc(v) -> str:
    return str(v or "").replace("|", "\\|").replace("\n", " ")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--units", nargs="*", default=["mate-1"])
    args = ap.parse_args()

    out = ["# 그림 자산 목록 — 아직 그림이 없는 개념 카드", ""]
    out.append("> **이 파일은 생성물이다.** 손으로 고치지 말고 카드를 고친 뒤")
    out.append("> `python app/scripts/gen_figure_doc.py` 를 다시 돌려라.")
    out.append("")

    out.append("## 왜 교과서 그림으로 다 채우지 않았나")
    out.append("")
    out.append(f"**교과서 그림 크롭은 단원당 {UNIT_CROP_LIMIT}장이 상한이다** (설계서 §4.4, 제약 R2).")
    out.append("저작권법 제25조 제3항이 허용하는 것은 \"공표된 저작물의 **일부분**\" 이용이고,")
    out.append("단원의 그림을 전량 가져오면 일부분을 넘어선다. 상한을 늘리면 게재 근거 자체가 약해진다.")
    out.append("")
    out.append("**직접 만든 그림에는 이 상한이 걸리지 않는다.** 내 저작물이기 때문이다.")
    out.append("권리자가 교사 본인이면 `access_tier` 는 `public` 이 되고, 로그인 없이 누구에게나 열린다.")
    out.append("")

    out.append("## 넣는 법")
    out.append("")
    out.append("1. 그림을 만들어 **`app/public/media/own/<카드 id>.png`** 로 넣는다.")
    out.append("   파일명이 곧 카드 id 다 — 예: `mate-charles-law.png`")
    out.append("2. 권리 대장에 등록한다 (상한은 없지만 **기록은 건너뛰지 않는다**):")
    out.append("   ```")
    out.append("   python .claude/skills/figure-cropper/scripts/register_own.py --unit mate-1 --author \"이름\"")
    out.append("   ```")
    out.append("3. 앱 데이터를 다시 만든다:")
    out.append("   ```")
    out.append("   python app/scripts/build_concepts.py")
    out.append("   ```")
    out.append("")
    out.append("## 만들 때 참고")
    out.append("")
    out.append("- 개념 카드 본문 폭에 들어간다. **가로 800~1200px** 정도면 넉넉하다.")
    out.append("- 카드에서 그림이 놓이는 자리는 「관계 명제」와 「이어지는 개념」 사이다.")
    out.append("  그림만 봐도 **관계 명제가 떠오르는** 그림이 좋은 그림이다.")
    out.append("- 아래 표의 「그려야 할 것」은 그 카드의 관계 명제에서 뽑았다. 명제를 그림으로")
    out.append("  옮기면 카드와 그림이 같은 말을 하게 된다.")
    out.append("- 글자를 넣을 때는 **현행 표기**를 쓴다 (`docs/naming_policy.md`).")
    out.append("")

    for unit_id in args.units:
        unit, cards, ledger, topic_of, section_of, order = load(unit_id)
        have = [c for c in cards if c["id"] in ledger]
        need = [c for c in cards if c["id"] not in ledger]
        need.sort(key=lambda c: order.get(c.get("topic_id", ""), (9, 9)))

        out.append(f"# {unit['numeral']}. {unit['title']} (`{unit_id}`)")
        out.append("")
        out.append(f"카드 {len(cards)}장 · 그림 있음 **{len(have)}장** · **필요 {len(need)}장**")
        out.append("")

        if have:
            out.append("<details><summary>이미 그림이 있는 카드 "
                       f"{len(have)}장 (교과서 크롭 — 상한 소진)</summary>")
            out.append("")
            out.append("| 카드 | 그림 | 권리 |")
            out.append("|---|---|---|")
            for c in have:
                r = ledger[c["id"]]
                tier = r["access_tier"]
                out.append(f"| {esc(c['term'])} | {esc(r.get('figure_no'))} {esc(r.get('caption'))} "
                           f"| {esc(r['rights']['holder'])} · `{tier}` |")
            out.append("")
            out.append("</details>")
            out.append("")

        cur = None
        for c in need:
            tid = c.get("topic_id", "")
            key = f"{section_of.get(tid, '')} > {topic_of.get(tid, '')}"
            if key != cur:
                cur = key
                out.append(f"## {key}")
                out.append("")
                out.append("| 카드 id | 표제어 | 그려야 할 것 (관계 명제에서) | 우선순위 |")
                out.append("|---|---|---|---|")
            # 우선순위: core 가 학생이 시험에서 만나는 것
            pri = {"core": "높음", "supporting": "보통", "context": "낮음"}.get(c.get("role", ""), "보통")
            draw = " / ".join(r["text"] for r in c["relations"][:2])
            out.append(f"| `{c['id']}` | **{esc(c['term'])}** | {esc(draw)} | {pri} |")
        out.append("")

        core_need = [c["id"] for c in need if c.get("role") == "core"]
        if core_need:
            out.append(f"**먼저 만들 것 ({len(core_need)}장)** — 성취기준이 직접 요구하는 `core` 카드다.")
            out.append("")
            out.append(" · ".join(f"`{i}`" for i in core_need))
            out.append("")

    OUT.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(f"생성: {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
