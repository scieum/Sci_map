/**
 * 앱 이름 — 미확정. 확정 시 이 파일만 수정한다.
 * 가칭: 사이셀파 (사이 sci + 셀파 Sherpa)
 */
export const BRAND = {
  name: "사이셀파",
  nameEn: "SciSherpa",
  provisional: true, // 이름 확정 시 false로
  tagline: "과학 개념의 길을 안내하는 학습 셀파",
} as const;

/**
 * 과목 색 — 보조 팔레트에서 하나씩 (Design.md §2.4).
 *
 * 과목이 여럿 붙기 시작하면 "지금 무엇을 보고 있나" 를 색으로 잡아 주는 편이
 * 알약 칩 이름만 읽는 것보다 빠르다. 다만 **활성 칩 하나에만** 쓴다 —
 * 브랜드색은 화면의 10% 이내라는 규칙이 있고(D1), 색이 늘어나면 학습 콘텐츠가
 * 뒤로 밀린다.
 *
 * 클래스 문자열을 통째로 적는 이유: Tailwind 는 소스를 훑어 클래스를 만든다.
 * `bg-${x}-500` 처럼 조립하면 그 클래스가 빌드에서 사라진다.
 */
export const SUBJECT_ACCENT: Record<string, string> = {
  "물질과 에너지": "bg-primary-500 shadow-chip",
  통합과학1: "bg-azure-500 shadow-[0_4px_12px_rgba(33,104,214,0.28)]",
  통합과학2: "bg-violet-500 shadow-[0_4px_12px_rgba(107,75,214,0.28)]",
  화학: "bg-rose-500 shadow-[0_4px_12px_rgba(194,58,114,0.28)]",
};

/** 사전에 없는 과목은 브랜드색으로 떨어뜨린다 — 색이 없는 것보다 낫다 */
export const subjectAccent = (subject: string): string =>
  SUBJECT_ACCENT[subject] ?? "bg-primary-500 shadow-chip";

/**
 * 단원 색 — 대단원마다 보조 팔레트에서 하나씩 (Design.md §2.4).
 *
 * 참고 이미지의 범주 타일이 그랬듯, 같은 과목 안에서도 "지금 몇 단원에 있나"를
 * 색이 먼저 말해 준다. 쓰는 자리는 셋으로 못 박는다 — 대단원 카드의 머리띠(tint),
 * 그 번호(text), 그 아래 중단원 진도 배지(tint+text). 카드 본문은 흰색 그대로다.
 *
 * 단원 id 가 없으면(시드) 브랜드색으로 떨어진다. 없는 단원에 색을 지어내지 않는다.
 */
export type Accent = { tint: string; text: string; solid: string };
const ACCENT: Record<string, Accent> = {
  indigo: { tint: "bg-primary-50", text: "text-primary-700", solid: "bg-primary-500" },
  azure: { tint: "bg-azure-50", text: "text-azure-700", solid: "bg-azure-500" },
  violet: { tint: "bg-violet-50", text: "text-violet-700", solid: "bg-violet-500" },
  rose: { tint: "bg-rose-50", text: "text-rose-700", solid: "bg-rose-500" },
};
const UNIT_ACCENT: Record<string, keyof typeof ACCENT> = {
  "mate-1": "indigo",
  "mate-2": "azure",
  "mate-3": "violet",
  "mate-4": "rose",
};
export const unitAccent = (unitId?: string): Accent =>
  ACCENT[UNIT_ACCENT[unitId ?? ""] ?? "indigo"];

/** 홈 "오늘의 구성" 타일 — 참고 이미지의 파스텔 카드 + 작은 색 태그 */
export const TILE = {
  review: { tint: "bg-violet-50", tag: "text-violet-700", value: "text-violet-700" },
  fresh: { tint: "bg-azure-50", tag: "text-azure-700", value: "text-azure-700" },
  streak: { tint: "bg-rose-50", tag: "text-rose-700", value: "text-rose-700" },
} as const;
