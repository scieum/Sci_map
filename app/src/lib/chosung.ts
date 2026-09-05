/** 한글 초성(두음) 추출 — 인출 모드 ② 힌트 단계용 (한판노트 두음 힌트 패턴) */
const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

export function toChosung(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += CHO[Math.floor((code - 0xac00) / 588)];
    } else if (/[A-Za-z0-9]/.test(ch)) {
      out += "·";
    } else {
      out += ch; // 공백·문장부호는 유지 — 문장 골격이 힌트가 된다
    }
  }
  return out;
}
