#!/usr/bin/env python3
"""NEIS 학교 목록 → 정적 파일 (`app/public/schools/<시도코드>.json`).

학생 브라우저가 NEIS 를 직접 부르지 않게 한다. 이유가 셋이다.

1. **인증키 없이는 5건만 온다.** pIndex 를 올려도 같은 5건이다 — 실제로 확인했다
   (강원 중학교 160개 중 5개). 그래서 키가 반드시 필요한데,
2. 키를 브라우저에 내보내면(NEXT_PUBLIC_) 아무나 그 키의 할당량을 쓴다. 키는
   빌드하는 사람의 컴퓨터에만 있으면 된다.
3. 학교 목록은 거의 바뀌지 않는다. 매번 부를 이유가 없고, 정적 파일이 훨씬 빠르다.

키 받기: https://open.neis.go.kr → 인증키 신청 (즉시 발급, 무료)
쓰기:    app/.env.local 에 `NEIS_KEY=발급받은키` 를 넣고 이 스크립트를 돌린다

    python app/scripts/build_schools.py
    python app/scripts/build_schools.py --sido K10        # 한 시도만
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "app" / "public" / "schools"
ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo"

# 중·고만 쓴다 (2026-09-07 교사 결정)
KINDS = ["중학교", "고등학교"]

SIDO = [
    ("B10", "서울"), ("C10", "부산"), ("D10", "대구"), ("E10", "인천"),
    ("F10", "광주"), ("G10", "대전"), ("H10", "울산"), ("I10", "세종"),
    ("J10", "경기"), ("K10", "강원"), ("M10", "충북"), ("N10", "충남"),
    ("P10", "전북"), ("Q10", "전남"), ("R10", "경북"), ("S10", "경남"),
    ("T10", "제주"),
]

PAGE = 1000


def key() -> str:
    k = os.environ.get("NEIS_KEY", "").strip()
    if not k:
        env = REPO / "app" / ".env.local"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.startswith("NEIS_KEY="):
                    k = line.split("=", 1)[1].strip().strip('"').strip("'")
    return k


def sigungu_of(address: str, sido_name: str) -> str:
    """도로명주소에서 시·군·구를 뽑는다.

    "강원특별자치도 속초시 사진용촌길 42" → "속초시"
    "서울특별시 종로구 …"                 → "종로구"

    세종처럼 그 자리에 시군구가 없는 곳은 빈 문자열이 된다 — 시·군·구로 끝날
    때만 인정한다. "경기도 수원시 팔달구 …" 는 "수원시" 로 잡는다(구까지 나누면
    선택지가 지나치게 잘게 쪼개진다).
    """
    parts = (address or "").strip().split()
    if len(parts) < 2:
        return ""
    return parts[1] if re.search(r"[시군구]$", parts[1]) else ""


def fetch(sido_code: str, kind: str, api_key: str) -> list[dict]:
    rows: list[dict] = []
    for page in range(1, 21):
        q = {
            "Type": "json", "KEY": api_key,
            "pIndex": page, "pSize": PAGE,
            "ATPT_OFCDC_SC_CODE": sido_code, "SCHUL_KND_SC_NM": kind,
        }
        url = f"{ENDPOINT}?{urllib.parse.urlencode(q)}"
        with urllib.request.urlopen(url, timeout=30) as res:
            data = json.loads(res.read().decode("utf-8"))
        if "schoolInfo" not in data:
            code = (data.get("RESULT") or {}).get("CODE", "")
            msg = (data.get("RESULT") or {}).get("MESSAGE", "")
            if code == "INFO-200":  # 해당 데이터 없음
                break
            raise SystemExit(f"NEIS 오류 {sido_code}/{kind}: {code} {msg}")
        batch = data["schoolInfo"][1].get("row") or []
        rows += batch
        if len(batch) < PAGE:
            break
        time.sleep(0.2)  # 예의상 — 공공 API 다
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sido", nargs="*", default=None, help="시도 코드 (기본: 전부)")
    args = ap.parse_args()

    api_key = key()
    if not api_key:
        print(
            "NEIS_KEY 가 없다.\n"
            "  1) https://open.neis.go.kr 에서 인증키를 신청한다 (즉시 발급·무료)\n"
            "  2) app/.env.local 에 NEIS_KEY=발급받은키 를 넣는다\n"
            "  3) 이 스크립트를 다시 돌린다\n"
            "키 없이 호출하면 시도당 5건만 오기 때문에 목록을 만들 수 없다.",
            file=sys.stderr,
        )
        return 2

    targets = [(c, n) for c, n in SIDO if not args.sido or c in args.sido]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index = []
    total = 0

    for code, name in targets:
        schools = []
        for kind in KINDS:
            for r in fetch(code, kind, api_key):
                addr = r.get("ORG_RDNMA") or ""
                schools.append({
                    "code": r.get("SD_SCHUL_CODE") or "",
                    "name": r.get("SCHUL_NM") or "",
                    "kind": r.get("SCHUL_KND_SC_NM") or kind,
                    "sigungu": sigungu_of(addr, r.get("LCTN_SC_NM") or ""),
                    "sido": r.get("LCTN_SC_NM") or name,
                    "address": addr,
                })
        schools.sort(key=lambda s: (s["sigungu"], s["kind"], s["name"]))
        (OUT_DIR / f"{code}.json").write_text(
            json.dumps(schools, ensure_ascii=False), encoding="utf-8", newline="\n")
        sgg = sorted({s["sigungu"] for s in schools if s["sigungu"]})
        no_sgg = sum(1 for s in schools if not s["sigungu"])
        index.append({"code": code, "name": name, "schools": len(schools),
                      "sigungu": sgg})
        total += len(schools)
        print(f"{name}({code}) 학교 {len(schools):5d} · 시군구 {len(sgg):3d}"
              + (f" · 시군구 못 뽑음 {no_sgg}" if no_sgg else ""))

    (OUT_DIR / "index.json").write_text(
        json.dumps({"sido": index}, ensure_ascii=False), encoding="utf-8", newline="\n")
    print(f"=> 학교 {total}개 → {OUT_DIR.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
