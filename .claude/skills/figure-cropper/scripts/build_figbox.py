#!/usr/bin/env python3
"""C7 준비 — 캡션 자리에서 그림 상자를 잡아 output/media/<unit-id>.figbox.json 을 만든다.

지금까지 이 일은 과목마다 일회용 스크립트로 했고, 그 탓에 같은 판형에서 같은 실수를
되풀이했다(캡션만 남은 h8 상자, 이웃 그림을 삼킨 상자). 방법을 여기 고정한다.

## 방법

1. 쪽을 2.0배로 렌더해 **잉크 마스크**를 만든다 (밝기 < INK_LEVEL).
2. pdfplumber 의 낱말 상자를 마스크에서 **지운다** — 글자는 그림이 아니다.
3. 남은 잉크를 DILATE_PT 만큼 부풀려 덩어리로 잇는다 (선화의 끊긴 획을 잇는다).
4. 캡션에서 **위로 먼저, 없으면 아래로** PROBE_PT 까지 탐침을 내려 덩어리를 찾는다.
   캡션이 그림 아래에 붙는 판형이 흔하므로 위쪽을 먼저 본다.
5. 찾은 덩어리와 캡션 상자를 합쳐 bbox 로 삼는다.

## 좌표

산출물 bbox 는 **pdfplumber 좌표**다 (x, top). plan.json 으로 옮길 때
`render = (x - page.bbox.x0, top - page.bbox.y0)` 로 바꾼다 — 교과서마다 값이 다르니
`docs/unit_backlog.yaml` 의 textbook.note 를 먼저 읽어라.

## review 플래그 — 사람이 눈으로 다시 볼 것

- 덩어리를 못 찾았다 (캡션만 남았다)
- 높이 < MIN_HEIGHT_PT — 두 줄·두 칸짜리 그림에서 한쪽만 잡힌 자리다
- 상자가 제 캡션보다 LEFT_DRIFT_PT 넘게 왼쪽에서 시작한다 — 곁주나 이웃 그림을 삼킨 자리다

뒤의 두 지표는 2026-09-14 「전자기와 양자」 C7 준비에서 사람이 손본 15건을
되짚어 얻은 것이다 (output/logs/pipeline.jsonl).

⚠️ PyMuPDF(fitz) 금지 — 렌더링은 pypdfium2(Apache-2.0).

사용: build_figbox.py <unit-id> [--scale 2.0] [--probe 36]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pdfplumber
import pypdfium2 as pdfium

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "textbook-parser" / "scripts"))
from _common import ROOT, clean, load_backlog, log_event  # noqa: E402

SCALE = 2.0
INK_LEVEL = 200          # 이보다 어두우면 잉크로 본다
DILATE_PT = 9.0          # 끊긴 획을 잇는 팽창 반지름
PROBE_PT = 36.0          # 캡션에서 그림까지 허용하는 빈 띠
WORD_PAD_PT = 1.2        # 낱말 상자를 지울 때 여유 (글자 삐침)
MIN_BLOB_PT = 14.0       # 이보다 작은 덩어리는 잡티
MIN_HEIGHT_PT = 80.0     # 이보다 낮으면 사람이 볼 것
LEFT_DRIFT_PT = 60.0     # 캡션보다 이만큼 왼쪽에서 시작하면 사람이 볼 것
TOUCH_PT = 12.0          # 캡션과 덩어리가 이만큼 겹쳐도 '맞닿았다' 로 본다

# 캡션은 그림·표 번호로 시작하는 **작은 글자**다. 본문이 '그림 2 와 같이 …' 로
# 그림을 가리키는 줄과 글자 크기로 갈린다 — 이 판형은 캡션 8.0pt, 본문 10.7pt.
#
# 머리에 방향 표시가 붙는 자리가 있다 — '▲ 그림 17 …', '▶ 그림 18 …'. 그림이 캡션의 위인지
# 옆인지를 조판으로 알려 주는 기호다. 기호를 지나치면 그 그림은 통째로 빠진다 — plan-2 79쪽
# 광도 곡선 두 장이 그 자리였고, 성취기준 12행우02-05 가 정면으로 요구하는 그림이다.
CAPTION_RE = re.compile(r"^[▲▼◀▶◆●■□○◇*※\s]*(그림|표)\s*([0-9]{1,3})\b")
CAPTION_MAX_SIZE = 9.0


CAP_CONT_GAP = 16.0      # 캡션 다음 줄이 이만큼 아래까지 오면 같은 캡션의 이어짐으로 본다
CAP_CONT_INDENT = 8.0    # 이어지는 줄은 첫 줄과 왼쪽 끝이 이만큼 안에서 맞는다


def caption_lines(layout_page: dict) -> list[dict]:
    """캡션 첫 줄과 **이어지는 줄**까지 한 덩이로 묶는다.

    이 판형의 캡션은 두세 줄로 접히는 일이 잦다 — 「그림 4 개기 일식 때 드러난 / 코로나의
    모습」. 첫 줄만 캡션으로 잡으면 크롭이 둘째 줄에서 잘려 출처 표시가 반토막 난다.
    크롭에 캡션을 넣는 까닭이 출처를 그림에 붙여 두려는 것이므로(figure-cropper SKILL.md),
    반토막은 그 장치를 망가뜨린다.

    이어짐의 조건은 셋이다 — 작은 글자, 첫 줄과 왼쪽 끝이 맞음, 바로 아래.
    새 캡션으로 시작하는 줄은 이어짐이 아니다.
    """
    small = [l for l in layout_page["lines"] if l.get("size", 99) <= CAPTION_MAX_SIZE]
    small.sort(key=lambda l: (l["bbox"][1], l["bbox"][0]))
    out = []
    for i, line in enumerate(small):
        m = CAPTION_RE.match(clean(line["text"]).strip())
        if not m:
            continue
        bbox = list(line["bbox"])
        title = clean(line["text"])[m.end():].strip()
        for nxt in small[i + 1:]:
            if CAPTION_RE.match(clean(nxt["text"]).strip()):
                break
            if abs(nxt["bbox"][0] - line["bbox"][0]) > CAP_CONT_INDENT:
                continue
            if not (0 <= nxt["bbox"][1] - bbox[3] <= CAP_CONT_GAP):
                continue
            bbox[1] = min(bbox[1], nxt["bbox"][1])
            bbox[2] = max(bbox[2], nxt["bbox"][2])
            bbox[3] = max(bbox[3], nxt["bbox"][3])
            title = (title + " " + clean(nxt["text"]).strip()).strip()
        out.append({"kind": m.group(1), "no": int(m.group(2)),
                    "title": title,
                    "bbox": [round(v, 1) for v in bbox]})
    return out


def ink_mask(page, rendered, scale: float) -> np.ndarray:
    """글자를 지운 잉크 마스크. True = 그림일 수 있는 잉크."""
    x0, y0 = page.bbox[0], page.bbox[1]
    a = np.asarray(rendered.convert("L"))
    mask = a < INK_LEVEL
    h, w = mask.shape
    pad = WORD_PAD_PT * scale
    for word in page.extract_words():
        wx0 = int((word["x0"] - x0) * scale - pad)
        wx1 = int((word["x1"] - x0) * scale + pad)
        wy0 = int((word["top"] - y0) * scale - pad)
        wy1 = int((word["bottom"] - y0) * scale + pad)
        wx0, wy0 = max(0, wx0), max(0, wy0)
        wx1, wy1 = min(w, wx1), min(h, wy1)
        if wx1 > wx0 and wy1 > wy0:
            mask[wy0:wy1, wx0:wx1] = False
    return mask


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    """적분 영상으로 사각 팽창. scipy 없이 돌린다."""
    if radius <= 0:
        return mask
    ii = np.zeros((mask.shape[0] + 1, mask.shape[1] + 1), dtype=np.int32)
    ii[1:, 1:] = np.cumsum(np.cumsum(mask.astype(np.int32), axis=0), axis=1)
    h, w = mask.shape
    r = radius
    y0 = np.clip(np.arange(h) - r, 0, h)
    y1 = np.clip(np.arange(h) + r + 1, 0, h)
    x0 = np.clip(np.arange(w) - r, 0, w)
    x1 = np.clip(np.arange(w) + r + 1, 0, w)
    total = (ii[np.ix_(y1, x1)] - ii[np.ix_(y0, x1)]
             - ii[np.ix_(y1, x0)] + ii[np.ix_(y0, x0)])
    return total > 0


def components(mask: np.ndarray) -> list[tuple[int, int, int, int]]:
    """4-이웃 연결 성분의 bbox 목록 (픽셀 좌표, x0,y0,x1,y1). 스택 기반 flood fill."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    boxes = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        minx = maxx = sx
        miny = maxy = sy
        while stack:
            y, x = stack.pop()
            if y < miny:
                miny = y
            if y > maxy:
                maxy = y
            if x < minx:
                minx = x
            if x > maxx:
                maxx = x
            # 행 단위로 밀어 넣는다 — 픽셀 하나씩 스택에 쌓으면 큰 도해에서 느리다
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        boxes.append((minx, miny, maxx + 1, maxy + 1))
    return boxes


