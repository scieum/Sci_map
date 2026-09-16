/**
 * 학기별 수강 과목 — "언제 무엇을 듣는가" 를 한 벌로 적어 둔다.
 *
 * 왜 학기별인가: 고등학교 과학은 학기마다 과목이 갈린다. 1학년은 대개
 * 통합과학1·2 를 한 학기씩 듣고, 2학년부터는 선택 과목이 학기마다 바뀐다.
 * 예전처럼 "수강 과목" 을 한 벌만 들고 있으면 학기가 바뀔 때마다 학생이 목록을
 * 통째로 갈아엎어야 하고, 지난 학기에 무엇을 들었는지는 남지 않는다.
 *
 * ★ 출제 범위는 여전히 **지금 학기 한 칸**이다 (`subjectsOf`). 여섯 칸을 전부
 *   범위로 삼으면 1학년 1학기 학생에게 3학년 과목 문항이 나온다. 나머지 칸은
 *   미리 적어 두는 자리이지 지금 푸는 자리가 아니다.
 */

export const GRADES = [1, 2, 3] as const;
export const SEMESTERS = [1, 2] as const;

export type Grade = (typeof GRADES)[number];
export type Semester = (typeof SEMESTERS)[number];
/** "2-1" = 2학년 1학기 */
export type Slot = `${Grade}-${Semester}`;

export type CoursePlan = Partial<Record<Slot, string[]>>;

export const SLOTS: { slot: Slot; grade: Grade; semester: Semester; label: string }[] =
  GRADES.flatMap((g) =>
    SEMESTERS.map((s) => ({
      slot: `${g}-${s}` as Slot,
      grade: g,
      semester: s,
      label: `${g}학년 ${s}학기`,
    })),
  );

const SLOT_SET = new Set<string>(SLOTS.map((s) => s.slot));

export function slotOf(
  grade: number | null | undefined,
  semester: number | null | undefined,
): Slot | null {
  const key = `${grade}-${semester}`;
  return SLOT_SET.has(key) ? (key as Slot) : null;
}

export const slotLabel = (slot: Slot) => SLOTS.find((s) => s.slot === slot)!.label;

/**
 * 1학년 기본값 — 공통 과목인 통합과학1·2 를 한 학기씩.
 *
 * 대부분의 학교가 이 순서로 나가므로 처음 들어온 학생이 아무것도 고르지 않아도
 * 오늘의 문항이 제 범위에서 나온다. **고정이 아니다** — 과학고처럼 1학년부터
 * 선택 과목을 듣는 학교가 있어 어느 칸이든 학생이 지우고 다시 고를 수 있다.
 * 2·3학년 칸은 비워 둔다. 학교마다 다른 것을 앱이 지어내지 않는다.
 */
export const DEFAULT_PLAN: CoursePlan = {
  "1-1": ["isci1"],
  "1-2": ["isci2"],
};

/** 서버에서 온 값(jsonb)을 믿지 않고 훑는다 — 모르는 칸·모르는 모양은 버린다 */
export function normalizePlan(raw: unknown): CoursePlan {
  const out: CoursePlan = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SLOT_SET.has(key) || !Array.isArray(value)) continue;
    const codes = Array.from(
      new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0)),
    );
    out[key as Slot] = codes;
  }
  return out;
}

/**
 * 화면에 처음 띄울 계획표.
 *
 * 순서: 저장된 계획표 → (없으면) 1학년 기본값. 어느 쪽이든, 예전 방식으로
 * 저장해 둔 `subjects` 가 있으면 **지금 학기 칸**은 그것이 이긴다. 그 목록이
 * 그 학생이 실제로 고른 것이고, 여기서 기본값으로 덮으면 고른 적 없는 과목이
 * 출제 범위가 된다.
 */
export function initialPlan(
  savedPlan: unknown,
  currentSlot: Slot | null,
  legacySubjects: string[] | null | undefined,
): CoursePlan {
  const saved = normalizePlan(savedPlan);
  const base: CoursePlan = Object.keys(saved).length > 0 ? saved : { ...DEFAULT_PLAN };
  if (currentSlot && (legacySubjects?.length ?? 0) > 0 && !base[currentSlot]?.length) {
    base[currentSlot] = [...legacySubjects!];
  }
  return base;
}

/** 지금 학기의 과목. 학년·학기를 아직 고르지 않았으면 빈 목록이다 */
export function subjectsOf(
  plan: CoursePlan,
  grade: number | null | undefined,
  semester: number | null | undefined,
): string[] {
  const slot = slotOf(grade, semester);
  return slot ? (plan[slot] ?? []) : [];
}

/** 빈 칸은 저장하지 않는다 — 비워 둔 학기와 아직 적지 않은 학기는 같은 것이다 */
export function prunePlan(plan: CoursePlan): CoursePlan {
  const out: CoursePlan = {};
  for (const { slot } of SLOTS) {
    const codes = plan[slot];
    if (codes && codes.length > 0) out[slot] = codes;
  }
  return out;
}

/** 두 계획표가 같은가 — 저장 단추를 켤지 정하는 데 쓴다 */
export function samePlan(a: CoursePlan, b: CoursePlan): boolean {
  for (const { slot } of SLOTS) {
    const x = (a[slot] ?? []).slice().sort();
    const y = (b[slot] ?? []).slice().sort();
    if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
  }
  return true;
}
