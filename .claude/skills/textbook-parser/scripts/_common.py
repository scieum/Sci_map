"""textbook-parser 공용 유틸.

⚠️ PDF 라이브러리는 pypdfium2(Apache-2.0) + pdfplumber(MIT)만 쓴다.
   PyMuPDF는 AGPL/상용 이중 라이선스라 금지다 (Sci_Map R11, CLAUDE.md §8).
   references/forbidden_libraries.md 참조.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[4]
BACKLOG = ROOT / "docs" / "unit_backlog.yaml"
LOG_DIR = ROOT / "output" / "logs"

# pdfminer 는 이 교과서의 별색(/P0 /P1) 지정마다 경고를 뱉는다. 추출에는 영향이 없다.
logging.getLogger("pdfminer").setLevel(logging.ERROR)

# 조판용 제어문자
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# ── 보이지 않는 문자 처리 ────────────────────────────────────────────────────
# 이 교과서는 일부 조판 블록에서 **띄어쓰기 대신 U+00AD(소프트 하이픈)** 를 쓴다
# (mate-1 본문 29,820자 중 2,005자 = 6.7%). 지우면 낱말이 들러붙고, 남기면 C4 의
# 원문 n-gram 대조가 통째로 어긋난다 → 보통 공백으로 바꾼다.
# 폭이 없는 문자(ZWSP·ZWJ·BOM 등)는 지우고, 폭이 있는 특수 공백은 공백으로 통일한다.
# 규칙을 눈으로 확인할 수 있도록 이스케이프 표기로만 적는다.
_ZERO_WIDTH = re.compile("[​-‏⁠﻿]")
_SPACE_LIKE = re.compile("[­   -   　]")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")


def clean(text: str) -> str:
    """조판 제어문자를 걷어내고 NFC 로 정규화한다.

    C4 의 원문 n-gram 대조 기준이 되는 문자열이므로, 여기서의 판단이
    R4(재서술 의무) 검사의 정확도를 그대로 좌우한다.
    """
    text = unicodedata.normalize("NFC", text)
    text = _CTRL.sub("", text)
    text = _ZERO_WIDTH.sub("", text)
    text = _SPACE_LIKE.sub(" ", text)
    return _MULTI_SPACE.sub(" ", text)


def normalize_for_overlap(text: str) -> str:
    """원문 대조(C4, R4)용 정규화 — 공백을 전부 지운 글자열로 만든다.

    한국어는 낱말 도중에도 줄이 바뀐다. '끌어당' / '기는' 처럼 접힌 낱말을 공백으로
    이으면 원문에 없던 공백이 생기고, 붙여 이으면 낱말 사이 공백이 사라진다. 줄만
    보고는 둘을 가릴 수 없으므로 **공백을 아예 지우고 글자열끼리 견준다**.
    §4.4 의 '연속 12어절' 상한은, 이렇게 찾은 최장 공통 부분열의 길이를 카드 쪽
    어절 경계에 되짚어 어절 수로 환산해 판정한다.
    """
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", text))


def load_backlog() -> dict:
    with BACKLOG.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def find_unit(backlog: dict, unit_id: str) -> dict:
    for unit in backlog["units"]:
        if unit["id"] == unit_id:
            return unit
    raise SystemExit(f"unit_backlog.yaml 에 '{unit_id}' 가 없다")


def log_event(stage: str, result: str, reason: str, **extra) -> None:
    """스킵·에스컬레이션·재시도를 JSONL로 남긴다 (CLAUDE.md §12 — 침묵 실패 금지)."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stage": stage,
        "result": result,
        "reason": reason,
        **extra,
    }
    with (LOG_DIR / "pipeline.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def escalate(stage: str, reason: str, **extra) -> None:
    """자동 복구가 불가능한 지점. 로그를 남기고 멈춘다."""
    log_event(stage, "escalate", reason, **extra)
    raise SystemExit(f"[{stage}] 에스컬레이션: {reason}")
