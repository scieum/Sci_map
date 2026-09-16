import { toChosung } from "@/lib/chosung";

/**
 * 빈칸 만들기 — 인출 모드가 **문장을 통째로 가리지 않게** 하는 장치.
 *
 * 왜 통째로 가리면 안 되나: 아무것도 없는 자리에서 한 문장을 그대로 복원하는
 * 것은 인출이 아니라 암송이다. 학생은 대개 "떠올랐다" 도 "안 떠올랐다" 도
 * 아닌 상태로 정답을 열게 되고, 그러면 자기 평가가 무의미해진다. 문장의
 * 뼈대는 남기고 **판가름 나는 자리만** 비우면, 맞았는지 틀렸는지가 그 자리에서
 * 바로 드러난다.
 *
 * 무엇이 "판가름 나는 자리"인가 — 순서대로:
 *   ① 이 카드의 표제어·별칭        ("증발"이 들어갈 자리를 비운다)
 *   ② 수치와 단위                  (0 °C, 2배 — 틀리면 그냥 틀린 것이다)
 *   ③ 관계 술어                    (증가/감소/비례/일정 — 관계 명제의 핵심)
 *   ④ 다른 개념 카드의 표제어      (개념 사전에 있는 말 = 배운 말)
 *   ⑤ 그래도 못 찾으면 어절         (조사를 뗀 길이가 긴 말부터)
 *
 * ⑤ 가 필요한 이유: ①~④ 는 사전에 있는 말만 짚는다. "가로막은 천체의 질량이
 * 클수록 빛은 더 크게 휘어진다" 처럼 사전에 없는 말로만 이루어진 명제가 적지
 * 않은데, 예전에는 그럴 때 문장을 통째로 가려 버렸다 — 고치려던 바로 그
 * 동작으로 되돌아가는 셈이었다.
 *
 * ★ 이 판정은 **형식 규칙**이다. 무엇이 과학적으로 중요한지 고르는 일이
 *   아니라, 카드에 이미 적혀 있는 것(표제어·개념 사전·수치)을 기계적으로
 *   짚는 것이다 (CLAUDE.md §9.7 — LLM 도 앱도 진위를 정하지 않는다).
 */

export interface Segment {
  text: string;
  /** 비운 자리인가 */
  blank: boolean;
  /** 힌트 단계에서 보여 줄 초성. 빈칸이 아니면 빈 문자열 */
  hint: string;
}

/** 관계 술어 — 어미는 뒤에 붙는 한글 몇 글자까지 함께 집는다 ("커지 + ㄴ다") */
const PREDICATE =
  /(정비례|반비례|비례|증가|감소|일정|보존|상쇄|평형|최대|최소|커지|작아지|많아지|적어지|높아지|낮아지|빨라지|느려지|세지|약해지)[가-힣]{0,3}/g;

/** 수치와 단위 — 숫자에 붙은 단위까지가 한 덩어리다 ("0 °C", "2배") */
const NUMBER = /\d+(?:[.,]\d+)?\s?(?:°C|°|%|[a-zA-ZµΩ][a-zA-Z/·]{0,5}|배|개|가지|족|주기|중)?/g;

/**
 * 비워 봤자 물음이 되지 않는 말. 문장을 잇는 말이거나 어느 명제에나 나오는
 * 말이라 여기가 비면 학생은 무엇을 묻는지 짐작할 근거가 없다
 */
const FILLER = new Set([
  "가운데", "때문에", "대해", "대하여", "따라", "따라서", "함께", "그리고", "하지만",
  "또는", "그러나", "이때", "여기", "거기", "이것", "그것", "모든", "어떤", "같은",
  "다른", "많은", "적은", "경우", "때", "것", "수", "등", "및", "더", "덜", "매우",
  "아주", "이다", "있다", "없다", "된다", "한다", "않는다", "이라고", "라고",
]);

/** 어절 끝에 붙는 조사 — 빈칸은 말까지만이고 조사는 문장에 남는다 */
const PARTICLE = /(?:으로써|으로서|에서도|에서는|으로|에서|에게|에는|이나|과는|와는|보다|처럼|까지|부터|라는|이란|의|이|가|은|는|을|를|에|로|와|과|도|만)$/;

interface Span {
  start: number;
  end: number;
  score: number;
}

