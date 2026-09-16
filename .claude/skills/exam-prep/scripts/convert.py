#!/usr/bin/env python3
"""Q0 평가자료 전처리 — HWP → PDF 변환과 회차 메타 확정.

설계서 §5.1 Q0 를 HWP 입력에 맞춰 구현한다. 원래 Q0 는 `/inbox/exam/*.pdf`
(평가원 기출 PDF)를 받도록 적혀 있는데, 실제로 들어온 것은 교과서 발행사가
낸 **HWP 평가자료**였다. 형식이 다를 뿐 하는 일은 같다 — 회차 메타를 확정하고
쪽을 정규화해 다음 단계가 쓸 수 있는 자리에 놓는다.

★ `정답및해설` 파일은 **변환하지 않는다.** 정답은 `문항정보표` 에 번호별로
  들어 있어 그쪽만 있으면 되고, 해설은 애초에 쓰지 않는다 — 해설은 카드의
  관계 명제를 인용해 우리가 쓴다 (CLAUDE.md §6). 쓰지 않을 파일을 변환해
  두면 언젠가 누군가 그것을 쓴다. 변환 자체를 하지 않는 편이 안전하다.

★ 변환 결과는 `/output/source/` 아래 둔다. 교과서 원문과 같은 취급이다 —
  **배포하지 않는 내부 자료**다 (CLAUDE.md §9.4).

변환은 설치된 한컴오피스를 COM 으로 부른다. 한 번 띄운 세션으로 전부 돌린다 —
파일마다 한글을 새로 띄우면 53개에 몇 분이 아니라 몇십 분이 든다.

사용:
    python convert.py --subject 통합과학2
    python convert.py --subject 통합과학2 --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
INBOX = REPO / "inbox" / "exam"
OUT = REPO / "output" / "source" / "exam"
LOG = REPO / "output" / "logs" / "pipeline.jsonl"

# 과목 이름 → 앱/백로그의 과목 코드
SUBJECT_CODE = {"통합과학1": "isci1", "통합과학2": "isci2"}

# 파일 이름에서 읽어 내는 것들
KIND = {
    "문제": "paper",
    "문항정보표": "info",
    "정답및해설": "answers",  # ★ 변환하지 않는다. 분류만 해 둔다
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def log(**row) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps({"ts": now(), "stage": "Q0", **row}, ensure_ascii=False) + "\n")


def parse_name(path: Path, subject_code: str) -> dict | None:
    """파일 이름 하나를 읽는다. 이번 범위(선택형)가 아니면 None.

    `고_통합과학2_소단원형성평가_1-2-5_문제_1회.hwp`
    `고_통합과학2_중간기말대비평가_2단원_문제_1회.hwp`
    """
    stem = path.stem
    m = re.match(r"^고_\S+?_(소단원형성평가|중간기말대비평가)_(.+?)_(문제|문항정보표|정답및해설)_(\d+)회$", stem)
    if not m:
        # 수행평가·서논술형·최소성취수준·학업성취도 — 앱에서 채점할 수 없는 형식이라
        # 이번 범위가 아니다. 버리는 것이 아니라 건너뛰는 것이므로 로그에 남긴다
        return None
    exam_type, scope, kind, round_no = m.groups()

    if exam_type == "소단원형성평가":
        # "1-2-5" → 소단원 topicId `isci2-1-2-05`
        parts = scope.split("-")
        if len(parts) != 3:
            return None
        topic_id = f"{subject_code}-{parts[0]}-{parts[1]}-{int(parts[2]):02d}"
        unit_id = f"{subject_code}-{parts[0]}"
        paper_id = f"{subject_code}-form-{parts[0]}-{parts[1]}-{int(parts[2]):02d}-r{round_no}"
        label = f"{scope} 소단원 형성평가 {round_no}회"
    else:
        # "2단원" → 대단원 unitId `isci2-2`
        mm = re.match(r"^(\d+)단원$", scope)
        if not mm:
            return None
        unit_id = f"{subject_code}-{mm.group(1)}"
        topic_id = None
        paper_id = f"{subject_code}-mid-{mm.group(1)}-r{round_no}"
        label = f"{mm.group(1)}단원 중간·기말 대비평가 {round_no}회"

    return {
        "paper_id": paper_id,
        "kind": KIND[kind],
        "subject_code": subject_code,
        "exam_type": exam_type,
        "unit_id": unit_id,
        "topic_id": topic_id,
        "round": int(round_no),
        "label": label,
        "src": str(path.relative_to(REPO)).replace("\\", "/"),
    }


def convert_batch(jobs: list[tuple[Path, Path]]) -> dict[str, bool]:
    """HWP → PDF. 한 번 띄운 한글 세션으로 전부 돌린다.

    돌려주는 것은 {입력경로: 성공여부}. 실패한 파일은 다음 단계에서 빠진다 —
    여기서 되살리려 애쓰지 않는다. 변환이 안 되는 파일은 사람이 봐야 한다.
    """
    if not jobs:
        return {}
    lines = [
        "$ErrorActionPreference = 'Continue'",
        "$hwp = New-Object -ComObject HWPFrame.HwpObject",
        "try { $hwp.RegisterModule('FilePathCheckDLL','FilePathCheckerModule') } catch {}",
    ]
    for src, dst in jobs:
        s = str(src).replace("'", "''")
        d = str(dst).replace("'", "''")
        lines += [
            f"$ok = $false",
            f"try {{ if ($hwp.Open('{s}', 'HWP', 'forceopen:true')) {{ $ok = $hwp.SaveAs('{d}', 'PDF', '') }} }} catch {{ }}",
            f"Write-Output (\"RESULT`t{s}`t\" + $ok)",
            "try { $hwp.Clear(1) } catch {}",
        ]
    lines.append("try { $hwp.Quit() } catch {}")

    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8-sig") as fh:
        fh.write("\n".join(lines))
        script = fh.name

    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    Path(script).unlink(missing_ok=True)

    done: dict[str, bool] = {}
    for line in (proc.stdout or "").splitlines():
        if line.startswith("RESULT\t"):
            _, path, ok = line.split("\t", 2)
            done[path] = ok.strip().lower() == "true"
    return done


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", required=True, help="inbox/exam 아래 과목 폴더 이름")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    subject_code = SUBJECT_CODE.get(args.subject)
    if not subject_code:
        print(f"모르는 과목: {args.subject} — SUBJECT_CODE 에 추가해라", file=sys.stderr)
        return 2

    root = INBOX / args.subject
    if not root.is_dir():
        print(f"없는 폴더: {root}", file=sys.stderr)
        return 2

    papers: dict[str, dict] = {}
    skipped: list[str] = []
    for path in sorted(root.rglob("*.hwp")):
        meta = parse_name(path, subject_code)
        if not meta:
            skipped.append(str(path.relative_to(REPO)).replace("\\", "/"))
            continue
        rec = papers.setdefault(
            meta["paper_id"],
            {k: meta[k] for k in
             ("paper_id", "subject_code", "exam_type", "unit_id", "topic_id", "round", "label")}
            | {"files": {}},
        )
        rec["files"][meta["kind"]] = meta["src"]

    # 문제지가 없는 회차는 회차가 아니다
    for pid in list(papers):
        if "paper" not in papers[pid]["files"]:
            log(result="skip", paper_id=pid, reason="문제 파일 없음")
            del papers[pid]

    jobs: list[tuple[Path, Path]] = []
    for pid, rec in sorted(papers.items()):
        out_dir = OUT / pid
        rec["out_dir"] = str(out_dir.relative_to(REPO)).replace("\\", "/")
        for kind in ("paper", "info"):  # ★ answers 는 변환하지 않는다
            src = rec["files"].get(kind)
            if not src:
                continue
            dst = out_dir / f"{kind}.pdf"
            rec.setdefault("pdf", {})[kind] = str(dst.relative_to(REPO)).replace("\\", "/")
            if dst.exists():
                continue
            if not args.dry_run:
                out_dir.mkdir(parents=True, exist_ok=True)
            jobs.append((REPO / src, dst))

    print(f"회차 {len(papers)}개 · 변환 대상 {len(jobs)}개 · 범위 밖 {len(skipped)}개")
    for pid, rec in sorted(papers.items()):
        have = "+".join(sorted(rec["files"]))
        print(f"  {pid:28s} {rec['label']}  [{have}]")

    if args.dry_run:
        return 0

    done = convert_batch(jobs)
    failed = [str(s) for s, _ in jobs if not done.get(str(s), False)]
    for f in failed:
        log(result="fail", stage_detail="hwp2pdf", file=f)

    OUT.mkdir(parents=True, exist_ok=True)
    index = {
        "subject": args.subject,
        "subject_code": subject_code,
        "built_at": now(),
        "papers": [papers[k] for k in sorted(papers)],
        "out_of_scope": skipped,
    }
    (OUT / "papers.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    ok = len(jobs) - len(failed)
    print(f"변환 완료 {ok}/{len(jobs)}" + (f" · 실패 {len(failed)}" if failed else ""))
    for f in failed:
        print("  실패:", f)
    log(result="ok", papers=len(papers), converted=ok, failed=len(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
