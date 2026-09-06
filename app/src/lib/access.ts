/**
 * 자산 접근 스위치.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 지금 값: 로그인 없이 그림을 전부 보여준다.
 *
 * 지금 이래도 되는 이유: **2026-09-06 교사 결정**이다. 교사가 교과서 발행사와
 * 협업 관계에 있어 크롭의 공개 노출이 허용된다고 판단했다
 * (docs/rights_policy.md §2.5). 앱에는 `access_tier: restricted` 자산이 실제로
 * 25장 들어와 있으므로, 이 스위치는 이제 "노출될 게 없어서" 내려간 것이 아니라
 * **사람이 내려 둔 것**이다. 에이전트가 임의로 올리거나 내리지 않는다.
 *
 * ★ 되돌려야 하는 시점: 협업 범위가 바뀌거나 발행사 허락이 끝나는 순간.
 *   그때는 이 값을 true 로 되돌리고 restricted 자산을 비공개 버킷 +
 *   단시간 서명 URL 로 돌린다 (설계서 §0.4, docs/rights_policy.md §4).
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
