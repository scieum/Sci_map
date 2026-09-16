#!/usr/bin/env python3
"""문항 파이프라인 산출물 → 앱 번들 데이터.

`output/items/*/items.json` 을 모아 `app/src/data/items.generated.json` 을 만든다.
`build_concepts.py` 와 같은 자리, 같은 규칙이다 — **손으로 고치지 마라.**

★ 여기 담기는 것은 **메타뿐이다.** 문항 이미지는 리포에 올라가지 않는다
  (2026-09-16 교사 결정: 로그인한 학생만 · docs/rights_policy.md). 앱은
  Supabase Storage 비공개 버킷에서 서명 URL 로 가져온다.

★ 발행사가 쓴 모범답안(`answer_internal`)과 문항 텍스트는 담지 않는다.
  객관식 번호만 간다 (CLAUDE.md §6).

사용:
    python app/scripts/build_items.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ITEMS = REPO / "output" / "items"
REVIEW = REPO / "output" / "review"
OUT = REPO / "app" / "src" / "data" / "items.generated.json"

# 앱으로 나가는 필드만 추린다. 빠뜨리는 쪽이 새는 쪽보다 낫다
ITEM_FIELDS = ("no", "kind", "answer", "difficulty", "domain", "curriculum",
               "topicLabel", "file", "width", "height", "conceptIds", "conceptCandidates")


def approved(kind: str, code: str) -> bool:
    """검토 문서 하나의 승인 여부. `kind` 는 exam(크롭·정답) 또는 curation(매핑·해설)."""
    path = REVIEW / f"{code}-{kind}.review.md"
    if not path.exists():
        return False
    return bool(re.search(r"^approved:\s*true\s*$", path.read_text(encoding="utf-8"), re.M))


def approved_subjects() -> dict[str, bool]:
    """Q6 게이트 — 교사가 승인한 과목만 앱으로 나간다 (CLAUDE.md §5).

    승인은 `output/review/<과목코드>-exam.review.md` 의 `approved: true` 로
    기록된다. 게이트를 코드로 막아 두지 않으면 "빌드했더니 배포돼 있었다" 가
    된다 — 자동 통과 옵션은 존재하지 않는다.
    """
    out: dict[str, bool] = {}
    for path in sorted(REVIEW.glob("*-exam.review.md")):
        code = path.name.split("-exam")[0]
        text = path.read_text(encoding="utf-8")
        out[code] = bool(re.search(r"^approved:\s*true\s*$", text, re.M))
    return out


def main() -> int:
    gate = approved_subjects()
    papers = []
    held: dict[str, int] = {}
    for path in sorted(ITEMS.glob("*/items.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        code = doc["subject_code"]
        if not gate.get(code):
            held[code] = held.get(code, 0) + len(doc["items"])
            continue
        # ★ 매핑·해설은 **따로 승인받는다** (Q6 재검토). 크롭·정답 승인만으로
        #   LLM 이 쓴 해설이 학생에게 나가지 않는다 — 게이트가 다르면 문서도 다르다
        curated = approved("curation", code)
        items = []
        for it in doc["items"]:
            row = {
                "id": it["item_id"],
                "no": it["no"],
                "kind": it.get("kind", "unknown"),
                "answer": it.get("answer"),
                "difficulty": it.get("difficulty"),
                "domain": it.get("domain"),
                "curriculum": it.get("curriculum"),
                "topicLabel": it.get("topic_label"),
                "file": it["file"],
                "width": it["width"],
                "height": it["height"],
                # 승인 전에는 LLM 이 고른 카드도 쓰지 않는다 — 후보만 보여 준다
                "conceptIds": it.get("concept_ids", []) if curated else [],
                "conceptCandidates": it.get("concept_candidates", []),
                "explanation": it.get("explanation") if curated else None,
            }
            items.append({k: v for k, v in row.items() if v not in (None, [], "")} | {
                "id": row["id"], "no": row["no"], "kind": row["kind"], "file": row["file"]})
        papers.append({
            "paperId": doc["paper_id"],
            "subjectCode": doc["subject_code"],
            "unitId": doc["unit_id"],
            "topicId": doc.get("topic_id"),
            "examType": doc["exam_type"],
            "round": doc["round"],
            "label": doc["label"],
            "accessTier": doc["access_tier"],
            "rightsHolder": doc["rights"]["holder"],
            "count": len(items),
            "items": items,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"papers": papers}, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8", newline="\n")
    total = sum(p["count"] for p in papers)
    choice = sum(1 for p in papers for i in p["items"] if i["kind"] == "choice")
    print(f"회차 {len(papers)}개 · 문항 {total}개 (객관식 {choice}) → {OUT.relative_to(REPO)}")
    curated_codes = sorted({p["subjectCode"] for p in papers if approved("curation", p["subjectCode"])})
    waiting = sorted({p["subjectCode"] for p in papers} - set(curated_codes))
    if curated_codes:
        print(f"  매핑·해설 반영: {', '.join(curated_codes)}")
    for code in waiting:
        print(f"  ⏸ {code}: 매핑·해설 승인 대기 (output/review/{code}-curation.review.md)")
    for code, n in sorted(held.items()):
        state = "승인 대기" if code in gate else "검토 파일 없음"
        print(f"  ⏸ {code}: {n}문항 보류 ({state} — output/review/{code}-exam.review.md)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
