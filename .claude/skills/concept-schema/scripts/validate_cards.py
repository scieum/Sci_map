#!/usr/bin/env python3
"""C3·C4 카드 검증 — 스키마 · 표기 · 원문 유사도 · 참조 무결성 · 순환 · 정답 중복.

설계서 §4.3 C3/C4 의 결정론적 검사만 한다. 진위는 사람이 본다 (C8).

사용:
    python validate_cards.py output/concepts/mate-1/ --unit mate-1
    python validate_cards.py output/concepts/mate-1/ --unit mate-1 --json
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
REFS = Path(__file__).resolve().parents[1] / "references"
SCHEMA = REFS / "concept.schema.json"
REGISTRY = REPO / "docs" / "concept_registry.yaml"
HOMONYMS = REPO / "docs" / "homonyms.yaml"
POLICY = REPO / "docs" / "naming_policy.md"
STANDARDS = REPO / ".claude" / "skills" / "curriculum-mapper" / "references" / "standards.yaml"

NGRAM_FAIL = 12   # 원문 연속 12어절 이상 일치 → fail (R4, §4.4)
NGRAM_WARN = 8


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[\s·ㆍ・]", "", s).lower()


def eojeol(s: str) -> list[str]:
    """어절 = 공백으로 나뉜 덩어리. 문장부호는 떼어 낸다."""
    s = re.sub(r"[“”\"'‘’()\[\]{}·,．.!?~—–\-]", " ", unicodedata.normalize("NFKC", s))
    return [w for w in s.split() if w]


class Result:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, name, ok, detail="", items=None):
        self.checks.append({"check": name, "result": "pass" if ok else "fail",
                            "detail": detail, "items": items or []})

    def warn(self, name, detail, items=None):
        self.checks.append({"check": name, "result": "warn", "detail": detail, "items": items or []})

    @property
    def failed(self):
        return [c for c in self.checks if c["result"] == "fail"]

    @property
    def warned(self):
        return [c for c in self.checks if c["result"] == "warn"]


def load_yaml(path: Path):
    import yaml
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def old_notation_table() -> dict[str, str]:
    """naming_policy.md 의 구표기 → 현행 표기 대응표를 읽는다.

    표를 코드에 복사하지 않는다 — 복사하면 정책이 바뀔 때 갈라진다.
    """
    if not POLICY.exists():
        return {}
    table = {}
    for line in POLICY.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([^|]+?)\s*\|\s*\*\*([^|*]+?)\*\*\s*\|$", line)
        if m:
            table[norm(m.group(1))] = m.group(2).strip()
    return table


# ══ C3 표기 검증 ═══════════════════════════════════════════════════════════
def check_notation(cards, res: Result) -> None:
    old = old_notation_table()
    res.warn("policy_table", f"naming_policy.md 에서 구표기 {len(old)}쌍을 읽었다")

    bad_term = [f"{c['id']}: {c['term']} → {old[norm(c['term'])]}"
                for c in cards if norm(c["term"]) in old]
    res.add("term_is_current", not bad_term,
            f"표제어가 구표기인 카드 {len(bad_term)}건", bad_term)

    # hanja 3상태 (R7) — null 은 미조사이므로 배포 불가
    null_hanja = [c["id"] for c in cards if c["notation"].get("hanja") is None]
    res.add("hanja_not_null", not null_hanja,
            f"hanja 가 null(미조사)인 카드 {len(null_hanja)}건", null_hanja)

    no_note = [c["id"] for c in cards
               if c["notation"].get("hanja") == "해당 없음" and not c["notation"].get("hanja_note")]
    res.add("hanja_note_present", not no_note,
            f"\"해당 없음\"인데 사유(hanja_note)가 없는 카드 {len(no_note)}건", no_note)

    # hanja_gloss 글자 수 = 훈음 항목 수
    gloss_bad = []
    for c in cards:
        h, g = c["notation"].get("hanja"), c["notation"].get("hanja_gloss")
        if not g or not h or h == "해당 없음":
            continue
        chars = [ch for ch in h if "一" <= ch <= "鿿"]
        items = [x for x in g.split("·") if x.strip()]
        if len(chars) != len(items):
            gloss_bad.append(f"{c['id']}: 한자 {len(chars)}자 vs 훈음 {len(items)}항")
    res.add("hanja_gloss_count", not gloss_bad,
            f"한자 수와 훈음 항목 수가 어긋난 카드 {len(gloss_bad)}건", gloss_bad)

    # 구표기는 aliases 로 — 있으면 좋다(warn)
    could = [f"{c['id']}: {c['term']}" for c in cards
             if any(norm(a) in old for a in c.get("aliases", []))]
    if could:
        res.warn("aliases_hold_old_notation", f"구표기를 aliases 로 안고 있는 카드 {len(could)}건", could)


def check_typeability(cards, res: Result) -> None:
    """symbol_plain 이 실제로 타이핑 가능한가 (R8)."""
    bad = []
    for c in cards:
        sp = c["notation"].get("symbol_plain")
        if sp and not re.fullmatch(r"[A-Za-z0-9 +\-=/().,^_]*", sp):
            bad.append(f"{c['id']}: {sp}")
    res.add("symbol_plain_typeable", not bad,
            f"평문이 아닌 symbol_plain {len(bad)}건", bad)


def check_answer_collision(cards, res: Result) -> None:
    """같은 단원 안에서 단답형 정답이 충돌하면 출제 버그다."""
    seen: dict[str, list[str]] = {}
    for c in cards:
        seen.setdefault(norm(c["term"]), []).append(c["id"])
        for a in c.get("aliases", []):
            seen.setdefault(norm(a), []).append(c["id"])
    dup = {k: v for k, v in seen.items() if len(set(v)) > 1}
    res.add("answer_unique", not dup,
            f"정답 충돌 {len(dup)}건", [f"{k}: {', '.join(sorted(set(v)))}" for k, v in dup.items()])

    long_terms = [f"{c['id']}: {c['term']} ({len(c['term'])}자)"
                  for c in cards if len(c["term"].replace(" ", "")) > 12]
    if long_terms:
        res.warn("answer_length", f"단답 정답 12자 초과 {len(long_terms)}건 — 단답형에서 제외 권장", long_terms)


# ══ C4 원문 유사도 ═════════════════════════════════════════════════════════
def check_originality(cards, unit_id, res: Result) -> None:
    """definition·relations[].text 를 교과서 원문과 대조 (R4).

    연속 12어절 이상 일치 = fail, 8~11 = warn.
    """
    src = REPO / "output" / "source" / unit_id / "text.jsonl"
    if not src.exists():
        res.warn("originality", f"원문을 찾지 못했다: {src} — 검사 건너뜀")
        return

    source_grams: set[tuple] = set()
    for line in src.open(encoding="utf-8"):
        words = eojeol(json.loads(line)["text"])
        for n in (NGRAM_WARN, NGRAM_FAIL):
            for i in range(len(words) - n + 1):
                source_grams.add(tuple(words[i:i + n]))

    fails, warns = [], []
    for c in cards:
        targets = [("definition", c["definition"])]
        targets += [(r["id"], r["text"]) for r in c["relations"]]
        for label, text in targets:
            words = eojeol(text)
            hit12 = any(tuple(words[i:i + NGRAM_FAIL]) in source_grams
                        for i in range(len(words) - NGRAM_FAIL + 1))
            hit8 = any(tuple(words[i:i + NGRAM_WARN]) in source_grams
                       for i in range(len(words) - NGRAM_WARN + 1))
            if hit12:
                fails.append(f"{c['id']}/{label}: 원문 {NGRAM_FAIL}어절 이상 일치")
            elif hit8:
                warns.append(f"{c['id']}/{label}: 원문 {NGRAM_WARN}~{NGRAM_FAIL-1}어절 일치")

    res.add("originality_12", not fails,
            f"원문 {NGRAM_FAIL}어절 이상 일치 {len(fails)}건 — 재서술 의무 위반 (R4)", fails)
    if warns:
        res.warn("originality_8", f"원문 {NGRAM_WARN}~{NGRAM_FAIL-1}어절 일치 {len(warns)}건 — 사람이 볼 것", warns)

    src_defs = [c["id"] for c in cards if c.get("definition_source") != "restated"]
    res.add("definition_restated", not src_defs,
            f"definition_source 가 restated 가 아닌 카드 {len(src_defs)}건", src_defs)


# ══ C4 참조 무결성·순환 ════════════════════════════════════════════════════
def all_cards_index() -> dict[str, str]:
    """리포 안의 **모든** 카드 id → concept_key.

    same 링크는 과목·학년을 가로지른다(§2.3). 그래서 참조가 실재하는지는 이 단원
    폴더만 봐서는 알 수 없다 — isci2-1 의 same 10개가 reac·mate 카드를 가리키는데,
    단원 폴더만 보면 전부 "실재하지 않는 대상" 이 된다.
    """
    out: dict[str, str] = {}
    root = Path(__file__).resolve().parents[4] / "output" / "concepts"
    if not root.is_dir():
        return out
    for f in root.glob("*/*.json"):
        if f.name.endswith(".candidates.json"):
            continue
        try:
            card = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(card, dict) and card.get("id"):
            out[card["id"]] = card.get("concept_key", "")
    return out


def check_links(cards, res: Result) -> None:
    ids = {c["id"] for c in cards}
    outside = all_cards_index()          # 단원 밖 카드까지 아우른 색인
    broken, edges, out_of_unit = [], [], []
    for c in cards:
        for l in c["links"]:
            if l["target"] not in ids and l["target"] not in outside:
                broken.append(f"{c['id']} -> {l['target']} ({l['type']})")
            # same 이 아닌 링크는 이 단원 안에 머물러야 한다. 예전에는 link_refs 가
            # 그 노릇을 겸했는데(단원 밖이면 무조건 broken), 이제 밖을 볼 수 있게
            # 됐으므로 그 규칙을 따로 세운다 — 아니면 규칙이 조용히 사라진다
            if l["target"] not in ids and l["type"] != "same":
                out_of_unit.append(f"{c['id']} -> {l['target']} ({l['type']})")
            if l["type"] == "prereq":
                edges.append((l["target"], c["id"]))   # target 을 알아야 c 를 이해한다
            elif l["type"] == "next":
                edges.append((c["id"], l["target"]))
    res.add("link_refs", not broken, f"실재하지 않는 링크 대상 {len(broken)}건", broken)
    res.add("link_scope", not out_of_unit,
            f"same 이 아닌데 단원 밖을 가리키는 링크 {len(out_of_unit)}건", out_of_unit)

    adj: dict[str, list[str]] = {i: [] for i in ids}
    for a, b in edges:
        if a in adj and b in ids:
            adj[a].append(b)
    color = {i: 0 for i in ids}
    cycles: list[str] = []

    def dfs(node, stack):
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
    res.add("prereq_acyclic", not cycles, f"선수 관계 순환 {len(cycles)}건", cycles)

    lonely = [c["id"] for c in cards if len(c["links"]) < 2]
    res.add("link_min", not lonely, f"링크 2개 미만(고립) {len(lonely)}건", lonely)

    # same 링크는 concept_key 일치가 근거다 (R9) — 표기 일치로 걸면 안 된다.
    # 단원 밖 대상도 색인에 있으므로 **가로지르는 same 도 실제로 검사된다.**
    # 예전에는 대상이 폴더 밖이면 조용히 건너뛰어, 정작 검사가 필요한 링크가
    # 검사되지 않았다
    key_of = {**outside, **{c["id"]: c["concept_key"] for c in cards}}
    bad_same = [f"{c['id']} -> {l['target']}" for c in cards for l in c["links"]
                if l["type"] == "same" and l["target"] in key_of
                and key_of[l["target"]] != c["concept_key"]]
    res.add("same_by_key", not bad_same,
            f"concept_key 가 다른데 same 으로 걸린 링크 {len(bad_same)}건 (R9)", bad_same)


def check_relations(cards, res: Result, unit: str) -> None:
    no_cond = []
    for c in cards:
        for r in c["relations"]:
            f = r["form"]
            if not f.get("condition") or not f.get("scope"):
                no_cond.append(f"{c['id']}/{r['id']}")
    res.add("relation_condition_scope", not no_cond,
            f"condition·scope 가 빈 명제 {len(no_cond)}건 — C6 반려 대상", no_cond)

    inv_no_text = [f"{c['id']}/{r['id']}" for c in cards for r in c["relations"]
                   if r["invertible"] and not r.get("inverted_text")]
    res.add("invertible_has_text", not inv_no_text,
            f"invertible 인데 inverted_text 가 없는 명제 {len(inv_no_text)}건 — OX 생성 불가", inv_no_text)

    # verified_by=teacher 는 C8 사람 게이트만 찍는다. 그 판정은
    # output/review/<unit>.approval.json 에 기록으로 남는다(approve_c8.py).
    # 기록과 대조해, **기록에 없는 승인**만 문제 삼는다 — 손으로 고쳐 넣은
    # 승인을 잡는 것이 이 검사의 쓸모다. 기록 자체가 없으면 전부가 그런 경우다.
    verified = [(c["id"], r["id"]) for c in cards for r in c["relations"]
                if r["verified_by"] == "teacher"]
    if verified:
        rec_path = REPO / "output" / "review" / f"{unit}.approval.json"
        rec = {}
        if rec_path.exists():
            try:
                rec = json.loads(rec_path.read_text(encoding="utf-8"))
            except Exception:
                rec = {}
        if rec.get("mode") == "all" and rec.get("approved"):
            covered = {rid for _, rid in verified}
        else:
            covered = set(rec.get("relations_approved") or [])
        stray = [f"{cid}/{rid}" for cid, rid in verified if rid not in covered]
        res.add("approval_recorded", not stray,
                f"승인 기록에 없는 verified_by=teacher {len(stray)}건 — C8 우회 의심", stray)
        if rec and not rec.get("reviewed_item_by_item", True):
            res.warn("approval_blanket",
                     f"C8 을 항목별 검토 없이 일괄 승인했다 "
                     f"(판정: {rec.get('approved_by','?')}, {rec.get('ts','?')})")


def check_curriculum(cards, res: Result) -> None:
    std = load_yaml(STANDARDS)
    if not std:
        res.warn("curriculum", "standards.yaml 을 읽지 못했다 — 건너뜀")
        return
    table = {s["code"]: s for course in (std.get("courses") or {}).values()
             for s in course.get("standards", [])}
    unknown, not_agreed = [], []
    for c in cards:
        codes = list(c.get("curriculum", []))
        for r in c["relations"]:
            codes += r.get("curriculum", [])
        for code in codes:
            if code not in table:
                unknown.append(f"{c['id']}: {code}")
            elif table[code].get("crosscheck") != "일치":
                not_agreed.append(f"{c['id']}: {code}")
    res.add("curriculum_exists", not unknown, f"실재하지 않는 성취기준 {len(unknown)}건", unknown)
    if not_agreed:
        res.warn("curriculum_crosscheck",
                 f"crosscheck 가 '일치' 가 아닌 코드 {len(not_agreed)}건", not_agreed)


def check_registry_and_homonyms(cards, res: Result) -> None:
    reg = load_yaml(REGISTRY)
    known = {c["key"] for c in ((reg or {}).get("concepts") or [])}
    bad = [f"{c['id']}: {c['concept_key']}" for c in cards
           if c.get("registry_status") == "reused" and c["concept_key"] not in known]
    res.add("registry_reused", not bad, f"reused 인데 사전에 없는 키 {len(bad)}건", bad)

    keys: dict[str, list[str]] = {}
    for c in cards:
        keys.setdefault(c["concept_key"], []).append(c["id"])
    dup = {k: v for k, v in keys.items() if len(v) > 1}
    res.add("key_unique", not dup, f"단원 내 concept_key 중복 {len(dup)}건",
            [f"{k}: {', '.join(v)}" for k, v in dup.items()])

    hom = load_yaml(HOMONYMS)
    # ★2026-09-09 결함 수정 — validate_candidates.py 와 같은 결함이었다.
    #   `homonyms` / `surface` 를 읽었으나 실제 키는 `watch_terms` / `term` 이라
    #   이 경고가 한 번도 뜬 적이 없다.
    _watch = (hom or {}).get("watch_terms") or []
    if not _watch:
        res.warn("homonym_surface", "homonyms.yaml 에 watch_terms 가 없다 — 검사가 무력하다")
    surfaces = {norm(h["term"]) for h in _watch}
    hits = [f"{c['id']} ({c['term']})" for c in cards if norm(c["term"]) in surfaces]
    if hits:
        res.warn("homonym_surface", f"동음이의 금지쌍 표기 {len(hits)}건 — 링크는 사람 확인", hits)


def check_media(cards, res: Result) -> None:
    """권리 대장과 카드 media 절의 정합성. 대장에 없는 자산은 배포 대상이 아니다."""
    led = REPO / "output" / "rights" / "ledger.jsonl"
    if not led.exists():
        res.warn("media_ledger", "권리 대장이 없다 — media 검사 건너뜀")
        return
    ledger = {json.loads(l)["asset_id"]: json.loads(l) for l in led.open(encoding="utf-8")}
    missing, mismatch = [], []
    for c in cards:
        for m in c.get("media", []):
            row = ledger.get(m["asset_id"])
            if not row:
                missing.append(f"{c['id']}: {m['asset_id']}")
            elif row["access_tier"] != m["access_tier"]:
                mismatch.append(f"{c['id']}: {m['asset_id']} 카드={m['access_tier']} 대장={row['access_tier']}")
    res.add("media_in_ledger", not missing,
            f"권리 대장에 없는 자산 {len(missing)}건 — 배포 금지", missing)
    res.add("media_tier_match", not mismatch,
            f"access_tier 가 대장과 다른 자산 {len(mismatch)}건", mismatch)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="카드 디렉터리 또는 단일 JSON")
    ap.add_argument("--unit", required=True)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    p = Path(args.path)
    files = sorted(p.glob("*.json")) if p.is_dir() else [p]
    files = [f for f in files if not f.name.endswith(".candidates.json")]
    if not files:
        print(f"카드 없음: {p}", file=sys.stderr)
        return 2

    cards, broken_json = [], []
    for f in files:
        try:
            cards.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception as e:
            broken_json.append(f"{f.name}: {e}")

    res = Result()
    if broken_json:
        res.add("json_parse", False, f"JSON 파싱 실패 {len(broken_json)}건", broken_json)

    import jsonschema
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    v = jsonschema.Draft202012Validator(schema)
    errs = []
    for c in cards:
        for e in sorted(v.iter_errors(c), key=lambda e: list(e.path)):
            where = "/".join(str(x) for x in e.path) or "(root)"
            errs.append(f"{c.get('id', '?')}/{where}: {e.message}")
    res.add("schema", not errs, f"{len(errs)}건 위반" if errs else f"카드 {len(cards)}장 통과", errs[:20])

    # 상한 40 — C1 후보 상한과 같이 맞춘다 (2026-09-08 교사 결정).
    # 두 상한이 갈리면 C1 을 통과한 후보가 C2 에서 경고를 맞는다.
    res.warn("count", f"카드 {len(cards)}장 (기준 10~40)")
    check_notation(cards, res)
    check_typeability(cards, res)
    check_answer_collision(cards, res)
    check_originality(cards, args.unit, res)
    check_links(cards, res)
    check_relations(cards, res, args.unit)
    check_curriculum(cards, res)
    check_registry_and_homonyms(cards, res)
    check_media(cards, res)

    ok = not res.failed
    if args.json:
        print(json.dumps({"stage": "C3/C4", "unit_id": args.unit, "cards": len(cards),
                          "result": "pass" if ok else "fail", "checks": res.checks},
                         ensure_ascii=False, indent=2))
    else:
        mark = {"pass": "  OK  ", "fail": " FAIL ", "warn": " WARN "}
        for c in res.checks:
            print(f"[{mark[c['result']]}] {c['check']}: {c['detail']}")
            for it in c["items"][:12]:
                print(f"           - {it}")
            if len(c["items"]) > 12:
                print(f"           ... 외 {len(c['items']) - 12}건")
        print()
        print(f"=> C3/C4 {'pass' if ok else 'FAIL'} (fail {len(res.failed)} / warn {len(res.warned)})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
