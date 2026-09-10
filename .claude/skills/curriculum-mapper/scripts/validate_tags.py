#!/usr/bin/env python3
"""개념 카드의 성취기준 태그를 검사한다 (C5 규칙 기반 부분).

C5 의 판단(범위 이탈 여부)은 LLM 이 한다. 이 스크립트는 그 앞의 결정론적 검사만 한다.
  1. 태그가 하나라도 있는가          (§4.3 C5 성공 기준)
  2. 코드가 references 에 실재하는가  (오타·환각 차단)
  3. 사람 확정이 안 끝난 코드를 쓰고 있지 않은가 (crosscheck 불일치·미대조)
  4. 단원이 다루는 영역의 코드인가    (다른 영역이면 범위 이탈 후보)

사용: validate_tags.py <카드.json | 디렉터리> [--unit mate-1] [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "textbook-parser" / "scripts"))
from _common import ROOT, find_unit, load_backlog  # noqa: E402

STANDARDS = Path(__file__).resolve().parents[1] / "references" / "standards.yaml"
# 단원 번호(mate-1) → 성취기준 영역 번호(01). 백로그 순서와 교육과정 영역 순서가 같다.
# 쓸 수 있는 crosscheck 값 두 가지.
#   일치      — 스크립트가 두 판본을 대조해 같다고 본 것
#   교사 확정 — 판본이 갈렸고 **사람이 어느 쪽인지 정한** 것 (2026-09-10 부터)
# 하나만 두었더니 사람이 이미 확정한 코드를 미확정으로 읽어 bio-2 에서 20건,
# cell 계열에서 수십 건을 헛되이 지적했다. 확정의 근거가 스크립트냐 사람이냐가
# 다를 뿐 둘 다 "써도 되는" 코드다.
CONFIRMED = {"일치", "교사 확정"}


def load_standards() -> dict[str, dict]:
    data = yaml.safe_load(STANDARDS.read_text(encoding="utf-8"))
    out = {}
    for course in data.get("courses", {}).values():
        for std in course.get("standards", []):
            out[std["code"]] = std
    return out


def expected_area(unit_id: str) -> str:
    """mate-1 → '01'. 백로그의 단원 순서가 곧 교육과정 영역 번호다."""
    return unit_id.rsplit("-", 1)[-1].zfill(2)


def check_card(card: dict, standards: dict, unit_id: str | None) -> list[str]:
    problems = []
    card_id = card.get("id", "(id 없음)")
    codes = card.get("curriculum") or []

    if not codes:
        problems.append(f"{card_id}: 성취기준 태그가 없다")
        return problems

    for code in codes:
        std = standards.get(code)
        if std is None:
            problems.append(f"{card_id}: '{code}' 는 references/standards.yaml 에 없는 코드다")
            continue
        if std.get("crosscheck") not in CONFIRMED:
            problems.append(
                f"{card_id}: '{code}' 는 판본 대조가 끝나지 않았다"
                f"({std.get('crosscheck')}). 사람이 NCIC 원문으로 확정하기 전에는 쓰지 않는다")
        if unit_id and std["area"] != expected_area(unit_id):
            problems.append(
                f"{card_id}: '{code}' 는 {std['area_name']}({std['area']}) 영역인데 "
                f"단원은 {unit_id}({expected_area(unit_id)}) 다 — 범위 이탈 후보")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", type=Path)
    ap.add_argument("--unit")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.unit:
        find_unit(load_backlog(), args.unit)  # 없는 단원이면 여기서 멈춘다

    standards = load_standards()
    paths = sorted(args.target.glob("*.json")) if args.target.is_dir() else [args.target]
    if not paths:
        print(f"검사할 카드가 없다: {args.target}", file=sys.stderr)
        return 1

    problems: list[str] = []
    for path in paths:
        card = json.loads(path.read_text(encoding="utf-8"))
        problems += check_card(card, standards, args.unit)

    result = {"cards": len(paths), "problems": problems, "ok": not problems}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"카드 {len(paths)}장 검사")
        if problems:
            print(f"  지적 {len(problems)}건")
            for p in problems:
                print("    - " + p)
        else:
            print("  통과")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
