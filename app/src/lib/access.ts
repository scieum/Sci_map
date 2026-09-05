/**
 * 자산 접근 스위치.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 지금 값: 로그인 없이 그림을 전부 보여준다.
 *
 * 지금 이래도 되는 이유: 앱에 **타인 저작물이 한 장도 없다.** 개념 카드의
 * 그림 자리는 자리만 잡혀 있고 파일이 없으며(public/art 는 우리가 만든 그림),
 * 교과서 크롭은 C7 이 아직 만들지 않았다. 노출될 것이 없으므로 열어 둔다.
 *
 * ★ 되돌려야 하는 시점: C7 이 교과서 크롭을 만들어 `access_tier: restricted`
 *   자산이 실제로 들어오는 순간. 그 자산의 게재 근거는 저작권법 제25조 제3항
 *   수업 목적 이용뿐이고, 그 조항은 접근제한 조치를 동반 의무로 요구한다
 *   (Sci_Map 설계서 §0.4, CLAUDE.md §6). C9 배포 전에 이 값을 true 로 되돌리고
 *   restricted 자산을 비공개 버킷 + 단시간 서명 URL 로 돌린다.
 *
 * 잠금 장치(LockedMedia)는 지우지 않았다. 스위치만 내려 두었다 —
 * 지웠다면 되돌릴 때 다시 만들어야 하고, 그때가 가장 급한 때다.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const MEDIA_REQUIRES_LOGIN =
  process.env.NEXT_PUBLIC_MEDIA_REQUIRES_LOGIN === "true";

/**
 * 이 자산을 지금 사용자에게 보여줄 수 있나.
 *
 * @param restricted 자산의 access_tier 가 restricted 인가.
 *                   **판단이 아니라 규칙이다** — rights.holder 가 교사 자신이
 *                   아니면 무조건 restricted (CLAUDE.md §6).
 */
export function canViewMedia(restricted: boolean): boolean {
  if (!restricted) return true; // public 자산은 언제나 열려 있다
  return !MEDIA_REQUIRES_LOGIN; // restricted 는 스위치에 달렸다
}
