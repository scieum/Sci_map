import generated from "./catalog.generated.json";

/**
 * 과목 카탈로그 — 내 정보 화면의 수강 과목 목록, 스케줄러의 출제 범위 근거.
 *
 * `catalog.generated.json` 은 `docs/unit_backlog.yaml` 에서 만들어진다
 * (`python app/scripts/build_concepts.py`). 손으로 고치지 마라.
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

/**
 * 과목 계열 — 같은 구분 안에서는 물 → 화 → 생 → 지 순으로 세운다
 * (교사 결정 2026-09-10). 학생이 과목을 찾는 순서가 이것이다.
 *
 * 백로그에는 계열 필드가 없다. 2022 개정 과학과의 과목 이름은 고시로 정해져
 * 있어 바뀌지 않으므로 이름으로 잡는다. 사전에 없는 과목(공통 과목처럼 계열이
 * 없는 것 포함)은 같은 구분 안에서 카탈로그 순서를 그대로 지킨다.
 */
const TRACK_ORDER = ["물리", "화학", "생명", "지구"] as const;
const TRACK_OF: Record<string, (typeof TRACK_ORDER)[number]> = {
  // 일반 선택
  물리학: "물리",
  화학: "화학",
  생명과학: "생명",
  지구과학: "지구",
  // 진로 선택
  "역학과 에너지": "물리",
  "전자기와 양자": "물리",
  "물질과 에너지": "화학",
  "화학 반응의 세계": "화학",
  "세포와 물질대사": "생명",
  "생물의 유전": "생명",
  지구시스템과학: "지구",
  행성우주과학: "지구",
};

const courseTypeRank = (t?: string | null) => {
  const i = COURSE_TYPES.indexOf((t ?? "") as (typeof COURSE_TYPES)[number]);
  return i < 0 ? 99 : i;
};
const trackRank = (name: string) => {
  const t = TRACK_OF[name];
  return t ? TRACK_ORDER.indexOf(t) : 99;
};

/** 과목을 구분별로 묶는다. 사전에 없는 구분은 맨 뒤 '그 밖'으로 */
export function groupByCourseType(subjects: CatalogSubject[]) {
  const groups = new Map<string, CatalogSubject[]>();
  for (const s of subjects) {
    const key = s.courseType ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  for (const list of groups.values()) {
    // 묶음 안은 계열 순. 계열을 모르는 과목끼리는 카탈로그 순서 그대로다
    list.sort((a, b) => trackRank(a.name) - trackRank(b.name));
  }
  return Array.from(groups.entries()).sort(
    (a, b) => courseTypeRank(a[0]) - courseTypeRank(b[0]),
  );
}

/**
 * 과목 이름 목록을 화면 순서로 세운다 — 공통 → 일반 선택 → 진로 선택 → 융합 선택,
 * 같은 구분 안에서는 물 → 화 → 생 → 지.
 *
 * 개념 탭은 과목을 코드가 아니라 이름으로 갖는다(카드의 `subject`). 카탈로그에
 * 없는 이름은 맨 뒤에 받은 순서대로 남긴다 — 순서를 몰라서 빠뜨리는 일은 없어야 한다.
 */
export function orderSubjectNames(names: string[]): string[] {
  const rank = (name: string): [number, number, number] => {
    const i = CATALOG.subjects.findIndex((s) => s.name === name);
    if (i < 0) return [99, 99, 99];
    return [courseTypeRank(CATALOG.subjects[i].courseType), trackRank(name), i];
  };
  return [...names].sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
}

export const CATALOG: { subjects: CatalogSubject[] } =
  generated as { subjects: CatalogSubject[] };

export const subjectByCode = (code: string) =>
  CATALOG.subjects.find((s) => s.code === code);

/** 과목 코드 → 카드의 subject 이름 (카드는 이름으로 과목을 갖는다) */
export const subjectNameOf = (code: string) => subjectByCode(code)?.name;
