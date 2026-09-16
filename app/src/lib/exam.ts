"use client";

import data from "@/data/items.generated.json";
import { CONCEPTS } from "@/data/concepts";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 기출·평가 문항 — 발행사 평가자료에서 뽑은 문항 크롭과 그 메타.
 *
 * ★ 문항 이미지는 **앱 번들에도 리포에도 없다.** 2026-09-16 교사 결정으로
 *   "로그인한 학생만" 보게 정해졌는데, 리포가 공개라 파일을 거기 두면 그
 *   결정이 무너진다 (docs/rights_policy.md). 이미지는 Supabase Storage 의
 *   비공개 버킷 `exam` 에 있고, 로그인한 세션에만 **서명 URL**로 내려온다.
 *
 * ★ 여기 담긴 정답은 객관식 번호(①~⑤)뿐이다. 서술형 모범답안은 발행사가 쓴
 *   글이라 가져오지 않는다 (CLAUDE.md §6) — 그런 문항은 '스스로 확인'이다.
 */

export type ItemKind = "choice" | "written" | "unknown";

export interface ExamItem {
  id: string;
  no: number;
  kind: ItemKind;
  /** 객관식 정답 기호. 서술형이면 없다 */
  answer?: string;
  difficulty?: string;
  domain?: string;
  curriculum?: string;
  topicLabel?: string;
  /** 버킷 안 파일 이름 (경로는 `<paperId>/<file>`) */
  file: string;
  width: number;
  height: number;
  /** Q3 에서 확정된 개념 카드 */
  conceptIds?: string[];
  /** 성취기준이 같은 카드들 — 아직 하나로 좁히지 못한 상태 */
  conceptCandidates?: string[];
  /** Q4 자체 해설. 아직 없으면 비어 있다 (설계서 §5.1 Q4 는 null 배포를 허용한다) */
  explanation?: string;
}

export interface ExamPaper {
  paperId: string;
  subjectCode: string;
  unitId: string;
  topicId?: string;
  examType: string;
  round: number;
  label: string;
  accessTier: string;
  rightsHolder: string;
  count: number;
  items: ExamItem[];
}

export const PAPERS: ExamPaper[] = (data as { papers: ExamPaper[] }).papers;

export const CHOICES = ["①", "②", "③", "④", "⑤"] as const;

export const paperById = (id: string) => PAPERS.find((p) => p.paperId === id);

/** 대단원 이름은 카드가 알고 있다 — 같은 unitId 를 쓴다 */
export function unitTitle(unitId: string): string {
  const c = CONCEPTS.find((x) => x.unitId === unitId);
  return c ? c.unit.split(" > ")[0] : unitId;
}

export function subjectTitle(subjectCode: string): string {
  const c = CONCEPTS.find((x) => x.unitId?.startsWith(`${subjectCode}-`));
  return c?.subject ?? subjectCode;
}

export interface SubjectSummary {
  code: string;
  name: string;
  papers: number;
  items: number;
  units: number;
}

/**
 * 과목 목록 — 문제 탭의 첫 화면.
 *
 * 문항이 **하나라도 있는 과목만** 담는다. 들어가 봐야 빈 목록인 과목을 세워
 * 두면, 학생은 그것이 "아직 안 들어온 과목" 인지 "내가 잘못 눌렀는지" 알 수 없다.
 */
export function subjectSummaries(): SubjectSummary[] {
  const by = new Map<string, ExamPaper[]>();
  for (const p of PAPERS) {
    if (!by.has(p.subjectCode)) by.set(p.subjectCode, []);
    by.get(p.subjectCode)!.push(p);
  }
  return Array.from(by.entries()).map(([code, papers]) => ({
    code,
    name: subjectTitle(code),
    papers: papers.length,
    items: papers.reduce((n, p) => n + p.count, 0),
    units: new Set(papers.map((p) => p.unitId)).size,
  }));
}

export interface UnitItems {
  unitId: string;
  title: string;
  /** 이 단원의 문항 전부 — 평가지를 가로질러 한 줄로 세운다 */
  items: (ExamItem & { paperId: string; paperLabel: string })[];
  papers: number;
}

/**
 * 단원 하나의 문항 전부.
 *
 * ★ 학생은 **단원으로 공부한다.** "1-2-5 형성평가 2회" 는 발행사가 자료를
 *   나눈 단위이지 학생이 시험 범위를 잡는 단위가 아니다. 회차별로 늘어놓으면
 *   한 단원을 훑으려고 목록을 여덟 번 드나들게 된다. 회차는 문항마다 배지로
 *   남겨 두어 어디서 온 문항인지는 알 수 있게 한다.
 *
 * 순서는 평가지 → 문항 번호다. 섞지 않는다 — 공통 지문을 쓰는 이웃 문항이
 * 흩어지면 앞 문항에서 본 자료를 다시 찾아야 한다.
 */
export function unitItems(unitId: string): UnitItems | null {
  const papers = PAPERS.filter((p) => p.unitId === unitId)
    .sort((a, b) => a.label.localeCompare(b.label));
  if (papers.length === 0) return null;
  return {
    unitId,
    title: unitTitle(unitId),
    papers: papers.length,
    items: papers.flatMap((p) =>
      p.items.map((i) => ({ ...i, paperId: p.paperId, paperLabel: p.label })),
    ),
  };
}

/** 한 과목의 대단원 → 회차 */
export function unitsOfSubject(code: string): { unitId: string; title: string; papers: ExamPaper[] }[] {
  const by = new Map<string, ExamPaper[]>();
  for (const p of PAPERS.filter((x) => x.subjectCode === code)) {
    if (!by.has(p.unitId)) by.set(p.unitId, []);
    by.get(p.unitId)!.push(p);
  }
  return Array.from(by.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([unitId, papers]) => ({
      unitId,
      title: unitTitle(unitId),
      papers: papers.sort((x, y) => x.label.localeCompare(y.label)),
    }));
}

/**
 * 문항 이미지 주소 — 로그인한 세션에만 내려오는 서명 URL.
 *
 * 한 단원의 이미지를 **한 번에** 받는다. 문항마다 따로 부르면 75문항짜리
 * 단원에서 왕복이 75번이고, 넘길 때마다 기다리게 된다.
 *
 * 서명 URL 은 유효 기간이 있다. 한 단원을 붙잡고 푸는 동안 넉넉하도록 두 시간을
 * 준다 — 짧게 잡으면 풀다 말고 이미지가 깨진다.
 */
export async function signedUrls(
  items: { id: string; paperId: string; file: string }[],
): Promise<Record<string, string>> {
  if (!isSupabaseConfigured() || items.length === 0) return {};
  const paths = items.map((i) => `${i.paperId}/${i.file}`);
  const { data: rows, error } = await supabase()
    .storage.from("exam")
    .createSignedUrls(paths, 2 * 60 * 60);
  if (error || !rows) return {};
  const byPath = new Map<string, string>();
  for (const row of rows) {
    if (row.signedUrl && row.path) byPath.set(row.path, row.signedUrl);
  }
  const out: Record<string, string> = {};
  for (const i of items) {
    const url = byPath.get(`${i.paperId}/${i.file}`);
    if (url) out[i.id] = url;
  }
  return out;
}
