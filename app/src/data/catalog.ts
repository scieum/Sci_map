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
}
export interface CatalogSubject {
  code: string;
  name: string;
  courseType?: string | null;
  grade?: number | null;
  units: CatalogUnit[];
}

const SEED: CatalogSubject[] = [
  { code: "isci1", name: "통합과학1", courseType: "공통", grade: 1, units: [] },
];

export const CATALOG: { subjects: CatalogSubject[] } = {
  subjects: [...(generated as { subjects: CatalogSubject[] }).subjects, ...SEED],
};

export const subjectByCode = (code: string) =>
  CATALOG.subjects.find((s) => s.code === code);

/** 과목 코드 → 카드의 subject 이름 (카드는 이름으로 과목을 갖는다) */
export const subjectNameOf = (code: string) => subjectByCode(code)?.name;
