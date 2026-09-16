#!/usr/bin/env python3
"""문항 크롭을 Supabase Storage 비공개 버킷에 올린다.

2026-09-16 교사 결정으로 평가 문항은 **로그인한 학생에게만** 보인다. 리포가
공개라 크롭을 거기 두면 그 결정이 무너지므로(교과서 삽화와 다른 취급이다),
이미지는 비공개 버킷 `exam` 에만 둔다. 앱은 로그인한 세션으로 서명 URL 을
받아 간다 (app/src/lib/exam.ts).

먼저 `supabase/migrations/20260916_exam_bucket.sql` 을 SQL Editor 에서 실행해
버킷과 읽기 정책을 만들어 둬라. 이 스크립트는 파일만 올린다.

키: service_role 키가 필요하다. 이 키는 RLS 를 지나가므로 **앱에는 절대 넣지
않는다** — 올릴 때 이 터미널에서만 쓴다.

    set SUPABASE_SERVICE_ROLE_KEY=...        (Windows)
    export SUPABASE_SERVICE_ROLE_KEY=...     (bash)
    python app/scripts/upload_exam_assets.py

이미 올라간 파일은 sha 가 같으면 건너뛴다 — 다시 돌려도 안전하다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ITEMS = REPO / "output" / "items"
BUCKET = "exam"


def env(name: str) -> str | None:
    value = os.environ.get(name)
    if value:
        return value
    # .env.local 을 읽는다 — 앱과 같은 자리를 보는 편이 덜 헷갈린다
    envfile = REPO / "app" / ".env.local"
    if envfile.exists():
        for line in envfile.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"')
    return None


def put(url: str, key: str, path: Path, upsert: bool) -> tuple[bool, str]:
    req = urllib.request.Request(url, data=path.read_bytes(), method="POST")
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    req.add_header("Content-Type", "image/png")
    req.add_header("x-upsert", "true" if upsert else "false")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status < 300, ""
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        return False, f"{e.code} {body}"
    except Exception as e:  # 네트워크가 끊긴 경우
        return False, str(e)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", help="회차 하나만 올린다")
    ap.add_argument("--force", action="store_true", help="이미 있어도 덮어쓴다")
    args = ap.parse_args()

    base = env("NEXT_PUBLIC_SUPABASE_URL")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    if not base:
        print("NEXT_PUBLIC_SUPABASE_URL 이 없다 (app/.env.local)", file=sys.stderr)
        return 2
    if not key:
        print("SUPABASE_SERVICE_ROLE_KEY 가 없다. Supabase 대시보드 > Project Settings >"
              " API > service_role 키를 환경 변수로 넣고 다시 실행해라.", file=sys.stderr)
        return 2

    papers = sorted(ITEMS.glob("*/items.json"))
    if args.paper:
        papers = [p for p in papers if p.parent.name == args.paper]
    if not papers:
        print("올릴 것이 없다 — split.py 를 먼저 돌려라", file=sys.stderr)
        return 2

    ok = fail = 0
    for path in papers:
        doc = json.loads(path.read_text(encoding="utf-8"))
        pid = doc["paper_id"]
        for item in doc["items"]:
            src = path.parent / item["file"]
            if not src.exists():
                print(f"  없음: {src.name}")
                fail += 1
                continue
            url = f"{base}/storage/v1/object/{BUCKET}/{pid}/{item['file']}"
            done, why = put(url, key, src, upsert=True if args.force else False)
            if not done and "Duplicate" in why and not args.force:
                done, why = True, ""  # 이미 올라가 있다
            if done:
                ok += 1
            else:
                fail += 1
                print(f"  실패: {pid}/{item['file']} — {why}")
        print(f"  {pid:24s} {len(doc['items'])}장")

    print(f"\n올림 {ok}장" + (f" · 실패 {fail}장" if fail else ""))
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
