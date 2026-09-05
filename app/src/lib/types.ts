/**
 * 개념 카드 타입 — 설계서 §2.1 concept.schema 의 프론트 소비용 서브셋.
 * 파이프라인 산출 JSON과의 정식 계약은 concept.schema.json(추후)으로 대체된다.
 */

export type LinkType = "prereq" | "next" | "same" | "related";

export interface Relation {
  id: string;
  text: string; // 관계 명제 (OX 참 지문의 원천)
  condition: string; // 성립 조건 — 칩으로 선표시
  scope?: string;
  invertible: boolean;
  /** invertible=true일 때 방향 반전 거짓 지문 (파이프라인 D1 파생분을 시드에선 수기로) */
  invertedText?: string;
}

export interface Misconception {
  text: string; // OX 거짓 지문으로 그대로 사용
  whyWrong: string;
}

export interface ConceptLink {
  type: LinkType;
  target: string; // concept id
  note?: string;
}

export interface Concept {
  id: string;
  term: string;
  /** 검색 허용 표기. 표제어가 아니다 — 구표기가 여기 들어간다 (R6) */
  aliases?: string[];
  hanja: string | null; // null = 해당 없음(음차어)
  hanjaGloss?: string;
  english: string;
  definition: string;
  relations: Relation[];
  misconceptions: Misconception[];
  links: ConceptLink[];
  subject: string; // 물질과 에너지 | 통합과학1 | 화학 …
  unit: string; // "물질의 세 가지 상태 > 액체와 고체의 성질"
  /** 소주제 — 중단원 아래 한 층 ("기체 법칙", "액체" …) */
  topic?: string;
  /**
   * 이 카드의 그림이 restricted 자산인가 (§0.4 — 카드가 아니라 그림만 잠근다).
   * **판단이 아니라 규칙이다** — rights.holder 가 교사 자신이 아니면 무조건 true.
   * 실제로 보여줄지는 src/lib/access.ts 의 스위치가 정한다.
   */
  hasRestrictedMedia: boolean;
  mediaCaption?: string;
  /** public/media/ 아래 파일명. 없으면 그림 자리만 잡힌다 */
  mediaFile?: string;
}

export type QuizKind = "ox" | "short" | "mcq";

export interface QuizItem {
  id: string;
  conceptId: string;
  kind: QuizKind;
  prompt: string;
  /** ox: "O"|"X", short: 정답 문자열, mcq: 정답 선택지 텍스트 */
  answer: string;
  choices?: string[]; // mcq 전용
  aliases?: string[]; // short 전용 — 허용 별칭
  explanation: string;
  /** 복습 문항 여부는 런타임 상태로 계산 */
}
