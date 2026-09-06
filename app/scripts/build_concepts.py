#!/usr/bin/env python3
"""파이프라인 산출 카드 → 앱 데이터 (`src/data/concepts.generated.json`).

앱 데이터를 손으로 짜맞추지 않는다. 짜맞추면 파이프라인과 앱이 갈라지고,
갈라지면 어느 쪽이 맞는지 알 수 없게 된다.

읽는 것:
  output/concepts/<unit-id>/*.json   개념 카드 (C2~C6 산출)
  output/rights/ledger.jsonl         그림 자산과 access_tier (C7 산출)
  docs/unit_backlog.yaml             대단원·중단원·소주제 이름

쓰는 것:
  app/src/data/concepts.generated.json

사용:
    python app/scripts/build_concepts.py
    python app/scripts/build_concepts.py --units mate-1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "app" / "src" / "data" / "concepts.generated.json"


def unit_titles(unit_id: str):
    """unit_backlog.yaml 에서 대단원·중단원·소주제 이름을 읽는다.

    카드의 unit 문자열을 믿지 않는다 — 작성자가 여럿이면 표기가 갈린다.
    백로그가 원본이다.
    """
    import yaml
    with (REPO / "docs" / "unit_backlog.yaml").open(encoding="utf-8") as fh:
        backlog = yaml.safe_load(fh)
    subject = backlog["subject"]["name"]
    unit = next((u for u in backlog["units"] if u["id"] == unit_id), None)
    if not unit:
        raise SystemExit(f"백로그에 {unit_id} 이 없다")
    topic_of, section_of = {}, {}
    for sec in unit["sections"]:
        for t in sec["topics"]:
            topic_of[t["id"]] = t["title"]
            section_of[t["id"]] = sec["title"]
    return subject, unit["title"], section_of, topic_of


def load_media(unit_id: str) -> dict[str, dict]:
    """권리 대장에서 concept_id → 그림 1건. 대장에 없는 자산은 배포 대상이 아니다."""
    led = REPO / "output" / "rights" / "ledger.jsonl"
    if not led.exists():
        return {}
    out = {}
    for line in led.open(encoding="utf-8"):
        r = json.loads(line)
        if r.get("unit_id") != unit_id:
            continue
        # 한 크롭을 여러 카드가 쓸 수 있다 (concept_ids). 대장은 한 행으로 둔다.
        for cid in (r.get("concept_ids") or ([r["concept_id"]] if r.get("concept_id") else [])):
            if cid:
                out[cid] = r
    return out


def to_app(card: dict, subject, major, section_of, topic_of, media) -> dict:
    n = card["notation"]
    tid = card.get("topic_id", "")

    # 앱의 hanja 는 null = "해당 없음(음차어)" 라는 뜻이다.
    # 파이프라인의 null 은 "미조사" 라 뜻이 반대다 — 검증기가 미조사를 막으므로
    # 여기 도달한 null 은 없다고 보고, "해당 없음" 만 null 로 접는다.
    hanja = n.get("hanja")
    app_hanja = None if hanja in (None, "해당 없음") else hanja

    out = {
        "id": card["id"],
        "term": card["term"],
        "aliases": card.get("aliases", []),
        "hanja": app_hanja,
        "english": n["english"],
        "definition": card["definition"],
        "relations": [
            {
                "id": r["id"],
                "text": r["text"],
                "condition": r["form"]["condition"],
                "scope": r["form"].get("scope"),
                "invertible": r["invertible"],
                **({"invertedText": r["inverted_text"]} if r.get("inverted_text") else {}),
            }
            for r in card["relations"]
        ],
        "misconceptions": [
            {"text": m["text"], "whyWrong": m["why_wrong"]} for m in card["misconceptions"]
        ],
        "links": [
            {"type": l["type"], "target": l["target"], **({"note": l["note"]} if l.get("note") else {})}
            for l in card["links"]
        ],
        "subject": subject,
        "unit": f"{major} > {section_of.get(tid, '')}".rstrip(" >"),
        "topic": topic_of.get(tid, ""),
        # 목차 번호(Ⅰ. / 1. / 01.)의 근거다. 화면에서 순서를 세지 않는다 —
        # 세면 카드가 하나 빠지거나 순서가 바뀌는 순간 번호가 어긋난다.
        # 백로그 id 가 곧 교과서의 번호다: mate-1-1-01 → Ⅰ 단원 · 1 중단원 · 01 소단원.
        "unitId": card.get("unit_id"),
        "topicId": tid or None,
        "hasRestrictedMedia": False,
    }
    if n.get("hanja_gloss"):
        out["hanjaGloss"] = n["hanja_gloss"]

    m = media.get(card["id"])
    if m:
        out["hasRestrictedMedia"] = m["access_tier"] == "restricted"
        # 번호가 붙은 교과서 삽화는 "그림 Ⅰ-9 …" 로, 번호가 없는 것(수식 크롭,
        # 사이드 노트 박스)은 캡션만으로, 둘 다 없으면 표제어로 이름표를 만든다.
        if m.get("figure_no"):
            out["mediaCaption"] = f"{m['figure_no']} {m['caption']}"
        else:
            out["mediaCaption"] = m.get("caption") or card["term"]
        # public/media 아래 상대 경로를 그대로 살린다.
        # 파일명만 떼면 own/ 같은 하위 폴더가 사라져 404 가 난다.
        rel = Path(m["file"]).as_posix()
        marker = "public/media/"
        out["mediaFile"] = rel[rel.index(marker) + len(marker):] if marker in rel else Path(rel).name
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--units", nargs="*", default=["mate-1", "mate-2"])
    args = ap.parse_args()

    cards: list[dict] = []
    for unit_id in args.units:
        d = REPO / "output" / "concepts" / unit_id
        if not d.is_dir():
            print(f"건너뜀 (카드 없음): {d}", file=sys.stderr)
            continue
        subject, major, section_of, topic_of = unit_titles(unit_id)
        media = load_media(unit_id)
        files = sorted(f for f in d.glob("*.json") if not f.name.endswith(".candidates.json"))
        for f in files:
            cards.append(to_app(json.loads(f.read_text(encoding="utf-8")),
                                subject, major, section_of, topic_of, media))
        print(f"{unit_id}: 카드 {len(files)}장 · 그림 {len(media)}장")

    # 백로그 순서를 그대로 화면 순서로 쓴다. topic_id 가 곧 그 순서다
    # (mate-1-1-01 < mate-1-1-02 < mate-1-2-01). 소주제 **이름**으로 순서를
    # 매기면 단원이 둘 이상일 때 같은 이름끼리 자리를 덮어쓴다.
    cards.sort(key=lambda c: (c.get("unitId") or "", c.get("topicId") or "~", c["id"]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cards, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8", newline="\n")
    withfig = sum(1 for c in cards if c.get("mediaFile"))
    print(f"=> {OUT.relative_to(REPO)} · 카드 {len(cards)}장 (그림 {withfig}장)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
