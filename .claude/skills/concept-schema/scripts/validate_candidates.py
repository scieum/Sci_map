#!/usr/bin/env python3
"""C1 산출물 검증 — 스키마 + 개수 + 중복 + 순환 + 사전 대조.

Sci_Map 설계서 §4.3 C1 성공 기준을 그대로 검사한다.
LLM 판단은 하지 않는다. 결정론적 검사만 한다 (§3.1).

사용:
    python validate_candidates.py output/concepts/mate-1.candidates.json
    python validate_candidates.py output/concepts/mate-1.candidates.json --json
종료 코드: 0 = pass, 1 = fail, 2 = 입력 오류
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SCHEMA = Path(__file__).resolve().parents[1] / "references" / "candidates.schema.json"
REGISTRY = REPO / "docs" / "concept_registry.yaml"
HOMONYMS = REPO / "docs" / "homonyms.yaml"
STANDARDS = REPO / ".claude" / "skills" / "curriculum-mapper" / "references" / "standards.yaml"
CONCEPTS_DIR = REPO / "output" / "concepts"


def norm(s: str) -> str:
    """표기 정규화 — 공백·가운뎃점 무시 (naming_policy.md 5·6절)."""
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[\s·ㆍ・]", "", s).lower()


class Result:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, name: str, ok: bool, detail: str = "", items: list | None = None) -> None:
        self.checks.append(
            {"check": name, "result": "pass" if ok else "fail", "detail": detail, "items": items or []}
        )

    def warn(self, name: str, detail: str, items: list | None = None) -> None:
        self.checks.append({"check": name, "result": "warn", "detail": detail, "items": items or []})

    @property
    def failed(self) -> list[dict]:
        return [c for c in self.checks if c["result"] == "fail"]

    @property
    def warned(self) -> list[dict]:
        return [c for c in self.checks if c["result"] == "warn"]


def load_yaml(path: Path):
    import yaml
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def check_schema(doc, res: Result) -> None:
    import jsonschema
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(doc),
        key=lambda e: list(e.path),
    )
    items = []
    for e in errors[:20]:
        where = "/".join(str(p) for p in e.path) or "(root)"
        items.append(where + ": " + e.message)
    res.add("schema", not errors,
            (str(len(errors)) + "건 위반") if errors else "candidates.schema.json 통과",
            items)


def topic_count(unit_id: str) -> int:
    """이 단원의 소주제 수. 백로그를 못 읽으면 0."""
    backlog = load_yaml(REPO / "docs" / "unit_backlog.yaml")
    if not backlog:
        return 0
    subjects = backlog.get("subjects") or [{"units": backlog.get("units", [])}]
    unit = next((u for s in subjects for u in s.get("units", []) if u["id"] == unit_id), None)
    if not unit:
        return 0
    return sum(len(sec.get("topics", [])) for sec in unit.get("sections", []))


def check_count(cands, res: Result, unit_id: str = "") -> None:
    """상한은 소주제 수에 비례한다 — max(40, 소주제 × 5). 2026-09-10 교사 결정.

    처음에는 30, 2026-09-08 에 40 이 되었다. 둘 다 **소주제 8개 안팎**의 단원을
    기준으로 잡힌 고정 수였다. 생명과학이 그 가정을 깼다 — 단원당 소주제가
    14·17·12 개라 40 에 맞추면 소주제당 2.4~2.9 개로, 이 함수가 스스로 인용하던
    '소주제당 3~5 개' 아래로 떨어진다. 실제로 세 단원 모두 상한에 걸렸고
    성취기준이 직접 요구하는 것까지 밀려났다(12생과03-05 의 동물 문 수준 분류).

    2026-09-08 에 비례식을 물리쳤던 이유는 소주제 3개짜리 단원(후보 20개)이 소급해
    실패한다는 것이었다. **바닥을 40 으로 두면 그 문제가 없다** — 지금까지의 단원은
    전부 소주제 × 5 아래라 상한이 40 에서 올라가기만 하고 내려가지 않는다.

    하한 10 은 그대로다. 잘게 쪼개지 말라는 실질 통제는 textbook-analyst 지침이 한다.
    """
    n = len(cands)
    topics = topic_count(unit_id)
    cap = max(40, topics * 5)
    res.add("count", 10 <= n <= cap,
            "개념 " + str(n) + "개 (기준 10~" + str(cap) +
            (", 소주제 " + str(topics) + "개 × 5" if cap > 40 else "") + ")")


def check_duplicates(cands, res: Result, unit_id: str = "") -> None:
    """단원 안의 중복 + 이미 작성된 카드와의 표제어 중복."""
    seen: dict[str, list[str]] = {}
    for c in cands:
        seen.setdefault(norm(c["term"]), []).append(c["id"])
    dup = {k: v for k, v in seen.items() if len(v) > 1}
    res.add("term_unique_in_unit", not dup,
            "단원 내 표제어 중복 " + str(len(dup)) + "건",
            [k + ": " + ", ".join(v) for k, v in dup.items()])

    ids: dict[str, int] = {}
    for c in cands:
        ids[c["id"]] = ids.get(c["id"], 0) + 1
    dup_id = [k for k, v in ids.items() if v > 1]
    res.add("id_unique", not dup_id, "id 중복 " + str(len(dup_id)) + "건", dup_id)

    keys: dict[str, list[str]] = {}
    for c in cands:
        keys.setdefault(c["concept_key"], []).append(c["id"])
    dup_key = {k: v for k, v in keys.items() if len(v) > 1}
    res.add("concept_key_unique_in_unit", not dup_key,
            "단원 내 concept_key 중복 " + str(len(dup_key)) + "건",
            [k + ": " + ", ".join(v) for k, v in dup_key.items()])

    # 기존 카드와의 표제어 충돌 — 중복이면 same 후보로 표시돼 있어야 한다
    # 확정 카드는 output/concepts/<unit-id>/<card-id>.json 로 단원마다 폴더를 쓴다.
    # 예전 글롭은 CONCEPTS_DIR 바로 아래만 훑어 그 폴더를 통째로 놓쳤다 —
    # mate-2 후보가 mate-1 카드 30장과 표제어가 겹쳐도 "기존 카드가 없다"로
    # 지나갔다. 하위 폴더를 함께 본다 (*.candidates.json 은 카드가 아니다).
    #
    # ★ **자기 단원의 카드는 빼고 본다.** 그러지 않으면 C2 를 마친 단원의 후보
    #   파일이 그 뒤로 영영 fail 한다 — 그 카드들이 바로 이 후보에서 나온 것이라
    #   표제어가 겹치는 게 당연하기 때문이다(mate-1 후보 30개가 mate-1 카드 30장과
    #   전부 겹쳐 fail 했다). 이 검사가 잡으려는 것은 **다른 단원**의 카드와 겹치는데
    #   same 후보 표시가 없는 경우다.
    #
    # ★ **양방향으로 본다** (2026-09-09 교사 결정). 예전에는 후보에 same_candidate 가
    #   있느냐만 물었는데, 그러면 **나중에 생긴 카드** 때문에 옛 후보 파일이 소급해서
    #   fail 한다 — reac-3 후보(2026-09-07 작성)가 통합과학1 카드(2026-09-08 작성)와
    #   표제어가 겹친다고 실패하는 식이다. 옛 파일의 작성자가 알 수 없던 일이다.
    #
    #   진짜 기준은 R9 다: **concept_key 가 같으면 이미 같은 개념으로 이어진 것**이고,
    #   same_candidate 는 그 사실을 아직 키로 확정하기 전의 메모일 뿐이다. 그러니
    #   키가 같으면 통과시키고(어느 쪽이 먼저 쓰였든 상관없다), 키가 **다른데 표기만
    #   같은** 경우만 잡는다 — 그것이 동음이의이거나 재사용을 놓친 경우다.
    existing: dict[str, str] = {}
    existing_key: dict[str, str] = {}
    card_files = (sorted(CONCEPTS_DIR.glob("*.draft.json"))
                  + sorted(CONCEPTS_DIR.glob("*.card.json"))
                  + [q for q in sorted(CONCEPTS_DIR.glob("*/*.json"))
                     if not q.name.endswith(".candidates.json")
                     and q.parent.name != unit_id])
    for p in card_files:
        try:
            card = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(card, dict) and "term" in card:
            existing[norm(card["term"])] = card.get("id", p.stem)
            existing_key[norm(card["term"])] = card.get("concept_key")
    if not existing:
        res.warn("term_vs_existing_cards", "기존 카드가 없다 — 1차 단원이면 정상")
    else:
        bad, linked = [], []
        for c in cands:
            t = norm(c["term"])
            if t not in existing:
                continue
            if c.get("concept_key") and c["concept_key"] == existing_key.get(t):
                # 키가 같다 = 이미 같은 개념이다. 어느 쪽을 먼저 썼든 상관없다.
                linked.append(c["term"] + " <-> " + existing[t] + " (" + c["concept_key"] + ")")
            elif not c.get("same_candidate"):
                bad.append(c["term"] + " <-> " + existing[t]
                           + " (키가 다르다: " + str(c.get("concept_key"))
                           + " vs " + str(existing_key.get(t)) + ")")
        res.add("term_vs_existing_cards", not bad,
                "다른 단원 카드와 표제어가 같은데 concept_key 도 same_candidate 도 없는 것 "
                + str(len(bad)) + "건", bad)
        if linked:
            res.warn("term_vs_existing_cards_linked",
                     "표제어가 같고 concept_key 도 같다 — 이미 이어져 있다 "
                     + str(len(linked)) + "건", linked)


def check_hierarchy(doc, cands, res: Result) -> None:
    ids = {c["id"] for c in cands}
    edges = doc.get("hierarchy", [])

    broken = [e["from"] + " -> " + e["to"] for e in edges
              if e["from"] not in ids or e["to"] not in ids]
    res.add("hierarchy_refs", not broken,
            "위계에 없는 id 참조 " + str(len(broken)) + "건", broken)

    self_loop = [e["from"] + " -> " + e["to"] for e in edges if e["from"] == e["to"]]
    res.add("hierarchy_no_self_loop", not self_loop,
            "자기 참조 " + str(len(self_loop)) + "건", self_loop)

    # 순환 검사 (DFS, 흰-회-검)
    adj: dict[str, list[str]] = {i: [] for i in ids}
    for e in edges:
        if e["from"] in adj and e["to"] in ids:
            adj[e["from"]].append(e["to"])
    color: dict[str, int] = {i: 0 for i in ids}
    cycles: list[str] = []

    def dfs(node: str, stack: list[str]) -> None:
        color[node] = 1
        stack.append(node)
        for nxt in adj[node]:
            if color[nxt] == 1:
                cycles.append(" -> ".join(stack[stack.index(nxt):] + [nxt]))
            elif color[nxt] == 0:
                dfs(nxt, stack)
        stack.pop()
        color[node] = 2

    sys.setrecursionlimit(10000)
    for i in sorted(ids):
        if color[i] == 0:
            dfs(i, [])
    res.add("hierarchy_acyclic", not cycles, "순환 " + str(len(cycles)) + "건", cycles)

    isolated = sorted(ids - {e["from"] for e in edges} - {e["to"] for e in edges})
    if isolated:
        res.warn("hierarchy_isolated",
                 "위계에 걸리지 않은 개념 " + str(len(isolated)) + "개", isolated)


def check_curriculum(cands, res: Result) -> None:
    std = load_yaml(STANDARDS)
    if not std:
        res.warn("curriculum_codes", "standards.yaml 을 읽지 못했다 — 코드 검사 건너뜀")
        return
    table = {}
    for course in (std.get("courses") or {}).values():
        for s in course.get("standards", []):
            table[s["code"]] = s

    unknown, not_agreed = [], []
    for c in cands:
        for code in c.get("curriculum", []):
            if code not in table:
                unknown.append(c["id"] + ": " + code)
            elif table[code].get("crosscheck") != "일치":
                not_agreed.append(c["id"] + ": " + code + " (" + str(table[code].get("crosscheck")) + ")")
    res.add("curriculum_codes_exist", not unknown,
            "실재하지 않는 성취기준 코드 " + str(len(unknown)) + "건", unknown)
    if not_agreed:
        res.warn("curriculum_crosscheck",
                 "crosscheck 가 '일치' 가 아닌 코드 " + str(len(not_agreed)) + "건 — "
                 "사람이 NCIC 원문으로 확정하기 전까지 C5 에서 쓰지 않는다", not_agreed)

    used = sorted({code for c in cands for code in c.get("curriculum", [])})
    res.warn("curriculum_coverage",
             "이 단원 후보가 덮은 성취기준 " + str(len(used)) + "개: " + ", ".join(used))


def check_registry(cands, res: Result) -> None:
    reg = load_yaml(REGISTRY)
    known = {c["key"] for c in ((reg or {}).get("concepts") or [])}
    bad = [c["id"] + ": " + c["concept_key"] for c in cands
           if c["registry_status"] == "reused" and c["concept_key"] not in known]
    res.add("registry_reused_exists", not bad,
            "reused 인데 사전에 없는 키 " + str(len(bad)) + "건", bad)
    new = [c["concept_key"] for c in cands if c["registry_status"] == "new"]
    if new:
        res.warn("registry_new_keys",
                 "신규 키 " + str(len(new)) + "개 — G3 사람 게이트 승인 전에는 same 링크로 쓰지 않는다",
                 new)


def check_homonyms(cands, res: Result) -> None:
    hom = load_yaml(HOMONYMS)
    if not hom:
        res.warn("homonyms", "homonyms.yaml 을 읽지 못했다 — 검사 건너뜀")
        return
    # ★2026-09-09 결함 수정. 여기서 `homonyms` / `surface` 를 읽고 있었는데
    #   docs/homonyms.yaml 의 실제 키는 `watch_terms` / `term` 이다. 그래서 이 검사가
    #   **늘 빈 집합으로 통과**했다 — R9(표기 일치로 개념을 잇지 않는다)를 지키는
    #   검사가 침묵 실패한 것이다 (CLAUDE.md §12 침묵 실패 금지).
    #   키가 또 바뀌면 조용히 통과하지 않고 warn 으로 드러나게 둔다.
    terms = hom.get("watch_terms") or []
    if not terms:
        res.warn("homonyms", "homonyms.yaml 에 watch_terms 가 없다 — 검사가 무력하다. 파일 구조 확인 필요")
        return
    surfaces = {norm(h["term"]) for h in terms}
    missing = [c["id"] + " (" + c["term"] + ")" for c in cands
               if norm(c["term"]) in surfaces and not c.get("homonym_flag")]
    res.add("homonym_flagged", not missing,
            "금지쌍 표기인데 homonym_flag 가 없는 것 " + str(len(missing)) + "건", missing)


def check_evidence(doc, cands, res: Result) -> None:
    """evidence 가 실재하는 페이지·블록을 가리키는가."""
    text_path = REPO / doc["source"]["text_jsonl"]
    if not text_path.exists():
        res.warn("evidence_refs", "원문을 찾지 못했다: " + str(text_path))
        return
    blocks: set[str] = set()
    pages: set[int] = set()
    with text_path.open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            pages.add(rec["page"])
            blocks.update(b["block_id"] for b in rec.get("blocks", []))
    bad = []
    for c in cands:
        for e in c.get("evidence", []):
            if e["block_id"] not in blocks or e["page"] not in pages:
                bad.append(c["id"] + ": p" + str(e["page"]) + " " + e["block_id"])
    res.add("evidence_refs", not bad,
            "원문에 없는 페이지·블록 참조 " + str(len(bad)) + "건", bad)


def check_pages_in_unit(doc, cands, res: Result) -> None:
    """개념의 pages 가 단원 페이지 범위 안인가 (unit_backlog.yaml 기준)."""
    backlog = load_yaml(REPO / "docs" / "unit_backlog.yaml")
    if not backlog:
        res.warn("pages_in_unit", "unit_backlog.yaml 을 읽지 못했다 — 검사 건너뜀")
        return
    subjects = backlog.get("subjects") or [{"units": backlog.get("units", [])}]
    unit = next((u for s in subjects for u in s.get("units", []) if u["id"] == doc["unit_id"]), None)
    if not unit:
        res.warn("pages_in_unit", "백로그에 " + str(doc["unit_id"]) + " 이 없다")
        return
    lo, hi = unit["pages"]
    bad = []
    for c in cands:
        for p in c.get("pages", []):
            if not (lo <= p <= hi):
                bad.append(c["id"] + ": p" + str(p) + " (단원 " + str(lo) + "~" + str(hi) + ")")
    res.add("pages_in_unit", not bad,
            "단원 페이지 범위를 벗어난 참조 " + str(len(bad)) + "건", bad)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--json", action="store_true", help="결과를 JSON 으로 출력")
    args = ap.parse_args()

    path = Path(args.path)
    if not path.exists():
        print("입력 없음: " + str(path), file=sys.stderr)
        return 2
    doc = json.loads(path.read_text(encoding="utf-8"))
    cands = doc.get("candidates", [])

    res = Result()
    check_schema(doc, res)
    check_count(cands, res, doc.get("unit_id", ""))
    check_duplicates(cands, res, doc.get("unit_id", ""))
    check_hierarchy(doc, cands, res)
    check_curriculum(cands, res)
    check_registry(cands, res)
    check_homonyms(cands, res)
    check_evidence(doc, cands, res)
    check_pages_in_unit(doc, cands, res)

    ok = not res.failed
    if args.json:
        print(json.dumps({"stage": "C1", "unit_id": doc.get("unit_id"),
                          "result": "pass" if ok else "fail",
                          "checks": res.checks}, ensure_ascii=False, indent=2))
    else:
        mark = {"pass": "  OK  ", "fail": " FAIL ", "warn": " WARN "}
        for c in res.checks:
            print("[" + mark[c["result"]] + "] " + c["check"] + ": " + c["detail"])
            for it in c["items"][:12]:
                print("           - " + it)
            if len(c["items"]) > 12:
                print("           ... 외 " + str(len(c["items"]) - 12) + "건")
        print()
        print("=> C1 " + ("pass" if ok else "FAIL")
              + " (fail " + str(len(res.failed)) + " / warn " + str(len(res.warned)) + ")")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