def probe(cap: dict, boxes: list[dict], page_w: float, probe_pt: float) -> tuple[dict | None, bool]:
    """캡션에 맞닿은 덩어리를 네 방향에서 모아 **가장 큰 것**을 고른다.

    방향에 우선순위를 두면 안 된다. 캡션이 옅은 색 띠 위에 얹힌 판형에서는 그 띠가
    캡션을 '품은' 작은 덩어리로 잡혀, 위쪽에 있는 진짜 도해를 밀어낸다 (plan-1 26쪽
    그림 9 가 그 자리였다 — 높이 26pt 짜리 띠가 140pt 짜리 그래프를 이겼다).
    넓이로 고르면 그런 띠는 자연히 진다.

    맞닿음은 TOUCH_PT 만큼의 겹침까지 받아 준다 — 캡션이 그림 색면의 맨 윗줄에 얹히면
    빈 띠가 음수로 나온다.
    """
    cx0, ctop, cx1, cbot = cap["bbox"]
    cw = max(1.0, cx1 - cx0)
    ch = max(1.0, cbot - ctop)

    def h_near(b):
        return min(cx1, b["x1"]) - max(cx0, b["x0"]) > 0.25 * cw

    def v_near(b):
        return min(cbot, b["y1"]) - max(ctop, b["y0"]) > 0.25 * ch

    cands: list[tuple[dict, bool]] = []
    for b in boxes:
        if h_near(b):
            if b["y0"] <= ctop and b["y1"] >= cbot:            # 캡션을 품었다
                cands.append((b, bool(ctop > (b["y0"] + b["y1"]) / 2)))
            elif -TOUCH_PT <= ctop - b["y1"] <= probe_pt:       # 위에 있다
                cands.append((b, True))
            elif -TOUCH_PT <= b["y0"] - cbot <= probe_pt:       # 아래에 있다
                cands.append((b, False))
        # 캡션이 그림 **옆** 바깥 여백에 붙는 자리가 있다 (plan-1 21·36·40, plan-2 56,
        # plan-3 98쪽). 가로 빈 띠는 단 사이 홈이라 위아래 빈 띠보다 넓다 — 그래서 탐침을
        # 곱절로 늘린다. 넓이로 고르므로 이웃 그림을 잘못 집어 올 위험은 크지 않다.
        elif v_near(b) and (-TOUCH_PT <= b["x0"] - cx1 <= probe_pt * 2
                            or -TOUCH_PT <= cx0 - b["x1"] <= probe_pt * 2):
            cands.append((b, False))
    if not cands:
        return None, False
    return max(cands, key=lambda bf: (bf[0]["y1"] - bf[0]["y0"]) * (bf[0]["x1"] - bf[0]["x0"]))


