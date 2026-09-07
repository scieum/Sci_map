import generated from "./catalog.generated.json";

/**
 * 과목 카탈로그 — 내 정보 화면의 수강 과목 목록, 스케줄러의 출제 범위 근거.
 *
 * `catalog.generated.json` 은 `docs/unit_backlog.yaml` 에서 만들어진다
 * (`python app/scripts/build_concepts.py`). 손으로 고치지 마라.
 * 통합과학1 은 아직 파이프라인을 돌지 않아 시드 항목으로 붙여 둔다.
 */
export interface CatalogUnit {
  id: string;
  title: string;
  /** 1 | 2 | null(양 학기 또는 미정). 교사가 백로그에 채운다 */
  semester: number | null;
  status?: string | null;
  cards: boolean;
  /** 이 단원에 실린 개념 카드 수 */
  cardCount: number;
}
export interface CatalogSubject {
  code: string;
  name: string;
  courseType?: string | null;
  grade?: number | null;
  units: CatalogUnit[];
  /** 과목 전체 카드 수. 0 이면 아직 고를 수 없는 과목이다 */
  cardCount: number;
}

const SEED: CatalogSubject[] = [
  { code: "isci1", name: "통합과학1", courseType: "공통", grade: 1, units: [], cardCount: 0 },
];

/**
 * 과목 구분 — 2022 개정 교육과정의 과목 성격이다.
 *
 * 화면에서 이 순서로 묶어 보여 준다. 학생이 시간표를 짤 때 쓰는 말이 이것이라,
 * "진로선택 · 단원 4개" 처럼 한 줄에 섞어 두면 구분이 눈에 들어오지 않는다.
 */
export const COURSE_TYPES = ["공통", "일반선택", "진로선택", "융합선택"] as const;

/** 백로그 표기를 화면 표기로 — '진로선택' → '진로 선택' */
export const courseTypeLabel = (t?: string | null): string => {
  if (!t) return "그 밖";
  return t.replace("일반선택", "일반 선택").replace("진로선택", "진로 선택")
          .replace("융합선택", "융합 선택");
};

/** 과목을 구분별로 묶는다. 사전에 없는 구분은 맨 뒤 '그 밖'으로 */
export function groupByCourseType(subjects: CatalogSubject[]) {
  const order = new Map<string, number>(COURSE_TYPES.map((t, i) => [t, i]));
  const groups = new Map<string, CatalogSubject[]>();
  for (const s of subjects) {
    const key = s.courseType ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return Array.from(groups.entries()).sort(
    (a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99),
  );
}

export const CATALOG: { subjects: CatalogSubject[] } = {
  subjects: [...(generated as { subjects: CatalogSubject[] }).subjects, ...SEED],
};

export const subjectByCode = (code: string) =>
  CATALOG.subjects.find((s) => s.code === code);

/** 과목 코드 → 카드의 subject 이름 (카드는 이름으로 과목을 갖는다) */
export const subjectNameOf = (code: string) => subjectByCode(code)?.name;
