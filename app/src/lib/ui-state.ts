"use client";

/**
 * 화면이 기억하는 자리 — "내가 보던 데"를 잃지 않게 하는 값들.
 *
 * Progress(store.ts)와 섞지 않는다. 저쪽은 학습 기록이라 서버로 올라가고
 * 기기를 넘나든다. 여기 있는 것은 이 기기, 이 브라우저의 화면 상태일 뿐이라
 * 서버에 보낼 이유가 없다.
 *
 * 개념 탭이 과목을 잊는 것이 이 파일이 생긴 까닭이다 — 화학 반응의 세계를 보다가
 * 카드로 들어갔다 나오면 첫 과목(물질과 에너지)으로 되돌아갔다. 여러 과목이
 * 붙은 뒤로는 매번 과목을 다시 고르는 일이 된다.
 */

const KEY = "scisherpa-ui-v1";

export interface UiState {
  /** 개념 탭에서 마지막으로 보던 과목 이름 */
  conceptsSubject?: string;
  /** 개념 탭 중단원 접기 상태 — `${major}>${minor}` → 펼침 여부 */
  conceptsOpen?: Record<string, boolean>;
}

export function loadUi(): UiState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UiState) : {};
  } catch {
    // 사생활 보호 모드처럼 저장소가 막힌 환경 — 기억을 못 할 뿐, 막히면 안 된다
    return {};
  }
}

export function saveUi(patch: Partial<UiState>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadUi(), ...patch }));
  } catch {
    /* 저장 실패는 조용히 넘긴다 — 화면 상태일 뿐이다 */
  }
}

/** 개념 탭이 돌아갈 과목을 적어 둔다. 카드 화면에 들어갈 때도 부른다 */
export function rememberSubject(subject: string) {
  saveUi({ conceptsSubject: subject });
}