def split_shared(figures: list[dict]) -> None:
    """한 덩어리를 여러 캡션이 나눠 쓰면 캡션 가운데를 기준으로 가른다.

    나란히 놓인 사진 석 장이 한 줄을 이루면 9pt 팽창이 셋을 하나로 잇는다. 그대로 두면
    세 카드가 같은 (page, bbox) 를 가리켜 crop.py 가 한 장으로 묶어 버린다 — 어느 카드도
    제 그림을 못 받는다. 캡션이 제 그림 아래에 붙는 판형이므로 캡션 중심의 가운데가 경계다.
    """
    # 같은 덩어리라도 캡션 상자를 합치는 과정에서 끝이 0.4pt쯤 어긋난다 (37쪽 그림 23·24 가
    # 그랬다). 좌표를 통째로 키로 쓰면 그 차이 때문에 한 짝이 갈라지므로 왼쪽 위 모서리만
    # 1pt 로 반올림해 묶는다 — 서로 다른 그림이 같은 모서리에서 시작하는 일은 드물다.
    groups: dict[tuple, list[dict]] = {}
    for f in figures:
        if f["bbox"] == f["cap_bbox"]:
            continue
        groups.setdefault((f["page"], round(f["bbox"][0]), round(f["bbox"][1])), []).append(f)
    for key, group in groups.items():
        if len(group) < 2:
            continue
        bbox = [min(f["bbox"][0] for f in group), min(f["bbox"][1] for f in group),
                max(f["bbox"][2] for f in group), max(f["bbox"][3] for f in group)]
        group.sort(key=lambda f: (f["cap_bbox"][0] + f["cap_bbox"][2]) / 2)
        centers = [(f["cap_bbox"][0] + f["cap_bbox"][2]) / 2 for f in group]
        edges = [bbox[0]] + [(centers[i] + centers[i + 1]) / 2 for i in range(len(group) - 1)] + [bbox[2]]
        for i, f in enumerate(group):
            f["bbox"] = [round(edges[i], 1), f["bbox"][1],
                         round(edges[i + 1], 1), f["bbox"][3]]
            f["shared_row"] = len(group)


