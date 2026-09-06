import type { Concept } from "@/lib/types";
import generated from "./concepts.generated.json";
import { SEED_ISCI1 } from "./seed-isci1";

/**
 * 개념 카드 — **손으로 고치지 마라.**
 *
 * `concepts.generated.json` 은 파이프라인 산출물에서 만들어진다:
 *     python app/scripts/build_concepts.py
 * 원본은 `output/concepts/<unit-id>/*.json` 과 `output/rights/ledger.jsonl` 이다.
 * 여기서 고치면 파이프라인과 앱이 갈라지고, 갈라지면 어느 쪽이 맞는지 알 수 없게 된다.
 *
 * SEED_ISCI1 만 예외 — 통합과학1이 아직 파이프라인을 돌지 않아 남겨 둔 시드다.
 */
export const CONCEPTS: Concept[] = [...(generated as Concept[]), ...SEED_ISCI1];

export const conceptById = (id: string) => CONCEPTS.find((c) => c.id === id);

/** 과목 > 대단원 > 중단원 > 소주제 트리 */
export function buildTree() {
  const tree = new Map<string, Map<string, Map<string, Concept[]>>>();
  for (const c of CONCEPTS) {
    const [major, minor] = c.unit.split(" > ");
    if (!tree.has(c.subject)) tree.set(c.subject, new Map());
    const subj = tree.get(c.subject)!;
    if (!subj.has(major)) subj.set(major, new Map());
    const maj = subj.get(major)!;
    const key = minor ?? major;
    if (!maj.has(key)) maj.set(key, []);
    maj.get(key)!.push(c);
  }
  return tree;
}

/** 중단원 안의 카드를 소주제별로 묶는다. 소주제가 없으면 한 덩어리. */
export function byTopic(concepts: Concept[]): [string, Concept[]][] {
  const out = new Map<string, Concept[]>();
  for (const c of concepts) {
    const k = c.topic ?? "";
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(c);
  }
  return Array.from(out.entries());
}

/**
 * 목차 번호 — 대단원 `Ⅰ.` · 중단원 `1.` · 소단원 `01.`
 *
 * 번호를 화면에서 세지 않는다. 세면 카드가 하나 빠지거나 정렬이 바뀌는 순간
 * 교과서와 어긋나고, 어긋난 것을 알아챌 방법이 없다. 백로그 id 가 곧 교과서의
 * 번호다 — `mate-1-1-01` = Ⅰ 단원 · 1 중단원 · 01 소단원.
 *
 * id 가 없는 카드(파이프라인을 아직 돌지 않은 통합과학1 시드)는 번호가 없다.
 * 그 경우 빈 문자열을 돌려주고, 화면은 번호 없이 이름만 그린다.
 */
const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];

/** "mate-1" → "Ⅰ" */
export function majorNo(c: Concept): string {
  const n = Number(c.unitId?.split("-").pop());
  return n >= 1 && n < ROMAN.length ? ROMAN[n] : "";
}

/** "mate-1-1-01" → "1" */
export function minorNo(c: Concept): string {
  const parts = c.topicId?.split("-") ?? [];
  return parts.length >= 4 ? String(Number(parts[parts.length - 2])) : "";
}

/** "mate-1-1-01" → "01" */
export function topicNo(c: Concept): string {
  const parts = c.topicId?.split("-") ?? [];
  return parts.length >= 4 ? parts[parts.length - 1] : "";
}
