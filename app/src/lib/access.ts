/**
 * 자산 접근 판정 — `restricted` 교과서 크롭을 지금 이 사용자에게 보여도 되나.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 지금 값: 스위치가 내려가 있어 로그인 없이 그림을 전부 보여준다.
 *
 * 지금 이래도 되는 이유: **2026-09-06 교사 결정**이다. 교사가 교과서 발행사와
 * 협업 관계에 있어 크롭의 공개 노출이 허용된다고 판단했다
 * (docs/rights_policy.md §2.5). 앱에는 `access_tier: restricted` 자산이 실제로
 * **124장** 들어와 있으므로, 이 스위치는 "노출될 게 없어서" 내려간 것이 아니라
 * **사람이 내려 둔 것**이다. 에이전트가 임의로 올리거나 내리지 않는다.
 *
 * ★ 되돌려야 하는 시점: 협업 범위가 바뀌거나 발행사 허락이 끝나는 순간.
 *   `NEXT_PUBLIC_MEDIA_REQUIRES_LOGIN=true` 로 두고 재배포하면 비로그인 사용자에게
 *   그림 자리만 잠긴다. 카드 본문은 열려 있다 (§0.4 — 자산 단위 잠금, D5).
 *   그다음 단계로 restricted 자산을 비공개 버킷 + 단시간 서명 URL 로 돌린다
 *   (설계서 §0.4, docs/rights_policy.md §4).
 *
 * ★ 스위치는 **로그인 여부를 본다.** 예전에는 boolean 하나만 보고 판정해서,
 *   켜는 순간 로그인한 학생까지 막혔다 — 잠금 화면의 "로그인하면 볼 수 있어요"가
 *   거짓말이 되는 상태였다. 세션을 인자로 받게 고쳤다 (2026-09-07).
 *
 * 잠금 장치(LockedMedia)는 지우지 않았다. 스위치만 내려 두었다 —
 * 지웠다면 되돌릴 때 다시 만들어야 하고, 그때가 가장 급한 때다.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const MEDIA_REQUIRES_LOGIN =
  process.env.NEXT_PUBLIC_MEDIA_REQUIRES_LOGIN === "true";

/** 지금 사용자의 자격. `useViewer()` 가 세션에서 채운다 */
export interface Viewer {
  /** Supabase 세션이 있는가 */
  signedIn: boolean;
  /**
   * 초대 코드를 쓴 수업 참여 학생인가 (R3).
   * 설계서 §7.5 는 restricted 자산의 조건을 "로그인 + 초대 코드" 로 정한다.
   */
  hasInvite: boolean;
}

export const ANONYMOUS: Viewer = { signedIn: false, hasInvite: false };

/**
 * 이 자산을 지금 사용자에게 보여줄 수 있나.
 *
 * @param restricted 자산의 access_tier 가 restricted 인가.
 *                   **판단이 아니라 규칙이다** — rights.holder 가 교사 자신이
 *                   아니면 무조건 restricted (CLAUDE.md §6).
 * @param viewer     지금 사용자. 생략하면 비로그인으로 본다 — 판정을 모르는 쪽이
 *                   여는 쪽보다 안전하다.
 */
export function canViewMedia(restricted: boolean, viewer: Viewer = ANONYMOUS): boolean {
  if (!restricted) return true; // public 자산은 언제나 열려 있다
  if (!MEDIA_REQUIRES_LOGIN) return true; // 스위치가 내려가 있다 (지금)
  return viewer.signedIn && viewer.hasInvite; // 켜지면 수업 참여 학생만
}
