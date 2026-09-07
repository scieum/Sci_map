"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Screen, ScreenTitle } from "@/components/ui";
import { conceptById } from "@/data/concepts";
import { accentOfSubject } from "@/lib/brand";
import { boundsOf, fitTo, loadGraph, type ConceptGraph, type GraphNode } from "@/lib/graph";
import { useProgress } from "@/lib/store";
import { loadUi } from "@/lib/ui-state";

/**
 * 지도 탭 — 개념 그래프 (Design.md §4.2).
 *
 * 캔버스형 화면. 노드 = 개념 카드, 엣지 = 링크 4종.
 *   노드 크기  링크 수 (허브가 커진다)
 *   노드 채움  학습 상태 — 미학습 bg-subtle · 학습중 primary-100 · 안정 primary-500
 *   엣지       prereq·next 는 실선, related 는 옅게, same 은 info 점선(학년 간)
 *
 * 노드를 누르면 **하단 미리보기 시트**가 뜬다. 그래프에서 곧장 전체 화면으로
 * 넘어가지 않는다 — 길을 잃지 않게 하려는 것이다 (§4.2).
 *
 * 처음 열면 전체가 아니라 **보던 과목**으로 줌인해 둔다. 192개를 한꺼번에
 * 보여 주면 아무것도 안 보인다.
 */
export default function MapPage() {
  const [graph, setGraph] = useState<ConceptGraph | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    loadGraph(ac.signal)
      .then(setGraph)
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFailed(true);
      });
    return () => ac.abort();
  }, []);

  if (failed) {
    return (
      <Screen>
        <ScreenTitle>지도</ScreenTitle>
        <EmptyState
          art="empty-map"
          title="개념 그래프를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."
          action={
            <Link
              href="/concepts"
              className="rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
            >
              개념 트리 둘러보기
            </Link>
          }
        />
      </Screen>
    );
  }
  if (!graph) {
    return (
      <Screen>
        <ScreenTitle>지도</ScreenTitle>
        <p className="text-[14px] text-ink-faint">개념 지도를 그리는 중…</p>
      </Screen>
    );
  }
  return <GraphCanvas graph={graph} />;
}

/** 학습 상태 세 단계 — Design.md §4.2 의 노드 채움 */
type Learned = "none" | "learning" | "stable";

