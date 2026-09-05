#!/usr/bin/env python3
"""금지 라이브러리 임포트 자체 점검 (CLAUDE.md §8, Sci_Map R11).

리포의 .py 를 훑어 금지 모듈 임포트를 찾는다. 1건이라도 있으면 실패한다.
node_modules/.next/.git 은 walk 단계에서 잘라낸다 — 리포가 OneDrive 동기화
폴더에 있어 들어갔다 나오는 것만으로도 몇 분이 걸린다.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import ROOT  # noqa: E402

FORBIDDEN = {"fitz", "pymupdf"}
PRUNE = {"node_modules", ".next", ".git", ".venv", "venv", "__pycache__", "inbox", "output"}
IMPORT_RE = re.compile(r"^\s*(?:import|from)\s+([A-Za-z_][\w.]*)", re.MULTILINE)

# 이 파일은 금지 이름을 적는 것이 목적이므로 점검 대상에서 뺀다
ALLOWLIST = {Path(__file__).resolve()}


def iter_py(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        for name in filenames:
            if name.endswith(".py"):
                yield Path(dirpath) / name


def main() -> int:
    hits = []
    for path in iter_py(ROOT):
        if path.resolve() in ALLOWLIST:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for m in IMPORT_RE.finditer(text):
            if m.group(1).split(".")[0].lower() in FORBIDDEN:
                line = text[: m.start()].count("\n") + 1
                hits.append(f"{path.relative_to(ROOT)}:{line}  {m.group(0).strip()}")

    if hits:
        print("금지 라이브러리 임포트 발견 (Sci_Map R11):", file=sys.stderr)
        for h in hits:
            print("  " + h, file=sys.stderr)
        return 1
    print("license check: ok (금지 임포트 0건)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
