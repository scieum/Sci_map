/**
 * 한글 타수(打數) 계산 — 타속(타/분)의 분자다.
 *
 * 글자 수로 세면 안 된다. "빛"은 한 글자지만 ㅂ·ㅣ·ㅊ 세 번을 눌러 만들고,
 * "꽝"은 ㄱㄱ·ㅗㅏ·ㅇ 다섯 번이다. 글자 수로 재면 받침 없는 낱말을 치는 학생이
 * 늘 빨라 보인다 — 실력이 아니라 낱말이 만든 차이다.
 *
 * 기준은 **두벌식 자판에서 실제로 누르는 횟수**다. 국내 타자 연습 사이트가
 * 모두 이 기준을 쓰고, 학생이 아는 "몇 타" 도 이 숫자다.
 *   · 겹자음(ㄲ)·겹받침(ㄳ)·복모음(ㅘ) = 2타 — 한 키로 안 눌린다
 *   · ㅐ·ㅒ 는 1타 — shift 를 함께 눌러도 자판 위 키는 하나다
 *   · 영문·숫자·기호·공백 = 1타
 */

/** 유니코드 한글 음절의 초성 19개 순서 */
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
/** 중성 21개 순서 */
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
/** 종성 27개 순서 (받침 없음은 인덱스 0) */
const JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/** 두 번 눌러 만드는 자모 — 이 셋에 없으면 전부 1타다 */
const TWO_STROKE_CHO = new Set(["ㄲ", "ㄸ", "ㅃ", "ㅆ", "ㅉ"]);
const TWO_STROKE_JUNG = new Set(["ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"]);
const TWO_STROKE_JONG = new Set([
  "ㄲ", "ㄳ", "ㄵ", "ㄶ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅄ", "ㅆ",
]);

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 글자 하나의 타수 */
function strokesOf(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code < HANGUL_BASE || code > HANGUL_LAST) return 1; // 영문·숫자·기호·공백

  const offset = code - HANGUL_BASE;
  const cho = CHO[Math.floor(offset / 588)];
  const jung = JUNG[Math.floor((offset % 588) / 28)];
  const jongIdx = offset % 28;

  let n = TWO_STROKE_CHO.has(cho) ? 2 : 1;
  n += TWO_STROKE_JUNG.has(jung) ? 2 : 1;
  if (jongIdx > 0) {
    const jong = JONG[jongIdx - 1];
    n += TWO_STROKE_JONG.has(jong) ? 2 : 1;
  }
  return n;
}

/** 문자열 전체의 타수 */
export function keystrokes(text: string): number {
  let n = 0;
  for (const ch of text) n += strokesOf(ch);
  return n;
}

/**
 * 타속 — 분당 타수.
 *
 * 재는 구간은 **첫 타건부터 제출까지**다. 정의를 읽는 시간은 빼야 한다 —
 * 넣으면 긴 정의가 붙은 개념일수록 느린 학생으로 나오고, 그건 타자 실력이
 * 아니라 지문 길이를 잰 것이다.
 */
export function kpm(text: string, typingMs: number): number {
  if (typingMs <= 0) return 0;
  return Math.round((keystrokes(text) / typingMs) * 60000);
}
