#!/usr/bin/env python3
"""C0 보조. 텍스트 레이어가 없는 PDF 를 OCR 경로로 돌린다 (Sci_Map R10).

⚠️ 이 경로는 아직 **실물로 검증되지 않았다**. 현재 투입된 '물질과 에너지' 교과서는
   텍스트 레이어가 있어(detect_layer 기준 추출률 96%대) 이 경로를 타지 않으며,
   이 기기에 ocrmypdf·tesseract 도 설치돼 있지 않다. 스캔본 교과서를 처음 투입할 때
   반드시 눈으로 결과를 확인하고 이 주석을 지워라.

ocrmypdf 로 원본 옆에 텍스트 레이어만 덧입힌 사본을 만든다. 원본은 건드리지 않는다.
사용: ocr.py <pdf> [--lang kor+eng] [--out <path>]
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import escalate, log_event  # noqa: E402

REQUIRED = ("ocrmypdf", "tesseract")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--lang", default="kor+eng")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    missing = [tool for tool in REQUIRED if not shutil.which(tool)]
    if missing:
        # 자동 복구 불가 — 스캔 품질 문제와 마찬가지로 사람이 판단할 일이다.
        escalate("C0", f"OCR 경로에 필요한 도구가 없다: {', '.join(missing)}. "
                       f"`brew install ocrmypdf tesseract-lang` 후 다시 시도한다",
                 pdf=str(args.pdf))

    out = args.out or args.pdf.with_suffix(".ocr.pdf")
    cmd = ["ocrmypdf", "--language", args.lang, "--skip-text",
           "--output-type", "pdf", str(args.pdf), str(out)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        escalate("C0", f"ocrmypdf 실패 (rc={proc.returncode}): {proc.stderr.strip()[:400]}",
                 pdf=str(args.pdf))

    log_event("C0", "pass", "OCR 사본 생성", pdf=str(args.pdf), out=str(out), lang=args.lang)
    print(f"OCR 사본 → {out}")
    print("detect_layer.py 로 추출률을 다시 재고 95% 기준을 넘는지 확인한다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
