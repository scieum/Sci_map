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
const PILL: Record<string, string> = {
  indigo: "bg-primary-500 shadow-chip",
  azure: "bg-azure-500 shadow-[0_4px_12px_rgba(33,104,214,0.28)]",
  violet: "bg-violet-500 shadow-[0_4px_12px_rgba(107,75,214,0.28)]",
  rose: "bg-rose-500 shadow-[0_4px_12px_rgba(194,58,114,0.28)]",
};

/** 활성 과목 알약 칩 — 과목 색의 채움판. 사전에 없는 과목은 브랜드색 */
export const subjectAccent = (subject: string): string =>
  PILL[SUBJECT_HUE[subject] ?? "indigo"];

/**
 * 과목 색 — 과목마다 보조 팔레트에서 하나씩 (Design.md §2.4).
 *
 * **같은 과목 안에서는 한 색이다.** 대단원마다 색을 바꾸면 "지금 어느 과목인가"
 * 라는 큰 신호가 "몇 단원인가" 라는 작은 신호에 묻힌다 (교사 결정 2026-09-07).
 * 쓰는 자리: 활성 과목 칩(solid), 대단원 카드 머리띠(tint)·번호(text)·중단원
 * 진도 배지(tint+text). 카드 본문은 흰색 그대로다.
 *
 * 사전에 없는 과목은 브랜드색으로 떨어진다. 없는 과목에 색을 지어내지 않는다.
 */
/**
 * fillSolid·fillSoft 는 SVG 용이다. 개념 지도의 노드는 <circle> 이라 bg-* 가 듣지
 * 않고 fill-* 를 써야 한다 — 같은 색을 두 벌로 적어 두는 대신 여기 한 곳에 둔다.
 */
export type Accent = {
  tint: string;
  text: string;
  solid: string;
  fillSolid: string;
  fillSoft: string;
};
const ACCENT: Record<string, Accent> = {
  indigo: { tint: "bg-primary-50", text: "text-primary-700", solid: "bg-primary-500",
            fillSolid: "fill-primary-500", fillSoft: "fill-primary-100" },
  azure: { tint: "bg-azure-50", text: "text-azure-700", solid: "bg-azure-500",
           fillSolid: "fill-azure-500", fillSoft: "fill-azure-50" },
  violet: { tint: "bg-violet-50", text: "text-violet-700", solid: "bg-violet-500",
            fillSolid: "fill-violet-500", fillSoft: "fill-violet-50" },
  rose: { tint: "bg-rose-50", text: "text-rose-700", solid: "bg-rose-500",
          fillSolid: "fill-rose-500", fillSoft: "fill-rose-50" },
};
/** 과목 이름 → 색 이름. 카드는 과목을 이름으로 갖는다 */
const SUBJECT_HUE: Record<string, keyof typeof ACCENT> = {
  "물질과 에너지": "indigo",
  "화학 반응의 세계": "violet",
  통합과학1: "azure",
  통합과학2: "rose",
};
export const accentOfSubject = (subject: string): Accent =>
  ACCENT[SUBJECT_HUE[subject] ?? "indigo"];

/** 홈 "오늘의 구성" 타일 — 참고 이미지의 파스텔 카드 + 작은 색 태그 */
export const TILE = {
  review: { tint: "bg-violet-50", tag: "text-violet-700", value: "text-violet-700" },
  fresh: { tint: "bg-azure-50", tag: "text-azure-700", value: "text-azure-700" },
  streak: { tint: "bg-rose-50", tag: "text-rose-700", value: "text-rose-700" },
} as const;
