#!/usr/bin/env python3
"""C8 검토 패키지 생성 — 설계서 §4.3 C8.

교사가 단원 하나를 짧은 시간에 판단할 수 있는 md 를 만든다. **판정하지 않는다** —
차려 놓기만 한다. 진위는 사람이 본다 (CLAUDE.md §9.7).

패키지에 무엇을 넣을지는 설계서가 정해 두었다. 그중 중심은 **관계 명제 전문 목록**이고,
나머지는 "자동 검증이 원리적으로 못 잡는 것"을 앞으로 끌어내는 장치다.

사용:
    python build_c8_package.py mate-2
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]


def load_cards(unit: str) -> list[dict]:
    d = REPO / "output" / "concepts" / unit
    return [json.loads(f.read_text(encoding="utf-8"))
            for f in sorted(d.glob("*.json")) if not f.name.endswith(".candidates.json")]


def load_media(unit: str) -> dict[str, dict]:
    led = REPO / "output" / "rights" / "ledger.jsonl"
    out: dict[str, dict] = {}
    if not led.exists():
        return out
    for line in led.open(encoding="utf-8"):
        r = json.loads(line)
        if r.get("unit_id") != unit:
            continue
        for cid in (r.get("concept_ids") or []):
            if cid:
                out[cid] = r
    return out


def validation_text(unit: str) -> str:
    script = REPO / ".claude/skills/concept-schema/scripts/validate_cards.py"
    p = subprocess.run([sys.executable, str(script),
                        str(REPO / "output/concepts" / unit), "--unit", unit],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return (p.stdout or "") + (p.stderr or "")


def main() -> int:
    if len(sys.argv) < 2:
        print("사용: build_c8_package.py <unit-id>", file=sys.stderr)
        return 2
    unit = sys.argv[1]
    cards = load_cards(unit)
    if not cards:
        print(f"카드가 없다: output/concepts/{unit}/", file=sys.stderr)
        return 2
    media = load_media(unit)

    rels = [(c, r) for c in cards for r in c["relations"]]
    inv = [(c, r) for c, r in rels if r["invertible"]]
    llm_mis = [(c, m) for c in cards for m in c["misconceptions"] if m.get("source") == "llm"]
    new_keys = [c for c in cards if c.get("registry_status") == "new"]
    cur = Counter(code for c in cards for code in c.get("curriculum", []))

    L: list[str] = []
    w = L.append
    unit_title = cards[0].get("unit", unit)
    w(f"# C8 검토 패키지 — {unit_title} (`{unit}`)")
    w("")
    w("> **이 문서는 판정이 아니라 검토 자료다.** 관계 명제가 참인지는 사람이 본다.")
    w("> 승인된 명제만 `verified_by: teacher` 가 되고, 그것만 데일리 문항이 된다.")
    w("> 명제 단위 부분 승인이 허용된다 — 미승인 명제는 카드에 남되 문항에서 빠진다.")
    w("")
    w("## 1. 단원 요약")
    w("")
    w("| | |")
    w("|---|---|")
    w(f"| 과목 · 단원 | {cards[0].get('subject','')} · {unit_title} |")
    w(f"| 개념 카드 | {len(cards)}장 |")
    w(f"| 관계 명제 | **{len(rels)}개** (그중 `invertible` {len(inv)}개) |")
    w(f"| 오개념 | {sum(len(c['misconceptions']) for c in cards)}개 (LLM 출처 {len(llm_mis)}개) |")
    w(f"| 교과서 그림 | {len(set(m['asset_id'] for m in media.values()))}장 → 카드 {len(media)}/{len(cards)} |")
    w(f"| 신규 `concept_key` | {len(new_keys)}개 (G3 대상) |")
    w(f"| 성취기준 커버리지 | {', '.join(f'{k}({v})' for k, v in sorted(cur.items())) or '없음'} |")
    w("")

    w("## 2. 카드별 표")
    w("")
    w("| 표제어 | 한자 | 영어 | 명제 | 오개념 | 링크 | 난이도 | 그림 |")
    w("|---|---|---|---:|---:|---:|---|---|")
    for c in cards:
        n = c["notation"]
        w(f"| {c['term']} | {n.get('hanja','')} | {n.get('english','')} | "
          f"{len(c['relations'])} | {len(c['misconceptions'])} | {len(c['links'])} | "
          f"{c.get('difficulty','')} | {'○' if c['id'] in media else '—'} |")
    w("")

    w("## 3. ★관계 명제 전문 — 검토의 중심")
    w("")
    w("명제마다 판정한다. `[ ]` 를 `[x]` 로 바꾸면 승인이다.")
    w("**`뒤집기` 가 붙은 명제는 그 문장이 그대로 OX 오답 지문이 된다** — 틀리면 학생에게")
    w("오개념을 심는 자리이므로 특히 본다.")
    w("")
    for c in cards:
        w(f"### {c['term']} (`{c['id']}`)")
        w("")
        w(f"> 정의 — {c['definition']}")
        w("")
        for r in c["relations"]:
            f = r["form"]
            w(f"- [ ] **{r['id']}** — {r['text']}")
            w(f"  - 조건 `{f.get('condition','')}` · 범위 `{f.get('scope','')}` · 유형 `{f.get('type','')}`")
            if r["invertible"]:
                w(f"  - **뒤집기(OX 오답)** — \u201c{r.get('inverted_text','')}\u201d")
                if r.get("invertible_reason"):
                    w(f"    - 근거: {r['invertible_reason']}")
            else:
                w(f"  - 뒤집지 않음 — {r.get('invertible_reason','(사유 없음)')}")
        w("")

    w("## 4. 자동 검증 요약 (C3~C7)")
    w("")
    w("```")
    w(validation_text(unit).rstrip())
    w("```")
    w("")

    w("## 5. ★특히 봐야 할 지점")
    w("")
    w("자동 검증이 **원리적으로** 못 잡는 것만 모았다.")
    w("")
    w(f"### 5.1 LLM 이 만든 오개념 {len(llm_mis)}개")
    w("")
    w("교사 출처(`docs/misconceptions.yaml`)가 없어 전부 LLM 이 지어낸 것이다.")
    w("**오개념 문장은 그대로 OX 거짓 지문이 된다.**")
    w("")
    for c, m in llm_mis:
        w(f"- [ ] `{c['id']}` — \u201c{m['text']}\u201d")
        w(f"  - 왜 틀렸나: {m['why_wrong']}")
    w("")
    w(f"### 5.2 `invertible: true` 명제 {len(inv)}개")
    w("")
    w("§3 에 전문이 있다. 여기서는 **뒤집은 문장만** 모아 둔다 — 이것이 학생이 볼 오답이다.")
    w("")
    for c, r in inv:
        w(f"- [ ] `{r['id']}` ({c['term']}) — \u201c{r.get('inverted_text','')}\u201d")
    w("")
    w(f"### 5.3 신규 `concept_key` {len(new_keys)}개 — G3 대상")
    w("")
    for c in new_keys:
        w(f"- [ ] `{c['concept_key']}` ← {c['term']}")
    w("")

    w("## 6. 승인 기록 방법")
    w("")
    w("판정을 마친 뒤:")
    w("")
    w("```bash")
    w(f"python .claude/skills/concept-schema/scripts/approve_c8.py {unit} --all --by \"교사 이름\"")
    w("```")
    w("")
    w("일부만 승인할 때는 `--relations <id> <id> ...` 로 명제 id 를 준다.")
    w("승인 결과는 `output/review/<unit>.approval.json` 과 `output/logs/pipeline.jsonl` 에 남는다.")
    w("")

    out = REPO / "output" / "review" / f"{unit}.review.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    print(f"=> {out.relative_to(REPO)} · 카드 {len(cards)} · 명제 {len(rels)} "
          f"(invertible {len(inv)}) · LLM 오개념 {len(llm_mis)} · 신규 키 {len(new_keys)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
