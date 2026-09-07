"use client";

/**
 * 개념 그래프 — G3 가 낸 좌표와 간선을 읽는다 (`public/graph.json`).
 *
 * 좌표는 파이프라인이 낸다. 클라이언트는 **렌더와 줌만** 한다 (Design.md §7).
 * 브라우저에서 힘 기반 배치를 돌리면 노드 192개·간선 934개에서 모바일이 버겁고,
 * 무엇보다 열 때마다 그림이 달라져 "저번에 여기쯤이었지" 가 생기지 않는다.
 *
 * 표제어·정의는 여기 없다 — concepts.generated.json 에 이미 있으므로 id 로 잇는다.
 * 같은 값을 두 곳에 두면 갈라진다.
 */

export interface GraphNode {
  id: string;
  unit: string;
  x: number;
  y: number;
  degree: number;
}

export interface GraphLink {
  from: string;
  to: string;
  type: "prereq" | "next" | "related" | "same" | string;
}

export interface ConceptGraph {
  generatedAt?: string;
  hubs: string[];
  nodes: GraphNode[];
  links: GraphLink[];
}

let cached: ConceptGraph | null = null;

export async function loadGraph(signal?: AbortSignal): Promise<ConceptGraph> {
  if (cached) return cached;
  const res = await fetch("/graph.json", { signal });
  if (!res.ok) throw new Error(`그래프를 불러오지 못했어요 (${res.status})`);
  cached = (await res.json()) as ConceptGraph;
  return cached;
}

/** 노드를 감싸는 사각형 — 처음 열 때 어디를 비출지 정하는 데 쓴다 */
export function boundsOf(nodes: GraphNode[], pad = 60) {
  if (nodes.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return {
    x,
    y,
    w: Math.max(...xs) - x + pad,
    h: Math.max(...ys) - y + pad,
  };
}