def apply_fixes(unit_id: str, figures: list[dict]) -> None:
    """사람이 잡은 상자를 덮어씌운다 — `output/media/<unit>.figbox.fixes.json`.

    검출은 스크립트가 하고 **최종 판단은 사람이 한다.** 그 판단을 산출물에 직접 써 두면
    스크립트를 한 번만 다시 돌려도 지워진다 — 실제로 한 번 날려 먹고 다시 잡았다.
    그래서 사람 손이 닿은 것은 사이드카에 따로 두고 여기서 덮어씌운다.

    사이드카 형식 (없으면 아무 일도 하지 않는다):

        {"unit_id": "plan-1",
         "fixes": [{"page": 26, "kind": "그림", "no": 9,
                    "bbox": [191.0, 466.0, 562.5, 640.0],
                    "note": "왜 손댔는지"}],
         "confirmed": [{"page": 16, "kind": "그림", "no": 1, "note": "눈으로 봤다 — 맞다"}]}

    `fixes` 는 상자를 갈아 끼우고, `confirmed` 는 상자는 그대로 두되 review 만 내린다.
    둘 다 review 를 false 로 만든다 — 사람이 이미 본 것이기 때문이다.
    """
    path = ROOT / "output" / "media" / f"{unit_id}.figbox.fixes.json"
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    index = {(f["page"], f["kind"], f["no"]): f for f in figures}
    missing = []
    for entry in data.get("fixes", []):
        key = (entry["page"], entry["kind"], entry["no"])
        f = index.get(key)
        if f is None:
            missing.append(key)
            continue
        f["bbox"] = [round(v, 1) for v in entry["bbox"]]
        f["height"] = round(f["bbox"][3] - f["bbox"][1], 1)
        f["review"] = False
        f["fix_note"] = "사람이 다시 잡았다 — " + entry.get("note", "")
    for entry in data.get("confirmed", []):
        key = (entry["page"], entry["kind"], entry["no"])
        f = index.get(key)
        if f is None:
            missing.append(key)
            continue
        f["review"] = False
        f["fix_note"] = "사람이 쪽을 렌더해 확인했다 — " + entry.get("note", "맞다")
    if missing:
        # 사이드카가 가리키는 그림이 사라졌다는 것은 검출 규칙이 바뀌었다는 뜻이다.
        # 조용히 지나가면 사람의 판단이 소리 없이 빠진다.
        print(f"⚠️ {unit_id}: 사이드카가 가리키는 그림 {len(missing)}건을 찾지 못했다 — {missing}",
              file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("unit_id")
    ap.add_argument("--scale", type=float, default=SCALE)
    ap.add_argument("--probe", type=float, default=PROBE_PT)
    args = ap.parse_args()

    layout_path = ROOT / "output" / "source" / args.unit_id / "layout.json"
    layout = json.loads(layout_path.read_text(encoding="utf-8"))

    # 카드에 붙일 그림은 **본문 쪽**에서만 나온다. 단원 마무리·프로젝트·진로 쪽의 삽화까지
    # 잡으면 C2 가 쓰지도 않을 상자를 놓고 사람이 눈으로 확인하게 된다 (plan-3 127쪽이
    # 그 자리였다 — 대단원 프로젝트 쪽 그림 둘이 review 로 올라왔다).
    body_pages = {json.loads(line)["page"]
                  for line in (ROOT / "output" / "source" / args.unit_id / "text.jsonl")
                  .read_text(encoding="utf-8").splitlines() if line.strip()
                  and json.loads(line)["role"] == "body"}
    pdf_path = ROOT / layout["source_pdf"]
    scale = args.scale

    doc = pdfium.PdfDocument(str(pdf_path))
    figures = []
    with pdfplumber.open(str(pdf_path)) as plumb:
        for pno_s, page_layout in sorted(layout["pages_layout"].items(), key=lambda kv: int(kv[0])):
            pno = int(pno_s)
            if pno not in body_pages:
                continue
            caps = caption_lines(page_layout)
            if not caps:
                continue
            page = plumb.pages[pno - 1]
            px0, py0 = page.bbox[0], page.bbox[1]
            rendered = doc[pno - 1].render(scale=scale).to_pil()
            mask = ink_mask(page, rendered, scale)
            grown = dilate(mask, int(round(DILATE_PT * scale)))
            boxes = []
            for bx0, by0, bx1, by1 in components(grown):
                b = {"x0": float(bx0) / scale + px0, "y0": float(by0) / scale + py0,
                     "x1": float(bx1) / scale + px0, "y1": float(by1) / scale + py0}
                if b["x1"] - b["x0"] < MIN_BLOB_PT or b["y1"] - b["y0"] < MIN_BLOB_PT:
                    continue
                boxes.append(b)

            for cap in caps:
                blob, above = probe(cap, boxes, page.width, args.probe)
                cx0, ctop, cx1, cbot = cap["bbox"]
                if blob is None:
                    bbox = [cx0, ctop, cx1, cbot]
                    review, fix = True, "덩어리를 못 찾았다 — 캡션만 남았다"
                else:
                    bbox = [min(cx0, blob["x0"]), min(ctop, blob["y0"]),
                            max(cx1, blob["x1"]), max(cbot, blob["y1"])]
                    review, fix = False, None
                    if bbox[3] - bbox[1] < MIN_HEIGHT_PT:
                        review, fix = True, f"높이 {bbox[3] - bbox[1]:.0f}pt — 한쪽만 잡혔을 수 있다"
                    elif cx0 - bbox[0] > LEFT_DRIFT_PT:
                        review, fix = True, (f"캡션보다 {cx0 - bbox[0]:.0f}pt 왼쪽에서 시작한다 — "
                                             "곁주나 이웃 그림을 삼켰을 수 있다")
                figures.append({
                    "page": pno, "kind": cap["kind"], "no": cap["no"], "title": cap["title"],
                    "cap_bbox": cap["bbox"],
                    "bbox": [round(v, 1) for v in bbox],
                    "above": above,
                    "height": round(bbox[3] - bbox[1], 1),
                    "review": review,
                    "fix_note": fix,
                })

    split_shared(figures)
    for f in figures:
        if f["bbox"] == f["cap_bbox"]:
            continue
        cx0 = f["cap_bbox"][0]
        f["height"] = round(f["bbox"][3] - f["bbox"][1], 1)
        if f["height"] < MIN_HEIGHT_PT:
            f["review"], f["fix_note"] = True, f"높이 {f['height']:.0f}pt — 한쪽만 잡혔을 수 있다"
        elif cx0 - f["bbox"][0] > LEFT_DRIFT_PT:
            f["review"], f["fix_note"] = True, (
                f"캡션보다 {cx0 - f['bbox'][0]:.0f}pt 왼쪽에서 시작한다 — 곁주나 이웃 그림을 삼켰을 수 있다")
        else:
            f["review"], f["fix_note"] = False, None

    apply_fixes(args.unit_id, figures)

    out = ROOT / "output" / "media" / f"{args.unit_id}.figbox.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "unit_id": args.unit_id,
        "note": ("C7 준비 산출물 — 캡션 위치에서 잡은 그림 상자다. bbox 는 **pdfplumber 좌표**이고, "
                 "plan.json 으로 옮길 때 mediabox 원점만큼 렌더 좌표로 바꿔야 한다. "
                 "review 가 true 면 사람이 눈으로 다시 잡아야 한다."),
        "method": (f"render {scale}x · 글자 줄 마스킹 · {DILATE_PT}pt 팽창 후 덩어리 · "
                   f"탐침 {args.probe}pt"),
        "figures": figures,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    n_review = sum(1 for f in figures if f["review"])
    print(f"{args.unit_id}  캡션 {len(figures)}건 / review {n_review}건 → {out.relative_to(ROOT)}")
    log_event("C7-prep", "pass" if not n_review else "판단",
              f"{args.unit_id}: 그림 상자 {len(figures)}건 검출, review {n_review}건",
              unit_id=args.unit_id, figures=len(figures), review=n_review)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
