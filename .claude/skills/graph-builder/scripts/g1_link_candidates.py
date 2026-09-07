#!/usr/bin/env python3
"""G1 — 링크 후보 탐지 (설계서 §5.2).

전체 카드를 훑어 **단원을 가로지르는 연결 후보**를 뽑는다. 판정하지 않는다 —
유효한지는 G2(graph-curator)가 보고, 사전 등록은 G3 사람 게이트가 한다.

근거 네 가지:
  key_exact       concept_key 완전 일치            강함 → same 후보
  term_match      표제어·별칭 일치 (띄어쓰기 무시)   중간 → 같은 개념일 수 있다
  mention         카드 본문이 다른 단원 카드의 표제어를 부른다  중간/약함
  reverse_missing A→B 링크는 있는데 B→A 가 없다      복구 후보

★ 표기가 같다는 이유로 링크를 걸지 않는다 (R9). 이 스크립트는 **후보만** 만든다.
  homonyms.yaml 의 surface 에 걸리는 후보는 homonym_surface 를 달아 내보낸다 —
  G2 가 그것을 먼저 본다.

사용:
    python g1_link_candidates.py                  # 전체 카드
    python g1_link_candidates.py --units reac-1 reac-2
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
CONCEPTS = REPO / "output" / "concepts"
OUT = REPO / "output" / "graph" / "link_candidates.json"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"
HOMONYMS = REPO / "docs" / "homonyms.yaml"

# 링크 후보로 올릴 최소 표기 길이. homonyms.yaml 의 matching_rules 기본값과 같다.
# '염'·'산' 같은 한 글자 표기는 아무 데나 걸려서 후보를 쓸모없게 만든다.
MIN_SURFACE = 2
# 본문 언급이 이만큼 나오면 약함이 아니라 중간으로 본다
MENTION_STRONG_AT = 2

HANGUL_OR_ALNUM = re.compile(r"[0-9A-Za-z가-힣]")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), **row}, ensure_ascii=False) + "\n")


def load_cards(units: list[str] | None) -> list[dict]:
    cards = []
    for d in sorted(CONCEPTS.iterdir()):
        if not d.is_dir():
            continue
        if units and d.name not in units:
            continue
        for f in sorted(d.glob("*.json")):
            if f.name.endswith(".candidates.json"):
                continue
            c = json.loads(f.read_text(encoding="utf-8"))
            c["_unit"] = d.name
            cards.append(c)
    return cards


def homonym_surfaces() -> set[str]:
    """사람 관리 파일에서 금지 표기만 읽는다. 고치지 않는다 (CLAUDE.md §9.3)"""
    if not HOMONYMS.exists():
        return set()
    try:
        import yaml
        data = yaml.safe_load(HOMONYMS.read_text(encoding="utf-8")) or {}
    except Exception:
        return set()
    return {h["surface"] for h in (data.get("homonyms") or []) if h.get("surface")}


def surfaces_of(card: dict) -> list[str]:
    out = [card.get("term") or ""]
    out += list(card.get("aliases") or [])
    return [s for s in out if len(s.replace(" ", "")) >= MIN_SURFACE]


def card_text(card: dict) -> str:
    """카드가 말하는 것 전부 — 정의·명제·오개념. 표기(notation)는 넣지 않는다"""
    parts = [card.get("definition") or ""]
    for r in card.get("relations") or []:
        parts.append(r.get("text") or "")
        form = r.get("form") or {}
        parts += [form.get("condition") or "", form.get("scope") or ""]
        parts.append(r.get("inverted_text") or "")
    for m in card.get("misconceptions") or []:
        parts += [m.get("text") or "", m.get("why_wrong") or ""]
    return "\n".join(parts)


def scan_mentions(text: str, surfaces: list[str]) -> dict[str, int]:
    """본문이 부르는 표기를 센다.

    규칙 둘로 정한다.

    1. **어절 첫머리에서 시작해야 한다.** 한국어는 낱말 뒤에 조사·어미가 붙지만
       앞에는 붙지 않는다. 그래서 뒤는 열어 두고("수소 결합이" ○) 앞만 막으면
       된다. 이 규칙 하나가 G2 가 잡아낸 오검출을 거의 다 걷어낸다 —
       '비전해질'→전해질(뜻이 정반대다), '과호흡'→호흡, '1기압'→기압,
       '과산화 수소수'→산화수.
    2. **긴 표기가 이긴다.** '산화수' 가 있는 자리를 '산화' 로 세지 않는다.

    처음에는 본문의 공백까지 모두 지우고 부분 문자열로 찾았다가 '…같고 분자성…'
    에서 '고분자' 를 만들어 냈다. 공백을 지우는 것은 **표기 쪽**에만 적용하고
    (표기 정책 §6 의 '증기 압력 ≡ 증기압력'), 본문의 어절 경계는 지킨다.
    """
    counts: dict[str, int] = {}
    taken: list[tuple[int, int]] = []  # 이미 긴 표기가 차지한 구간

    def overlaps(a: int, b: int) -> bool:
        return any(a < y and x < b for x, y in taken)

    for surface in sorted({s for s in surfaces if s}, key=lambda x: -len(x)):
        parts = [re.escape(p) for p in surface.split() if p]
        if not parts:
            continue
        # 표기 안의 공백은 있어도 없어도 된다. 앞은 한글·영숫자로 이어지면 안 된다
        pattern = r"(?<![0-9A-Za-z가-힣])" + r"\s*".join(parts)
        n = 0
        for m in re.finditer(pattern, text):
            if overlaps(m.start(), m.end()):
                continue
            taken.append((m.start(), m.end()))
            n += 1
        if n:
            counts[re.sub(r"\s+", "", surface)] = n
    return counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--units", nargs="*", default=None)
    args = ap.parse_args()

    cards = load_cards(args.units)
    if not cards:
        print("카드가 없다", file=sys.stderr)
        return 2
    by_id = {c["id"]: c for c in cards}
    homs = homonym_surfaces()

    # 이미 걸려 있는 링크 — 후보로 다시 올리지 않는다
    existing: set[tuple[str, str]] = set()
    for c in cards:
        for l in c.get("links") or []:
            existing.add((c["id"], l.get("target")))

    cands: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    def add(frm: str, to: str, basis: str, strength: str, suggested: str, evidence: dict):
        key = (frm, to, basis)
        if key in seen:
            return
        seen.add(key)
        a, b = by_id[frm], by_id.get(to)
        surface = evidence.get("surface", "")
        cands.append({
            "id": f"g1-{len(cands) + 1:04d}",
            "from": frm,
            "to": to,
            "from_unit": a["_unit"],
            "to_unit": b["_unit"] if b else None,
            "from_term": a.get("term"),
            "to_term": b.get("term") if b else None,
            "from_key": a.get("concept_key"),
            "to_key": b.get("concept_key") if b else None,
            "basis": basis,
            "strength": strength,
            "suggested_type": suggested,
            "homonym_surface": surface if surface in homs else None,
            "evidence": evidence,
        })

    # ① concept_key 완전 일치 — 가장 강한 근거. same 후보다
    bykey: dict[str, list[dict]] = {}
    for c in cards:
        bykey.setdefault(c["concept_key"], []).append(c)
    for key, group in bykey.items():
        if len(group) < 2:
            continue
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                add(a["id"], b["id"], "key_exact", "strong", "same",
                    {"concept_key": key, "surface": a.get("term", "")})

    # ② 표제어·별칭 일치 (띄어쓰기 무시) — 단원이 다를 때만
    by_surface: dict[str, list[dict]] = {}
    for c in cards:
        for s in surfaces_of(c):
            by_surface.setdefault(re.sub(r"\s+", "", s), []).append(c)
    for flat, group in by_surface.items():
        uniq = {c["id"]: c for c in group}.values()
        if len(uniq) < 2:
            continue
        lst = list(uniq)
        for i, a in enumerate(lst):
            for b in lst[i + 1:]:
                if a["_unit"] == b["_unit"]:
                    continue
                if a["concept_key"] == b["concept_key"]:
                    continue  # ①이 이미 잡았다
                add(a["id"], b["id"], "term_match", "medium", "same?",
                    {"surface": flat})

    # ③ 본문 언급 — 카드가 다른 단원 개념을 부르는 자리
    # 표기 → 그 표기를 가진 카드들. 한 표기를 여러 카드가 가질 수 있다
    owner: dict[str, list[dict]] = {}
    all_surfaces: list[str] = []
    for c in cards:
        for s in surfaces_of(c):
            flat = re.sub(r"\s+", "", s)
            owner.setdefault(flat, []).append(c)
            all_surfaces.append(s)
    for a in cards:
        counts = scan_mentions(card_text(a), all_surfaces)
        for flat, n in counts.items():
            for b in owner.get(flat, []):
                if a["id"] == b["id"] or a["_unit"] == b["_unit"]:
                    continue
                if (a["id"], b["id"]) in existing:
                    continue
                add(a["id"], b["id"], "mention",
                    "medium" if n >= MENTION_STRONG_AT else "weak",
                    "related",
                    {"surface": flat, "count": n})

    # ④ 역방향 누락 — A 는 B 를 가리키는데 B 는 A 를 모른다
    for a in cards:
        for l in a.get("links") or []:
            t = l.get("target")
            b = by_id.get(t)
            if not b:
                continue
            if (t, a["id"]) in existing:
                continue
            add(t, a["id"], "reverse_missing", "medium",
                {"prereq": "next", "next": "prereq"}.get(l.get("type"), l.get("type")),
                {"forward_type": l.get("type"), "surface": ""})

    by_basis: dict[str, int] = {}
    for c in cands:
        by_basis[c["basis"]] = by_basis.get(c["basis"], 0) + 1
    cross = sum(1 for c in cands if c["to_unit"] and c["from_unit"] != c["to_unit"])

    out = {
        "generated_at": now(),
        "cards_scanned": len(cards),
        "units": sorted({c["_unit"] for c in cards}),
        "existing_links": len(existing),
        "stats": {
            "total": len(cands),
            "by_basis": by_basis,
            "cross_unit": cross,
            "homonym_flagged": sum(1 for c in cands if c["homonym_surface"]),
        },
        "note": "후보일 뿐이다. 유효성은 G2, 사전 등록은 G3 사람 게이트가 정한다 (R9).",
        "candidates": cands,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8", newline="\n")

    print(f"카드 {len(cards)}장 · 기존 링크 {len(existing)}개")
    for k, v in sorted(by_basis.items()):
        print(f"  {k:16s} {v}")
    print(f"=> 후보 {len(cands)}건 (단원 간 {cross} · 동음이의 표기 "
          f"{out['stats']['homonym_flagged']}) → {OUT.relative_to(REPO)}")
    log(stage="G1", result="pass", reason=f"링크 후보 {len(cands)}건",
        cards=len(cards), units=out["units"], **out["stats"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