function push(out: Span[], start: number, end: number, score: number) {
  if (end - start < 1) return;
  out.push({ start, end, score });
}

function findAll(text: string, needle: string, score: number, out: Span[]) {
  if (needle.length < 2) return;
  let i = text.indexOf(needle);
  while (i !== -1) {
    push(out, i, i + needle.length, score);
    i = text.indexOf(needle, i + needle.length);
  }
}

export interface ClozeOptions {
  /** 이 카드의 표제어 */
  term: string;
  /** 검색 허용 표기 — 본문에 구표기로 적혀 있을 수 있다 */
  aliases?: string[];
  /** 다른 개념 카드의 표제어 목록. 없으면 ①②③만으로 만든다 */
  lexicon?: string[];
  /** 빈칸 최대 개수. 기본은 문장 길이에서 정한다 */
  max?: number;
}

/**
 * 문장을 조각으로 쪼갠다. 빈칸이 하나도 잡히지 않으면 **문장 전체가 한
 * 빈칸**이다 — 예전 동작 그대로다. 짚을 자리를 못 찾았다고 해서 인출을
 * 건너뛰게 둘 수는 없다.
 */
export function makeCloze(text: string, opts: ClozeOptions): Segment[] {
  const spans: Span[] = [];

  findAll(text, opts.term, 5, spans);
  for (const a of opts.aliases ?? []) findAll(text, a, 4.5, spans);

  for (const m of text.matchAll(NUMBER)) {
    const raw = m[0].trimEnd();
    push(spans, m.index!, m.index! + raw.length, 4);
  }
  for (const m of text.matchAll(PREDICATE)) {
    push(spans, m.index!, m.index! + m[0].length, 3);
  }
  for (const t of opts.lexicon ?? []) {
    // 긴 말일수록 내용이 있다. "열"보다 "열용량"을 비우는 편이 물음이 된다
    if (t.length >= 2 && t !== opts.term) findAll(text, t, 2 + t.length * 0.1, spans);
  }

  // ⑤ 어절 — 점수가 가장 낮다. ①~④ 가 하나라도 걸리면 그쪽이 먼저 뽑힌다
  const WORD = /[^\s]+/g;
  for (const m of text.matchAll(WORD)) {
    const raw = m[0].replace(/[,.·…()"'“”‘’]+$/u, "");
    if (raw.length < 2) continue;
    const stem = raw.replace(PARTICLE, "");
    if (stem.length < 2 || FILLER.has(stem) || FILLER.has(raw)) continue;
    // 조사가 붙어 있었다는 것은 명사라는 뜻이고, 명사 자리가 답이 되기 쉽다.
    // 반대로 연결어미로 끝나는 말("있으면", "바뀌고")은 답이 아니라 문장의
    // 뼈대라 비우면 읽을 수 없는 문장이 된다
    let score = 1 + Math.min(stem.length, 6) * 0.05;
    if (stem !== raw) score += 0.3;
    if (/(?:면|고|며|서|야|든|나|지만|거나|어|아)$/.test(stem)) score -= 0.5;
    push(spans, m.index!, m.index! + stem.length, score);
  }

  // 겹치는 후보는 점수 높은 쪽, 같으면 긴 쪽이 이긴다
  spans.sort((a, b) => b.score - a.score || b.end - b.start - (a.end - a.start));

  const maxBlanks = opts.max ?? Math.min(3, Math.max(1, Math.floor(text.length / 20)));
  // 문장의 절반을 넘게 지우면 결국 통째로 가린 것과 다르지 않다
  const budget = Math.ceil(text.length * 0.4);

  const chosen: Span[] = [];
  let used = 0;
  for (const s of spans) {
    if (chosen.length >= maxBlanks) break;
    if (chosen.some((c) => s.start < c.end && c.start < s.end)) continue;
    if (used + (s.end - s.start) > budget && chosen.length > 0) continue;
    chosen.push(s);
    used += s.end - s.start;
  }

  if (chosen.length === 0) {
    return [{ text, blank: true, hint: toChosung(text) }];
  }

  chosen.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const s of chosen) {
    if (s.start > at) out.push({ text: text.slice(at, s.start), blank: false, hint: "" });
    const piece = text.slice(s.start, s.end);
    out.push({ text: piece, blank: true, hint: toChosung(piece) });
    at = s.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), blank: false, hint: "" });
  return out;
}
