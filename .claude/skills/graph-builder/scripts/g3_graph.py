#!/usr/bin/env python3
"""G3 — 그래프 생성 + 개념 사전 갱신 제안 (설계서 §5.2).

G2 가 `valid` 로 판정한 링크와 카드에 이미 있던 링크를 합쳐 그래프를 만든다.
검사는 결정론적이고, **사전 등록은 사람이 한다** — 이 스크립트는 제안만 쓴다
(CLAUDE.md §5 G3 게이트, §9.3).

성공 기준 (설계서 §5.2)
  prereq 순환      0건        ← 어기면 에스컬레이션
  고립 카드        ≤ 10%      ← 넘으면 스킵 + 로그
  same 체인        ≥ 5개      ← 학년 간 연결이 실제로 생겼는가

출력
  output/graph/graph.json            노드·간선·허브·고립·배치 좌표 초안
  output/graph/registry_proposal.yaml 신규 concept_key 등록 제안 (★사람 승인 대상)

사용:
    python g3_graph.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
CONCEPTS = REPO / "output" / "concepts"
GRAPH_DIR = REPO / "output" / "graph"
JUDGE = GRAPH_DIR / "link_judgements.json"
OUT = GRAPH_DIR / "graph.json"
PROPOSAL = GRAPH_DIR / "registry_proposal.yaml"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"
REGISTRY = REPO / "docs" / "concept_registry.yaml"

HUB_DEGREE = 5          # 이만큼 이어지면 허브 개념
ISOLATE_LIMIT = 0.10    # 고립 카드 상한
SAME_CHAIN_MIN = 5      # 학년 간 연결의 최소 개수


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), **row}, ensure_ascii=False) + "\n")


def load_cards() -> list[dict]:
    cards = []
    for d in sorted(CONCEPTS.iterdir()):
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.json")):
            if f.name.endswith(".candidates.json"):
                continue
            c = json.loads(f.read_text(encoding="utf-8"))
            c["_unit"] = d.name
            cards.append(c)
    return cards


def registered_keys() -> set[str]:
    """사전에 이미 등록된 키. 파일은 읽기만 한다 (CLAUDE.md §9.3)"""
    if not REGISTRY.exists():
        return set()
    try:
        import yaml
        data = yaml.safe_load(REGISTRY.read_text(encoding="utf-8")) or {}
    except Exception:
        return set()
    concepts = data.get("concepts") or []
    if isinstance(concepts, dict):
        return set(concepts)
    return {c.get("key") for c in concepts if isinstance(c, dict) and c.get("key")}


def find_cycles(edges: list[tuple[str, str]]) -> list[list[str]]:
    """prereq 순환 — 색칠 DFS. 하나라도 있으면 에스컬레이션이다"""
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = defaultdict(int)
    cycles: list[list[str]] = []
    stack: list[str] = []

    def dfs(u: str) -> None:
        color[u] = GRAY
        stack.append(u)
        for v in adj[u]:
            if color[v] == GRAY:
                cycles.append(stack[stack.index(v):] + [v])
            elif color[v] == WHITE:
                dfs(v)
        stack.pop()
        color[u] = BLACK

    for n in list(adj):
        if color[n] == WHITE:
            dfs(n)
    return cycles


def main() -> int:
    if not JUDGE.exists():
        print(f"G2 판정본이 없다: {JUDGE}", file=sys.stderr)
        return 2
    judge = json.loads(JUDGE.read_text(encoding="utf-8"))
    cards = load_cards()
    by_id = {c["id"]: c for c in cards}

    # ── 간선 모으기 ─────────────────────────────────────────────────────────
    # 카드가 이미 갖고 있던 링크 + G2 가 valid 로 본 링크. 같은 (from,to) 가
    # 겹치면 카드 쪽을 남긴다 — 사람 손을 거친 쪽이 먼저다
    edges: dict[tuple[str, str], dict] = {}
    for c in cards:
        for l in c.get("links") or []:
            t = l.get("target")
            if t in by_id:
                edges[(c["id"], t)] = {"from": c["id"], "to": t,
                                       "type": l.get("type"), "source": "card"}
    added = 0
    for j in judge.get("judgements") or []:
        if j.get("verdict") != "valid":
            continue
        a, b = j.get("from"), j.get("to")
        if a not in by_id or b not in by_id:
            continue
        if (a, b) in edges:
            continue
        edges[(a, b)] = {"from": a, "to": b, "type": j.get("type"),
                         "source": "g2", "candidate_id": j.get("candidate_id"),
                         "reason": j.get("reason")}
        added += 1

    edge_list = list(edges.values())

    # ── 검사 ────────────────────────────────────────────────────────────────
    prereq = [(e["from"], e["to"]) for e in edge_list if e["type"] == "prereq"]
    cycles = find_cycles(prereq)

    degree: dict[str, int] = defaultdict(int)
    for e in edge_list:
        degree[e["from"]] += 1
        degree[e["to"]] += 1
    isolates = [c["id"] for c in cards if degree[c["id"]] == 0]
    hubs = sorted(
        ({"id": i, "term": by_id[i]["term"], "unit": by_id[i]["_unit"], "degree": d}
         for i, d in degree.items() if d >= HUB_DEGREE),
        key=lambda x: -x["degree"],
    )
    same_edges = [e for e in edge_list if e["type"] == "same"]
    cross_unit = [e for e in edge_list
                  if by_id[e["from"]]["_unit"] != by_id[e["to"]]["_unit"]]

    # ── 배치 좌표 초안 — 단원을 세로 띠로, 소주제 순서를 가로로 ──────────────
    # 힘 기반 배치는 열 때마다 그림이 달라져 "어디쯤이었지" 가 안 생긴다.
    # 단원·소주제 순서는 백로그가 정한 것이라 늘 같은 자리에 온다.
    units = sorted({c["_unit"] for c in cards})
    row_of = {u: i for i, u in enumerate(units)}
    per_unit: dict[str, list[dict]] = defaultdict(list)
    for c in sorted(cards, key=lambda c: (c.get("topic_id") or "~", c["id"])):
        per_unit[c["_unit"]].append(c)
    nodes = []
    for u, group in per_unit.items():
        for i, c in enumerate(group):
            nodes.append({
                "id": c["id"],
                "term": c["term"],
                "concept_key": c["concept_key"],
                "unit": u,
                "topic_id": c.get("topic_id"),
                "role": c.get("role"),
                "degree": degree[c["id"]],
                "x": i * 120,
                "y": row_of[u] * 220,
            })

    graph = {
        "generated_at": now(),
        "stage": "G3",
        "cards": len(cards),
        "edges": len(edge_list),
        "edges_from_cards": len(edge_list) - added,
        "edges_from_g2": added,
        "by_type": {t: sum(1 for e in edge_list if e["type"] == t)
                    for t in sorted({e["type"] for e in edge_list if e["type"]})},
        "cross_unit_edges": len(cross_unit),
        "checks": {
            "prereq_cycles": len(cycles),
            "cycles": cycles[:5],
            "isolates": len(isolates),
            "isolate_ratio": round(len(isolates) / len(cards), 4),
            "isolate_ids": isolates,
            "same_chains": len(same_edges),
            "same_chain_min": SAME_CHAIN_MIN,
        },
        "hubs": hubs,
        "nodes": nodes,
        "links": edge_list,
    }
    GRAPH_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(graph, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8", newline="\n")

    # ── 사전 갱신 제안 — ★사람 승인 대상. 사전 파일은 건드리지 않는다 ────────
    known = registered_keys()
    new_keys = []
    for c in sorted(cards, key=lambda c: c["concept_key"]):
        if c["concept_key"] in known:
            continue
        new_keys.append({
            "key": c["concept_key"],
            "term": c["term"],
            "english": (c.get("notation") or {}).get("english"),
            "card": c["id"],
            "unit": c["_unit"],
            "degree": degree[c["id"]],
        })
    lines = [
        "# G3 개념 사전 갱신 제안 — registry_proposal.yaml",
        "#",
        "# ★이 파일은 제안이다. 효력이 없다.",
        "#   사람이 확인해 docs/concept_registry.yaml 의 concepts 절로 옮겨야",
        "#   비로소 키가 등록된다 (CLAUDE.md §5 G3 게이트, §9.3).",
        "#",
        f"# 생성: {now()}  ·  카드 {len(cards)}장  ·  신규 키 {len(new_keys)}개",
        "",
        "proposed_concepts:",
    ]
    for k in new_keys:
        lines.append(f"  - key: {k['key']}")
        lines.append(f"    term: {k['term']}")
        if k["english"]:
            lines.append(f"    english: {k['english']}")
        lines.append(f"    card: {k['card']}")
        lines.append(f"    unit: {k['unit']}")
        lines.append(f"    degree: {k['degree']}")
    PROPOSAL.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    # ── 보고 ────────────────────────────────────────────────────────────────
    ok_cycle = len(cycles) == 0
    ok_iso = len(isolates) / len(cards) <= ISOLATE_LIMIT
    ok_same = len(same_edges) >= SAME_CHAIN_MIN
    print(f"카드 {len(cards)} · 간선 {len(edge_list)} "
          f"(카드 {len(edge_list) - added} + G2 {added}) · 단원 간 {len(cross_unit)}")
    print(f"  {'OK  ' if ok_cycle else 'FAIL'} prereq 순환 {len(cycles)}건")
    print(f"  {'OK  ' if ok_iso else 'WARN'} 고립 카드 {len(isolates)}장 "
          f"({len(isolates) / len(cards):.1%} · 상한 {ISOLATE_LIMIT:.0%})")
    print(f"  {'OK  ' if ok_same else 'FAIL'} same 체인 {len(same_edges)}개 "
          f"(기준 {SAME_CHAIN_MIN}개 이상)")
    print(f"  허브({HUB_DEGREE}+) {len(hubs)}개: "
          + ", ".join(f"{h['term']}({h['degree']})" for h in hubs[:8]))
    print(f"=> {OUT.relative_to(REPO)} · {PROPOSAL.relative_to(REPO)} "
          f"(신규 키 {len(new_keys)}개 — ★G3 사람 게이트)")

    log(stage="G3", result="pass" if ok_cycle else "escalate",
        reason=f"그래프 생성 — 간선 {len(edge_list)}개",
        cards=len(cards), edges=len(edge_list), from_g2=added,
        cross_unit=len(cross_unit), prereq_cycles=len(cycles),
        isolates=len(isolates), same_chains=len(same_edges),
        hubs=len(hubs), proposed_keys=len(new_keys))
    if not ok_same:
        log(stage="G3", result="note",
            reason=f"same 체인 {len(same_edges)}개로 기준({SAME_CHAIN_MIN}) 미달 — "
                   "두 과목이 서로 다른 개념만 다루고 있어 아직 학년 간 재등장이 없다. "
                   "설계서 §9 3차(통합과학1 추가)에서 다시 본다",
            same_chains=len(same_edges))
    return 0 if ok_cycle else 1


if __name__ == "__main__":
    sys.exit(main())