function GraphCanvas({ graph }: { graph: ConceptGraph }) {
  const progress = useProgress();
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph],
  );

  // ── 화면 크기 ────────────────────────────────────────────────────────────
  // viewBox 의 비율이 실제 그려지는 상자의 비율과 다르면 두 가지가 어긋난다.
  // ① SVG 가 여백을 넣어(letterbox) 그림이 가운데로 몰리고 ② 1px 을 밀었을 때
  // 좌표가 얼마나 움직이는지 계산이 틀려 손가락과 그림이 따로 논다.
  // 그래서 상자를 재고 **그 비율로 viewBox 를 만든다**. 폰 세로, 태블릿 가로,
  // 창 크기 변경까지 같은 코드로 맞는다.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 노드 id → 과목 이름. 렌더마다 192번 찾지 않도록 한 번만 만든다 */
  const subjects = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, conceptById(n.id)?.subject ?? ""])),
    [graph],
  );
  const subjectOf = useCallback((n: GraphNode) => subjects.get(n.id) ?? "", [subjects]);

  // 처음 볼 자리 — **단원 하나**다 (§4.2 "현재 학습 중 단원 중심으로 줌인").
  // 과목 전체를 담으면 폰에서 노드가 2px 밖에 안 돼 점 구름이 된다.
  // 어느 단원인가: 본 적 있는 개념이 가장 많은 단원, 없으면 개념 탭에서 보던
  // 과목의 첫 단원, 그것도 없으면 전체.
  const initial = useMemo(() => {
    const want = loadUi().conceptsSubject;
    const inSubject = want
      ? graph.nodes.filter((n) => subjectOf(n) === want)
      : graph.nodes;
    const pool = inSubject.length >= 3 ? inSubject : graph.nodes;

    const seen = new Map<string, number>();
    for (const n of pool) {
      if (progress.concepts[n.id]) seen.set(n.unit, (seen.get(n.unit) ?? 0) + 1);
    }
    let unit = "";
    let best = 0;
    for (const [u, c] of seen) if (c > best) [unit, best] = [u, c];
    if (!unit) unit = pool[0]?.unit ?? "";

    const mine = pool.filter((n) => n.unit === unit);
    return fitTo(boundsOf(mine.length >= 3 ? mine : pool), box);
  }, [graph, subjectOf, box, progress]);

  const [view, setView] = useState(initial);
  /** 상자를 처음 잰 뒤 한 번만 맞춘다. 그 뒤에는 학생이 민 자리를 지킨다 */
  const fitted = useRef(false);
  useEffect(() => {
    if (box.w === 0 || fitted.current) return;
    fitted.current = true;
    setView(initial);
  }, [box, initial]);

  /** 창 크기가 바뀌면 보던 가운데를 지킨 채 비율만 다시 맞춘다 */
  useEffect(() => {
    if (box.w === 0 || box.h === 0) return;
    setView((v) => {
      const h = v.w * (box.h / box.w);
      return { ...v, y: v.y + (v.h - h) / 2, h };
    });
  }, [box]);

  const levelOf = useCallback(
    (id: string): Learned => {
      const lv = progress.concepts[id]?.level;
      if (lv === undefined) return "none";
      return lv >= 3 ? "stable" : "learning";
    },
    [progress],
  );

  // ── 팬·줌 — 포인터 이벤트 하나로 손가락과 마우스를 함께 다룬다 ────────────
  // 손가락이 하나면 밀기, 둘이면 오므리기다. 둘 사이의 거리를 지난 값과 견줘
  // 그 비율만큼 확대·축소한다 — 두 손가락의 가운데를 붙잡은 채로.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pinchDist = useRef<number | null>(null);

  function toView(dxPx: number, dyPx: number) {
    if (!box.w || !box.h) return { dx: 0, dy: 0 };
    return { dx: (dxPx / box.w) * view.w, dy: (dyPx / box.h) * view.h };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      pinchDist.current = null;
    } else {
      pan.current = null; // 두 번째 손가락이 닿으면 밀기를 멈춘다
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const prev = pinchDist.current;
      pinchDist.current = dist;
      if (prev && dist > 0) {
        zoomBy(prev / dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      return;
    }

    const p = pan.current;
    if (!p) return;
    const { dx, dy } = toView(e.clientX - p.x, e.clientY - p.y);
    setView((v) => ({ ...v, x: p.vx - dx, y: p.vy - dy }));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pointers.current.size === 0) pan.current = null;
  }

  /** 손가락·커서가 있는 자리를 붙잡은 채로 확대한다 */
  const zoomBy = useCallback((ratio: number, cx?: number, cy?: number) => {
    setView((v) => {
      const el = svgRef.current;
      const r = el?.getBoundingClientRect();
      const px = r && cx !== undefined ? (cx - r.left) / r.width : 0.5;
      const py = r && cy !== undefined ? (cy - r.top) / r.height : 0.5;
      const w = Math.min(Math.max(v.w * ratio, 220), 4000);
      const h = (w / v.w) * v.h;
      return { x: v.x + (v.w - w) * px, y: v.y + (v.h - h) * py, w, h };
    });
  }, []);

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    zoomBy(e.deltaY > 0 ? 1.12 : 0.89, e.clientX, e.clientY);
  }

  /**
   * 좌표 1픽셀이 몇 단위인가. 노드 크기·선 굵기·글자 크기를 전부 이 값으로
   * 환산해 **화면에서 늘 같은 크기**로 보이게 한다.
   *
   * 그러지 않으면 멀리서는 점이 2px 이라 누를 수도 읽을 수도 없고, 가까이
   * 가면 공처럼 커진다. 그래프 좌표계의 폭이 3000 이 넘어 특히 그렇다.
   */
  const u = box.w ? view.w / box.w : 1;
  const rOf = (degree: number) => (5 + Math.min(degree, 24) / 3) * u;

  const terms = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, conceptById(n.id)?.term ?? ""])),
    [graph],
  );

  /** 연결이 많은 것부터 — 밀 때마다 다시 정렬하지 않도록 한 번만 만든다 */
  const byDegree = useMemo(
    () => [...graph.nodes].sort((a, b) => b.degree - a.degree),
    [graph],
  );

  /**
   * 이름표 — **겹치면 버린다.**
   *
   * "연결 10개 이상만" 같은 기준으로 고르면 폰에서는 그마저 겹쳐 읽히지
   * 않고(실제로 그랬다), 태블릿에서는 자리가 남는데도 이름이 안 나온다.
   * 화면에 실제로 놓이는 자리를 계산해서, 이미 놓인 이름과 부딪히면 그 이름을
   * 버린다. 연결이 많은 것부터 고르므로 폰에서는 허브만, 태블릿에서는 거의
   * 전부가 살아남는다 — 기기 크기를 따로 나눌 필요가 없다.
   */
  const labels = useMemo(() => {
    if (u >= 4) return [] as GraphNode[]; // 너무 멀면 아예 걸지 않는다
    const font = 11 * u;
    const taken: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const out: GraphNode[] = [];
    for (const n of byDegree) {
      // 화면 밖은 건너뛴다 — 안 보이는 자리를 차지하지 않게
      if (n.x < view.x || n.x > view.x + view.w) continue;
      if (n.y < view.y || n.y > view.y + view.h) continue;
      const t = terms.get(n.id) ?? "";
      if (!t) continue;
      const w = t.length * font * 0.62;   // 한글 폭 어림값
      const h = font * 1.25;
      const cy = n.y - rOf(n.degree) - 4 * u;
      const b = { x1: n.x - w / 2, y1: cy - h, x2: n.x + w / 2, y2: cy + h * 0.25 };
      const hit = taken.some(
        (o) => !(b.x2 < o.x1 || b.x1 > o.x2 || b.y2 < o.y1 || b.y1 > o.y2),
      );
      if (hit) continue;
      taken.push(b);
      out.push(n);
    }
    return out;
  }, [byDegree, view, u, terms]);
  const pickedCard = picked ? conceptById(picked.id) : null;

  return (
    <div
      ref={wrapRef}
      /* 탭 바(56px)와 홈 인디케이터(safe-area)를 뺀 나머지가 캔버스다.
         1024px 이상에서는 전체 폭 캔버스로 둔다 (Design.md §3.3) */
      className="relative h-[calc(100dvh-56px-env(safe-area-inset-bottom))] w-full overflow-hidden bg-bg"
    >
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 px-5 pt-4">
        <h1 className="text-[22px] font-extrabold text-ink">지도</h1>
        <p className="mt-0.5 text-[12px] text-ink-faint">
          개념 {graph.nodes.length}개 · 연결 {graph.links.length}개 · 손가락으로 밀고 오므려요
        </p>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label={`개념 지도 — 개념 ${graph.nodes.length}개와 연결 ${graph.links.length}개`}
      >
        {/* 간선 먼저 — 노드가 위에 와야 누르기 쉽다 */}
        <g>
          {graph.links.map((l, i) => {
            const a = nodeById.get(l.from);
            const b = nodeById.get(l.to);
            if (!a || !b) return null;
            const same = l.type === "same";
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={same ? "var(--color-info)" : "var(--color-line)"}
                strokeWidth={(same ? 1.6 : l.type === "related" ? 0.7 : 1.1) * u}
                strokeDasharray={same ? `${4 * u} ${3 * u}` : undefined}
                opacity={l.type === "related" ? 0.7 : 1}
              />
            );
          })}
        </g>
        <g>
          {graph.nodes.map((n) => {
            const r = rOf(n.degree);
            const learned = levelOf(n.id);
            const accent = accentOfSubject(subjectOf(n));
            const on = picked?.id === n.id;
            return (
              <circle
                key={n.id}
                cx={n.x}
                cy={n.y}
                r={on ? r + 3 * u : r}
                className={
                  learned === "stable"
                    ? accent.fillSolid
                    : learned === "learning"
                      ? accent.fillSoft
                      : "fill-bg-subtle"
                }
                stroke={on ? "var(--color-ink)" : "var(--color-surface)"}
                strokeWidth={(on ? 2 : 1) * u}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setPicked(n);
                }}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </g>
        {/* 이름표 — 겹치지 않는 것만 남는다 (labels) */}
        <g pointerEvents="none">
          {labels.map((n) => (
            <text
              key={n.id}
              x={n.x}
              y={n.y - rOf(n.degree) - 4 * u}
              textAnchor="middle"
              fontSize={11 * u}
              className="fill-ink"
              stroke="var(--color-bg)"
              strokeWidth={3 * u}
              paintOrder="stroke"
            >
              {terms.get(n.id)}
            </text>
          ))}
        </g>
      </svg>

      {/* 미니 범례 — 접어 둔다 (§4.2) */}
      <div className="absolute bottom-3 left-3 z-10">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="rounded-full bg-surface px-3 py-1.5 text-[12px] font-bold text-ink-sub shadow-[0_2px_10px_rgba(23,58,94,0.1)]"
        >
          범례 {legendOpen ? "▾" : "▸"}
        </button>
        {legendOpen && (
          <div className="mt-2 rounded-[16px] bg-surface p-3 text-[12px] leading-relaxed text-ink-sub shadow-[0_2px_14px_rgba(23,58,94,0.12)]">
            <p className="mb-1 font-bold text-ink">노드</p>
            <p>크기 = 연결 수 · 색 = 과목</p>
            <p>옅은 색 = 배우는 중 · 진한 색 = 익숙함 · 회색 = 아직</p>
            <p className="mb-1 mt-2 font-bold text-ink">선</p>
            <p>진한 선 = 먼저·다음 · 옅은 선 = 관련</p>
            <p>점선 = 같은 개념의 재등장</p>
          </div>
        )}
      </div>

      {/* 노드 미리보기 시트 — 여기서 카드로 간다 */}
      {picked && (
        <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[24px] bg-surface p-5 pb-6 shadow-[0_-4px_24px_rgba(23,58,94,0.16)]">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[17px] font-extrabold text-ink">
                {pickedCard?.term ?? picked.id}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-faint">
                {pickedCard?.subject} · {pickedCard?.unit?.split(" > ").pop()} · 연결{" "}
                {picked.degree}개
              </p>
            </div>
            <button
              onClick={() => setPicked(null)}
              aria-label="닫기"
              className="shrink-0 text-[18px] text-ink-faint"
            >
              ✕
            </button>
          </div>
          {pickedCard?.definition && (
            <p className="line-clamp-2 text-[14px] leading-relaxed text-ink-sub">
              {pickedCard.definition}
            </p>
          )}
          <Link
            href={`/concepts/${picked.id}`}
            className="mt-4 flex h-12 items-center justify-center rounded-full bg-primary-500 text-[15px] font-bold text-white shadow-cta"
          >
            카드 열기
          </Link>
        </div>
      )}
    </div>
  );
}
